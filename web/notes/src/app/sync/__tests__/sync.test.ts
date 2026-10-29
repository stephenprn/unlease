import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { syncOnce, type SyncTransport } from '@unlease/core/sync/engine';
import { createClock, tick } from '@unlease/core/sync/hlc';
import type { SyncRequest, SyncResponse } from '@unlease/core/sync/protocol';
import { mergeRecord, writeFields, type Fields, type SyncRecord } from '@unlease/core/sync/record';

import { freshLibrary } from '../../../test/library';
import { storeFile, storedFileIds } from '../../media/files';
import { addAttachment, createNote, updateNote } from '../../store/actions';
import { acknowledge, countPending, deviceNode, mergeRemote, pendingRecords, readCursor, useLibraryStore, writeCursor } from '../../store/library';
import { useServerSettingsStore } from '../../store/serverSettings';
import { setServer, useSettingsStore } from '../../store/settings';
import { useSyncStore } from '../../store/syncStatus';
import { configureSync, startSync, stopSync } from '../loop';
import { createTransport, fetchServerSettings, saveServerSettings, SyncError } from '../transport';

const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const SETTINGS = { analysis: { enabled: false, keySource: null, keyHint: null, model: 'claude-haiku-5-5', budgetUsd: 5 } };

/** A server in miniature: core's merge, a sequence, and a long-poll that the client can abort. */
class TestServer {
  readonly records = new Map<string, { record: SyncRecord; seq: number }>();
  readonly requests: SyncRequest[] = [];
  private seq = 0;
  private readonly clock = createClock('server01');
  private waiters = new Set<() => void>();
  /** Set to make the next requests fail this way. */
  failWith: SyncError | null = null;

  write(type: SyncRecord['type'], id: string, patch: Fields): void {
    const current = this.records.get(`${type}:${id}`)?.record ?? { type, id, fields: {}, clocks: {} };
    this.seq += 1;
    this.records.set(`${type}:${id}`, { record: writeFields(current, patch, tick(this.clock, Date.now())), seq: this.seq });
    for (const wake of this.waiters) wake();
  }

  readonly transport: SyncTransport = {
    sync: async (request, signal) => {
      this.requests.push(request);
      if (this.failWith) throw this.failWith;
      for (const record of request.records) {
        const key = `${record.type}:${record.id}`;
        const merged = mergeRecord(this.records.get(key)?.record, record);
        if (merged.changed) {
          this.seq += 1;
          this.records.set(key, { record: merged.record, seq: this.seq });
        }
      }
      let page = this.since(request.since);
      if (page.length === 0 && request.wait) {
        await new Promise<void>((resolve, reject) => {
          const done = (): void => {
            this.waiters.delete(done);
            resolve();
          };
          this.waiters.add(done);
          signal?.addEventListener('abort', () => {
            this.waiters.delete(done);
            reject(new SyncError('aborted', 'aborted'));
          });
        });
        page = this.since(request.since);
      }
      const response: SyncResponse = { records: page.map(row => row.record), cursor: page.length ? page[page.length - 1]!.seq : request.since, more: false, serverTime: Date.now() };
      return response;
    },
  };

  private since(cursor: number) {
    return [...this.records.values()].filter(row => row.seq > cursor).sort((a, b) => a.seq - b.seq);
  }
}

const store = {
  pendingRecords,
  applyRemote: (records: readonly SyncRecord[]) => void mergeRemote(records),
  acknowledge,
  readCursor,
  writeCursor,
};

describe('one sync pass over the web store (core engine)', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  it('pushes pending records, acknowledges them, pulls the server’s, and moves the cursor', async () => {
    const server = new TestServer();
    server.write('note', 'fromphone1', { kind: 'text', title: 'Écrite sur le téléphone', position: 'a3' });
    const id = createNote({ kind: 'text', title: 'Écrite ici' });
    const outcome = await syncOnce(store, server.transport, { node: deviceNode() });
    expect(outcome.pushed).toBe(2); // the note and "Non classé"
    expect(countPending()).toBe(0);
    expect(server.records.get(`note:${id}`)?.record.fields.title).toBe('Écrite ici');
    expect(useLibraryStore.getState().notes.fromphone1?.title).toBe('Écrite sur le téléphone');
    expect(readCursor()).toBe(outcome.cursor);
    expect(outcome.cursor).toBeGreaterThan(0);
    // The next pass sends nothing and asks from the new cursor.
    await syncOnce(store, server.transport, { node: deviceNode() });
    expect(server.requests[1]).toMatchObject({ since: outcome.cursor, records: [] });
  });

  it('keeps an edit made while the request was in flight pending for the next pass', async () => {
    const id = createNote({ kind: 'text', title: 'v1' });
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => (release = resolve));
    const server = new TestServer();
    const slow: SyncTransport = {
      sync: async (request, signal) => {
        await gate;
        return server.transport.sync(request, signal);
      },
    };
    const pass = syncOnce(store, slow, { node: deviceNode() });
    updateNote(id, { title: 'v2' });
    release();
    await pass;
    expect(server.records.get(`note:${id}`)?.record.fields.title).toBe('v1');
    expect(pendingRecords(400).map(record => record.id)).toEqual([id]);
    await syncOnce(store, server.transport, { node: deviceNode() });
    expect(server.records.get(`note:${id}`)?.record.fields.title).toBe('v2');
    expect(countPending()).toBe(0);
  });
});

describe('the sync loop', () => {
  let server: TestServer;

  beforeEach(async () => {
    await freshLibrary();
    server = new TestServer();
    configureSync({ transportFor: () => server.transport, uploader: async () => {} });
    // The loop asks the server's settings when it starts: answered here, never by the network.
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url).endsWith('/api/settings') ? json(SETTINGS) : json({}, 404))));
    setServer({ url: 'https://carnet.test', token: 'jeton' });
  });

  afterEach(() => {
    stopSync();
    configureSync({ transportFor: createTransport });
    vi.unstubAllGlobals();
  });

  it('asks the server whether it reads links, and remembers the answer', async () => {
    expect(useSettingsStore.getState().reading).toBeNull();
    startSync();
    await vi.waitFor(() => expect(useSettingsStore.getState().reading).toBe(false));
    expect(useServerSettingsStore.getState().settings?.analysis.model).toBe('claude-haiku-5-5');
    // Another server may differ: forgetting the address forgets the answer.
    setServer(null);
    expect(useSettingsStore.getState().reading).toBeNull();
  });

  it('pushes, then holds a long-poll, and pushes a local edit after the debounce', async () => {
    startSync();
    await vi.waitFor(() => expect(useSyncStore.getState().phase).toBe('synced'));
    expect(countPending()).toBe(0);
    // Nothing left to send: the loop now waits on the server.
    await vi.waitFor(() => expect(server.requests.at(-1)?.wait).toBe(25_000));
    const id = createNote({ kind: 'text', title: 'Nouvelle' });
    await vi.waitFor(() => expect(server.records.get(`note:${id}`)?.record.fields.title).toBe('Nouvelle'), { timeout: 3_000 });
    await vi.waitFor(() => expect(countPending()).toBe(0));
  });

  it('brings in what the server writes while it holds the long-poll', async () => {
    startSync();
    await vi.waitFor(() => expect(server.requests.at(-1)?.wait).toBe(25_000));
    server.write('note', 'serverwrote', { kind: 'text', title: 'Du serveur', position: 'a1' });
    await vi.waitFor(() => expect(useLibraryStore.getState().notes.serverwrote?.title).toBe('Du serveur'));
  });

  it('stops on a refused token and says so', async () => {
    server.failWith = new SyncError('unauthorized', 'Jeton refusé par le serveur', 401);
    startSync();
    await vi.waitFor(() => expect(useSyncStore.getState().phase).toBe('unauthorized'));
    const count = server.requests.length;
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(server.requests.length).toBe(count);
  });

  it('goes offline on a network failure, keeping changes', async () => {
    server.failWith = new SyncError('network', 'Serveur injoignable');
    createNote({ kind: 'text', title: 'En attente' });
    startSync();
    await vi.waitFor(() => expect(useSyncStore.getState().phase).toBe('offline'));
    expect(useSyncStore.getState().pending).toBeGreaterThan(0);
  });

  it('uploads photos added here, then marks them uploaded and forgets the local copy', async () => {
    const uploaded: string[] = [];
    configureSync({ uploader: async (_config, id) => void uploaded.push(id) });
    const note = createNote({ kind: 'text', title: 'Photo' });
    await storeFile('photo42', new Blob([new Uint8Array([1])], { type: 'image/png' }), 'image/png');
    addAttachment(note, { id: 'photo42', mime: 'image/png', width: 10, height: 10, bytes: 1 });
    startSync();
    await vi.waitFor(() => expect(uploaded).toEqual(['photo42']));
    await vi.waitFor(() => expect(useLibraryStore.getState().attachments.photo42?.uploaded).toBe(true));
    expect(await storedFileIds()).toEqual([]);
    await vi.waitFor(() => expect(server.records.get('attachment:photo42')?.record.fields.uploaded).toBe(true), { timeout: 3_000 });
  });
});

describe('the server settings calls', () => {
  const config = { url: 'https://carnet.test', token: 'jeton' };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the settings, sends the bearer token, and tolerates a server without them', async () => {
    const fetchMock = vi.fn(async () => json({ analysis: { enabled: true, keySource: 'app', keyHint: '…k3Xq', model: 'claude-sonnet-5-5', budgetUsd: 15 } }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await fetchServerSettings(config))?.analysis).toEqual({ enabled: true, keySource: 'app', keyHint: '…k3Xq', model: 'claude-sonnet-5-5', budgetUsd: 15 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://carnet.test/api/settings');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jeton');
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'not found' }, 404)));
    expect(await fetchServerSettings(config)).toBeNull();
  });

  it('puts a patch, and throws the server’s own words when it refuses a key', async () => {
    const fetchMock = vi.fn(async () => json(SETTINGS));
    vi.stubGlobal('fetch', fetchMock);
    await saveServerSettings(config, { model: 'claude-haiku-5-5' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ model: 'claude-haiku-5-5' });
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Anthropic refuse cette clé.' }, 400)));
    await expect(saveServerSettings(config, { anthropicApiKey: 'sk-ant-faux' })).rejects.toThrow('Anthropic refuse cette clé.');
  });
});
