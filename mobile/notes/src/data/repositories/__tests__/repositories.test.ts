import { formatHlc } from '@unlease/core/sync/hlc';
import type { SyncRecord } from '@unlease/core/sync/record';
import { writeFields } from '@unlease/core/sync/record';

import { closeDatabase, openDatabase } from '../../db/database';
import { acknowledge, countPending, loadAllRecords, pendingRecords, saveLocal, saveMerged } from '../recordRepository';
import { readPreferences, readSyncState, writePreference, writeSyncState } from '../stateRepository';
import { loadLocalFiles, markFileUploaded, saveLocalFile } from '../fileRepository';

const clock = (ms: number) => formatHlc(ms, 0, 'phone1');
const note = (id: string, title: string, ms: number): SyncRecord => ({
  type: 'note',
  id,
  fields: { title },
  clocks: { title: clock(ms) },
});

beforeEach(() => {
  closeDatabase();
  openDatabase({ name: 'test.sqlite' });
});

describe('records', () => {
  it('keeps a local change pending until that exact version is acknowledged', () => {
    const v1 = note('n1', 'v1', 1);
    saveLocal([v1]);
    expect(countPending()).toBe(1);
    const v2 = writeFields(v1, { title: 'v2' }, clock(2));
    saveLocal([v2]);
    acknowledge([v1]);
    expect(pendingRecords(10).map(r => r.fields.title)).toEqual(['v2']);
    acknowledge([v2]);
    expect(countPending()).toBe(0);
  });

  it('merged writes never clear a pending mark', () => {
    saveLocal([note('n1', 'mine', 1)]);
    saveMerged([note('n1', 'merged', 2)]);
    const [stored] = loadAllRecords();
    expect(stored).toMatchObject({ pending: true, record: { fields: { title: 'merged' } } });
  });

  it('round-trips JSON fields, nested values included', () => {
    saveMerged([{ type: 'link', id: 'l1', fields: { attributes: [{ label: 'Année', value: '1997' }] }, clocks: { attributes: clock(1) } }]);
    expect(loadAllRecords()[0]!.record.fields.attributes).toEqual([{ label: 'Année', value: '1997' }]);
  });
});

describe('state and files', () => {
  it('stores sync state as strings and preferences as JSON', () => {
    writeSyncState('cursor', '42');
    expect(readSyncState('cursor')).toBe('42');
    expect(readSyncState('missing')).toBeNull();
    writePreference('theme', 'dark');
    writePreference('server', { url: 'https://x', token: 't' });
    expect(readPreferences()).toEqual({ theme: 'dark', server: { url: 'https://x', token: 't' } });
  });

  it('tracks local photos until uploaded', () => {
    saveLocalFile({ id: 'a1', path: '/data/a1.jpg', mime: 'image/jpeg' }, 1);
    markFileUploaded('a1');
    expect(loadLocalFiles()).toEqual([{ id: 'a1', path: '/data/a1.jpg', mime: 'image/jpeg', uploaded: true }]);
  });
});
