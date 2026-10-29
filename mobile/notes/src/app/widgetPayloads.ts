/**
 * What each home-screen widget draws, as plain data built from the library with the app's own words
 * (`linkRowText`, `plural`, `formatPrice`) and order (`sectionsFor`), so the native widget only lays it
 * out (android/.../widget). A widget shows a first screenful; the rest is a tap away in the app.
 */
import { collectionEmblem } from '@unlease/notes/models/collections';
import { pebbleTurnOf } from '@unlease/design/pebbles';
import { asLineColor } from '@unlease/design/colors';
import { t } from '@unlease/core/i18n';
import { INBOX_TITLE, INBOX_ID, shownTitle, type CheckItem, type Note } from '@unlease/notes/models/entities';
import { formatPrice, plural } from '@unlease/core/services/format';
import { linkRowText } from '@unlease/notes/services/linkRow';
import { bodyText } from '@unlease/notes/services/noteBody';

import { sectionsFor } from './hooks/useBoard';
import type { LibraryState } from './store/libraryStore';

export const WIDGET_LIMITS = {
  /** A collection's links to do. */
  links: 30,
  /** A label's notes. */
  notes: 24,
  /** A card's open items, and how much of its words. */
  cardItems: 4,
  cardBody: 320,
  /** A note widget's items, and a text note's paragraphs. */
  items: 300,
  lines: 150,
} as const;

/** Its collection, label or note is gone (deleted, or in the bin): the widget offers another. */
export interface GonePayload {
  readonly v: 1;
  readonly kind: 'collection' | 'label' | 'note';
  readonly id: string;
  readonly gone: true;
}

export interface WidgetLink {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  /** "Zalando · 49,90 €": the source as the row writes it, the price at its end. */
  readonly source: string;
  /** The link's kind, for the glyph its frame shows until a picture lands. */
  readonly kind: string;
  /** Its first kept picture's blob id. */
  readonly image: string | null;
  /** Claude is reading it. */
  readonly reading: boolean;
}

export interface CollectionPayload {
  readonly v: 1;
  readonly kind: 'collection';
  readonly id: string;
  readonly gone: false;
  readonly title: string;
  /** "12 liens": the links still to do. */
  readonly count: string;
  readonly emblem: string;
  readonly color: string;
  /** Its stone's turn, for life. */
  readonly turn: number;
  readonly links: readonly WidgetLink[];
  /** "3 déjà faits", or ''. */
  readonly done: string;
}

export interface WidgetCard {
  readonly id: string;
  /** Where a press goes, after `carnet://`: a collection's page, else the note. */
  readonly open: string;
  readonly title: string;
  readonly body: string;
  /** A checklist's first open items. */
  readonly items: readonly { readonly text: string; readonly indent: number }[];
  /** "+ 3 éléments · 2 éléments cochés" (the board card's words), or ''. */
  readonly more: string;
  /** The note's wash or gradient key, or null for paper. */
  readonly wash: string | null;
}

export interface LabelPayload {
  readonly v: 1;
  readonly kind: 'label';
  readonly id: string;
  readonly gone: false;
  readonly name: string;
  readonly color: string;
  readonly notes: readonly WidgetCard[];
}

export interface WidgetItem {
  readonly id: string;
  readonly text: string;
  readonly checked: boolean;
  readonly indent: number;
}

export interface NotePayload {
  readonly v: 1;
  readonly kind: 'note';
  readonly id: string;
  readonly gone: false;
  readonly title: string;
  /** A checklist: its items tick on the widget. */
  readonly list: boolean;
  readonly wash: string | null;
  /** A text note's paragraphs. */
  readonly lines: readonly string[];
  /** A checklist's items in their order; the widget puts the done ones last. */
  readonly items: readonly WidgetItem[];
}

export type WidgetPayload = CollectionPayload | LabelPayload | NotePayload | GonePayload;

const gone = (kind: GonePayload['kind'], id: string): GonePayload => ({ v: 1, kind, id, gone: true });

const isLiveNote = (note: Note | undefined): note is Note => !!note && note.deletedAt === null && note.trashedAt === null;

function checksOf(state: LibraryState, noteId: string): CheckItem[] {
  return (state.checksByNote[noteId] ?? []).flatMap(id => {
    const item = state.checks[id];
    return item && item.deletedAt === null ? [item] : [];
  });
}

export function collectionPayload(state: LibraryState, id: string): CollectionPayload | GonePayload {
  const note = state.notes[id];
  if (!isLiveNote(note) || note.kind !== 'links') return gone('collection', id);
  const links = (state.linksByNote[id] ?? []).flatMap(linkId => {
    const link = state.links[linkId];
    return link && link.deletedAt === null ? [link] : [];
  });
  const open = links.filter(link => !link.done);
  const done = links.length - open.length;
  return {
    v: 1,
    kind: 'collection',
    id,
    gone: false,
    title: shownTitle(note).trim() || (id === INBOX_ID ? t(INBOX_TITLE) : t('Sans titre')),
    count: plural(open.length, 'lien'),
    emblem: collectionEmblem(id, note.emblem),
    color: asLineColor(note.color) ?? 'grey',
    turn: pebbleTurnOf(id),
    links: open.slice(0, WIDGET_LIMITS.links).map(link => {
      const text = linkRowText(link);
      const price = link.price !== null ? formatPrice(link.price, link.currency) : null;
      return {
        id: link.id,
        url: link.url,
        title: text.title,
        source: [text.source, price].filter(Boolean).join(' · '),
        kind: link.kind,
        image: link.imageIds[0] ?? null,
        reading: link.status === 'pending',
      };
    }),
    done: done > 0 ? plural(done, 'déjà fait', 'déjà faits') : '',
  };
}

/** A card's words: what it says, blank runs of lines closed up, cut where a card stops anyway. */
function excerpt(text: string): string {
  const closed = text.trim().replace(/\n{3,}/g, '\n\n');
  return closed.length > WIDGET_LIMITS.cardBody ? `${closed.slice(0, WIDGET_LIMITS.cardBody).trimEnd()}…` : closed;
}

function card(state: LibraryState, note: Note): WidgetCard {
  const base = { id: note.id, open: note.kind === 'links' ? `line/${note.id}` : `note/${note.id}`, title: shownTitle(note).trim(), wash: note.color };
  if (note.kind === 'links') {
    const open = (state.linksByNote[note.id] ?? []).filter(linkId => state.links[linkId]?.done === false).length;
    return { ...base, body: plural(open, 'lien'), items: [], more: '' };
  }
  if (note.kind === 'checklist') {
    const items = checksOf(state, note.id);
    const open = items.filter(item => !item.checked && item.text.trim());
    const done = items.filter(item => item.checked).length;
    const rest = open.length - WIDGET_LIMITS.cardItems;
    const more = [rest > 0 ? `+ ${plural(rest, 'élément')}` : '', done > 0 ? plural(done, 'élément coché', 'éléments cochés') : ''].filter(Boolean).join(' · ');
    return { ...base, body: '', items: open.slice(0, WIDGET_LIMITS.cardItems).map(item => ({ text: item.text, indent: item.indent })), more };
  }
  if (note.kind === 'drawing') return { ...base, body: t('Dessin'), items: [], more: '' };
  const body = excerpt(bodyText(note));
  const photos = state.attachmentsByNote[note.id]?.length ?? 0;
  // A note of pictures alone still says what it holds.
  const fallback = !body && !base.title ? (photos > 0 ? plural(photos, 'photo') : t('Note vide')) : '';
  return { ...base, body: body || fallback, items: [], more: body && photos > 0 ? plural(photos, 'photo') : '' };
}

export function labelPayload(state: LibraryState, id: string, now: number): LabelPayload | GonePayload {
  const label = state.labels[id];
  if (!label || label.deletedAt !== null) return gone('label', id);
  // The label's view on the board: pinned first, the archive and the bin left out.
  const ids = sectionsFor(`label:${id}`, state.noteOrder, state.notes, now).sections.flatMap(section => section.ids);
  return {
    v: 1,
    kind: 'label',
    id,
    gone: false,
    name: label.name,
    color: label.color,
    notes: ids.slice(0, WIDGET_LIMITS.notes).flatMap(noteId => {
      const note = state.notes[noteId];
      return note ? [card(state, note)] : [];
    }),
  };
}

export function notePayload(state: LibraryState, id: string): NotePayload | GonePayload {
  const note = state.notes[id];
  if (!isLiveNote(note) || note.kind === 'links') return gone('note', id);
  const list = note.kind === 'checklist';
  const lines = list ? [] : note.kind === 'drawing' ? [t('Dessin')] : bodyText(note).replace(/\s+$/, '').split('\n');
  return {
    v: 1,
    kind: 'note',
    id,
    gone: false,
    title: note.title.trim(),
    list,
    wash: note.color,
    lines: lines.length === 1 && lines[0] === '' ? [] : lines.slice(0, WIDGET_LIMITS.lines),
    items: list
      ? checksOf(state, id)
          .filter(item => item.text.trim())
          .slice(0, WIDGET_LIMITS.items)
          .map(item => ({ id: item.id, text: item.text, checked: item.checked, indent: item.indent }))
      : [],
  };
}

export function widgetPayload(kind: 'collection' | 'label' | 'note', target: string, state: LibraryState, now: number): WidgetPayload {
  if (kind === 'collection') return collectionPayload(state, target);
  if (kind === 'label') return labelPayload(state, target, now);
  return notePayload(state, target);
}
