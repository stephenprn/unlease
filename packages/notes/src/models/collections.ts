/**
 * One-tap starter collections, shared by the phone and the web. Fixed ids, so two devices that
 * both tap "Films & séries" make one collection, not two. Each comes with its own facts, chosen as
 * it is made (`starterFacts`).
 */
import { EMBLEMS, isEmblem, type CollectionEmblem, type Emblem } from '@unlease/design/emblems';
import { cutIndex } from '@unlease/design/shapes';
import { t, tx } from '@unlease/core/i18n';
import type { LineColor } from '@unlease/design/colors';
import { INBOX_ID } from './entities';
import type { PresetField, TemplateFieldType } from './templates';

export interface SuggestedCollection {
  readonly id: string;
  readonly title: string;
  readonly code: string;
  readonly hint: string;
  readonly emblem: Emblem;
  readonly color: LineColor;
  /**
   * What Claude notes on its links (« Les informations de cette collection »), chosen as it is made:
   * a kind's fields where they mean the same (their ids and words, so facts already read keep
   * matching), and what this collection needs besides. `TEMPLATE_LIMITS.fields` at most.
   */
  readonly facts: readonly PresetField[];
}

/** Its title and sentence read in the interface's language, so a tapped one is made in it. */
const starter = (made: SuggestedCollection): SuggestedCollection => ({ ...made, get title() { return t(made.title); }, get hint() { return t(made.hint); } });

/** A starter's fact, as a kind's preset is written (`KIND_TEMPLATES`): its words French, marked for the dictionary. */
const fact = (id: string, name: string, type: TemplateFieldType, hint: string): PresetField => ({ id, name, type, hint });

export const SUGGESTED_COLLECTIONS: readonly SuggestedCollection[] = [
  starter({
    id: 'line-mode',
    title: tx('Mode'),
    code: 'M',
    hint: tx('Vêtements, chaussures et accessoires à acheter.'),
    emblem: 'fleur',
    color: 'pink',
    facts: [
      fact('brand', tx('Marque'), 'text', tx('La marque ou le fabricant')),
      fact('model', tx('Modèle'), 'text', tx('Le nom ou la référence du modèle')),
      fact('colour', tx('Couleur'), 'text', tx('La couleur, ou les couleurs proposées')),
      fact('sizes', tx('Taille(s)'), 'list', tx('Les tailles proposées')),
      fact('material', tx('Matière'), 'text', tx('Les matières principales')),
      fact('fit', tx('Coupe'), 'text', tx('La coupe d’un vêtement : ajustée, droite, ample…')),
      fact('availability', tx('Disponibilité'), 'text', tx('En stock, en précommande ou épuisé')),
    ],
  }),
  starter({
    id: 'line-films',
    title: tx('Films & séries'),
    code: 'F',
    hint: tx('Films et séries à voir, au cinéma ou en streaming.'),
    emblem: 'etoile',
    color: 'yellow',
    facts: [
      fact('director', tx('Réalisateur'), 'text', tx('Qui a réalisé le film, ou créé la série')),
      fact('year', tx('Année'), 'number', tx('L’année de sortie, ou celle du premier épisode')),
      fact('genre', tx('Genre'), 'list', tx('Ses genres')),
      fact('length', tx('Durée'), 'duration', tx('La durée du film, ou d’un épisode')),
      fact('seasons', tx('Saisons'), 'number', tx('Pour une série, le nombre de saisons')),
      fact('rating', tx('Note [rating]'), 'text', tx('La note du public ou de la critique, avec son échelle')),
      fact('whereToWatch', tx('Où le voir'), 'list', tx('Au cinéma, ou les plateformes qui le proposent')),
    ],
  }),
  starter({
    id: 'line-restos',
    title: tx('Restaurants'),
    code: 'R',
    hint: tx('Restaurants, cafés et bars à essayer.'),
    emblem: 'soleil',
    color: 'red',
    facts: [
      fact('cuisine', tx('Cuisine'), 'text', tx('Le genre de cuisine')),
      fact('neighbourhood', tx('Quartier'), 'text', tx('Le quartier et la ville')),
      fact('averagePrice', tx('Prix moyen'), 'text', tx('Ce que coûte un repas, à peu près')),
      fact('address', tx('Adresse'), 'text', tx('L’adresse complète')),
      fact('hours', tx('Horaires'), 'text', tx('Les jours et heures d’ouverture')),
      fact('booking', tx('Réservation'), 'text', tx('Comment réserver : en ligne, par téléphone, ou sans réservation')),
      fact('phone', tx('Téléphone'), 'text', tx('Le numéro pour réserver')),
    ],
  }),
  starter({
    id: 'line-lire',
    title: tx('À lire'),
    code: 'L',
    hint: tx('Articles, essais et livres à lire.'),
    emblem: 'feuille',
    color: 'green',
    facts: [
      fact('author', tx('Auteur'), 'text', tx('Qui l’a écrit')),
      fact('source', tx('Source'), 'text', tx('Le journal, le blog, le site ou l’éditeur')),
      fact('date', tx('Date'), 'date', tx('Le jour de sa publication')),
      fact('readingTime', tx('Temps de lecture'), 'duration', tx('Le temps qu’il faut pour le lire')),
      fact('pages', tx('Pages'), 'number', tx('Pour un livre, le nombre de pages')),
    ],
  }),
  starter({
    id: 'line-maison',
    title: tx('Maison'),
    code: 'H',
    hint: tx('Meubles, déco et objets pour la maison.'),
    emblem: 'arche',
    color: 'ochre',
    facts: [
      fact('brand', tx('Marque'), 'text', tx('La marque ou le fabricant')),
      fact('model', tx('Modèle'), 'text', tx('Le nom ou la référence du modèle')),
      fact('dimensions', tx('Dimensions'), 'text', tx('Largeur, profondeur et hauteur, avec l’unité')),
      fact('material', tx('Matière'), 'text', tx('Les matières principales')),
      fact('colour', tx('Couleur'), 'text', tx('La couleur, ou les couleurs proposées')),
      fact('delivery', tx('Livraison'), 'text', tx('Le délai et le prix de la livraison')),
      fact('availability', tx('Disponibilité'), 'text', tx('En stock, en précommande ou épuisé')),
    ],
  }),
  starter({
    id: 'line-voyages',
    title: tx('Voyages'),
    code: 'V',
    hint: tx('Lieux, hôtels et idées de voyage.'),
    emblem: 'oiseau',
    color: 'blue',
    facts: [
      fact('destination', tx('Destination'), 'text', tx('La ville, la région et le pays')),
      fact('type', tx('Type'), 'text', tx('Ce que c’est : hôtel, site, restaurant, randonnée…')),
      fact('address', tx('Adresse'), 'text', tx('L’adresse complète')),
      fact('bestSeason', tx('Quand y aller'), 'text', tx('La meilleure saison pour y aller')),
      fact('budget', tx('Budget'), 'text', tx('Ce que ça coûte, à peu près : une nuit, une entrée…')),
      fact('access', tx('Accès'), 'text', tx('Comment y aller : gare, aéroport, transports')),
    ],
  }),
];

/** A collection's name as two names compare: case and accents aside. */
const nameKey = (title: string): string => title.trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * The starters not made yet: by their fixed id, and by their name (a collection restored or made on
 * another device has its own id, and « À lire » twice reads as one).
 */
export function suggestionsFor(lines: readonly { readonly id: string; readonly title: string }[]): SuggestedCollection[] {
  const ids = new Set(lines.map(line => line.id));
  const names = new Set(lines.map(line => nameKey(line.title)));
  return SUGGESTED_COLLECTIONS.filter(suggestion => !ids.has(suggestion.id) && !names.has(nameKey(suggestion.title)));
}

/**
 * The emblem a collection wears: its own choice, else a starter's designed one (they predate
 * emblems on older devices), else one picked from its id: stable everywhere.
 */
export function emblemOf(id: string, chosen: string | null): Emblem {
  if (isEmblem(chosen)) return chosen;
  return SUGGESTED_COLLECTIONS.find(starter => starter.id === id)?.emblem ?? EMBLEMS[cutIndex(id, EMBLEMS.length)]!;
}

/** What a collection draws: "Non classé" is always the tray. */
export function collectionEmblem(id: string, chosen: string | null): CollectionEmblem {
  return id === INBOX_ID ? 'bac' : emblemOf(id, chosen);
}

/** The first emblem no collection shows yet, stored or derived, in order. */
export function nextEmblem(collections: readonly { readonly id: string; readonly emblem: string | null }[]): Emblem {
  const shown = new Set<string>(collections.map(collection => collectionEmblem(collection.id, collection.emblem)));
  return EMBLEMS.find(emblem => !shown.has(emblem)) ?? EMBLEMS[collections.length % EMBLEMS.length]!;
}
