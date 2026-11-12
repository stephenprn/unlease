/** « Effacer des données » for Carnet: its parts, counted, and the tombstones each one writes. */
import type { Fields } from '@unlease/core/sync/record';

import { INBOX_ID } from '../../models/entities';
import { attachmentFromRecord, checkFromRecord, labelFromRecord, linkFromRecord, linkTemplateFromRecord, noteFromRecord } from '../../sync/entities';
import { erasedCount } from '@unlease/core/services/erase';

import { eraseChanges, eraseParts, type EraseLibrary } from '../erase';

const NOW = 1_800_000_000_000;
const byId = <T extends { id: string }>(items: readonly T[]): Record<string, T> => Object.fromEntries(items.map(item => [item.id, item]));
const rec = (type: string, id: string, fields: Fields) => ({ type, id, fields: { createdAt: 1, deletedAt: null, position: 'a0', ...fields }, clocks: {} });
const plain = (text: string): string => text.replace(/\u00a0/g, ' ');

const library: EraseLibrary = {
  notes: byId([
    noteFromRecord(rec('note', INBOX_ID, { kind: 'links', title: 'Non classé' })),
    noteFromRecord(rec('note', 'text', { kind: 'text', title: 'Idée', labelIds: ['L1'] })),
    noteFromRecord(rec('note', 'list', { kind: 'checklist', title: 'Courses', archived: true })),
    noteFromRecord(rec('note', 'binned', { kind: 'drawing', trashedAt: 5, labelIds: ['L1', 'L2'] })),
    noteFromRecord(rec('note', 'gone', { kind: 'text', deletedAt: 3 })),
    noteFromRecord(rec('note', 'films', { kind: 'links', title: 'Films', labelIds: ['L2'] })),
    noteFromRecord(rec('note', 'old', { kind: 'links', title: 'Vieux', trashedAt: 6 })),
  ]),
  checks: byId([checkFromRecord(rec('check', 'c1', { noteId: 'list', text: 'lait' })), checkFromRecord(rec('check', 'c2', { noteId: 'list', text: 'pain', deletedAt: 4 }))]),
  attachments: byId([attachmentFromRecord(rec('attachment', 'p1', { noteId: 'text', mime: 'image/png' }))]),
  links: byId([
    linkFromRecord(rec('link', 'k1', { noteId: 'films', url: 'https://example.org/a' })),
    linkFromRecord(rec('link', 'k2', { noteId: 'old', url: 'https://example.org/b' })),
    linkFromRecord(rec('link', 'k3', { noteId: INBOX_ID, url: 'https://example.org/c' })),
    linkFromRecord(rec('link', 'k4', { noteId: INBOX_ID, url: 'https://example.org/d', deletedAt: 2 })),
  ]),
  labels: byId([labelFromRecord(rec('label', 'L1', { name: 'perso', color: 'blue' })), labelFromRecord(rec('label', 'L2', { name: 'travail', color: 'red' }))]),
  linkTemplates: byId([
    linkTemplateFromRecord(rec('linkTemplate', 'T1', { name: 'Vins', kind: null, fields: [] })),
    linkTemplateFromRecord(rec('linkTemplate', 'template-film', { name: '', kind: 'film', fields: [] })),
  ]),
};

const ids = (changes: readonly { type: string; id: string }[]): string[] => changes.map(change => `${change.type}:${change.id}`).sort();

describe('Carnet’s erase', () => {
  it('counts each part from the records that are live, the bin and the archive included', () => {
    const parts = eraseParts(library);
    expect(parts.map(part => [part.id, part.count])).toEqual([
      ['notes', 5],
      ['collections', 4],
      ['inbox', 1],
      ['labels', 2],
      ['templates', 2],
    ]);
    expect(parts.map(part => plain(part.detail))).toEqual([
      '3 notes, dont 1 archivée et 1 dans la corbeille · 1 photo',
      '2 collections, 2 liens',
      '1 lien ; la collection elle-même reste',
      '2 labels, retirés des notes qui les portent',
      '1 liste d’informations, 1 type de lien modifié : Claude revient aux informations habituelles',
    ]);
    expect(parts[2]!.title).toBe('Liens de Non classé');
  });

  it('erases the notes with their items and photos, their words emptied', () => {
    const changes = eraseChanges(library, new Set(['notes']), NOW);
    expect(ids(changes)).toEqual(['attachment:p1', 'check:c1', 'note:binned', 'note:list', 'note:text']);
    expect(changes.find(change => change.id === 'text')!.patch).toEqual({ deletedAt: NOW, title: '', body: '', drawing: '' });
    expect(erasedCount(changes)).toBe(5);
  });

  it('erases the collections and their links, never « Non classé », and its links apart', () => {
    expect(ids(eraseChanges(library, new Set(['collections']), NOW))).toEqual(['link:k1', 'link:k2', 'note:films', 'note:old']);
    expect(ids(eraseChanges(library, new Set(['inbox']), NOW))).toEqual(['link:k3']);
    const everything = eraseChanges(library, new Set(['notes', 'collections', 'inbox', 'labels', 'templates']), NOW);
    expect(everything.some(change => change.id === INBOX_ID)).toBe(false);
    expect(erasedCount(everything)).toBe(14);
  });

  it('takes the labels erased off the notes that stay, as deleting a label does', () => {
    const changes = eraseChanges(library, new Set(['labels']), NOW);
    expect(changes.filter(change => change.type === 'label').map(change => change.patch)).toEqual([{ deletedAt: NOW }, { deletedAt: NOW }]);
    expect(changes.filter(change => change.type === 'note')).toEqual([
      { type: 'note', id: 'text', patch: { labelIds: [] } },
      { type: 'note', id: 'binned', patch: { labelIds: [] } },
      { type: 'note', id: 'films', patch: { labelIds: [] } },
    ]);
    expect(erasedCount(changes)).toBe(2);
    // The notes erased too need nothing more.
    const both = eraseChanges(library, new Set(['labels', 'notes']), NOW);
    expect(both.filter(change => 'labelIds' in change.patch).map(change => change.id)).toEqual(['films']);
  });

  it('erases what Claude notes: the person’s lists and the kinds they changed', () => {
    expect(ids(eraseChanges(library, new Set(['templates']), NOW))).toEqual(['linkTemplate:T1', 'linkTemplate:template-film']);
    expect(eraseChanges(library, new Set(), NOW)).toEqual([]);
  });
});
