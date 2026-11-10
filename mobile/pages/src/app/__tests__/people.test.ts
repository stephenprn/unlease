/**
 * The people pages mention: Contacts' records, held under `people` beside Carnet's (whose labels
 * share a key name with Contacts'), found by « @ » and never as a bookmark, named as they are now.
 */
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { formatHlc } from '@unlease/core/sync/hlc';
import type { SyncRecord } from '@unlease/core/sync/record';
import { targetTitle } from '@app/hooks/usePages';
import { loadLibrary, mergeRemote, resetLibrary, useLibraryStore } from '@app/store/libraryStore';
import { BOOKMARK_SECTIONS, searchTargets } from '@ui/features/pages/TargetSearch';

const at = (wall: number) => formatHlc(wall, 0, 'server');
const record = (type: string, id: string, fields: Record<string, unknown>, wall: number): SyncRecord => ({ type, id, fields, clocks: Object.fromEntries(Object.keys(fields).map(key => [key, at(wall)])) });

describe('people in Pages', () => {
  beforeEach(() => {
    closeDatabase();
    resetLibrary();
    openDatabase({ name: 'people.sqlite' });
    loadLibrary();
  });

  it('finds a contact for « @ », not for a bookmark, and names it as it is now', () => {
    mergeRemote([
      record('contact', 'lea', { firstName: 'Léa', lastName: 'Martin', company: 'Atelier Nord', jobTitle: '', phones: [], emails: [], labelIds: ['fam'], trashedAt: null, createdAt: 1, deletedAt: null }, 1000),
      record('contactLabel', 'fam', { name: 'Famille', color: 'green', position: 'a0', createdAt: 1, deletedAt: null }, 1000),
      record('label', 'carnet', { name: 'Courses', color: 'red', position: 'a0', createdAt: 1, deletedAt: null }, 1000),
    ]);
    const s = useLibraryStore.getState();
    // Carnet's labels and Contacts' each keep their own.
    expect(Object.keys(s.labels)).toEqual(['carnet']);
    expect(Object.keys(s.people.labels)).toEqual(['fam']);
    const hits = searchTargets(s, 'lea');
    expect(hits.map(hit => [hit.section, hit.title, hit.detail])).toContainEqual(['Contacts', 'Léa Martin', 'Atelier Nord']);
    expect(searchTargets(s, 'lea', { sections: BOOKMARK_SECTIONS }).some(hit => hit.target.type === 'contact')).toBe(false);
    expect(targetTitle(s, { type: 'contact', id: 'lea' })).toBe('Léa Martin');
    mergeRemote([record('contact', 'lea', { firstName: 'Léana' }, 2000)]);
    expect(targetTitle(useLibraryStore.getState(), { type: 'contact', id: 'lea' })).toBe('Léana Martin');
    mergeRemote([record('contact', 'lea', { deletedAt: 3000 }, 3000)]);
    expect(targetTitle(useLibraryStore.getState(), { type: 'contact', id: 'lea' })).toBeNull();
  });
});
