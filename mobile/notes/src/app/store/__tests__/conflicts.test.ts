import { formatHlc, hlcWall } from '@unlease/core/sync/hlc';
import { writeFields, type SyncRecord } from '@unlease/core/sync/record';
import { closeDatabase, openDatabase } from '@data/db/database';
import { countPending, loadAllRecords } from '@data/repositories/recordRepository';
import { readSyncState } from '@data/repositories/stateRepository';

import { clockNote } from '@unlease/core/services/format';
import { checkFields } from '@unlease/notes/sync/entities';

import { addCheck, createNote, ensureInbox, moveCheck, pasteChecks, saveTypedText, splitCheck, updateNote } from '../actions';
import { acknowledge, basesFor, deviceTime, getRecord, loadLibrary, markAllPending, mergeRemote, observeServerTime, resetLibrary, useLibraryStore, writeLocal } from '../libraryStore';
import { useSyncStore } from '../syncStore';

const state = () => useLibraryStore.getState();
const web = (record: SyncRecord, patch: Record<string, unknown>, wall: number): SyncRecord => writeFields(record, patch, formatHlc(wall, 0, 'web001'));

beforeEach(() => {
  closeDatabase();
  resetLibrary();
  openDatabase({ name: 'test.sqlite' });
  loadLibrary(1_000);
  ensureInbox();
});

/** A note the server already has: written here, then acknowledged. */
function syncedNote(body: string): string {
  const id = createNote({ kind: 'text', title: 'Idées', body }, 2_000);
  acknowledge([getRecord('note', id)!]);
  return id;
}

describe('typed text edited on two devices', () => {
  it('keeps the base of an unacknowledged edit beside the record, on disk too, until the server has it', () => {
    const id = syncedNote('pain');
    expect(basesFor([getRecord('note', id)!])).toEqual([]);
    updateNote(id, { body: 'pain\nlait' });
    const [base] = basesFor([getRecord('note', id)!]);
    expect(base!.fields).toEqual({ body: 'pain' });
    expect(loadAllRecords().find(row => row.record.id === id)!.bases!.fields).toEqual({ body: 'pain' });
    acknowledge([getRecord('note', id)!]);
    expect(basesFor([getRecord('note', id)!])).toEqual([]);
    expect(loadAllRecords().find(row => row.record.id === id)!.bases).toBeNull();
  });

  it('merges an edit from the web that arrives before this phone’s edit was sent', () => {
    const id = syncedNote('Ligne 1\nLigne 2');
    const before = getRecord('note', id)!;
    updateNote(id, { body: 'Ligne 1\nLigne 2\nAjout du téléphone' });
    mergeRemote([web(before, { body: 'Ligne 0 du web\nLigne 1\nLigne 2' }, Date.now() + 5_000)]);
    expect(state().notes[id]!.body).toBe('Ligne 0 du web\nLigne 1\nLigne 2\nAjout du téléphone');
    // The merge is a fresh local write: pending, and its base is now the web's version.
    expect(loadAllRecords().find(row => row.record.id === id)!.pending).toBe(true);
    expect(basesFor([getRecord('note', id)!])[0]!.fields.body).toBe('Ligne 0 du web\nLigne 1\nLigne 2');
  });

  it('survives a restart with the base, so an offline edit still merges after the app was closed', () => {
    const id = syncedNote('a');
    const before = getRecord('note', id)!;
    updateNote(id, { body: 'a b' });
    resetLibrary();
    loadLibrary(1_000);
    mergeRemote([web(before, { body: 'z a' }, Date.now() + 5_000)]);
    expect(state().notes[id]!.body).toBe('z a b');
  });

  it('merges in the editor what landed while typing, and writes nothing when nothing was typed', () => {
    const id = syncedNote('Lait');
    mergeRemote([web(getRecord('note', id)!, { body: 'Lait x2' }, Date.now() + 5_000)]);
    const pending = countPending();
    // The edit that landed first comes first.
    expect(saveTypedText('note', id, 'body', 'Lait', 'Lait demi-écrémé')).toBe('Lait x2 demi-écrémé');
    expect(state().notes[id]!.body).toBe('Lait x2 demi-écrémé');
    expect(countPending()).toBe(pending + 1);
    expect(saveTypedText('note', id, 'body', 'Lait x2 demi-écrémé', 'Lait x2 demi-écrémé')).toBe('Lait x2 demi-écrémé');
    expect(countPending()).toBe(pending + 1);
  });

  it('merges checklist lines too', () => {
    const id = createNote({ kind: 'checklist', title: 'Courses' }, 2_000);
    const item = addCheck(id, 'Lait', null, 2_000);
    acknowledge([getRecord('note', id)!, getRecord('check', item)!]);
    const before = getRecord('check', item)!;
    updateNote(id, { title: 'Courses samedi' });
    writeLocal([{ type: 'check', id: item, patch: { text: 'Lait demi-écrémé' } }]);
    mergeRemote([web(before, { text: 'Lait x2' }, Date.now() + 5_000)]);
    expect(state().checks[item]!.text).toBe('Lait demi-écrémé x2');
  });
});

describe('the server lost data', () => {
  it('marks every record pending again', () => {
    syncedNote('a');
    acknowledge([getRecord('note', 'inbox')!]);
    expect(countPending()).toBe(0);
    markAllPending();
    expect(countPending()).toBe(loadAllRecords().length);
  });
});

describe('a phone whose date is wrong', () => {
  it('says so in the sync status once it is minutes off, and stops saying it once right', () => {
    observeServerTime(Date.now() - 10 * 60_000);
    expect(useSyncStore.getState().clock).toBe('L’horloge de cet appareil avance de 10\u00a0min sur celle du serveur.');
    observeServerTime(Date.now() + 2 * 86_400_000);
    expect(useSyncStore.getState().clock).toBe('L’horloge de cet appareil retarde de 2\u00a0jours sur celle du serveur.');
    observeServerTime(Date.now() + 30_000);
    expect(useSyncStore.getState().clock).toBeNull();
    expect(clockNote(3 * 3_600_000)).toBe('L’horloge de cet appareil avance de 3\u00a0h sur celle du serveur.');
  });

  afterEach(() => jest.restoreAllMocks());

  it('writes on the server’s time once it has heard it is behind', () => {
    const now = Date.now();
    const behind = now - 3 * 86_400_000;
    jest.spyOn(Date, 'now').mockReturnValue(behind);
    observeServerTime(now, behind);
    expect(Number(readSyncState('clockOffset'))).toBeGreaterThan(2 * 86_400_000);
    const id = createNote({ kind: 'text', title: 'x' });
    expect(Math.abs(hlcWall(getRecord('note', id)!.clocks.title!) - now)).toBeLessThan(60_000);
    expect(Math.abs(deviceTime() - now)).toBeLessThan(60_000);
  });

  it('never follows a server whose own date is behind', () => {
    const now = Date.now();
    observeServerTime(now - 3 * 86_400_000, now);
    expect(Number(readSyncState('clockOffset') ?? '0')).toBe(0);
    const id = createNote({ kind: 'text', title: 'x' });
    expect(Math.abs(hlcWall(getRecord('note', id)!.clocks.title!) - now)).toBeLessThan(60_000);
  });

  it('takes the server’s clock back for a field it stamped days ahead, once the server replaced it', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 3 * 86_400_000);
    const id = createNote({ kind: 'text', title: 'En avance' });
    jest.restoreAllMocks();
    acknowledge([getRecord('note', id)!]);
    const record = getRecord('note', id)!;
    const replaced = { ...record, clocks: { ...record.clocks, title: formatHlc(now, 0, 'srvtest01') } };
    mergeRemote([replaced]);
    expect(getRecord('note', id)!.clocks.title).toBe(formatHlc(now, 0, 'srvtest01'));
    // Later edits of it from elsewhere land again.
    mergeRemote([writeFields(getRecord('note', id)!, { title: 'Renommée sur le web' }, formatHlc(now + 1000, 0, 'web001'))]);
    expect(state().notes[id]!.title).toBe('Renommée sur le web');
    expect(loadAllRecords().find(row => row.record.id === id)!.pending).toBe(false);
  });
});

describe('items two devices put at the same place', () => {
  /** A checklist whose last item the web also appended at, offline: two items share a key. */
  let made = 0;
  function twins(): { noteId: string; un: string; mine: string; theirs: string } {
    const noteId = createNote({ kind: 'checklist', title: 'Courses' }, 2_000);
    const un = addCheck(noteId, 'un');
    const mine = addCheck(noteId, 'ajout téléphone');
    const fields = checkFields({ noteId, text: 'ajout web', checked: false, position: state().checks[mine]!.position, indent: 0, createdAt: 3_000, deletedAt: null });
    const theirs = `zz-web-${(made += 1)}`;
    mergeRemote([writeFields({ type: 'check', id: theirs, fields: {}, clocks: {} }, fields, formatHlc(Date.now() + 5_000, 0, 'web001'))]);
    return { noteId, un, mine, theirs };
  }
  const texts = (noteId: string) => (state().checksByNote[noteId] ?? []).map(id => state().checks[id]!.text);

  it('puts an item split or added after the first twin between them, in one write', () => {
    const { noteId, mine } = twins();
    expect(texts(noteId)).toEqual(['un', 'ajout téléphone', 'ajout web']);
    splitCheck(mine, 'ajout téléphone', 'ajout téléphone'.length);
    expect(texts(noteId)).toEqual(['un', 'ajout téléphone', '', 'ajout web']);
    const { noteId: other, mine: first } = twins();
    addCheck(other, 'entre', first);
    expect(texts(other)).toEqual(['un', 'ajout téléphone', 'entre', 'ajout web']);
  });

  it('pastes several lines after the first twin in one write', () => {
    const { noteId, mine, theirs } = twins();
    const { text, ids } = pasteChecks(mine, 'ajout téléphone', ['ajout téléphone et', 'deux', 'trois']);
    expect(text).toBe('ajout téléphone et');
    expect(texts(noteId)).toEqual(['un', 'ajout téléphone et', 'deux', 'trois', 'ajout web']);
    const clocks = new Set([mine, ...ids].map(id => getRecord('check', id)!.clocks.text).concat(getRecord('check', theirs)!.clocks.position!));
    expect(clocks.size).toBe(1);
  });

  it('moves an item between them', () => {
    const { noteId, un, mine, theirs } = twins();
    moveCheck(un, mine, theirs);
    expect(texts(noteId)).toEqual(['ajout téléphone', 'un', 'ajout web']);
  });
});
