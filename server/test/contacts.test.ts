import { afterEach, describe, expect, it } from 'vitest';
import { parseVCards } from '@unlease/contacts/services/vcard';
import { Housekeeping } from '../src/jobs/housekeeping';
import { readContacts } from '../src/apps/contacts/files';
import { AUTH, createTestServer, FakeFetcher, jpeg, rec, T0, type TestServer } from './helpers';
import { putSettings } from './seed';

const DAY = 86_400_000;
const OLD = T0 - 8 * DAY;
let server: TestServer;

afterEach(() => server.close());

const lea = (extra: Record<string, unknown> = {}) =>
  rec(
    'contact',
    'lea',
    {
      firstName: 'Léa',
      lastName: 'Martin',
      phones: [{ id: 'p1', number: '06 12 34 56 78', kind: 'mobile', label: '' }],
      emails: [{ id: 'e1', address: 'lea@example.org', kind: 'home', label: '' }],
      birthday: '--03-12',
      labelIds: ['fam'],
      favorite: true,
      photoId: 'photo-lea',
      photoUploaded: true,
      photoMime: 'image/jpeg',
      trashedAt: null,
      createdAt: OLD,
      deletedAt: null,
      ...extra,
    },
    OLD,
  );

describe('Contacts on the server', () => {
  it('syncs contacts and labels, counts them, and keeps their photos', async () => {
    server = createTestServer();
    const accepted = server.sync.push([lea(), rec('contactLabel', 'fam', { name: 'Famille', color: 'green', position: 'a0', createdAt: OLD, deletedAt: null }, OLD)]);
    expect(accepted).toBeDefined();
    expect(server.records.get('contact', 'lea')!.fields.firstName).toBe('Léa');
    expect(server.contacts.counts!()).toEqual({ contacts: 1 });
    expect([...server.contacts.filesInUse!(server.records.all(), () => false)]).toEqual(['photo-lea']);
  });

  it('empties its bin after a week, and waits while Contacts is off', async () => {
    server = createTestServer();
    const housekeeping = new Housekeeping({ db: server.db, sync: server.sync, records: server.records, blobs: server.blobs, apps: server.apps, isOn: id => server.runner.isOn(id), now: server.now });
    server.sync.push([lea({ trashedAt: OLD }), rec('contact', 'paul', { firstName: 'Paul', trashedAt: T0 - DAY, createdAt: OLD, deletedAt: null }, T0 - DAY)]);
    expect((await putSettings(server, { apps: ['notes'] })).status).toBe(200);
    expect((await housekeeping.run()).tombstoned).toBe(0);
    expect((await putSettings(server, { apps: ['notes', 'contacts'] })).status).toBe(200);
    expect((await housekeeping.run()).tombstoned).toBe(1);
    expect(server.records.get('contact', 'lea')!.fields.deletedAt).toBe(T0);
    expect(server.records.get('contact', 'paul')!.fields.deletedAt).toBeNull();
  });

  it('writes a vCard and a list in archives, its photos under its folder', () => {
    server = createTestServer();
    server.sync.push([lea(), rec('contactLabel', 'fam', { name: 'Famille', color: 'green', position: 'a0', createdAt: OLD, deletedAt: null }, OLD)]);
    const all = server.records.all();
    const files = server.contacts.files!(all, { kept: true });
    expect(files.get('photo-lea')).toBe('Contacts/Photos/Léa Martin.jpg');
    const markdown = server.contacts.markdown!(all, { kept: true });
    const vcf = markdown.find(file => file.path === 'Contacts/Contacts.vcf')!;
    const [back] = parseVCards(vcf.text);
    expect(back).toMatchObject({ firstName: 'Léa', lastName: 'Martin', birthday: '--03-12', favorite: true, labels: ['Famille'] });
    expect(vcf.text).toContain('PHOTO;VALUE=uri:../Fichiers/Contacts/Photos/L%C3%A9a%20Martin.jpg');
    const list = markdown.find(file => file.path === 'Contacts/Contacts.md')!;
    expect(list.text).toContain('## Léa Martin ★');
    expect(list.text).toContain('- Mobile : 06 12 34 56 78');
    expect(readContacts(all)).toHaveLength(1);
  });

  it('takes a photo from an address as an uploaded photo, and refuses what is no picture', async () => {
    const photo = await jpeg(40, 40);
    server = createTestServer({
      fetcher: new FakeFetcher({
        'https://lh3.example.org/photo': { status: 200, headers: { 'content-type': 'image/jpeg' }, body: photo },
        'https://example.org/page': { status: 200, headers: { 'content-type': 'text/html' }, body: '<html></html>' },
      }),
    });
    const post = (url: string) => server.app.request('/api/contacts/photos', { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
    const ok = await post('https://lh3.example.org/photo');
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { id: string; mime: string };
    expect(body.mime).toBe('image/jpeg');
    expect(server.blobs.get(body.id)).toMatchObject({ source: 'upload', mime: 'image/jpeg', width: 40 });
    expect((await post('https://example.org/page')).status).toBe(415);
    expect((await post('https://example.org/missing')).status).toBe(502);
    expect((await post('file:///etc/passwd')).status).toBe(400);
    expect((await putSettings(server, { apps: ['notes'] })).status).toBe(200);
    expect((await post('https://lh3.example.org/photo')).status).toBe(404);
  });
});

describe('what Contacts asks the other apps', () => {
  const get = (path: string) => server.app.request(path, { headers: AUTH });
  const gift = (body: unknown) => server.app.request('/api/notes/gifts', { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('lists the pages and notes that mention a person (or one merged into it), the bin left out', async () => {
    server = createTestServer();
    server.sync.push([
      rec('block', 'trip', { kind: 'page', parentId: null, text: 'Voyage', icon: '✈️', position: 'a0', trashedAt: null, createdAt: OLD, deletedAt: null }, OLD),
      rec('block', 'day', { kind: 'page', parentId: 'trip', text: 'Jour 1', position: 'a0', trashedAt: null, createdAt: OLD, deletedAt: null }, OLD),
      rec('block', 'line', { kind: 'text', parentId: 'day', text: 'Dîner avec {@contact=lea}', position: 'a0', createdAt: OLD, deletedAt: null }, OLD),
      rec('block', 'old', { kind: 'page', parentId: null, text: 'Vieux', position: 'a1', trashedAt: OLD, createdAt: OLD, deletedAt: null }, OLD),
      rec('block', 'oldline', { kind: 'text', parentId: 'old', text: '{@contact=lea}', position: 'a0', createdAt: OLD, deletedAt: null }, OLD),
      rec('note', 'n1', { kind: 'text', title: 'Cadeaux', body: 'Pour {@contact=dup}', rich: true, labelIds: [], pinned: false, archived: false, trashedAt: null, position: 'a0', createdAt: OLD, deletedAt: null }, OLD),
      rec('note', 'call', { kind: 'text', title: 'Rappeler', body: '', labelIds: [], contactIds: ['lea'], pinned: false, archived: false, trashedAt: null, position: 'a1', createdAt: OLD, deletedAt: null }, OLD + 2),
      rec('note', 'gifts', { kind: 'links', title: 'Cadeaux', body: '', labelIds: [], pinned: false, archived: false, trashedAt: null, position: 'a2', createdAt: OLD, deletedAt: null }, OLD),
      rec('link', 'book', { noteId: 'gifts', url: 'https://example.org/livre', status: 'skipped', title: '', contactIds: ['dup'], position: 'a0', createdAt: OLD, deletedAt: null }, OLD + 1),
      rec('note', 'binned', { kind: 'links', title: 'Vieux', body: '', labelIds: [], pinned: false, archived: false, trashedAt: OLD, position: 'a3', createdAt: OLD, deletedAt: null }, OLD),
      rec('link', 'lost', { noteId: 'binned', url: 'https://example.org/vieux', status: 'skipped', title: 'Vieux', contactIds: ['lea'], position: 'a0', createdAt: OLD, deletedAt: null }, OLD),
    ]);
    const pages = await get('/api/pages/mentions?type=contact&ids=lea,dup');
    expect(pages.status).toBe(200);
    expect(((await pages.json()) as { places: unknown[] }).places).toEqual([{ app: 'pages', type: 'page', id: 'day', title: 'Jour 1', within: 'Voyage', icon: null, editedAt: OLD }]);
    const notes = (await (await get('/api/notes/mentions?type=contact&ids=lea,dup')).json()) as { places: { id: string; type: string; title: string; within: string; linked?: boolean }[] };
    // Mentioned in its words, or named among its people (a note about them, a gift idea): the most recent first, the bin left out.
    expect(notes.places.map(place => [place.type, place.id, place.title, place.within, place.linked ?? false])).toEqual([
      ['note', 'call', 'Rappeler', '', true],
      ['link', 'book', 'example.org/livre', 'Cadeaux', true],
      ['note', 'n1', 'Cadeaux', '', false],
    ]);
    expect((await get('/api/pages/mentions?type=contact')).status).toBe(400);
  });

  it('keeps a gift idea in Carnet’s « Cadeaux » collection: made once, found again, an address once', async () => {
    server = createTestServer();
    const first = await gift({ url: 'https://example.org/livre', forName: 'Léa Martin', lang: 'fr' });
    expect(first.status).toBe(200);
    const made = (await first.json()) as { collectionId: string; linkId: string; existing: boolean; created: boolean };
    expect(made).toMatchObject({ existing: false, created: true });
    expect(server.records.get('note', made.collectionId)!.fields).toMatchObject({ kind: 'links', title: 'Cadeaux', emblem: 'coeur' });
    expect(server.records.get('link', made.linkId)!.fields).toMatchObject({ noteId: made.collectionId, url: 'https://example.org/livre', comment: 'Pour Léa Martin', filedBy: 'person', status: 'pending', lang: 'fr' });

    const again = (await (await gift({ url: 'https://example.org/livre', forName: 'Paul', lang: 'fr' })).json()) as typeof made;
    expect(again).toMatchObject({ collectionId: made.collectionId, linkId: made.linkId, existing: true, created: false });
    expect(server.records.get('link', made.linkId)!.fields.comment).toBe('Pour Léa Martin\nPour Paul');

    const other = (await (await gift({ url: 'https://example.org/jeu', forName: 'Paul', lang: 'en' })).json()) as typeof made;
    expect(other).toMatchObject({ collectionId: made.collectionId, existing: false, created: false });
    expect(server.records.get('link', other.linkId)!.fields.comment).toBe('For Paul');
    expect((await gift({ url: 'pas une adresse', forName: 'Paul' })).status).toBe(400);
  });

  it('names the contact a gift idea is for among the link’s people, the comment left alone', async () => {
    server = createTestServer();
    const made = (await (await gift({ url: 'https://example.org/livre', forName: 'Léa Martin', contactId: 'lea', lang: 'fr' })).json()) as { collectionId: string; linkId: string };
    expect(server.records.get('link', made.linkId)!.fields).toMatchObject({ noteId: made.collectionId, contactIds: ['lea'], comment: '' });
    // The same address for someone else: the link gains them; for the same person again, nothing changes.
    await gift({ url: 'https://example.org/livre', forName: 'Paul', contactId: 'paul', lang: 'fr' });
    await gift({ url: 'https://example.org/livre', forName: 'Léa Martin', contactId: 'lea', lang: 'fr' });
    expect(server.records.get('link', made.linkId)!.fields).toMatchObject({ contactIds: ['lea', 'paul'], comment: '' });
    const places = (await (await get('/api/notes/mentions?type=contact&ids=paul')).json()) as { places: { id: string; linked?: boolean }[] };
    expect(places.places).toMatchObject([{ id: made.linkId, linked: true }]);
    expect((await gift({ url: 'https://example.org/b', forName: 'Paul', contactId: '../x' })).status).toBe(400);
  });

  it('finds a « Gifts » collection made by hand rather than making a second one', async () => {
    server = createTestServer();
    server.sync.push([rec('note', 'mine', { kind: 'links', title: 'Gifts', body: '', labelIds: [], pinned: false, archived: false, trashedAt: null, position: 'a0', createdAt: OLD, deletedAt: null }, OLD)]);
    const made = (await (await gift({ url: 'https://example.org/a', forName: 'Léa', lang: 'fr' })).json()) as { collectionId: string; created: boolean };
    expect(made).toMatchObject({ collectionId: 'mine', created: false });
  });
});
