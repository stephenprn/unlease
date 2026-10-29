import type { SyncRequest } from '@unlease/core/sync/protocol';
import { closeDatabase, openDatabase } from '@data/db/database';
import { countPending } from '@data/repositories/recordRepository';

import { createNote, ensureInbox, updateNote } from '../../store/actions';
import { loadLibrary, resetLibrary } from '../../store/libraryStore';
import { useSettingsStore } from '../../store/settingsStore';
import { flushNow, onBeforePause, pauseSync, startSync, stopSync } from '../syncManager';

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
