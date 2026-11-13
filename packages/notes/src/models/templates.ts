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
    field('brand', tx('Brand'), 'text', tx('The brand or maker')),
    field('colour', tx('Colour'), 'text', tx('Its colour, or the colours on offer')),
    field('sizes', tx('Size(s)'), 'list', tx('The sizes on offer')),
    field('material', tx('Material'), 'text', tx('The main materials')),
    field('model', tx('Model'), 'text', tx('The model’s name or reference')),
    field('availability', tx('Availability'), 'text', tx('In stock, on pre-order or sold out')),
  ],
  film: [
    field('director', tx('Director'), 'text', tx('Who directed it')),
    field('year', tx('Year'), 'number', tx('The year it came out')),
    field('length', tx('Length'), 'duration', tx('How long the film runs')),
    field('genre', tx('Genre'), 'list', tx('Its genres')),
    field('rating', tx('Rating'), 'text', tx('The audience’s or the critics’ rating, with its scale')),
  ],
  series: [
    field('creator', tx('Created by'), 'text', tx('Who created the series')),
    field('year', tx('Year'), 'number', tx('The year of its first episode')),
    field('seasons', tx('Seasons'), 'number', tx('How many seasons')),
    field('genre', tx('Genre'), 'list', tx('Its genres')),
    field('rating', tx('Rating'), 'text', tx('The audience’s or the critics’ rating, with its scale')),
  ],
  book: [
    field('author', tx('Author'), 'text', tx('Who wrote it')),
    field('publisher', tx('Publisher'), 'text', tx('The publishing house')),
    field('year', tx('Year'), 'number', tx('The year it was published')),
    field('pages', tx('Pages'), 'number', tx('How many pages')),
  ],
  music: [
    field('artist', tx('Artist'), 'text', tx('The artist or band')),
    field('album', tx('Album'), 'text', tx('The album it is from')),
    field('year', tx('Year'), 'number', tx('The year it came out')),
    field('length', tx('Length'), 'duration', tx('How long it lasts')),
  ],
  game: [
    field('platforms', tx('Platforms'), 'list', tx('The consoles and computers it plays on')),
    field('publisher', tx('Publisher'), 'text', tx('Who publishes it')),
    field('year', tx('Year'), 'number', tx('The year it came out')),
    field('genre', tx('Genre'), 'list', tx('Its genres')),
    field('rating', tx('Rating'), 'text', tx('The audience’s or the critics’ rating, with its scale')),
  ],
  restaurant: [
    field('address', tx('Address'), 'text', tx('The full address')),
    field('cuisine', tx('Cuisine'), 'text', tx('The kind of food')),
    field('averagePrice', tx('Average price'), 'text', tx('Roughly what a meal costs')),
    field('hours', tx('Opening hours'), 'text', tx('The days and hours it is open')),
    field('phone', tx('Phone'), 'text', tx('The number to book')),
  ],
  place: [
    field('address', tx('Address'), 'text', tx('The full address')),
    field('hours', tx('Opening hours'), 'text', tx('The days and hours it is open')),
    field('type', tx('Type'), 'text', tx('What it is: museum, shop, park…')),
  ],
  recipe: [
    field('totalTime', tx('Total time'), 'duration', tx('Preparing and cooking together')),
    field('servings', tx('Servings'), 'text', tx('For how many people, or how many pieces')),
    field('difficulty', tx('Difficulty'), 'text', tx('Easy, medium or hard')),
  ],
  article: [
    field('author', tx('Author'), 'text', tx('Who wrote it')),
    field('source', tx('Source'), 'text', tx('The paper, the blog or the site')),
    field('date', tx('Date'), 'date', tx('The day it was published')),
    field('readingTime', tx('Reading time'), 'duration', tx('How long it takes to read')),
  ],
  video: [
    field('channel', tx('Channel'), 'text', tx('The channel or account that posted it')),
    field('length', tx('Length'), 'duration', tx('How long it lasts')),
    field('date', tx('Date'), 'date', tx('The day it was published')),
  ],
  event: [
    field('date', tx('Date'), 'date', tx('The day, and the time when the page gives it')),
    field('venue', tx('Venue'), 'text', tx('The venue or the address')),
    field('price', tx('Price'), 'text', tx('What a ticket costs')),
  ],
  other: [],
};

/** The types' names, in the interface's language through `shownFieldType`. */
export const TEMPLATE_FIELD_TYPE_NAMES: Readonly<Record<TemplateFieldType, string>> = {
  text: tx('Text'),
  number: tx('Number'),
  date: tx('Date'),
  duration: tx('Length'),
  list: tx('List'),
  yesno: tx('Yes or no'),
};

/** What a value of each type looks like, under the type's name where it is picked. */
export const TEMPLATE_FIELD_TYPE_HINTS: Readonly<Record<TemplateFieldType, string>> = {
  text: tx('A few words'),
  number: tx('A number, with its unit'),
  date: tx('A day, as people write it'),
  duration: tx('A length of time: 1 h 30'),
  list: tx('Several values'),
  yesno: tx('Yes or no'),
};

/**
 * Each type as the editors name it: the shape of Claude's answer, in a few words (« Réponse : un
 * nombre »), read where shown. « quelques mots » is the default, left unsaid beside a fact.
 */
export const TEMPLATE_FIELD_TYPE_ANSWERS: Readonly<Record<TemplateFieldType, string>> = {
  text: tx('a few words'),
  number: tx('a number'),
  date: tx('a date'),
  duration: tx('a length of time'),
  list: tx('several values'),
  yesno: tx('yes or no'),
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
