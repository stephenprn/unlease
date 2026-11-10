/**
 * What Carnet reads from a link, as a template (« modèle de fiche »): named fields, each with its type
 * and what to put in it, which Claude fills when it reads the page. Every kind of link has its own
 * (`KIND_TEMPLATES`: the facts Claude has always looked for, recipes' times, films' directors), which
 * the person may change and set back; they may also make their own (« Vin », « Plante ») and give one
 * to a collection, whose links are then read with it. A template's fields land on the link as its
 * facts (`attributes`), labelled with the fields' names, in the template's order.
 */
import { tx } from '@unlease/core/i18n';
import type { LinkKind } from './entities';

/** How a field's value is written: the kind of answer Claude gives, and how it is shown. */
export const TEMPLATE_FIELD_TYPES = ['text', 'number', 'date', 'duration', 'list', 'yesno'] as const;
export type TemplateFieldType = (typeof TEMPLATE_FIELD_TYPES)[number];

export const TEMPLATE_LIMITS = {
  /** A template's own name (« Vin »). */
  name: 40,
  /** A field's name: it becomes the fact's label (60 at most on the link). */
  fieldName: 40,
  /** What to put in a field, in the person's words. */
  hint: 200,
  /** The fields one template holds: as many facts as a link shows on its page. */
  fields: 8,
  /** The person's own templates. */
  templates: 50,
} as const;

export interface TemplateField {
  /** Stable through renames and moves: letters and digits, unique within its template. */
  readonly id: string;
  /** Its name, the fact's label on the link (« Domaine »). */
  readonly name: string;
  readonly type: TemplateFieldType;
  /** What to put in it (« Le domaine ou le château qui le produit »): what Claude reads; may be empty. */
  readonly hint: string;
}

/**
 * A stored template (`linkTemplate` record). A kind's own, once changed, is kept under the kind's
 * fixed id (`kindTemplateId`), so two devices changing it write one record; set back, it is deleted
 * and the kind's preset reads again. The person's own carry a name and no kind.
 */
export interface LinkTemplate {
  readonly id: string;
  /** The person's own template's name; empty for a kind's (shown by the kind's name). */
  readonly name: string;
  /** The kind it is the template of; null for one of the person's own. */
  readonly kind: LinkKind | null;
  readonly fields: readonly TemplateField[];
  readonly createdAt: number;
  readonly deletedAt: number | null;
}

/**
 * A preset's field: its name and its hint are French marked for the dictionary (`tx`), shown in the
 * interface's language (`shownFieldName`, `shownFieldHint`). A name that reads two ways in English
 * carries its context (« Note [rating] »: a rating, not a note).
 */
export interface PresetField {
  readonly id: string;
  readonly name: string;
  readonly type: TemplateFieldType;
  readonly hint: string;
}

const field = (id: string, name: string, type: TemplateFieldType, hint: string): PresetField => ({ id, name, type, hint });

/**
 * Each kind's preset: the facts Claude looked for before templates existed (the analysis prompt's
 * lists, in the same order), each with what to put in it. `other` has none: a link of no kind keeps
 * its title and summary.
 */
export const KIND_TEMPLATES: Readonly<Record<LinkKind, readonly PresetField[]>> = {
  product: [
    field('brand', tx('Marque'), 'text', tx('La marque ou le fabricant')),
    field('colour', tx('Couleur'), 'text', tx('La couleur, ou les couleurs proposées')),
    field('sizes', tx('Taille(s)'), 'list', tx('Les tailles proposées')),
    field('material', tx('Matière'), 'text', tx('Les matières principales')),
    field('model', tx('Modèle'), 'text', tx('Le nom ou la référence du modèle')),
    field('availability', tx('Disponibilité'), 'text', tx('En stock, en précommande ou épuisé')),
  ],
  film: [
    field('director', tx('Réalisateur'), 'text', tx('Qui l’a réalisé')),
    field('year', tx('Année'), 'number', tx('L’année de sortie')),
    field('length', tx('Durée'), 'duration', tx('La durée du film')),
    field('genre', tx('Genre'), 'list', tx('Ses genres')),
    field('rating', tx('Note [rating]'), 'text', tx('La note du public ou de la critique, avec son échelle')),
  ],
  series: [
    field('creator', tx('Création'), 'text', tx('Qui a créé la série')),
    field('year', tx('Année'), 'number', tx('L’année de son premier épisode')),
    field('seasons', tx('Saisons'), 'number', tx('Le nombre de saisons')),
    field('genre', tx('Genre'), 'list', tx('Ses genres')),
    field('rating', tx('Note [rating]'), 'text', tx('La note du public ou de la critique, avec son échelle')),
  ],
  book: [
    field('author', tx('Auteur'), 'text', tx('Qui l’a écrit')),
    field('publisher', tx('Éditeur'), 'text', tx('La maison d’édition')),
    field('year', tx('Année'), 'number', tx('L’année de parution')),
    field('pages', tx('Pages'), 'number', tx('Le nombre de pages')),
  ],
  music: [
    field('artist', tx('Artiste'), 'text', tx('L’artiste ou le groupe')),
    field('album', tx('Album'), 'text', tx('L’album dont il vient')),
    field('year', tx('Année'), 'number', tx('L’année de sortie')),
    field('length', tx('Durée'), 'duration', tx('Sa durée')),
  ],
  game: [
    field('platforms', tx('Plateformes'), 'list', tx('Les consoles et ordinateurs où il se joue')),
    field('publisher', tx('Éditeur'), 'text', tx('Qui l’édite')),
    field('year', tx('Année'), 'number', tx('L’année de sortie')),
    field('genre', tx('Genre'), 'list', tx('Ses genres')),
    field('rating', tx('Note [rating]'), 'text', tx('La note du public ou de la critique, avec son échelle')),
  ],
  restaurant: [
    field('address', tx('Adresse'), 'text', tx('L’adresse complète')),
    field('cuisine', tx('Cuisine'), 'text', tx('Le genre de cuisine')),
    field('averagePrice', tx('Prix moyen'), 'text', tx('Ce que coûte un repas, à peu près')),
    field('hours', tx('Horaires'), 'text', tx('Les jours et heures d’ouverture')),
    field('phone', tx('Téléphone'), 'text', tx('Le numéro pour réserver')),
  ],
  place: [
    field('address', tx('Adresse'), 'text', tx('L’adresse complète')),
    field('hours', tx('Horaires'), 'text', tx('Les jours et heures d’ouverture')),
    field('type', tx('Type'), 'text', tx('Ce que c’est : musée, boutique, parc…')),
  ],
  recipe: [
    field('totalTime', tx('Temps total'), 'duration', tx('Préparation et cuisson comprises')),
    field('servings', tx('Portions'), 'text', tx('Pour combien de personnes, ou combien de pièces')),
    field('difficulty', tx('Difficulté'), 'text', tx('Facile, moyenne ou difficile')),
  ],
  article: [
    field('author', tx('Auteur'), 'text', tx('Qui l’a écrit')),
    field('source', tx('Source'), 'text', tx('Le journal, le blog ou le site')),
    field('date', tx('Date'), 'date', tx('Le jour de sa publication')),
    field('readingTime', tx('Temps de lecture'), 'duration', tx('Le temps qu’il faut pour le lire')),
  ],
  video: [
    field('channel', tx('Chaîne'), 'text', tx('La chaîne ou le compte qui l’a publiée')),
    field('length', tx('Durée'), 'duration', tx('Sa durée')),
    field('date', tx('Date'), 'date', tx('Le jour de sa publication')),
  ],
  event: [
    field('date', tx('Date'), 'date', tx('Le jour, et l’heure quand la page la donne')),
    field('venue', tx('Lieu [venue]'), 'text', tx('La salle ou l’adresse')),
    field('price', tx('Prix'), 'text', tx('Le prix d’une place')),
  ],
  other: [],
};

/** The types' names, in the interface's language through `shownFieldType`. */
export const TEMPLATE_FIELD_TYPE_NAMES: Readonly<Record<TemplateFieldType, string>> = {
  text: tx('Texte'),
  number: tx('Nombre'),
  date: tx('Date'),
  duration: tx('Durée'),
  list: tx('Liste'),
  yesno: tx('Oui ou non'),
};

/** What a value of each type looks like, under the type's name where it is picked. */
export const TEMPLATE_FIELD_TYPE_HINTS: Readonly<Record<TemplateFieldType, string>> = {
  text: tx('Quelques mots'),
  number: tx('Un nombre, avec son unité'),
  date: tx('Un jour, comme on l’écrit'),
  duration: tx('Un temps : 1 h 30'),
  list: tx('Plusieurs valeurs'),
  yesno: tx('Oui ou non'),
};

/**
 * How each type is asked of Claude, in English (the prompt's language): the value it writes, in the
 * message's language. Fixed words, so what the person types is the only thing that varies.
 */
export const TEMPLATE_FIELD_TYPE_PROMPTS: Readonly<Record<TemplateFieldType, string>> = {
  text: 'a few words',
  number: 'a number, with its unit when it has one',
  date: 'a date as people write it in the message’s language',
  duration: 'a length of time, short (1 h 30)',
  list: 'several values separated by commas',
  yesno: 'yes or no, in the message’s language',
};
