/**
 * What the spotlight searches (`searchIndex`): every live page, note, collection and link as a
 * document. A page is its blocks (its headings apart, files and what a block points at as meta); a
 * note its lines and checklist items, its labels as meta (an untitled note's first line counts as
 * a heading); a collection its sentence; a link what Claude read of it and the person's comment,
 * with its site, kind and collection as meta, so "films dune" finds the film. Nothing in the bin.
 */
import type { BlockKind, BlockTarget } from '../models/blocks';
import { LINK_KIND_NAMES, shownHint, shownTitle, type Attachment, type CheckItem, type Label, type LinkItem, type Note } from '../models/entities';
import { noteEditedAt } from '../sync/entities';
import { containingPage, isInBin, type BlockMap, type ChildIndex } from './blocks';
import { cleanSiteName } from './linkRow';
import { pageContent } from './pageSearch';
import type { PartRole, SearchDoc, SearchPart } from '@unlease/core/services/searchIndex';
import { siteDomain, slugTitle } from '@unlease/core/services/url';
import { bodyText } from './noteBody';

export const SPOT_TYPES = ['page', 'note', 'collection', 'link'] as const;

export type SpotType = (typeof SPOT_TYPES)[number];

export interface SpotMeta {
  readonly type: SpotType;
  readonly id: string;
  /** A note's labels; none for anything else. */
  readonly labelIds: readonly string[];
  /** An archived note or collection, or a link in one. */
  readonly archived: boolean;
  /** Where it sits: a page's page, a link's collection; null at the top. */
  readonly within: string | null;
}

/** The library as both clients hold it. */
export interface SpotLibrary {
  readonly notes: Readonly<Record<string, Note>>;
  readonly checks: Readonly<Record<string, CheckItem>>;
  readonly links: Readonly<Record<string, LinkItem>>;
  readonly labels: Readonly<Record<string, Label>>;
  readonly attachments: Readonly<Record<string, Attachment>>;
  readonly blocks: BlockMap;
  readonly blocksByParent: ChildIndex;
  readonly checksByNote: Readonly<Record<string, readonly string[]>>;
  readonly linksByNote: Readonly<Record<string, readonly string[]>>;
  readonly attachmentsByNote: Readonly<Record<string, readonly string[]>>;
  /** Every live note, in board order. */
  readonly noteOrder: readonly string[];
}

/** A document's key: its type and its id. */
export const spotKey = (type: SpotType, id: string): string => `${type}:${id}`;

/** A key's type and id, or null for a key no document could have. */
export function parseSpotKey(key: string): { readonly type: SpotType; readonly id: string } | null {
  const at = key.indexOf(':');
  const type = key.slice(0, at) as SpotType;
  return at > 0 && SPOT_TYPES.includes(type) ? { type, id: key.slice(at + 1) } : null;
}

/** A link's title as its row shows it: what Claude read, else its address made readable. */
export function linkTitle(link: Pick<LinkItem, 'title' | 'url'>): string {
  return link.title.trim() || slugTitle(link.url) || siteDomain(link.url);
}

const HEADINGS: ReadonlySet<BlockKind> = new Set(['h1', 'h2', 'h3', 'h4']);
const POINTERS: ReadonlySet<BlockKind> = new Set(['image', 'video', 'pdf', 'file', 'bookmark', 'embed']);

function blockRole(kind: BlockKind): PartRole {
  return HEADINGS.has(kind) ? 'heading' : POINTERS.has(kind) ? 'meta' : 'body';
}

function labelNames(library: SpotLibrary, ids: readonly string[]): string {
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

function noteDoc(library: SpotLibrary, note: Note): SearchDoc<SpotMeta> {
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

function collectionDoc(library: SpotLibrary, note: Note): SearchDoc<SpotMeta> {
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

/** Every live page, note, collection and link as a document; `label` names what a mention or a bookmark points at. */
export function spotlightDocs(library: SpotLibrary, label: (target: BlockTarget) => string): SearchDoc<SpotMeta>[] {
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
  for (const page of Object.values(library.blocks)) {
    if (page.kind !== 'page' || page.deletedAt !== null || isInBin(library.blocks, page.id)) continue;
    const content = pageContent(page, library.blocks, library.blocksByParent, label);
    const parts = content.parts.map((part): SearchPart => ({ text: part.text, role: blockRole(part.kind), ref: part.blockId }));
    docs.push({
      key: spotKey('page', page.id),
      title: page.text.trim(),
      parts,
      editedAt: content.editedAt,
      meta: { type: 'page', id: page.id, labelIds: [], archived: false, within: containingPage(library.blocks, page.id) },
    });
  }
  return docs;
}
