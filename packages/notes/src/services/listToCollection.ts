/**
 * « Transformer en collection »: a checklist, or a text note whose lines count as its items, made a
 * collection of links in one batch. Every filled item must hold an address (`services/lineLinks`,
 * as the Keep import reads a list); one that holds none stops it, and the person is told which.
 *
 * The collection takes the note's title (else a name drawn from its links), its colour when it is a
 * pigment (else the next collection's), the next emblem; its links are planned as `addLinks` plans
 * them (`services/savedLinks`: a reading copied from a link saved elsewhere at that address), the
 * words around each address its comment, a ticked item a done link, chosen by the person. The note
 * goes to the bin, so taking it back (`undoListToCollection`) brings it back as it was.
 */
import { getLocale, t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { createId } from '@unlease/core/services/ids';
import { positionsBetween } from '@unlease/core/services/fractionalIndex';
import type { Fields } from '@unlease/core/sync/record';
import { asLineColor, nextLineColor } from '@unlease/design/colors';

import { nextEmblem } from '../models/collections';
import { shownTitle, type CheckItem, type LinkItem, type Note } from '../models/entities';
import { linkFields, noteFields } from '../sync/entities';
import { TEXT_LIMITS } from '../sync/types';
import { freeTitle, listLinks, listName, shortLine, type ListLine } from './lineLinks';
import { bodyText } from './noteBody';
import { planLinks, savedAddresses } from './savedLinks';
import type { Templates } from './templates';

/** One write of the batch, as each client's `writeLocal` takes it. */
export interface CollectionChange {
  readonly type: 'note' | 'link';
  readonly id: string;
  readonly patch: Fields;
}

/** What the conversion reads of the library. */
export interface ListLibrary {
  readonly notes: Readonly<Record<string, Note>>;
  readonly checks: Readonly<Record<string, CheckItem>>;
  readonly checksByNote: Readonly<Record<string, readonly string[]>>;
  readonly links: Readonly<Record<string, LinkItem>>;
  readonly linkTemplates?: Templates;
}

/** A checklist's items, or a text note's lines, in order; null for a note of another kind. */
export function listLines(note: Note, library: Pick<ListLibrary, 'checks' | 'checksByNote'>): ListLine[] | null {
  if (note.kind === 'checklist') {
    return (library.checksByNote[note.id] ?? []).flatMap(id => {
      const check = library.checks[id];
      return check && check.deletedAt === null ? [{ text: check.text, done: check.checked }] : [];
    });
  }
  if (note.kind === 'text') return bodyText(note).split('\n').map(text => ({ text, done: false }));
  return null;
}

/** Whether the menu offers it: a checklist or a text note with something in it, not in the bin. */
export function canBecomeCollection(note: Note, library: Pick<ListLibrary, 'checks' | 'checksByNote'>): boolean {
  if (note.trashedAt !== null || note.deletedAt !== null) return false;
  return (listLines(note, library) ?? []).some(line => line.text.trim().length > 0);
}

export type ListToCollection =
  /** Nothing to make links of. */
  | { readonly status: 'empty' }
  /** Items that hold no address, as written. */
  | { readonly status: 'notLinks'; readonly lines: readonly string[] }
  | {
      readonly status: 'ok';
      readonly collectionId: string;
      readonly title: string;
      readonly links: number;
      /** The batch: the collection, its links, the note to the bin. */
      readonly changes: readonly CollectionChange[];
    };

export interface ListToCollectionOptions {
  /** The new collection's place among the notes (the client's top, as a new collection gets). */
  readonly position: string;
  /** The server reads links: they wait for Claude; else they are kept plain. */
  readonly reading: boolean;
  readonly now: number;
}

/** The batch that makes `note` a collection, or why it cannot be one. */
export function listToCollection(note: Note, library: ListLibrary, options: ListToCollectionOptions): ListToCollection {
  const lines = listLines(note, library);
  const found = lines ? listLinks(lines) : null;
  if (!lines || !lines.some(line => line.text.trim())) return { status: 'empty' };
  if (!found) return { status: 'notLinks', lines: lines.map(line => line.text.trim()).filter(Boolean) };
  if (found.strays.length > 0) return { status: 'notLinks', lines: found.strays.map(stray => stray.text) };

  const { now } = options;
  const collections = Object.values(library.notes).filter(line => line.kind === 'links' && line.deletedAt === null);
  const id = createId(now);
  // A title no other collection goes by: Claude files links by their collection's title.
  const title = freeTitle(note.title.trim() || listName(found.links) || t('Collection'), collections.map(shownTitle), TEXT_LIMITS.note.title);
  const collection: CollectionChange = {
    type: 'note',
    id,
    patch: noteFields({
      kind: 'links',
      title,
      body: '',
      color: asLineColor(note.color) ?? nextLineColor(collections.map(line => asLineColor(line.color))),
      pinned: false,
      archived: false,
      trashedAt: null,
      labelIds: [],
      position: options.position,
      reminderAt: null,
      code: ([...title][0] ?? '').toUpperCase().slice(0, 3),
      emblem: nextEmblem(collections),
      hint: '',
      createdAt: now,
      deletedAt: null,
    }),
  };

  const saved = savedAddresses(library.links, library.notes);
  // The new collection reads by kind: a reading is copied only from a collection that does too.
  const plans = planLinks(
    found.links.map(link => link.url),
    id,
    saved,
    library.linkTemplates ? { templates: library.linkTemplates, notes: library.notes } : undefined,
  );
  const positions = positionsBetween(null, null, plans.length);
  const links: CollectionChange[] = plans.map((plan, index) => {
    const link = found.links[index]!;
    return {
      type: 'link',
      id: createId(now),
      patch: linkFields({
        noteId: id,
        url: plan.url,
        status: options.reading ? 'pending' : 'skipped',
        autoFile: false,
        filedBy: 'person',
        lang: getLocale(),
        copy: null,
        title: '',
        summary: '',
        siteName: '',
        kind: 'other',
        price: null,
        currency: null,
        attributes: [],
        imageIds: [],
        imageUrl: null,
        error: null,
        analyzedAt: null,
        ...plan.reading,
        done: link.done,
        doneAt: link.done ? now : null,
        comment: link.comment.slice(0, TEXT_LIMITS.link.comment),
        position: positions[index]!,
        createdAt: now,
        deletedAt: null,
      }),
    };
  });
  const binned: CollectionChange = { type: 'note', id: note.id, patch: { trashedAt: now, pinned: false } };
  return { status: 'ok', collectionId: id, title, links: links.length, changes: [collection, ...links, binned] };
}

/** Taking it back: the collection and its links erased, the note out of the bin as it was. */
export function undoListToCollection(note: Pick<Note, 'id' | 'pinned'>, done: Extract<ListToCollection, { status: 'ok' }>, now: number): CollectionChange[] {
  return [
    ...done.changes.filter(change => change.id !== note.id).map(change => ({ type: change.type, id: change.id, patch: { deletedAt: now } })),
    { type: 'note', id: note.id, patch: { trashedAt: null, pinned: note.pinned } },
  ];
}

/** How many items the refusal names before « et N autres ». */
export const NOT_LINKS_SHOWN = 5;

/** The refusal, said in a dialog: what is wrong, the items (cut), and what to do. */
export function notLinksWords(kind: Note['kind'], lines: readonly string[]): { readonly title: string; readonly message: string; readonly items: readonly string[]; readonly more: string | null } {
  const checklist = kind === 'checklist';
  const one = lines.length === 1;
  const title = checklist
    ? one
      ? t('Un élément n’est pas un lien')
      : t('Certains éléments ne sont pas des liens')
    : one
      ? t('Une ligne n’est pas un lien')
      : t('Certaines lignes ne sont pas des liens');
  const message = checklist
    ? one
      ? t('Une collection ne contient que des liens. Modifiez ou supprimez cet élément, puis réessayez :')
      : t('Une collection ne contient que des liens. Modifiez ou supprimez ces éléments, puis réessayez :')
    : one
      ? t('Une collection ne contient que des liens. Modifiez ou supprimez cette ligne, puis réessayez :')
      : t('Une collection ne contient que des liens. Modifiez ou supprimez ces lignes, puis réessayez :');
  const items = lines.slice(0, NOT_LINKS_SHOWN).map(line => shortLine(line, 60));
  const rest = lines.length - items.length;
  return { title, message, items, more: rest > 0 ? t('et {count} autres', { count: rest }) : null };
}

/** The slip once done. */
export function listConvertedMessage(title: string, links: number): string {
  return t('Collection « {title} » créée : {links}', { title, links: plural(links, 'lien') });
}
