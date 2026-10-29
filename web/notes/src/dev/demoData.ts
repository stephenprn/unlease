/**
 * The dev demo's notes, lines, links and pages: synthetic French content, written
 * through the library's own door with past times, so cards say "Modifiée hier"
 * and lines sort as they would after a few weeks of use. Development only.
 */
import { shiftDay } from '@unlease/core/services/dates';
import { finishStroke, serializeStrokes } from '@unlease/notes/services/drawing';
import { keysBetween } from '@unlease/core/services/fractionalIndex';
import { formatHlc } from '@unlease/core/sync/hlc';
import type { SyncRecord } from '@unlease/core/sync/record';
import { attachmentFields, blockFields, checkFields, labelFields, linkFields, noteFields } from '@unlease/notes/sync/entities';
import type { BlockKind, BlockTarget, CellValue, TableColumn } from '@unlease/notes/models/blocks';
import type { LineColor, NotePattern } from '@unlease/design/colors';
import type { DrawingInk, DrawingSize, DrawingTool } from '@unlease/notes/models/drawing';
import { INBOX_ID, type LinkAttribute, type LinkKind, type LinkStatus, type NoteKind } from '@unlease/notes/models/entities';

import type { LocalChange } from '../app/store/library';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

interface NoteSeed {
  readonly id: string;
  readonly kind: NoteKind;
  readonly title: string;
  readonly body?: string;
  /** The body is formatted lines (`notes/services/noteBody`). */
  readonly rich?: boolean;
  /** A drawing note's strokes (`notes/services/drawing`). */
  readonly drawing?: string;
  readonly color?: LineColor | null;
  readonly pattern?: NotePattern;
  readonly labels?: readonly string[];
  readonly pinned?: boolean;
  readonly archived?: boolean;
  readonly trashedAgo?: number;
  readonly reminder?: (now: number) => number;
  readonly ago: number;
  readonly checks?: readonly (readonly [string, boolean])[];
  readonly photo?: string;
  readonly code?: string;
  readonly hint?: string;
}

interface LinkSeed {
  readonly line: string;
  readonly url: string;
  readonly ago: number;
  readonly title?: string;
  readonly kind?: LinkKind;
  readonly siteName?: string;
  readonly summary?: string;
  readonly price?: number;
  readonly attributes?: readonly LinkAttribute[];
  readonly images?: readonly string[];
  readonly status?: LinkStatus;
  readonly error?: string;
  readonly doneAgo?: number;
  readonly comment?: string;
}

const LABELS = [
  { id: 'demo-label-perso', name: 'Perso', color: 'blue' as const },
  { id: 'demo-label-travail', name: 'Travail', color: 'orange' as const },
  { id: 'demo-label-maison', name: 'Maison', color: 'green' as const },
  { id: 'demo-label-idees', name: 'Idées', color: 'lilac' as const },
];

const at = (now: number, days: number, hour: number, minute = 0): number => {
  const date = new Date(now + days * DAY);
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
};

/** A hand's wobble, the same on every run. */
function wobble(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648 - 0.5;
  };
}

type Pen = readonly [tool: DrawingTool, size: DrawingSize, ink: DrawingInk];

/** Strokes drawn by hand from shapes: each list of points traced with a little wobble. */
function sketch(seed: number, lines: readonly (readonly [Pen, readonly (readonly [number, number])[]])[]): string {
  const shake = wobble(seed);
  return serializeStrokes(
    lines.flatMap(([[tool, size, ink], points], index) => {
      const traced: number[] = [];
      points.forEach(([x, y], at) => {
        const next = points[at + 1];
        const steps = next ? Math.max(1, Math.round(Math.hypot(next[0] - x, next[1] - y) / 14)) : 1;
        for (let step = 0; step < steps; step += 1) {
          const t = step / steps;
          traced.push(x + (next ? (next[0] - x) * t : 0) + shake() * 3, y + (next ? (next[1] - y) * t : 0) + shake() * 3);
        }
      });
      const stroke = finishStroke(`000000${String(index).padStart(3, '0')}demo`, tool, size, ink, traced);
      return stroke ? [stroke] : [];
    }),
  );
}

const ring = (cx: number, cy: number, r: number, from = 0, to = 360): [number, number][] =>
  Array.from({ length: 25 }, (_, k) => {
    const angle = ((from + ((to - from) * k) / 24) * Math.PI) / 180;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  });

/** « Plan du potager »: beds, a path, the sun and where the water is. */
const GARDEN = sketch(7, [
  [['pen', 1, 'ink'], [[90, 140], [470, 130], [480, 420], [95, 430], [90, 140]]],
  [['pen', 1, 'ink'], [[560, 150], [910, 140], [905, 430], [555, 420], [560, 150]]],
  [['marker', 1, 'brown'], [[120, 560], [300, 520], [520, 560], [720, 520], [900, 560]]],
  [['marker', 0, 'green'], [[140, 200], [180, 170], [220, 205], [260, 170], [300, 205], [340, 170], [380, 205], [420, 175]]],
  [['marker', 0, 'green'], [[140, 300], [180, 270], [220, 305], [260, 270], [300, 305], [340, 270], [380, 305], [420, 275]]],
  [['pen', 2, 'red'], ring(640, 230, 26)],
  [['pen', 2, 'red'], ring(740, 260, 26)],
  [['pen', 2, 'red'], ring(820, 210, 26)],
  [['pen', 2, 'red'], ring(690, 340, 26)],
  [['marker', 1, 'yellow'], ring(860, 620, 48)],
  [['pen', 1, 'yellow'], [[860, 548], [860, 520]]],
  [['pen', 1, 'yellow'], [[932, 620], [962, 620]]],
  [['pen', 1, 'yellow'], [[910, 570], [935, 548]]],
  [['highlighter', 1, 'sky'], [[150, 660], [420, 660]]],
  [['pen', 0, 'blue'], [[170, 650], [200, 640], [230, 655], [260, 640], [290, 655], [320, 640], [350, 655], [380, 642]]],
]);

/** The route from the hotel to the river, drawn in the Lisbon page. */
const ROUTE = sketch(11, [
  [['marker', 2, 'blue'], [[40, 600], [260, 560], [520, 610], [760, 560], [980, 600]]],
  [['pen', 1, 'ink'], [[120, 120], [180, 520]]],
  [['pen', 1, 'ink'], [[60, 300], [900, 260]]],
  [['pen', 1, 'ink'], [[520, 90], [560, 540]]],
  [['pen', 1, 'ink'], [[300, 120], [860, 140]]],
  [['highlighter', 2, 'yellow'], [[180, 300], [540, 285], [555, 520]]],
  [['pen', 2, 'red'], [[170, 270], [185, 300], [215, 305], [192, 325], [200, 355], [172, 340], [146, 357], [152, 326], [128, 306], [158, 300], [170, 270]]],
  [['pen', 2, 'green'], ring(560, 520, 30)],
]);

/** Board order, first to last. */
const NOTES: readonly NoteSeed[] = [
  { id: 'demo-portail', kind: 'text', title: 'Code du portail', body: 'Portail : 4512B\nInterphone : Martin, 3e gauche', labels: ['demo-label-perso'], pinned: true, ago: 2 * DAY },
  {
    id: 'demo-courses',
    kind: 'checklist',
    title: 'Courses samedi',
    labels: ['demo-label-maison'],
    pinned: true,
    ago: 3 * DAY,
    checks: [
      ['Lait d’avoine', false],
      ['Pain de seigle', false],
      ['Tomates cerises', false],
      ['Parmesan', false],
      ['Café en grains', false],
      ['Citrons', false],
      ['Œufs', true],
      ['Beurre demi-sel', true],
    ],
  },
  { id: 'line-films', kind: 'links', title: 'Films & séries', code: 'F', color: 'violet', hint: 'Films et séries à voir, au cinéma ou en streaming.', pinned: true, ago: 35 * DAY },
  { id: 'demo-resto', kind: 'text', title: 'Anniversaire de Léa', body: 'Réserver pour six samedi soir, plutôt vers Oberkampf. Lui demander si elle préfère italien ou libanais.', color: 'orange', ago: 40 * MINUTE },
  { id: 'demo-garage', kind: 'text', title: 'Appeler le garage', body: 'Contrôle technique avant le 30. Demander s’ils font aussi la vidange.', reminder: now => at(now, 1, 9), ago: 5 * HOUR },
  {
    id: 'demo-lyon',
    kind: 'text',
    title: 'Week-end à Lyon',
    rich: true,
    body: '# Samedi\nArrivée à {b:10 h 12}, gare de la Part-Dieu.\nDéjeuner au {i:Café des Fédérations}, la table est réservée.\n## Dimanche\nMarché du quai Saint-Antoine, puis {u:la colline de Fourvière} à pied.\n### À ne pas oublier\nLes {b:billets retour} et le chargeur.',
    color: 'sky',
    labels: ['demo-label-perso'],
    ago: 3 * HOUR,
  },
  {
    id: 'demo-cadeaux',
    kind: 'checklist',
    title: 'Idées cadeaux Maman',
    color: 'lilac',
    labels: ['demo-label-idees'],
    ago: 1 * DAY,
    checks: [
      ['Un atelier de céramique', false],
      ['Un plaid en laine', false],
      ['Un livre de photographies de jardins', false],
      ['Une journée au spa', true],
    ],
  },
  {
    id: 'demo-rive',
    kind: 'text',
    title: 'Réunion projet Rive',
    body: 'Points à aborder :\n- budget du dernier trimestre\n- planning des livraisons\n- qui reprend le dossier client en janvier ?',
    labels: ['demo-label-travail'],
    reminder: now => at(now, 2, 9, 30),
    ago: 6 * DAY,
  },
  { id: 'demo-potager', kind: 'drawing', title: 'Plan du potager', drawing: GARDEN, pattern: 'grid', labels: ['demo-label-maison'], ago: 7 * HOUR },
  { id: 'demo-balcon', kind: 'text', title: 'Plan du balcon', body: 'Jasmin étoilé côté mur, trois pots de basilic, tomates cerises si le soleil suffit.', color: 'green', photo: 'demo-balcony', ago: 5 * DAY },
  {
    id: 'demo-crepes',
    kind: 'text',
    title: 'Pâte à crêpes',
    body: '250 g de farine\n4 œufs\n50 cl de lait\n1 pincée de sel\n2 cuillères à soupe de sucre\n50 g de beurre fondu\n\nMélanger la farine et les œufs, ajouter le lait petit à petit en fouettant. Laisser reposer une heure. Cuire à feu moyen, une louche par crêpe, en retournant dès que les bords dorent.',
    color: 'yellow',
    labels: ['demo-label-maison'],
    ago: 12 * DAY,
  },
  {
    id: 'demo-valise',
    kind: 'checklist',
    title: 'Valise Lisbonne',
    color: 'sky',
    labels: ['demo-label-perso'],
    ago: 20 * DAY,
    checks: [
      ['Passeport', false],
      ['Adaptateur', false],
      ['Maillot de bain', false],
      ['Crème solaire', false],
      ['Chargeur', false],
      ['Lunettes de soleil', false],
      // eslint-disable-next-line no-restricted-syntax -- a notebook to pack, not the app
      ['Carnet', false],
      ['Billets imprimés', true],
      ['Réservation de l’hôtel', true],
    ],
  },
  { id: 'demo-citation', kind: 'text', title: '', body: '« Ce n’est pas le temps qui manque, c’est nous qui lui manquons. »\nÀ retrouver : qui l’a écrit ?', labels: ['demo-label-idees'], ago: 30 * DAY },
  { id: 'demo-velo', kind: 'text', title: 'Vélo', body: 'Pneu arrière à changer, 700×28. Garder la chambre à air de secours.', ago: 26 * DAY },
  { id: 'line-mode', kind: 'links', title: 'Mode', code: 'M', color: 'magenta', hint: 'Vêtements, chaussures et accessoires à acheter.', ago: 35 * DAY },
  { id: 'line-restos', kind: 'links', title: 'Restaurants', code: 'R', color: 'orange', hint: 'Restaurants, cafés et bars à essayer.', ago: 35 * DAY },
  { id: 'line-lire', kind: 'links', title: 'À lire', code: 'L', color: 'blue', hint: 'Articles, essais et livres à lire.', ago: 35 * DAY },
  { id: 'line-maison', kind: 'links', title: 'Maison', code: 'H', color: 'green', hint: 'Meubles, déco et objets pour la maison.', ago: 35 * DAY },
  { id: 'line-voyages', kind: 'links', title: 'Voyages', code: 'V', color: 'sky', hint: 'Lieux, hôtels et idées de voyage.', ago: 35 * DAY },
  { id: 'demo-wifi', kind: 'text', title: 'Ancien wifi', body: 'Réseau : Maison-5G\nÀ supprimer de la box.', archived: true, ago: 60 * DAY },
  { id: 'demo-brouillon', kind: 'text', title: 'Brouillon de lettre', body: 'Madame, Monsieur, je me permets de…', trashedAgo: 2 * DAY, ago: 9 * DAY },
];

/** Each line's links, first to last. */
const LINKS: readonly LinkSeed[] = [
  {
    line: 'line-mode',
    url: 'https://www.tissage-lent.fr/chemise-en-lin',
    ago: 3 * MINUTE,
    status: 'pending',
  },
  {
    line: 'line-mode',
    url: 'https://www.atelier-nord.fr/veste-laine-bouillie',
    ago: 2 * DAY,
    title: 'Veste en laine bouillie',
    kind: 'product',
    siteName: 'Atelier Nord',
    summary: 'Veste droite en laine bouillie, doublure en coton, deux poches plaquées. Coupe un peu ample : prendre sa taille habituelle.',
    price: 189,
    attributes: [
      { label: 'Couleur', value: 'Camel' },
      { label: 'Matière', value: 'Laine bouillie' },
      { label: 'Tailles', value: 'S à XL' },
    ],
    images: ['demo-jacket'],
    comment: 'En M. Voir en boutique avant.',
  },
  {
    line: 'line-mode',
    url: 'https://www.pas-de-cote.fr/baskets-cuir-blanc',
    ago: 4 * DAY,
    title: 'Baskets en cuir blanc',
    kind: 'product',
    siteName: 'Pas de côté',
    summary: 'Baskets basses en cuir pleine fleur, semelle cousue, fabriquées au Portugal.',
    price: 129,
    attributes: [{ label: 'Pointure', value: '42' }],
    images: ['demo-sneakers'],
  },
  {
    line: 'line-mode',
    url: 'https://boutique-fermee.fr/sac-cabas',
    ago: 6 * DAY,
    status: 'failed',
    error: 'La page refuse les robots.',
  },
  {
    line: 'line-mode',
    url: 'https://www.maille-et-fil.fr/pull-col-roule-merinos',
    ago: 8 * DAY,
    title: 'Pull col roulé en mérinos',
    kind: 'product',
    siteName: 'Maille & Fil',
    summary: 'Pull fin en laine mérinos extra-fine, col roulé, se porte seul ou sous une veste.',
    price: 89.9,
    attributes: [{ label: 'Couleur', value: 'Marine' }],
    images: ['demo-sweater'],
  },
  {
    line: 'line-mode',
    url: 'https://www.atelier-nord.fr/echarpe-cachemire',
    ago: 15 * DAY,
    title: 'Écharpe en cachemire',
    kind: 'product',
    siteName: 'Atelier Nord',
    price: 75,
    attributes: [{ label: 'Couleur', value: 'Bordeaux' }],
    images: ['demo-scarf'],
    doneAgo: 9 * DAY,
  },
  {
    line: 'line-films',
    url: 'https://www.cinema-lumiere.fr/films/les-feux-de-septembre',
    ago: 1 * DAY,
    title: 'Les Feux de septembre',
    kind: 'film',
    siteName: 'Cinéma Lumière',
    summary: 'Dans un village de Provence, un été d’incendies rapproche deux frères brouillés. Drame lumineux, porté par ses deux acteurs.',
    attributes: [
      { label: 'Durée', value: '1 h 52' },
      { label: 'Genre', value: 'Drame' },
    ],
    images: ['demo-poster1'],
  },
  {
    line: 'line-films',
    url: 'https://www.ecrans-du-soir.fr/series/station-nord',
    ago: 3 * DAY,
    title: 'Station Nord, saison 2',
    kind: 'series',
    siteName: 'Écrans du soir',
    summary: 'Polar dans une base scientifique de l’Arctique. La deuxième saison suit l’hiver polaire.',
    attributes: [{ label: 'Épisodes', value: '8' }],
    images: ['demo-poster2'],
  },
  {
    line: 'line-films',
    url: 'https://www.cinema-lumiere.fr/films/le-dernier-quai',
    ago: 18 * DAY,
    title: 'Le Dernier Quai',
    kind: 'film',
    siteName: 'Cinéma Lumière',
    images: ['demo-poster4'],
    doneAgo: 11 * DAY,
  },
  {
    line: 'line-restos',
    url: 'https://www.le-comptoir-des-halles.fr',
    ago: 2 * DAY,
    title: 'Le Comptoir des Halles',
    kind: 'restaurant',
    siteName: 'Le Comptoir des Halles',
    summary: 'Bistrot de quartier, cuisine du marché, ardoise qui change chaque jour.',
    attributes: [
      { label: 'Cuisine', value: 'Bistrot' },
      { label: 'Quartier', value: 'Châtelet' },
      { label: 'Prix', value: '25 à 40 € par personne' },
    ],
    images: ['demo-plate'],
  },
  {
    line: 'line-restos',
    url: 'https://www.mezze-and-co.fr',
    ago: 9 * DAY,
    title: 'Mezze & Co',
    kind: 'restaurant',
    siteName: 'Mezze & Co',
    attributes: [{ label: 'Cuisine', value: 'Libanaise' }],
    images: ['demo-mezze'],
  },
  {
    line: 'line-lire',
    url: 'https://www.revue-urbaine.fr/pourquoi-les-villes-ralentissent',
    ago: 4 * DAY,
    title: 'Pourquoi les villes ralentissent',
    kind: 'article',
    siteName: 'La Revue urbaine',
    summary: 'Zones à 30 km/h, rues scolaires, places rendues aux piétons : une enquête sur dix ans de villes plus lentes.',
    attributes: [{ label: 'Lecture', value: '12 min' }],
    images: ['demo-article'],
  },
  {
    line: 'line-maison',
    url: 'https://www.maison-clair.fr/lampe-de-bureau-articulee',
    ago: 7 * DAY,
    title: 'Lampe de bureau articulée',
    kind: 'product',
    siteName: 'Maison Clair',
    price: 64,
    attributes: [{ label: 'Couleur', value: 'Jaune moutarde' }],
    images: ['demo-lamp'],
  },
  {
    line: 'line-voyages',
    url: 'https://www.gites-des-lacs.fr/annecy-bord-du-lac',
    ago: 10 * DAY,
    title: 'Gîte au bord du lac d’Annecy',
    kind: 'place',
    siteName: 'Gîtes des lacs',
    price: 145,
    attributes: [{ label: 'Capacité', value: '4 personnes' }],
    images: ['demo-lake'],
  },
  {
    line: INBOX_ID,
    url: 'https://www.carnet-de-route.fr/trois-jours-a-porto',
    ago: 5 * HOUR,
    title: 'Trois jours à Porto, carnet de route',
    kind: 'article',
    // eslint-disable-next-line no-restricted-syntax -- a travel blog's name, not the app
    siteName: 'Carnet de route',
  },
  {
    // Saved while reading was off: kept plain until someone asks for it to be read.
    line: INBOX_ID,
    url: 'https://www.maille-et-fil.fr/bonnet-cotes-anglaises',
    ago: 2 * DAY,
    status: 'skipped',
  },
  {
    line: INBOX_ID,
    url: 'https://www.cuisine-du-jour.fr/recettes/tarte-fine-aux-pommes',
    ago: 3 * DAY,
    title: 'Tarte fine aux pommes',
    kind: 'recipe',
    siteName: 'Cuisine du jour',
    summary: 'Une pâte feuilletée, quatre pommes en lamelles fines, du beurre et du sucre : prête en quarante minutes.',
    attributes: [
      { label: 'Temps total', value: '40 min' },
      { label: 'Portions', value: '6' },
    ],
  },
];


interface BlockSeed {
  readonly kind: BlockKind;
  /** Rich text markup (`core/services/richText`), a code block's source, a page's title; or markup made from the demo's day (a date close to it). */
  readonly text?: string | ((now: number) => string);
  readonly checked?: boolean;
  readonly language?: string;
  readonly icon?: string;
  readonly color?: LineColor;
  readonly columns?: readonly TableColumn[];
  readonly cells?: Readonly<Record<string, CellValue>>;
  readonly target?: BlockTarget;
  readonly caption?: string;
  /** A drawing block's strokes. */
  readonly drawing?: string;
  readonly children?: readonly BlockSeed[];
  /** A page's own id, so pages can point at each other. */
  readonly id?: string;
  readonly ago?: number;
}

const row = (cells: Readonly<Record<string, CellValue>>): BlockSeed => ({ kind: 'row', cells });

const BUDGET: TableColumn[] = [
  { id: 'poste', name: 'Poste', type: 'text', width: 220 },
  { id: 'montant', name: 'Montant', type: 'number', unit: '€', width: 120 },
  { id: 'paye', name: 'Payé', type: 'checkbox', width: 90 },
  {
    id: 'categorie',
    name: 'Catégorie',
    type: 'select',
    width: 150,
    options: [
      { id: 'transport', name: 'Transport', color: 'blue' },
      { id: 'logement', name: 'Logement', color: 'lilac' },
      { id: 'sorties', name: 'Sorties', color: 'orange' },
    ],
  },
  { id: 'date', name: 'Date', type: 'date', width: 140 },
];

const LECTURES: TableColumn[] = [
  { id: 'titre', name: 'Titre', type: 'text', width: 220 },
  { id: 'auteur', name: 'Auteur', type: 'text', width: 150 },
  { id: 'note', name: 'Note', type: 'number', unit: '/5', width: 90 },
  { id: 'lu', name: 'Lu', type: 'checkbox', width: 70 },
  {
    id: 'genre',
    name: 'Genre',
    type: 'select',
    width: 120,
    options: [
      { id: 'roman', name: 'Roman', color: 'pink' },
      { id: 'essai', name: 'Essai', color: 'blue' },
      { id: 'bd', name: 'BD', color: 'green' },
    ],
  },
  {
    id: 'themes',
    name: 'Thèmes',
    type: 'multi',
    width: 170,
    options: [
      { id: 'mer', name: 'Mer', color: 'sky' },
      { id: 'famille', name: 'Famille', color: 'lilac' },
      { id: 'ville', name: 'Ville', color: 'ochre' },
    ],
  },
  { id: 'fini', name: 'Terminé le', type: 'date', width: 140 },
  { id: 'lien', name: 'Lien', type: 'url', width: 200 },
];

const PROPORTIONS: TableColumn[] = [
  { id: 'ingredient', name: 'Ingrédient', type: 'text', width: 200 },
  { id: 'quantite', name: 'Quantité', type: 'number', unit: 'g', width: 120 },
  { id: 'bio', name: 'Bio', type: 'checkbox', width: 80 },
];

/** A day of the Lisbon trip, counted from its Thursday six or seven weeks after the demo's day: ahead of it, and the days the page's words name. */
function tripDay(now: number, fromThursday: number): string {
  const ahead = new Date(now);
  ahead.setDate(ahead.getDate() + 42);
  return shiftDay(ahead.getTime(), ((4 - ahead.getDay() + 7) % 7) + fromThursday);
}

/** The top-level pages, first to last, with what each holds (sub-pages among it). */
const PAGES: readonly BlockSeed[] = [
  {
    id: 'demo-page-lisbonne',
    kind: 'page',
    text: 'Voyage à Lisbonne',
    icon: '✈️',
    ago: 2 * DAY,
    children: [
      { kind: 'text', text: 'Quatre jours, du {b:jeudi} au {b:dimanche}. L’hôtel est réservé près du {a=https\\://fr.wikipedia.org/wiki/Alfama:quartier de l’Alfama}.' },
      { kind: 'callout', icon: '💡', color: 'yellow', text: 'Prendre le {b:tram 28} tôt le matin : après 10 h, il est bondé.' },
      { kind: 'toc' },
      { kind: 'h2', text: 'Préparatifs' },
      { kind: 'todo', text: 'Réserver l’hôtel', checked: true },
      { kind: 'todo', text: 'Acheter les billets d’avion', checked: true },
      { kind: 'todo', text: 'Imprimer les cartes d’embarquement' },
      { kind: 'todo', text: now => `Prévenir la banque : {@date=${shiftDay(now, 1)}}` },
      { kind: 'todo', text: now => `Enregistrement en ligne : {@date=${tripDay(now, -1)}}` },
      { kind: 'text', text: now => `Départ le {@date=${tripDay(now, 0)}T0715} depuis Orly, retour le {@date=${tripDay(now, 3)}}.` },
      { kind: 'text', text: 'La liste de la valise est dans {@note=demo-valise}, et les idées de sorties dans {@note=line-voyages}.' },
      { kind: 'h2', text: 'Budget' },
      {
        kind: 'table',
        columns: BUDGET,
        children: [
          row({ poste: 'Vols aller-retour', montant: 186, paye: true, categorie: 'transport', date: '2026-03-02' }),
          row({ poste: 'Hôtel, trois nuits', montant: 342, paye: true, categorie: 'logement', date: '2026-03-04' }),
          row({ poste: 'Musée des Azulejos', montant: 10, paye: false, categorie: 'sorties' }),
          row({ poste: 'Dîner fado', montant: 70, paye: false, categorie: 'sorties' }),
        ],
      },
      { kind: 'h2', text: 'Itinéraire' },
      { kind: 'drawing', drawing: ROUTE, caption: 'De l’hôtel au Tage, par la Baixa.' },
      {
        kind: 'columns',
        children: [
          { kind: 'column', children: [{ kind: 'h3', text: 'Jeudi' }, { kind: 'bullet', text: 'Arrivée vers 11 h' }, { kind: 'bullet', text: 'Alfama et le {i:miradouro} de Santa Luzia' }, { kind: 'bullet', text: 'Dîner fado' }] },
          { kind: 'column', children: [{ kind: 'h3', text: 'Vendredi' }, { kind: 'bullet', text: 'Belém : le monastère, puis les pastéis' }, { kind: 'bullet', text: 'LX Factory en fin de journée' }] },
        ],
      },
      { kind: 'toggle', text: 'Adresses utiles', children: [{ kind: 'text', text: 'Pharmacie : Rua Augusta, 98' }, { kind: 'text', text: 'Consulat : Rua de São Domingos à Lapa, 2' }] },
      { kind: 'h3', text: 'Pour la suite du voyage' },
      { kind: 'bookmark', target: { type: 'link', id: 'demo-link-inbox-0' }, caption: 'À lire avant de prendre le train pour Porto.' },
      {
        id: 'demo-page-restos',
        kind: 'page',
        text: 'Restaurants à tester',
        icon: '🍽️',
        children: [
          { kind: 'text', text: 'Ce que Claude a rangé dans {@note=line-restos}, à garder sous la main :' },
          { kind: 'embed', target: { type: 'note', id: 'line-restos' } },
          { kind: 'h3', text: 'À ne pas manquer' },
          { kind: 'numbered', text: 'Pastéis de Belém' },
          { kind: 'numbered', text: 'Cervejaria Ramiro, pour les crevettes' },
        ],
      },
    ],
  },
  {
    id: 'demo-page-recettes',
    kind: 'page',
    text: 'Recettes',
    icon: '🍳',
    ago: 12 * DAY,
    children: [
      { kind: 'text', text: 'Les recettes testées et approuvées. Chacune a sa page ; les courses sont dans {@note=demo-courses}.' },
      {
        id: 'demo-page-crepes',
        kind: 'page',
        text: 'Pâte à crêpes',
        icon: '🥞',
        children: [
          { kind: 'embed', target: { type: 'note', id: 'demo-crepes' } },
          { kind: 'callout', icon: '🔥', color: 'orange', text: 'Laisser reposer la pâte {b:une heure} : elle n’en sera que meilleure.' },
        ],
      },
      {
        id: 'demo-page-levain',
        kind: 'page',
        text: 'Pain au levain',
        icon: '🍞',
        children: [
          { kind: 'h2', text: 'Étapes' },
          { kind: 'numbered', text: 'Rafraîchir le levain la veille au soir' },
          { kind: 'numbered', text: 'Mélanger farine et eau, laisser reposer une heure ({i:autolyse})' },
          { kind: 'numbered', text: 'Ajouter le levain et le sel, pétrir dix minutes' },
          { kind: 'numbered', text: 'Pointage : quatre heures, avec des rabats toutes les 30 minutes' },
          { kind: 'numbered', text: 'Façonner, puis une nuit au frigo' },
          { kind: 'numbered', text: 'Cuire 20 minutes à 250 °C couvert, puis 25 minutes découvert' },
          { kind: 'toggle', text: 'Si la pâte ne lève pas', children: [{ kind: 'bullet', text: 'Vérifier que le levain double en six heures' }, { kind: 'bullet', text: 'Allonger le pointage d’une heure' }] },
          { kind: 'h2', text: 'Proportions' },
          {
            kind: 'table',
            columns: PROPORTIONS,
            children: [row({ ingredient: 'Farine T80', quantite: 500, bio: true }), row({ ingredient: 'Eau', quantite: 350, bio: false }), row({ ingredient: 'Levain', quantite: 100, bio: true }), row({ ingredient: 'Sel', quantite: 10, bio: false })],
          },
          // Three levels further down: a deep breadcrumb, folded on a narrow window.
          {
            id: 'demo-page-levain-maison',
            kind: 'page',
            text: 'Levain maison, du démarrage à l’entretien',
            icon: '🫙',
            children: [
              { kind: 'text', text: 'Farine de seigle et eau à parts égales, cinq jours de suite, au chaud.' },
              {
                id: 'demo-page-levain-nourrir',
                kind: 'page',
                text: 'Nourrir le levain chaque semaine',
                icon: '🥄',
                children: [
                  { kind: 'text', text: 'Une cuillère de levain, 50 g de farine, 50 g d’eau tiède.' },
                  {
                    id: 'demo-page-levain-calendrier',
                    kind: 'page',
                    text: 'Calendrier des rafraîchis',
                    icon: '📅',
                    children: [
                      { kind: 'text', text: 'Le dimanche soir, avant de le remettre au frigo.' },
                      { kind: 'text', text: 'Le vendredi matin quand une fournée est prévue le samedi.' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'demo-page-technique',
    kind: 'page',
    text: 'Notes techniques',
    icon: '💻',
    ago: 5 * DAY,
    children: [
      { kind: 'text', text: 'Ce qui me sert souvent sur le serveur de la maison.' },
      { kind: 'h2', text: 'Sauvegarde' },
      { kind: 'code', language: 'bash', text: 'rsync -avh --delete ~/Documents/ /mnt/sauvegarde/documents/\n\n# tous les soirs à 2 h\n0 2 * * * /usr/local/bin/sauvegarde.sh', caption: 'La ligne cron va dans crontab -e, sur le serveur.' },
      { kind: 'h2', text: 'Petits scripts' },
      { kind: 'code', language: 'typescript', text: "type Note = { title: string; tags: string[] };\n\nexport function byTag(notes: Note[], tag: string): Note[] {\n  return notes.filter(note => note.tags.includes(tag));\n}" },
      { kind: 'code', language: 'python', text: "from pathlib import Path\n\n\ndef taille(dossier: str) -> int:\n    \"\"\"Octets occupés par un dossier.\"\"\"\n    return sum(f.stat().st_size for f in Path(dossier).rglob('*') if f.is_file())" },
      { kind: 'text', text: 'Le port par défaut est {c:8080}, à changer dans le fichier {c:.env}.' },
      { kind: 'callout', icon: '⚠️', color: 'red', text: 'Ne jamais mettre le jeton dans un dépôt.' },
      { kind: 'h3', text: 'Dans les pages' },
      { kind: 'bullet', text: '{b:/} ouvre le menu des blocs, {b:@} cite une note, une collection, un lien ou une page' },
      { kind: 'bullet', text: '{i:Échap} sélectionne le bloc ; {b:Ctrl+Maj+↑} le remonte' },
      { kind: 'bullet', text: 'Du {fg=blue:texte en bleu}, du {bg=yellow:surligné} et du {s:barré}' },
      { kind: 'bullet', text: '{k:Ctrl+K} met un lien sur les mots choisis, {k:[[} cite une page et {k::} suivi d’un mot propose ses emoji' },
    ],
  },
  {
    id: 'demo-page-lectures',
    kind: 'page',
    text: 'Lectures 2026',
    icon: '📚',
    ago: 20 * DAY,
    children: [
      { kind: 'text', text: 'Ce que je lis cette année, et ce que j’en ai pensé.' },
      {
        kind: 'table',
        columns: LECTURES,
        children: [
          row({ titre: 'La Nuit des phares', auteur: 'Inès Garnier', note: 4, lu: true, genre: 'roman', themes: ['mer', 'famille'], fini: '2026-02-11', lien: '' }),
          row({ titre: 'Pourquoi les villes ralentissent', auteur: 'La Revue urbaine', note: 3.5, lu: true, genre: 'essai', themes: ['ville'], fini: '2026-03-20', lien: 'https://www.revue-urbaine.fr/pourquoi-les-villes-ralentissent' }),
          row({ titre: 'Station Nord', auteur: '', note: null, lu: false, genre: 'bd', themes: ['mer'], fini: '', lien: '' }),
        ],
      },
      { kind: 'h2', text: 'À lire ensuite' },
      { kind: 'embed', target: { type: 'note', id: 'line-lire' } },
      { kind: 'text', text: 'Voir aussi {@page=demo-page-technique}.' },
    ],
  },
];

/**
 * The demo as sync records, with clocks at each record's own time. Pure: it
 * imports nothing but core and types, so `tools/demo/seed-server.ts` can push
 * the same dataset to a real server for the phone.
 */
export function buildDemoRecords(now: number = Date.now()): SyncRecord[] {
  const events: { readonly time: number; readonly changes: LocalChange[] }[] = [];
  const add = (time: number, changes: LocalChange[]): void => {
    events.push({ time, changes });
  };

  const labelKeys = keysBetween(null, null, LABELS.length);
  add(now - 45 * DAY, LABELS.map((label, index) => ({ type: 'label' as const, id: label.id, patch: labelFields({ name: label.name, color: label.color, position: labelKeys[index]!, createdAt: now - 45 * DAY, deletedAt: null }) })));

  const noteKeys = keysBetween(null, null, NOTES.length);
  NOTES.forEach((seed, index) => {
    const time = now - seed.ago;
    const changes: LocalChange[] = [
      {
        type: 'note',
        id: seed.id,
        patch: noteFields({
          kind: seed.kind,
          title: seed.title,
          body: seed.body ?? '',
          rich: seed.rich,
          drawing: seed.drawing,
          color: seed.color ?? null,
          ...(seed.pattern ? { pattern: seed.pattern } : {}),
          pinned: seed.pinned ?? false,
          archived: seed.archived ?? false,
          trashedAt: seed.trashedAgo !== undefined ? now - seed.trashedAgo : null,
          labelIds: [...(seed.labels ?? [])],
          position: noteKeys[index]!,
          reminderAt: seed.reminder ? seed.reminder(now) : null,
          code: seed.code ?? '',
          hint: seed.hint ?? '',
          createdAt: time,
          deletedAt: null,
        }),
      },
    ];
    const checkKeys = keysBetween(null, null, seed.checks?.length ?? 0);
    seed.checks?.forEach(([text, checked], i) => {
      changes.push({ type: 'check', id: `${seed.id}-c${i}`, patch: checkFields({ noteId: seed.id, text, checked, position: checkKeys[i]!, indent: 0, createdAt: time, deletedAt: null }) });
    });
    if (seed.photo) {
      changes.push({
        type: 'attachment',
        id: seed.photo,
        patch: attachmentFields({ noteId: seed.id, mime: 'image/jpeg', width: 640, height: 480, bytes: 0, position: 'a0', uploaded: true, createdAt: time, deletedAt: null }),
      });
    }
    add(time, changes);
  });

  const byLine = new Map<string, LinkSeed[]>();
  for (const link of LINKS) byLine.set(link.line, [...(byLine.get(link.line) ?? []), link]);
  for (const [line, links] of byLine) {
    const keys = keysBetween(null, null, links.length);
    links.forEach((seed, index) => {
      const time = now - seed.ago;
      add(time, [
        {
          type: 'link',
          id: `demo-link-${line}-${index}`,
          patch: linkFields({
            noteId: line,
            url: seed.url,
            status: seed.status ?? 'ready',
            autoFile: false,
            filedBy: line === INBOX_ID ? null : 'claude',
            // The demo's readings are written in French.
            lang: 'fr',
            title: seed.title ?? '',
            summary: seed.summary ?? '',
            siteName: seed.siteName ?? '',
            kind: seed.kind ?? 'other',
            price: seed.price ?? null,
            currency: seed.price !== undefined ? 'EUR' : null,
            attributes: seed.attributes ?? [],
            imageIds: seed.images ?? [],
            imageUrl: null,
            done: seed.doneAgo !== undefined,
            doneAt: seed.doneAgo !== undefined ? now - seed.doneAgo : null,
            comment: seed.comment ?? '',
            position: keys[index]!,
            error: seed.error ?? null,
            analyzedAt: seed.status === 'pending' || seed.status === 'skipped' ? null : time,
            createdAt: time,
            deletedAt: null,
          }),
        },
      ]);
    });
  }

  // Pages: each block under its parent, siblings in order, at its page's time.
  let blockCount = 0;
  const placeBlocks = (seeds: readonly BlockSeed[], parentId: string | null, time: number): void => {
    const keys = keysBetween(null, null, seeds.length);
    seeds.forEach((seed, index) => {
      const id = seed.id ?? `demo-block-${(blockCount += 1)}`;
      const at = seed.ago !== undefined ? now - seed.ago : time;
      add(at, [
        {
          type: 'block',
          id,
          patch: blockFields({
            parentId,
            position: keys[index]!,
            kind: seed.kind,
            createdAt: at,
            text: typeof seed.text === 'function' ? seed.text(now) : (seed.text ?? ''),
            ...(seed.checked !== undefined || seed.kind === 'todo' ? { checked: seed.checked ?? false } : {}),
            ...(seed.language ? { language: seed.language } : {}),
            ...(seed.icon ? { icon: seed.icon } : {}),
            ...(seed.color ? { color: seed.color } : {}),
            ...(seed.columns ? { columns: seed.columns } : {}),
            ...(seed.cells ? { cells: seed.cells } : {}),
            ...(seed.target ? { target: seed.target } : {}),
            ...(seed.caption ? { caption: seed.caption } : {}),
            ...(seed.drawing ? { drawing: seed.drawing } : {}),
            ...(seed.kind === 'page' ? { trashedAt: null } : {}),
          }),
        },
      ]);
      placeBlocks(seed.children ?? [], id, at);
    });
  };
  placeBlocks(PAGES, null, now - DAY);

  // Clocks at each record's own time (as a Keep import does), so "Modifiée hier" says yesterday.
  let counter = 0;
  const records: SyncRecord[] = [];
  for (const event of events) {
    for (const change of event.changes) {
      counter += 1;
      const clock = formatHlc(event.time, counter, 'demoseed');
      records.push({ type: change.type, id: change.id, fields: change.patch, clocks: Object.fromEntries(Object.keys(change.patch).map(key => [key, clock])) });
    }
  }
  return records;
}

/** Image blob ids the demo records refer to (link images and the note photo). */
export const DEMO_IMAGE_IDS: readonly string[] = [
  ...new Set([...LINKS.flatMap(link => link.images ?? []), ...NOTES.flatMap(note => (note.photo ? [note.photo] : []))]),
];
