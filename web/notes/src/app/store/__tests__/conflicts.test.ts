import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { syncOnce, type SyncTransport } from '@unlease/core/sync/engine';
import { formatHlc, hlcWall } from '@unlease/core/sync/hlc';
import type { SyncRequest } from '@unlease/core/sync/protocol';
import { writeFields, type SyncRecord } from '@unlease/core/sync/record';

import { freshLibrary } from '../../../test/library';
import { openDatabase } from '../../db/database';
import { configureSync, onBeforePause, pauseSync, startSync, stopSync } from '../../sync/loop';
import { createTransport, SyncError } from '../../sync/transport';
import { checkFields } from '@unlease/notes/sync/entities';

import { addCheck, createNote, moveCheck, saveTypedText, updateNote } from '../actions';
import { splitCheck } from '../editing';
import {
  acknowledge,
  basesFor,
  countPending,
  deviceTime,
  flushLibrary,
  getRecord,
  loadLibrary,
  markAllPending,
  mergeRemote,
  observeServerTime,
  pendingRecords,
  readEpoch,
  receiveFromTab,
  resetLibrary,
  useLibraryStore,
  writeEpoch,
} from '../library';
import { setServer } from '../settings';
import { useSyncStore } from '../syncStatus';

const state = () => useLibraryStore.getState();
let later = 0;
/** An edit made on the phone, each one later than the last. */
const web = (record: SyncRecord, patch: Record<string, unknown>): SyncRecord => writeFields(record, patch, formatHlc(Date.now() + 60_000 + (later += 1_000), 0, 'phone1'));

/** A note the server already has. */
function syncedNote(body: string): string {
  const id = createNote({ kind: 'text', title: 'Idées', body });
  acknowledge([getRecord('note', id)!]);
  return id;
}

describe('typed text edited on two devices (web)', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  it('keeps a base until the server has the text, and merges an edit from the phone that arrives first', () => {
    const id = syncedNote('Ligne 1\nLigne 2');
    const before = getRecord('note', id)!;
    updateNote(id, { body: 'Ligne 1\nLigne 2\nAjout du web' });
    expect(basesFor([getRecord('note', id)!])[0]!.fields).toEqual({ body: 'Ligne 1\nLigne 2' });
    mergeRemote([web(before, { body: 'Ligne 0 du téléphone\nLigne 1\nLigne 2' })]);
    expect(state().notes[id]!.body).toBe('Ligne 0 du téléphone\nLigne 1\nLigne 2\nAjout du web');
    acknowledge([getRecord('note', id)!]);
    expect(basesFor([getRecord('note', id)!])).toEqual([]);
  });

  it('merges in the editor what landed while typing', () => {
    const id = syncedNote('Lait');
    mergeRemote([web(getRecord('note', id)!, { body: 'Lait x2' })]);
    expect(saveTypedText('note', id, 'body', 'Lait', 'Lait demi-écrémé')).toBe('Lait x2 demi-écrémé');
    const item = addCheck(id, 'Pain');
    acknowledge([getRecord('check', item)!]);
    mergeRemote([web(getRecord('check', item)!, { text: 'Pain complet' })]);
    expect(saveTypedText('check', item, 'text', 'Pain', 'Pain x2')).toBe('Pain complet x2');
  });

  it('shares bases with the other tabs', () => {
    const id = syncedNote('a');
    const record = getRecord('note', id)!;
    const typed = writeFields(record, { body: 'a b' }, formatHlc(Date.now() + 1000, 0, 'otherdevicetab'));
    const base = { type: 'note' as const, id, fields: { body: 'a' }, clocks: { body: record.clocks.body! } };
    receiveFromTab({ records: [typed], pending: [`note:${id}`], acked: [], bases: [base] });
    expect(basesFor([getRecord('note', id)!])).toEqual([base]);
  });

  it('marks everything pending again when the server lost data, and keeps the epoch', () => {
    syncedNote('a');
    acknowledge(pendingRecords(400));
    expect(countPending()).toBe(0);
    markAllPending();
    expect(countPending()).toBe(pendingRecords(400).length);
    expect(countPending()).toBeGreaterThan(1);
    writeEpoch('abcd1234');
    expect(readEpoch()).toBe('abcd1234');
  });

  it('follows the server only when this browser is behind, and takes back a clock the server replaced', () => {
    const now = Date.now();
    observeServerTime(now - 3 * 86_400_000, now);
    expect(Math.abs(deviceTime() - now)).toBeLessThan(60_000);
    vi.spyOn(Date, 'now').mockReturnValue(now + 3 * 86_400_000);
    const id = createNote({ kind: 'text', title: 'En avance' });
    vi.restoreAllMocks();
    acknowledge([getRecord('note', id)!]);
    const record = getRecord('note', id)!;
    mergeRemote([{ ...record, clocks: { ...record.clocks, title: formatHlc(now, 0, 'srvtest01') } }]);
    expect(hlcWall(getRecord('note', id)!.clocks.title!)).toBe(now);
  });
});

describe('bases on disk', () => {
  it('survive a reload, so an offline edit still merges after the tab was closed', async () => {
    const { db, name } = await freshLibrary({ persistent: true });
    const id = syncedNote('a');
    const before = getRecord('note', id)!;
    updateNote(id, { body: 'a b' });
    writeEpoch('abcd1234');
    await flushLibrary();
    db!.close();
    resetLibrary();
    const again = await openDatabase(name);
    await loadLibrary({ db: again, name });
    expect(readEpoch()).toBe('abcd1234');
    mergeRemote([web(before, { body: 'z a' })]);
    expect(state().notes[id]!.body).toBe('z a b');
    again.close();
  });
});

describe('leaving the tab', () => {
  const requests: SyncRequest[] = [];
  // Holds a long-poll until the loop aborts it, as the server does.
  const transport: SyncTransport = {
    sync: async (request, signal) => {
      requests.push(request);
      if (request.wait) await new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new SyncError('aborted', 'aborted'))));
      return { records: [], cursor: 0, more: false, serverTime: Date.now() };
    },
  };

  beforeEach(async () => {
    await freshLibrary();
    requests.length = 0;
    configureSync({ transportFor: () => transport, uploader: async () => {} });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    setServer({ url: 'https://carnet.test', token: 'jeton' });
  });

  afterEach(() => {
    stopSync();
    configureSync({ transportFor: createTransport });
    vi.unstubAllGlobals();
  });

  it('sends what was typed a moment before the tab was hidden', async () => {
    startSync();
    await vi.waitFor(() => expect(countPending()).toBe(0));
    const id = createNote({ kind: 'text', title: 'Tapé juste avant' });
    // Hidden within the push debounce: the loop stops, the edit still goes.
    await pauseSync();
    expect(requests.some(request => request.records.some(record => record.id === id))).toBe(true);
    expect(countPending()).toBe(0);
  });

  it('still sends what is written while the tab is hidden, and hands over an editor’s unsaved text first', async () => {
    startSync();
    await vi.waitFor(() => expect(countPending()).toBe(0));
    const id = createNote({ kind: 'text', title: 'avant' });
    let typed = 'tapé, pas encore enregistré';
    const unsubscribe = onBeforePause(() => {
      if (typed) updateNote(id, { title: typed });
      typed = '';
    });
    await pauseSync();
    unsubscribe();
    expect(requests.some(request => request.records.some(record => record.id === id && record.fields.title === 'tapé, pas encore enregistré'))).toBe(true);
    // An editor's debounced save fires after the tab was hidden: it goes too.
    updateNote(id, { title: 'après' });
    await vi.waitFor(() => expect(requests.some(request => request.records.some(record => record.id === id && record.fields.title === 'après'))).toBe(true), { timeout: 3_000 });
    await vi.waitFor(() => expect(countPending()).toBe(0));
  });

  it('answers its first exchange at once, and never loops on long-polls answered at once', async () => {
    const quick: SyncTransport = {
      sync: async request => {
        requests.push(request);
        return { records: [], cursor: 0, more: false, serverTime: Date.now() };
      },
    };
    configureSync({ transportFor: () => quick, uploader: async () => {} });
    acknowledge(pendingRecords(400));
    startSync();
    await new Promise(resolve => setTimeout(resolve, 2_500));
    stopSync();
    expect(requests[0]!.wait).toBe(0);
    // About one a second, not thousands.
    expect(requests.length).toBeLessThan(6);
  });

  it('pushes typed text with its base, so the server can merge', async () => {
    const id = syncedNote('avant');
    updateNote(id, { body: 'après' });
    await syncOnce(
      {
        pendingRecords,
        applyRemote: records => void mergeRemote(records),
        acknowledge,
        readCursor: () => 0,
        writeCursor: () => {},
        basesFor,
      },
      transport,
      { node: 'webtest1' },
    );
    expect(requests.at(-1)!.bases).toEqual([{ type: 'note', id, fields: { body: 'avant' }, clocks: { body: expect.any(String) } }]);
  });
});

describe('items two devices put at the same place (web)', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  /** A checklist whose last item the phone also appended at, offline: two items share a key. */
  let made = 0;
  function twins(): { noteId: string; un: string; mine: string; theirs: string } {
    const noteId = createNote({ kind: 'checklist', title: 'Courses' });
    const un = addCheck(noteId, 'un');
    const mine = addCheck(noteId, 'ajout web');
    const fields = checkFields({ noteId, text: 'ajout téléphone', checked: false, position: state().checks[mine]!.position, indent: 0, createdAt: 3_000, deletedAt: null });
    const theirs = `zz-phone-${(made += 1)}`;
    mergeRemote([writeFields({ type: 'check', id: theirs, fields: {}, clocks: {} }, fields, formatHlc(Date.now() + 5_000, 0, 'phone1'))]);
    return { noteId, un, mine, theirs };
  }
  const texts = (noteId: string) => (state().checksByNote[noteId] ?? []).map(id => state().checks[id]!.text);

  it('splits, adds and moves between them', () => {
    const { noteId, un, mine } = twins();
    expect(texts(noteId)).toEqual(['un', 'ajout web', 'ajout téléphone']);
    splitCheck(mine, 'ajout web!', 'ajout web!'.length);
    expect(texts(noteId)).toEqual(['un', 'ajout web!', '', 'ajout téléphone']);
    const second = twins();
    addCheck(second.noteId, 'entre', second.mine);
    expect(texts(second.noteId)).toEqual(['un', 'ajout web', 'entre', 'ajout téléphone']);
    const third = twins();
    moveCheck(third.un, third.mine, third.theirs);
    expect(texts(third.noteId)).toEqual(['ajout web', 'un', 'ajout téléphone']);
    expect(un).toBeTruthy();
  });
});

describe('a browser whose clock is off (web)', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  it('says so in the sync status once it is minutes off, and stops once right', () => {
    observeServerTime(Date.now() - 10 * 60_000);
    expect(useSyncStore.getState().clock).toBe('L’horloge de cet appareil avance de 10\u00a0min sur celle du serveur.');
    observeServerTime(Date.now() + 20_000);
    expect(useSyncStore.getState().clock).toBeNull();
  });
});
