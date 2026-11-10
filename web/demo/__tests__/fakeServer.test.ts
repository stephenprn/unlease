import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatHlc } from '@unlease/core/sync/hlc';
import type { SyncRecord } from '@unlease/core/sync/record';
import { collectionsOfTemplate, kindTemplateId, linksOfTemplate, linksReadBefore, templateSignature } from '@unlease/notes/services/templates';
import { linkFromRecord, linkTemplateFields, linkTemplateFromRecord, noteFromRecord } from '@unlease/notes/sync/entities';
import { TEMPLATE_TRY_PATH } from '@unlease/notes/sync/templateTry';

import { buildDemoRecords, DEMO_WINE_TEMPLATE } from '../demoData';
import { DEMO_SERVER, FakeServer } from '../fakeServer';

const call = async (server: FakeServer, path: string, method = 'GET', body?: unknown): Promise<{ status: number; body: unknown }> => {
  const response = await server.handle(new URL(path, DEMO_SERVER), { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
};

describe('the demo’s server', () => {
  it('says the apps it runs and whether it is set up, and takes both from the settings', async () => {
    const server = new FakeServer({ setupDone: false });
    expect((await call(server, '/api/health')).body).toMatchObject({ apps: ['notes', 'pages'], setup: false });
    expect((await call(server, '/api/settings', 'PUT', { apps: ['notes'] })).body).toMatchObject({ apps: { enabled: ['notes'] }, setup: { done: false } });
    expect((await call(server, '/api/settings', 'PUT', { setupDone: true })).body).toMatchObject({ setup: { done: true } });
    expect((await call(server, '/api/health')).body).toMatchObject({ apps: ['notes'], setup: true });
    // Pages off: its routes answer as the server's do.
    expect(await call(server, '/api/pages/copies', 'POST', { link: { id: 'l1', url: 'https://example.org/a' }, lang: 'fr' })).toEqual({ status: 404, body: { error: 'Pages n’est pas activé sur ce serveur' } });
  });

  it('makes a copy into a page, and points the link at it in the same pull', async () => {
    const server = new FakeServer();
    server.write('link', 'l1', { url: 'https://example.org/a', title: 'Un article', noteId: 'inbox', deletedAt: null });
    const { status, body } = await call(server, '/api/pages/copies', 'POST', { link: { id: 'l1', url: 'https://example.org/a' }, lang: 'fr', title: 'Un article' });
    expect(status).toBe(200);
    const pageId = (body as { pageId: string }).pageId;
    const records = server.pull(0).records;
    expect(records.find(record => record.type === 'link')!.fields.copy).toBe(pageId);
    const page = records.find(record => record.type === 'block' && record.id === pageId)!;
    expect(page.fields).toMatchObject({ kind: 'page', parentId: null, text: 'Un article' });
    const children = records.filter(record => record.type === 'block' && record.fields.parentId === pageId);
    expect(children[0]!.fields).toMatchObject({ kind: 'bookmark', targetType: 'link', targetId: 'l1' });
    // A pull naming Carnet's types alone gets no block.
    expect(server.pull(0, ['note', 'link']).records.every(record => record.type !== 'block')).toBe(true);
  });
});

describe('the demo’s templates', () => {
  const VIN = [
    { id: 'domaine', name: 'Domaine', type: 'text' as const, hint: '' },
    { id: 'millesime', name: 'Millésime', type: 'number' as const, hint: '' },
    { id: 'garde', name: 'Garde', type: 'duration' as const, hint: '' },
    { id: 'note', name: 'Mon avis', type: 'text' as const, hint: '' },
  ];
  const clocked = (type: SyncRecord['type'], id: string, fields: SyncRecord['fields']): SyncRecord => ({ type, id, fields, clocks: Object.fromEntries(Object.keys(fields).map(key => [key, formatHlc(Date.now(), 0, 'web001')])) });

  afterEach(() => vi.useRealTimers());

  it('seeds « Vin », read by « Vins », and the recipe kind’s changed, its recipe read with the preset before', () => {
    const records = buildDemoRecords(Date.now());
    const templates = Object.fromEntries(records.filter(record => record.type === 'linkTemplate').map(record => [record.id, linkTemplateFromRecord(record)]));
    // « Non classé » is every device's own seed, not the demo's.
    const inbox = noteFromRecord({ type: 'note', id: 'inbox', fields: { kind: 'links', title: 'Non classé' }, clocks: {} });
    const notes = { inbox, ...Object.fromEntries(records.filter(record => record.type === 'note').map(record => [record.id, noteFromRecord(record)])) };
    const links = records.filter(record => record.type === 'link').map(linkFromRecord);
    const vin = templates[DEMO_WINE_TEMPLATE]!;
    expect(vin).toMatchObject({ name: 'Vin', kind: null });
    expect(vin.fields.map(field => [field.name, field.type])).toEqual([
      ['Domaine', 'text'],
      ['Millésime', 'number'],
      ['Cépages', 'list'],
      ['Région', 'text'],
      ['Accords', 'text'],
    ]);
    expect(collectionsOfTemplate(vin.id, notes).map(note => note.title)).toEqual(['Vins']);
    expect(linksOfTemplate(vin, links, notes, templates)).toHaveLength(2);
    expect(linksReadBefore(vin, links, notes, templates)).toEqual([]);
    const recipe = templates[kindTemplateId('recipe')]!;
    expect(recipe.fields.at(-1)).toMatchObject({ name: 'Végétarien', type: 'yesno' });
    expect(linksReadBefore(recipe, links, notes, templates).map(link => link.title)).toEqual(['Tarte fine aux pommes']);
  });

  it('reads a link with its collection’s template, in its fields’ order, and writes the version', () => {
    vi.useFakeTimers();
    const server = new FakeServer();
    server.write('linkTemplate', 'vin', linkTemplateFields({ name: 'Vin', kind: null, fields: VIN, createdAt: 1, deletedAt: null }));
    server.write('note', 'vins', { kind: 'links', title: 'Vins', templateId: 'vin', trashedAt: null, deletedAt: null, position: 'a1', createdAt: 1 });
    server.push([clocked('link', 'l1', { noteId: 'vins', url: 'https://www.cave-des-coteaux.fr/vins/les-galets', status: 'pending', autoFile: false, kind: 'other', lang: 'fr', attributes: [], createdAt: 1, deletedAt: null })]);
    vi.advanceTimersByTime(3_200);
    const link = linkFromRecord(server.pull(0).records.find(record => record.id === 'l1')!);
    expect(link).toMatchObject({ status: 'ready', title: 'Côtes-du-Rhône Les Galets 2022', readWith: templateSignature(VIN) });
    // The canned reading's facts by name, a duration made up, a text the page does not give left out.
    expect(link.attributes).toEqual([
      { label: 'Domaine', value: 'Domaine des Ormes' },
      { label: 'Millésime', value: '2022' },
      { label: 'Garde', value: '45 min' },
    ]);
  });

  it('tries a template on a page after a pause, writing nothing, and refuses without Claude', async () => {
    vi.useFakeTimers();
    const server = new FakeServer();
    const before = server.pull(0).records.length;
    const tried = call(server, TEMPLATE_TRY_PATH, 'POST', { url: 'https://www.cave-des-coteaux.fr/vins/les-galets', lang: 'fr', fields: VIN });
    await vi.advanceTimersByTimeAsync(1_500);
    expect(await tried).toEqual({ status: 200, body: { title: 'Côtes-du-Rhône Les Galets 2022', values: { domaine: 'Domaine des Ormes', millesime: '2022', garde: '45 min' }, costUsd: 0.004 } });
    expect(server.pull(0).records).toHaveLength(before);
    expect(await call(server, TEMPLATE_TRY_PATH, 'POST', { url: 'https://example.org', lang: 'fr', fields: [] })).toEqual({ status: 400, body: { error: 'Essai de modèle invalide' } });
    const off = new FakeServer({ reading: false });
    expect((await call(off, TEMPLATE_TRY_PATH, 'POST', { url: 'https://example.org/a', lang: 'fr', fields: VIN })).status).toBe(409);
  });
});
