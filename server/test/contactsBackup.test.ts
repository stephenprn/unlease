/**
 * Contacts in backups, as Carnet's and Pages' records are: every contact and label in `unlease.json`,
 * their photos sent to S3 once, `Contacts/Contacts.vcf` and `Contacts.md` readable in the snapshot,
 * and a new server brought back from it with its people and their photos.
 */
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { readTar } from '../src/backup/tar';
import { AUTH, createTestServer, jpeg, postSync, rec, T0, type TestServer } from './helpers';
import { putSettings, settle } from './seed';

const S3 = { endpoint: 'https://s3.fr-par.scw.cloud', region: 'fr-par', bucket: 'carnet-test', prefix: 'carnet', accessKeyId: 'SCWTESTKEY0000', secretAccessKey: 'secret-key-abcd-1234' };
const PHOTO = 'photo-lea';

const servers: TestServer[] = [];
function server(): TestServer {
  const created = createTestServer();
  servers.push(created);
  return created;
}
afterEach(() => {
  for (const created of servers.splice(0)) created.close();
});

async function entries(archive: Buffer): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  for await (const entry of readTar(Readable.from(archive).pipe(createGunzip()))) {
    const chunks: Buffer[] = [];
    for await (const piece of entry.body) chunks.push(piece);
    out.set(entry.name.slice(entry.name.indexOf('/') + 1), Buffer.concat(chunks));
  }
  return out;
}

const snapshots = (target: TestServer): string[] => [...target.s3.objects.keys()].filter(key => key.startsWith('carnet/sauvegardes/')).sort();

async function seedContacts(target: TestServer): Promise<Buffer> {
  const photo = await jpeg(200, 200);
  expect((await target.app.request(`/api/blobs/${PHOTO}`, { method: 'PUT', headers: { ...AUTH, 'Content-Type': 'image/jpeg' }, body: new Uint8Array(photo) })).status).toBe(200);
  const at = T0 - 60_000;
  const pushed = await postSync(target, {
    node: 'phone1',
    since: 0,
    records: [
      rec('contactLabel', 'fam', { name: 'Famille', color: 'green', position: 'a0', createdAt: at, deletedAt: null }, at),
      rec(
        'contact',
        'lea',
        {
          firstName: 'Léa',
          lastName: 'Martin',
          phones: [{ id: 'p1', number: '06 12 34 56 78', kind: 'mobile', label: '' }],
          birthday: '1990-03-12',
          labelIds: ['fam'],
          favorite: true,
          photoId: PHOTO,
          photoUploaded: true,
          photoMime: 'image/jpeg',
          trashedAt: null,
          createdAt: at,
          deletedAt: null,
        },
        at,
      ),
    ],
  });
  expect(pushed.status).toBe(200);
  return photo;
}

describe('contacts in backups', () => {
  it('sends their photos once and writes them in every snapshot, readable and restorable', async () => {
    const source = server();
    const photo = await seedContacts(source);
    expect((await putSettings(source, { backup: S3 })).status).toBe(200);
    await source.backups.run('manual');
    expect(source.backups.status().last).toMatchObject({ ok: true, filesSent: 1 });
    expect(source.s3.objects.get(`carnet/fichiers/${PHOTO}.jpg`)?.data.equals(photo)).toBe(true);

    const files = await entries(source.s3.objects.get(snapshots(source)[0]!)!.data);
    const document = JSON.parse(files.get('unlease.json')!.toString('utf8'));
    expect(document.records.map((record: { type: string; id: string }) => `${record.type}:${record.id}`).sort()).toEqual(expect.arrayContaining(['contact:lea', 'contactLabel:fam']));
    expect(files.get('Contacts/Contacts.vcf')!.toString('utf8')).toContain('FN:Léa Martin');
    expect(files.get('Contacts/Contacts.md')!.toString('utf8')).toContain('## Léa Martin ★');
    expect(files.get('LISEZMOI.md')!.toString('utf8')).toContain('`Contacts/`');

    // A new server, pointed at the same bucket, brings everyone back with their photos.
    const target = server();
    for (const [key, object] of source.s3.objects) target.s3.objects.set(key, object);
    expect((await putSettings(target, { backup: S3 })).status).toBe(200);
    const name = snapshots(source)[0]!.slice('carnet/sauvegardes/'.length);
    expect((await target.app.request('/api/admin/restore?mode=merge', { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot: name }) })).status).toBe(202);
    await settle(target);
    expect(target.restore.status()).toMatchObject({ error: null, report: { files: 1, missingFiles: 0 } });
    expect(target.records.get('contact', 'lea')?.fields).toMatchObject({ firstName: 'Léa', favorite: true, photoId: PHOTO });
    expect(target.records.get('contactLabel', 'fam')?.fields.name).toBe('Famille');
    const original = await target.app.request(`/api/blobs/${PHOTO}?variant=original`, { headers: AUTH });
    expect(Buffer.from(await original.arrayBuffer()).equals(photo)).toBe(true);
  });

  it('backs up contacts on its schedule even when Contacts is turned off', async () => {
    const source = server();
    await seedContacts(source);
    expect((await putSettings(source, { apps: ['notes'], backup: S3 })).status).toBe(200);
    await source.backups.run('manual');
    const files = await entries(source.s3.objects.get(snapshots(source)[0]!)!.data);
    expect(JSON.parse(files.get('unlease.json')!.toString('utf8')).records.some((record: { type: string }) => record.type === 'contact')).toBe(true);
    expect(files.has('Contacts/Contacts.vcf')).toBe(true);
  });
});
