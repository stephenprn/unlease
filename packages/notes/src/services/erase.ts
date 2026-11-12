/**
 * « Effacer des données » for Carnet (`core/services/erase`): its parts, each counted from the
 * library as it is now, and the batch that erases those ticked. The parts never overlap, so ticking
 * one and not another means what it says:
 *
 * - `notes`: text notes, checklists and drawings, archived and in the bin too, with their items and
 *   photos.
 * - `collections`: the collections but « Non classé », in the bin too, with their links.
 * - `inbox`: the links in « Non classé »; the collection itself stays (every device seeds it).
 * - `labels`: the labels, taken off the notes that keep them, as deleting a label does.
 * - `templates`: what the person chose for Claude to note (« Ce que Claude relève »): their own
 *   lists of facts and the kinds' changed ones; Claude notes the usual facts again.
 *
 * A note or a collection loses its words with its tombstone, as « Supprimer définitivement » does.
 * Records already erased are left as they are.
 */
import { t } from '@unlease/core/i18n';
import type { EraseChange, ErasePart } from '@unlease/core/services/erase';
import { plural } from '@unlease/core/services/format';
import type { GlyphName } from '@unlease/design/glyphs';

import { INBOX_ID, shownTitle, type Attachment, type CheckItem, type Label, type LinkItem, type Note } from '../models/entities';
import type { LinkTemplate } from '../models/templates';
import type { RecordType } from '../sync/types';

/** What erasing reads of Carnet's library: every record, erased ones too (both clients' stores hold these maps). */
export interface EraseLibrary {
  readonly notes: Readonly<Record<string, Note>>;
  readonly checks: Readonly<Record<string, CheckItem>>;
  readonly links: Readonly<Record<string, LinkItem>>;
  readonly labels: Readonly<Record<string, Label>>;
  readonly attachments: Readonly<Record<string, Attachment>>;
  readonly linkTemplates: Readonly<Record<string, LinkTemplate>>;
}

export const NOTES_ERASE_PARTS = ['notes', 'collections', 'inbox', 'labels', 'templates'] as const;
export type NotesErasePart = (typeof NOTES_ERASE_PARTS)[number];

/** One write of the erase: a tombstone, or a note's labels taken off (`core/services/erase`'s `erasedCount` counts the tombstones). */
export interface NotesEraseWrite extends EraseChange {
  readonly type: RecordType;
}

const live = <T extends { readonly deletedAt: number | null }>(map: Readonly<Record<string, T>>): T[] => Object.values(map).filter(entry => entry.deletedAt === null);

/** The records of each part, by type. */
function partRecords(library: EraseLibrary): Record<NotesErasePart, { readonly type: RecordType; readonly ids: readonly string[] }[]> {
  const notes = live(library.notes);
  const written = notes.filter(note => note.kind !== 'links' && note.id !== INBOX_ID);
  const collections = notes.filter(note => note.kind === 'links' && note.id !== INBOX_ID);
  const links = live(library.links);
  return {
    // Items and photos belong to notes alone: all of them go with them.
    notes: [
      { type: 'note', ids: written.map(note => note.id) },
      { type: 'check', ids: live(library.checks).map(check => check.id) },
      { type: 'attachment', ids: live(library.attachments).map(attachment => attachment.id) },
    ],
    collections: [
      { type: 'note', ids: collections.map(note => note.id) },
      { type: 'link', ids: links.filter(link => link.noteId !== INBOX_ID).map(link => link.id) },
    ],
    inbox: [{ type: 'link', ids: links.filter(link => link.noteId === INBOX_ID).map(link => link.id) }],
    labels: [{ type: 'label', ids: live(library.labels).map(label => label.id) }],
    templates: [{ type: 'linkTemplate', ids: live(library.linkTemplates).map(template => template.id) }],
  };
}

const sum = (groups: readonly { readonly ids: readonly string[] }[]): number => groups.reduce((total, group) => total + group.ids.length, 0);

/** The notes' line: how many, how many archived or in the bin, their photos. */
function notesDetail(notes: readonly Note[], photos: number): string {
  if (notes.length === 0) return t('Aucune note');
  const all = plural(notes.length, 'note');
  const archived = notes.filter(note => note.archived && note.trashedAt === null).length;
  const binned = notes.filter(note => note.trashedAt !== null).length;
  const words =
    archived > 0 && binned > 0
      ? t('{notes}, dont {archived} et {binned} dans la corbeille', { notes: all, archived: plural(archived, 'archivée', 'archivées'), binned })
      : archived > 0
        ? t('{notes}, dont {archived}', { notes: all, archived: plural(archived, 'archivée', 'archivées') })
        : binned > 0
          ? t('{notes}, dont {binned} dans la corbeille', { notes: all, binned })
          : all;
  return photos > 0 ? `${words} · ${plural(photos, 'photo')}` : words;
}

/** Carnet's parts, counted now: how many records each would erase, and what it holds in words. */
export function eraseParts(library: EraseLibrary): ErasePart[] {
  const records = partRecords(library);
  const notes = live(library.notes);
  const written = notes.filter(note => note.kind !== 'links' && note.id !== INBOX_ID);
  const collections = notes.filter(note => note.kind === 'links' && note.id !== INBOX_ID);
  const links = live(library.links);
  const filed = links.filter(link => link.noteId !== INBOX_ID).length;
  const unfiled = links.length - filed;
  const templates = live(library.linkTemplates);
  const own = templates.filter(template => template.kind === null).length;
  const kinds = templates.length - own;
  const labels = live(library.labels).length;
  const inbox = library.notes[INBOX_ID];
  const part = (id: NotesErasePart, title: string, detail: string, glyph: GlyphName): ErasePart => ({ id, title, detail, count: sum(records[id]), glyph });
  return [
    part('notes', t('Notes, listes et dessins'), notesDetail(written, live(library.attachments).length), 'note'),
    part(
      'collections',
      t('Collections'),
      collections.length > 0 ? t('{collections}, {links}', { collections: plural(collections.length, 'collection'), links: plural(filed, 'lien') }) : t('Aucune collection'),
      'collections',
    ),
    part(
      'inbox',
      t('Liens de {collection}', { collection: inbox ? shownTitle(inbox) : t('Non classé') }),
      unfiled > 0 ? t('{links} ; la collection elle-même reste', { links: plural(unfiled, 'lien') }) : t('Aucun lien'),
      'inbox',
    ),
    part('labels', t('Labels'), labels > 0 ? t('{labels}, retirés des notes qui les portent', { labels: plural(labels, 'label') }) : t('Aucun label'), 'tag'),
    part(
      'templates',
      t('Ce que Claude relève'),
      templates.length > 0
        ? t('{lists} : Claude revient aux informations habituelles', {
            lists: [own > 0 ? plural(own, 'liste d’informations', 'listes d’informations') : null, kinds > 0 ? plural(kinds, 'type de lien modifié', 'types de liens modifiés') : null].filter(Boolean).join(', '),
          })
        : t('Claude relève les informations habituelles'),
      'list',
    ),
  ];
}

/**
 * The batch that erases the parts chosen: a tombstone on every live record of each (a note's or a
 * collection's words emptied with it), and, when the labels go but notes stay, each note that wore
 * one without it. « Non classé » is never erased.
 */
export function eraseChanges(library: EraseLibrary, chosen: ReadonlySet<string>, now: number): NotesEraseWrite[] {
  const records = partRecords(library);
  const changes: NotesEraseWrite[] = [];
  for (const id of NOTES_ERASE_PARTS) {
    if (!chosen.has(id)) continue;
    for (const group of records[id]) {
      for (const recordId of group.ids) {
        if (group.type === 'note' && recordId === INBOX_ID) continue;
        changes.push({ type: group.type, id: recordId, patch: group.type === 'note' ? { deletedAt: now, title: '', body: '', drawing: '' } : { deletedAt: now } });
      }
    }
  }
  if (chosen.has('labels')) {
    const gone = new Set(records.labels.flatMap(group => group.ids));
    const erased = new Set(changes.filter(change => change.type === 'note').map(change => change.id));
    for (const note of live(library.notes)) {
      if (erased.has(note.id) || !note.labelIds.some(id => gone.has(id))) continue;
      changes.push({ type: 'note', id: note.id, patch: { labelIds: note.labelIds.filter(id => !gone.has(id)) } });
    }
  }
  return changes;
}
