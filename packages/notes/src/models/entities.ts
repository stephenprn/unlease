/**
 * The five stored entities. Each is also a sync record: every field travels with its own clock.
 * Epoch ms. Rows are never removed: `deletedAt` is the tombstone, or a peer would bring them back.
 */
import { localized, t, tx, type Locale } from '@unlease/core/i18n';
import type { LineColor, NoteColor, NotePattern } from '@unlease/design/colors';

export const NOTE_KINDS = ['text', 'checklist', 'links', 'drawing'] as const;

export type NoteKind = (typeof NOTE_KINDS)[number];

export interface Note {
  readonly id: string;
  readonly kind: NoteKind;
  readonly title: string;
  /** Text notes only; empty otherwise. Plain text, or the formatted lines of `notes/services/noteBody` when `rich`. */
  readonly body: string;
  /** The body is formatted text (bold, italic, underline, headings), not plain text. */
  readonly rich: boolean;
  /** A drawing note's strokes (`notes/services/drawing`); empty otherwise. */
  readonly drawing: string;
  /** A text or checklist note's wash or gradient; a collection's pigment (never a gradient). */
  readonly color: NoteColor | null;
  /** The paper under a note's colour: dots, grid or lines. */
  readonly pattern: NotePattern | null;
  readonly pinned: boolean;
  readonly archived: boolean;
  readonly trashedAt: number | null;
  readonly labelIds: readonly string[];
  /** Fractional index (see `core/services/fractionalIndex`); smaller sorts first. */
  readonly position: string;
  readonly reminderAt: number | null;
  /** A collection's initials (one or two characters), kept for search and older clients. */
  readonly code: string;
  /** A collection's cut-out emblem key (`design/emblems`); null until one is chosen. */
  readonly emblem: string | null;
  /** A URL list's description, which Claude reads when it files a link. */
  readonly hint: string;
  /** A collection's link modules (`notes/models/modules`), in no order; null until picked: the defaults. */
  readonly modules: readonly string[] | null;
  /** A collection's template (`notes/models/templates`, one of the person's own), its links read with it; null or absent: each link's kind's. */
  readonly templateId?: string | null;
  /** The people of Contacts it is about or for (a gift's, a call's), as they were picked; none for most notes. */
  readonly contactIds: readonly string[];
  readonly createdAt: number;
  readonly deletedAt: number | null;
  /** The newest field clock's time. */
  readonly editedAt: number;
}

export interface CheckItem {
  readonly id: string;
  readonly noteId: string;
  readonly text: string;
  readonly checked: boolean;
  readonly position: string;
  /** 0, or 1 for a sub-item (Keep allows one level). */
  readonly indent: number;
  readonly createdAt: number;
  readonly deletedAt: number | null;
  /** When it was last written (its newest clock); not a synced field. */
  readonly editedAt: number;
}

/** What Claude decided a link is. Stored as these keys; shown in the interface's language. */
export const LINK_KINDS = [
  'product',
  'film',
  'series',
  'book',
  'music',
  'game',
  'restaurant',
  'place',
  'recipe',
  'article',
  'video',
  'event',
  'other',
] as const;

export type LinkKind = (typeof LINK_KINDS)[number];

export const LINK_KIND_NAMES: Record<LinkKind, string> = localized({
  product: tx('Product'),
  film: tx('Film'),
  series: tx('Series'),
  book: tx('Book'),
  music: tx('Music'),
  game: tx('Video game'),
  restaurant: tx('Restaurant'),
  place: tx('Place'),
  recipe: tx('Recipe'),
  article: tx('Article'),
  video: tx('Video'),
  event: tx('Event'),
  other: tx('Link'),
});

/** `skipped`: no Claude key is set, so the link is kept plain (a key set later can re-queue it). */
export type LinkStatus = 'pending' | 'ready' | 'failed' | 'skipped';

/** Who chose a link's collection. */
export const LINK_FILERS = ['claude', 'person'] as const;
export type LinkFiler = (typeof LINK_FILERS)[number];

export interface LinkAttribute {
  readonly label: string;
  readonly value: string;
}

export interface LinkItem {
  readonly id: string;
  readonly noteId: string;
  readonly url: string;
  readonly status: LinkStatus;
  /** Quick input or share sheet: the server picks its list, moves it there and clears this. */
  readonly autoFile: boolean;
  /** Null while nobody chose: it sits where it landed. Claude's sorting of "Non classé" leaves the person's choices alone. */
  readonly filedBy: LinkFiler | null;
  readonly title: string;
  readonly summary: string;
  readonly siteName: string;
  readonly kind: LinkKind;
  /** In the currency's main unit (49.9 is 49,90 €). */
  readonly price: number | null;
  /** ISO 4217, e.g. `EUR`. */
  readonly currency: string | null;
  /** « Suivi des prix » (written by the server's watch): the price before its last change, null until it changes. */
  readonly priceBefore: number | null;
  /** When the watch saw the price change. */
  readonly priceChangedAt: number | null;
  /** When the watch last read the price. */
  readonly priceCheckedAt: number | null;
  readonly attributes: readonly LinkAttribute[];
  /** Blob ids of the images the server kept, best first. */
  readonly imageIds: readonly string[];
  /** The page's own image URL, shown only until a kept copy exists. */
  readonly imageUrl: string | null;
  /** Bought, watched, visited: done is a stamp, and the link stays. */
  readonly done: boolean;
  readonly doneAt: number | null;
  readonly comment: string;
  readonly position: string;
  readonly error: string | null;
  readonly analyzedAt: number | null;
  /** The version of the template it was read with (`templateSignature`, written by the server); null or absent: read with the presets, before templates. */
  readonly readWith?: string | null;
  /** The language Claude writes its reading in: the interface's on the device that saved it, or asked to read it again. */
  readonly lang: Locale;
  /** The page « Garder une copie » made of it, in Pages (written by the server); null without one. */
  readonly copy: string | null;
  /** The people of Contacts it is for or about (a gift idea's, set by Contacts' « Idée cadeau » too); none for most links. */
  readonly contactIds: readonly string[];
  readonly createdAt: number;
  readonly deletedAt: number | null;
}

export interface Label {
  readonly id: string;
  readonly name: string;
  readonly color: LineColor;
  readonly position: string;
  readonly createdAt: number;
  readonly deletedAt: number | null;
}

/** A label's name as two names compare: case and accents aside. */
export const labelKey = (name: string): string => name.trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Whether another live label already wears this name: two « Courses » would read as one on a card. */
export function labelNameTaken(labels: Readonly<Record<string, Label | undefined>>, name: string, except: string | null = null): boolean {
  const key = labelKey(name);
  return Object.values(labels).some(label => !!label && label.id !== except && label.deletedAt === null && labelKey(label.name) === key);
}

/**
 * Whether another collection already goes by this title (« Non classé » as shown, too): two « À lire »
 * read as one in the navigation, and Claude files a link by a collection's title.
 */
export function lineTitleTaken(lines: Iterable<{ readonly id: string; readonly title: string }>, title: string, except: string | null = null): boolean {
  const key = labelKey(title);
  for (const line of lines) if (line.id !== except && (labelKey(line.title) === key || labelKey(shownTitle(line)) === key)) return true;
  return false;
}

/** A photo in a note. The bytes live on the server as a blob with the same id. */
export interface Attachment {
  readonly id: string;
  readonly noteId: string;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly position: string;
  /** True once the server holds the bytes; other devices show it only then. */
  readonly uploaded: boolean;
  readonly createdAt: number;
  readonly deletedAt: number | null;
}

/** The list every unfiled link lands in. One id on every device, so they merge. */
export const INBOX_ID = 'inbox';
/**
 * Its seeded name and sentence, stored in French on every device since the first version (Claude reads
 * them too): data, never rewritten, so every device keeps seeding the same record.
 */
export const INBOX_TITLE = 'Non classé';
export const INBOX_HINT = 'Les liens qui ne vont dans aucune autre liste.';
/** The same, as the interface shows them (`t(INBOX_SHOWN_TITLE)`). */
export const INBOX_SHOWN_TITLE = tx('Unsorted');
const INBOX_SHOWN_HINT = tx('Links that go in no other collection.');

/** A note's or a collection's title as the interface shows it: « Non classé » in its language while it keeps its seeded name. */
export function shownTitle(note: { readonly id: string; readonly title: string }): string {
  return note.id === INBOX_ID && note.title === INBOX_TITLE ? t(INBOX_SHOWN_TITLE) : note.title;
}

/** A collection's sentence as shown: the inbox's seeded one in the interface's language. */
export function shownHint(note: { readonly id: string; readonly hint: string }): string {
  return note.id === INBOX_ID && note.hint === INBOX_HINT ? t(INBOX_SHOWN_HINT) : note.hint;
}

export const TRASH_RETENTION_DAYS = 7;
