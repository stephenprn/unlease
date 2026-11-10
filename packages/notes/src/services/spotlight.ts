/**
 * What the spotlight searches of Carnet (`searchIndex`): every live note, collection and link as a
 * document. A note is its lines and checklist items, its labels as meta (an untitled note's first
 * line counts as a heading); a collection its sentence; a link what Claude read of it and the
 * person's comment, with its site, kind and collection as meta, so "films dune" finds the film.
 * Nothing in the bin. Pages' documents are `@unlease/pages/services/spotlight`.
 */
import { LINK_KIND_NAMES, shownHint, shownTitle, type Attachment, type CheckItem, type Label, type LinkItem, type Note } from '../models/entities';
import { noteEditedAt } from '../sync/entities';
import { cleanSiteName } from './linkRow';
import { spotKey, type SpotMeta } from '@unlease/core/services/spotlight';
import type { SearchDoc, SearchPart } from '@unlease/core/services/searchIndex';
import { siteDomain, slugTitle } from '@unlease/core/services/url';
import { bodyText } from './noteBody';

export const NOTES_SPOT_TYPES = ['note', 'collection', 'link'] as const;

export type NotesSpotType = (typeof NOTES_SPOT_TYPES)[number];

/** Carnet's library as its clients hold it. */
export interface NotesSpotLibrary {
  readonly notes: Readonly<Record<string, Note>>;
  readonly checks: Readonly<Record<string, CheckItem>>;
  readonly links: Readonly<Record<string, LinkItem>>;
  readonly labels: Readonly<Record<string, Label>>;
  readonly attachments: Readonly<Record<string, Attachment>>;
  readonly checksByNote: Readonly<Record<string, readonly string[]>>;
  readonly linksByNote: Readonly<Record<string, readonly string[]>>;
  readonly attachmentsByNote: Readonly<Record<string, readonly string[]>>;
  /** Every live note, in board order. */
  readonly noteOrder: readonly string[];
}

/** A link's title as its row shows it: what Claude read, else its address made readable. */
export function linkTitle(link: Pick<LinkItem, 'title' | 'url'>): string {
  return link.title.trim() || slugTitle(link.url) || siteDomain(link.url);
}

function labelNames(library: NotesSpotLibrary, ids: readonly string[]): string {
  const names: string[] = [];
  for (const id of ids) {
    const label = library.labels[id];
    if (label && label.deletedAt === null) names.push(label.name);
  }
  return names.join(' · ');
}

function children<T extends { readonly deletedAt: number | null }>(ids: readonly string[] | undefined, map: Readonly<Record<string, T>>): T[] {
  const out: T[] = [];
  for (const id of ids ?? []) {
    const item = map[id];
    if (item && item.deletedAt === null) out.push(item);
  }
  return out;
}

function noteDoc(library: NotesSpotLibrary, note: Note): SearchDoc<SpotMeta> {
  const parts: SearchPart[] = [];
  // Without a title, the first line stands for one, as on a card.
  let first = !note.title.trim();
  const add = (text: string, ref: string | null): void => {
    parts.push({ text, role: first ? 'heading' : 'body', ref });
    first = false;
  };
  for (const line of bodyText(note).split('\n')) if (line.trim()) add(line.trim(), null);
  const checks = children(library.checksByNote[note.id], library.checks);
  for (const item of checks) if (item.text.trim()) add(item.text.trim(), item.id);
  const labels = labelNames(library, note.labelIds);
  if (labels) parts.push({ text: labels, role: 'meta' });
  const editedAt = noteEditedAt(note, checks, children(library.attachmentsByNote[note.id], library.attachments));
  return { key: spotKey('note', note.id), title: note.title.trim(), parts, editedAt, meta: { type: 'note', id: note.id, labelIds: note.labelIds, archived: note.archived, within: null } };
}

function collectionDoc(library: NotesSpotLibrary, note: Note): SearchDoc<SpotMeta> {
  const parts: SearchPart[] = [];
  const hint = shownHint(note).trim();
  if (hint) parts.push({ text: hint, role: 'body' });
  const labels = labelNames(library, note.labelIds);
  if (labels) parts.push({ text: labels, role: 'meta' });
  return { key: spotKey('collection', note.id), title: shownTitle(note).trim(), parts, editedAt: note.editedAt, meta: { type: 'collection', id: note.id, labelIds: [], archived: note.archived, within: null } };
}

function linkDoc(link: LinkItem, collection: Note): SearchDoc<SpotMeta> {
  const parts: SearchPart[] = [];
  const meta = (text: string, weight = 1): void => {
    if (text.trim()) parts.push({ text: text.trim(), role: 'meta', weight });
  };
  const body = (text: string): void => {
    if (text.trim()) parts.push({ text: text.trim(), role: 'body' });
  };
  meta(cleanSiteName(link.siteName) ?? siteDomain(link.url));
  if (link.kind !== 'other') meta(LINK_KIND_NAMES[link.kind]);
  meta(shownTitle(collection));
  body(link.summary);
  for (const attribute of link.attributes) body(`${attribute.label} ${attribute.value}`);
  body(link.comment);
  meta(link.url, 0.5);
  const editedAt = Math.max(link.createdAt, link.analyzedAt ?? 0, link.doneAt ?? 0);
  return { key: spotKey('link', link.id), title: linkTitle(link), parts, editedAt, meta: { type: 'link', id: link.id, labelIds: [], archived: collection.archived, within: collection.id } };
}

/** Every live note, collection and link as a document. */
export function notesSpotlightDocs(library: NotesSpotLibrary): SearchDoc<SpotMeta>[] {
  const docs: SearchDoc<SpotMeta>[] = [];
  for (const id of library.noteOrder) {
    const note = library.notes[id];
    if (!note || note.deletedAt !== null || note.trashedAt !== null) continue;
    if (note.kind !== 'links') {
      docs.push(noteDoc(library, note));
      continue;
    }
    docs.push(collectionDoc(library, note));
    for (const link of children(library.linksByNote[id], library.links)) docs.push(linkDoc(link, note));
  }
  return docs;
}
