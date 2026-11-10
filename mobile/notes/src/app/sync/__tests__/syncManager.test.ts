import type { SyncRequest } from '@unlease/core/sync/protocol';
import { schemaFingerprint } from '@unlease/core/sync/schema';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { countPending } from '@shared/data/repositories/recordRepository';
import { readSyncState, writeSyncState } from '@shared/data/repositories/stateRepository';

import { createNote, ensureInbox, updateNote } from '../../store/actions';
import { loadLibrary, resetLibrary } from '../../store/libraryStore';
import { useSettingsStore } from '@shared/app/store/settingsStore';
import { flushNow, onBeforePause, pauseSync, startSync, stopSync } from '@shared/app/sync/syncManager';

const json = (value: unknown, status = 200) => ({ ok: status < 300, status, json: async () => value }) as unknown as Response;
const requests: SyncRequest[] = [];

beforeEach(() => {
  closeDatabase();
  resetLibrary();
  openDatabase({ name: 'test.sqlite' });
  loadLibrary(1_000);
  ensureInbox();
  requests.length = 0;
  useSettingsStore.setState({ server: { url: 'https://carnet.test', token: 'jeton' }, reading: null });
  jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
    if (!String(url).endsWith('/api/sync')) return json({});
    const body = JSON.parse(String(init?.body)) as SyncRequest;
    requests.push(body);
    // A long-poll is held until the loop gives it up, as the server does.
    if (body.wait) await new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    return json({ records: [], cursor: 0, more: false, serverTime: Date.now() });
  });
});

afterEach(() => {
  stopSync();
  jest.restoreAllMocks();
});

const pushed = (id: string, title: string) => requests.some(request => request.records.some(record => record.id === id && record.fields.title === title));

async function until(condition: () => boolean, timeout = 4_000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeout) throw new Error('timed out');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

describe('going to the background', () => {
  it('sends what was just typed, and what is written while in the background', async () => {
    startSync();
    await until(() => countPending() === 0);
    const id = createNote({ kind: 'text', title: 'avant' });
    let typed = 'tapé, pas encore enregistré';
    const unsubscribe = onBeforePause(() => {
      if (typed) updateNote(id, { title: typed });
      typed = '';
    });
    await pauseSync();
    unsubscribe();
    expect(pushed(id, 'tapé, pas encore enregistré')).toBe(true);
    // An editor's debounced save, or a reminder answered from its notification, after leaving.
    updateNote(id, { title: 'après' });
    await until(() => pushed(id, 'après'));
    await until(() => countPending() === 0);
  });

  it('pushes at once from a headless start (a reminder answered while the app is closed)', async () => {
    const id = createNote({ kind: 'text', title: 'rappel fait' });
    await flushNow();
    expect(pushed(id, 'rappel fait')).toBe(true);
    expect(countPending()).toBe(0);
  });
});

describe('a server stopping to restart', () => {
  it('comes back when the server said to, not after a longer backoff', async () => {
    const asked: number[] = [];
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (!String(url).endsWith('/api/sync')) return json({});
      asked.push(Date.now());
      if (asked.length === 1) return { ok: false, status: 503, headers: new Headers({ 'Retry-After': '1' }), json: async () => ({ error: 'server stopping' }) } as unknown as Response;
      return json({ records: [], cursor: 0, more: false, serverTime: Date.now() });
    });
    createNote({ kind: 'text', title: 'pendant le redémarrage' });
    startSync();
    await until(() => asked.length >= 2, 3_000);
    expect(asked[1]! - asked[0]!).toBeGreaterThanOrEqual(900);
    expect(asked[1]! - asked[0]!).toBeLessThan(1_800);
    await until(() => countPending() === 0);
  });
});

describe('the record types this app syncs', () => {
  it('names Carnet’s types in every exchange, and pulls again from the start when the list it pulled with changes', async () => {
    // A phone of before the split: a cursor kept with no list beside it (every type).
    writeSyncState('cursor', '42');
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
      if (!String(url).endsWith('/api/sync')) return json({});
      const body = JSON.parse(String(init?.body)) as SyncRequest;
      requests.push(body);
      return json({ records: [], cursor: 50, more: false, serverTime: Date.now() });
    });
    createNote({ kind: 'text', title: 'types' });
    await flushNow();
    // Carnet's own, Contacts' and Agenda's (the people and the events its notes mention, `APPS.notes.reads`).
    expect(requests[0]!.types).toEqual(['attachment', 'calendarEvent', 'calendarFeed', 'calendarLabel', 'check', 'contact', 'contactLabel', 'label', 'link', 'linkTemplate', 'note']);
    // Not one of Pages'.
    expect(requests[0]!.types).not.toContain('block');
    expect(requests[0]!.since).toBe(0);
    // Kept with its list from now on: the next exchange goes on from there.
    expect(readSyncState('cursorTypes')).toBe('attachment,calendarEvent,calendarFeed,calendarLabel,check,contact,contactLabel,label,link,linkTemplate,note');
    createNote({ kind: 'text', title: 'encore' });
    await flushNow();
    expect(requests[1]!.since).toBe(50);
    // Another list (an app turned on, a newer build): from the start again.
    writeSyncState('cursorTypes', 'note');
    createNote({ kind: 'text', title: 'autre liste' });
    await flushNow();
    expect(requests[2]!.since).toBe(0);
  });

  it('pulls again from the start after a build that knows more of those types (a field, a value)', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
      if (!String(url).endsWith('/api/sync')) return json({});
      requests.push(JSON.parse(String(init?.body)) as SyncRequest);
      return json({ records: [], cursor: 50, more: false, serverTime: Date.now() });
    });
    createNote({ kind: 'text', title: 'un' });
    await flushNow();
    const types = requests[0]!.types!;
    expect(readSyncState('cursorSchema')).toBe(schemaFingerprint(types));
    createNote({ kind: 'text', title: 'deux' });
    await flushNow();
    expect(requests[1]!.since).toBe(50);
    // What an older build kept: it dropped from what it pulled what it did not know.
    writeSyncState('cursorSchema', 'an-older-build');
    createNote({ kind: 'text', title: 'trois' });
    await flushNow();
    expect(requests[2]!.since).toBe(0);
  });
});
