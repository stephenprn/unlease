import { afterEach, describe, expect, it } from 'vitest';
import type { SyncRecord } from '@unlease/core/sync/record';
import { AUTH, createTestServer, rec, T0, type TestServer } from './helpers';

let server: TestServer;
afterEach(() => server.close());

async function post(path: string, body: unknown) {
  const response = await server.app.request(path, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

function childrenOf(parent: string | null): SyncRecord[] {
  return server.records
    .ofType('block')
    .filter(block => (block.fields.parentId ?? null) === parent && block.fields.deletedAt === null)
    .sort((a, b) => (String(a.fields.position) < String(b.fields.position) ? -1 : 1));
}

describe('POST /api/pages/from-event', () => {
  it('makes the event’s notes after the other pages, the event and its people mentioned; asked again, the same page', async () => {
    server = createTestServer();
    server.sync.push([rec('block', 'other', { kind: 'page', parentId: null, text: 'Autre page', position: 'a5', trashedAt: null, createdAt: T0, deletedAt: null }, T0)]);
    const first = await post('/api/pages/from-event', { eventId: 'ev1', title: 'Point projet', start: '2026-11-04T14:30', contactIds: ['c1', 'c2'], lang: 'fr' });
    expect(first.status).toBe(200);
    expect(first.body.created).toBe(true);
    const pageId = first.body.pageId as string;
    expect(childrenOf(null).map(block => block.id)).toEqual(['other', pageId]);
    expect(childrenOf(null)[1]!.fields).toMatchObject({ kind: 'page', text: 'Point projet' });
    const blocks = childrenOf(pageId);
    expect(blocks.map(block => block.fields.kind)).toEqual(['text', 'text', 'h2', 'bullet']);
    expect(blocks[0]!.fields.text).toBe('Événement : {@event=ev1} · {@date=2026-11-04T1430}');
    expect(blocks[1]!.fields.text).toBe('Avec {@contact=c1} et {@contact=c2}');
    expect(blocks[2]!.fields.text).toBe('Notes');
    const again = await post('/api/pages/from-event', { eventId: 'ev1', title: 'Point projet', start: '2026-11-04T14:30', contactIds: [], lang: 'fr' });
    expect(again.body).toEqual({ pageId, created: false });
    // The page mentions the event: it shows in the event's « Mentionné dans ».
    const mentions = await server.app.request('/api/pages/mentions?type=event&ids=ev1', { headers: AUTH });
    expect(((await mentions.json()) as { places: { id: string }[] }).places.map(place => place.id)).toEqual([pageId]);
  });

  it('refuses what is no event', async () => {
    server = createTestServer();
    expect((await post('/api/pages/from-event', { eventId: 'x y', start: '2026-11-04' })).status).toBe(400);
    expect((await post('/api/pages/from-event', { eventId: 'ev1', start: 'demain' })).status).toBe(400);
  });
});

describe('POST /api/pages/daily', () => {
  it('makes the journal, then the day’s page under it, the newest first; asked again, the same page', async () => {
    server = createTestServer();
    const monday = await post('/api/pages/daily', { day: '2026-11-02', lang: 'fr' });
    expect(monday.status).toBe(200);
    const [journal] = childrenOf(null);
    expect(journal!.fields).toMatchObject({ kind: 'page', text: 'Journal' });
    expect(childrenOf(journal!.id).map(page => page.fields.text)).toEqual(['Lundi 2 novembre 2026']);
    expect(childrenOf(monday.body.pageId)[0]!.fields.text).toBe('Note du jour · {@date=2026-11-02}');
    const tuesday = await post('/api/pages/daily', { day: '2026-11-03', lang: 'en' });
    expect(childrenOf(journal!.id).map(page => page.fields.text)).toEqual(['Tuesday 3 November 2026', 'Lundi 2 novembre 2026']);
    expect(await post('/api/pages/daily', { day: '2026-11-02', lang: 'en' })).toEqual({ status: 200, body: { pageId: monday.body.pageId, created: false } });
    expect(tuesday.body.created).toBe(true);
    expect(childrenOf(null)).toHaveLength(1);
  });

  it('finds a journal of the person’s own by its title', async () => {
    server = createTestServer();
    server.sync.push([rec('block', 'mine', { kind: 'page', parentId: null, text: 'journal', position: 'a5', trashedAt: null, createdAt: T0, deletedAt: null }, T0)]);
    const made = await post('/api/pages/daily', { day: '2026-11-02', lang: 'fr' });
    expect(childrenOf('mine').map(page => page.id)).toEqual([made.body.pageId]);
  });
});
