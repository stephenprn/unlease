/**
 * Page templates: what a new page, still empty, offers to start from, quietly under its title on
 * both clients, never as a step before writing (once it holds something they are gone). Each fills
 * the page with blocks its owner then edits (headings, tasks, a typed table, today written as a
 * date), written once in the device's language: from then on they are the owner's words, never
 * translated. « Journal du jour » is the day's page Agenda's « Note du jour » makes
 * (`sync/journal`), so a day reads the same however it was started.
 */
import { tx, type Locale } from '@unlease/core/i18n';
import { dateRun, serializeRich, type Run } from '@unlease/core/services/richText';
import type { LineColor } from '@unlease/design/colors';
import type { GlyphName } from '@unlease/design/glyphs';
import type { BlockKind, TableColumn } from '../models/blocks';
import { dailyPageLines, dayTitle } from '../sync/journal';
import type { BlockMap, ChildIndex } from './blocks';
import type { BlockDraft } from './pageText';

export const PAGE_TEMPLATES = ['journal', 'meeting', 'trip', 'reading', 'project'] as const;

export type PageTemplateKey = (typeof PAGE_TEMPLATES)[number];

export interface TemplateChoice {
  readonly key: PageTemplateKey;
  /** Its name, translated where shown (`t`). */
  readonly label: string;
  readonly glyph: GlyphName;
}

/** The templates as an empty page offers them, in this order. */
export const TEMPLATE_CHOICES: readonly TemplateChoice[] = [
  { key: 'journal', label: tx('Journal du jour'), glyph: 'pen' },
  { key: 'meeting', label: tx('Réunion'), glyph: 'people' },
  { key: 'trip', label: tx('Voyage'), glyph: 'mapPin' },
  { key: 'reading', label: tx('Liste de lecture'), glyph: 'book' },
  { key: 'project', label: tx('Projet'), glyph: 'checklist' },
];

export interface PageTemplate {
  /** The page's title, given only to a page without one (null: none). */
  readonly title: string | null;
  /** The page's emoji, given only to a page without one (null: none). */
  readonly icon: string | null;
  /** Its blocks, at the top of the page. */
  readonly drafts: readonly BlockDraft[];
  /** The top-level draft the caret goes to (at its end) once the page has a title; until then, the title takes it. */
  readonly writeAt: number;
}

/** What a template writes, in each language: content once written (never translated after). */
const WORDS = {
  fr: {
    date: 'Date',
    attendees: 'Participants',
    agenda: 'Ordre du jour',
    notes: 'Notes',
    decisions: 'Décisions',
    actions: 'Actions',
    leaving: 'Départ',
    back: 'Retour',
    itinerary: 'Étapes',
    place: 'Lieu',
    stay: 'Hébergement',
    booked: 'Réservé',
    pack: 'À emporter',
    packing: ['Papiers d’identité', 'Billets et réservations', 'Chargeurs', 'Trousse de toilette'],
    see: 'À voir, à faire',
    title: 'Titre',
    author: 'Auteur',
    status: 'Statut',
    toRead: 'À lire',
    reading: 'En cours',
    read: 'Lu',
    rating: 'Note',
    readingNotes: 'Notes de lecture',
    goal: 'Objectif',
    started: 'Début',
    tasks: 'Tâches',
    task: 'Tâche',
    owner: 'Qui',
    due: 'Échéance',
    todo: 'À faire',
    doing: 'En cours',
    done: 'Fait',
  },
  en: {
    date: 'Date',
    attendees: 'Attendees',
    agenda: 'Agenda',
    notes: 'Notes',
    decisions: 'Decisions',
    actions: 'Action items',
    leaving: 'Leaving',
    back: 'Back',
    itinerary: 'Itinerary',
    place: 'Place',
    stay: 'Where to stay',
    booked: 'Booked',
    pack: 'To pack',
    packing: ['Passport or ID', 'Tickets and bookings', 'Chargers', 'Toiletries'],
    see: 'To see and do',
    title: 'Title',
    author: 'Author',
    status: 'Status',
    toRead: 'To read',
    reading: 'Reading',
    read: 'Read',
    rating: 'Rating',
    readingNotes: 'Reading notes',
    goal: 'Goal',
    started: 'Start',
    tasks: 'Tasks',
    task: 'Task',
    owner: 'Owner',
    due: 'Due',
    todo: 'To do',
    doing: 'In progress',
    done: 'Done',
  },
} as const;

/** « Date : » in French, "Date:" in English: a label before what follows on its line. */
const label = (words: string, lang: Locale): string => (lang === 'fr' ? `${words} : ` : `${words}: `);

const plain = (value: string): Run => ({ kind: 'text', text: value, marks: {} });

/** A line of words, then the day as a date when it is one. */
function withDay(lead: string, day: string): string {
  const date = dateRun(day);
  return serializeRich([plain(lead), ...(date ? [date] : [])]);
}

const line = (kind: BlockKind, text = ''): BlockDraft => ({ kind, text: text ? serializeRich([plain(text)]) : '' });

/** A table of typed columns and `rows` empty rows. Ids are the table's own (a column's, an option's). */
function table(columns: readonly TableColumn[], rows = 3): BlockDraft {
  return { kind: 'table', text: '', extra: { columns }, children: Array.from({ length: rows }, () => ({ kind: 'row' as const, text: '', extra: { cells: {} } })) };
}

const option = (id: string, name: string, color: LineColor) => ({ id, name, color });

/** A template's blocks, its title and its icon, for `day` (`2026-11-09`, the device's today) in `lang`. */
export function pageTemplate(key: PageTemplateKey, day: string, lang: Locale): PageTemplate {
  const words = WORDS[lang];
  switch (key) {
    case 'journal':
      return { title: dayTitle(day, lang), icon: null, drafts: [...dailyPageLines(day, lang)], writeAt: 1 };
    case 'meeting':
      return {
        title: null,
        icon: '🤝',
        drafts: [
          { kind: 'text', text: withDay(label(words.date, lang), day) },
          line('text', label(words.attendees, lang)),
          line('h2', words.agenda),
          line('bullet'),
          line('h2', words.notes),
          line('text'),
          line('h2', words.decisions),
          line('bullet'),
          line('h2', words.actions),
          line('todo'),
        ],
        writeAt: 1,
      };
    case 'trip':
      return {
        title: null,
        icon: '🧳',
        drafts: [
          { kind: 'text', text: withDay(label(words.leaving, lang), day) },
          line('text', label(words.back, lang)),
          line('h2', words.itinerary),
          table([
            { id: 'day', name: words.date, type: 'date' },
            { id: 'place', name: words.place, type: 'text' },
            { id: 'stay', name: words.stay, type: 'text' },
            { id: 'booked', name: words.booked, type: 'checkbox' },
          ]),
          line('h2', words.pack),
          ...words.packing.map(item => ({ ...line('todo', item), checked: false })),
          line('h2', words.see),
          line('bullet'),
        ],
        writeAt: 1,
      };
    case 'reading':
      return {
        title: null,
        icon: '📚',
        drafts: [
          table([
            { id: 'title', name: words.title, type: 'text', width: 240 },
            { id: 'author', name: words.author, type: 'text' },
            { id: 'status', name: words.status, type: 'select', width: 140, options: [option('toRead', words.toRead, 'sky'), option('reading', words.reading, 'yellow'), option('read', words.read, 'green')] },
            { id: 'rating', name: words.rating, type: 'number', unit: '★', width: 100 },
          ]),
          line('h2', words.readingNotes),
          line('text'),
        ],
        writeAt: 2,
      };
    case 'project':
      return {
        title: null,
        icon: '🚀',
        drafts: [
          { kind: 'callout', text: serializeRich([plain(label(words.goal, lang))]), extra: { icon: '🎯' } },
          { kind: 'text', text: withDay(label(words.started, lang), day) },
          line('h2', words.tasks),
          table([
            { id: 'task', name: words.task, type: 'text', width: 240 },
            { id: 'owner', name: words.owner, type: 'text', width: 140 },
            { id: 'due', name: words.due, type: 'date' },
            { id: 'status', name: words.status, type: 'select', width: 140, options: [option('todo', words.todo, 'grey'), option('doing', words.doing, 'yellow'), option('done', words.done, 'green')] },
          ]),
          line('h2', words.notes),
          line('text'),
        ],
        writeAt: 0,
      };
    default:
      return { title: null, icon: null, drafts: [], writeAt: 0 };
  }
}

/**
 * Nothing written in the page yet: no block, or only empty paragraphs (a sub-page in the bin, hidden,
 * counts for nothing). Its title and its icon do not count: a page named first still offers templates.
 */
export function isBlankPage(blocks: BlockMap, children: ChildIndex, pageId: string): boolean {
  return (children[pageId] ?? []).every(id => {
    const block = blocks[id];
    if (!block || block.deletedAt !== null) return true;
    if (block.kind === 'page') return block.trashedAt !== null;
    return block.kind === 'text' && block.text === '' && (children[id] ?? []).length === 0;
  });
}
