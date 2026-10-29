import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { hlcNode } from '@unlease/core/sync/hlc';
import { existsSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { RestoreService } from '../src/backup/restore';
import { S3Client, signRequest } from '../src/backup/s3';
import { writeMeta } from '../src/db/database';
import { FakeS3 } from './fakes';
import { readTar, TarWriter } from '../src/backup/tar';
import { AUTH, createTestServer, postSync, rec, T0, type TestServer } from './helpers';
import { NOTE, PDF, PHOTO, putSettings, seedLibrary, settle } from './seed';

const S3 = { endpoint: 'https://s3.fr-par.scw.cloud', region: 'fr-par', bucket: 'carnet-test', prefix: 'carnet', accessKeyId: 'SCWTESTKEY0000', secretAccessKey: 'secret-key-abcd-1234' };

const SEAFILE = (target: TestServer) => ({ provider: 'seafile', url: 'http://seafile.lan', token: target.seafile.token, folder: '/Unlease' });

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

describe('S3 signatures and tar', () => {
  it('signs as AWS documents it (GET Object and ListObjects examples)', () => {
    const base = { host: 'examplebucket.s3.amazonaws.com', region: 'us-east-1', accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', now: new Date('2013-05-24T00:00:00Z'), payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' };
    expect(signRequest({ ...base, method: 'GET', path: '/test.txt', query: {}, headers: { Range: 'bytes=0-9' } }).authorization).toMatch(/Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/);
    expect(signRequest({ ...base, method: 'GET', path: '/', query: { 'max-keys': '2', prefix: 'J' }, headers: {} }).authorization).toMatch(/Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7$/);
  });

  it('writes and reads long French names and streamed entries', async () => {
    const chunks: Buffer[] = [];
    const sink = new (await import('node:stream')).PassThrough();
    sink.on('data', chunk => chunks.push(chunk as Buffer));
    const tar = new TarWriter(sink);
    const name = `racine/Notes/${'Une très longue note à propos de ça '.repeat(5)}.md`;
    await tar.file(name, 'é');
    await tar.stream('racine/gros.bin', 70_000, Readable.from([Buffer.alloc(30_000, 1), Buffer.alloc(40_000, 2)]));
    await tar.end();
    sink.end();
    const read: [string, number][] = [];
    for await (const entry of readTar(Readable.from(Buffer.concat(chunks)))) {
      let size = 0;
      for await (const piece of entry.body) size += piece.length;
      read.push([entry.name, size]);
    }
    expect(read).toEqual([
      [name, 2],
      ['racine/gros.bin', 70_000],
    ]);
  });
});

describe('S3 settings', () => {
  it('tries the bucket before keeping it, and shows only the end of the secret', async () => {
    const target = server();
    const saved = await putSettings(target, { backup: S3 });
    expect(saved.status).toBe(200);
    // Set for the first time: every day, unless told otherwise.
    expect(saved.body.backup).toMatchObject({ configured: true, endpoint: S3.endpoint, prefix: 'carnet/', accessKeyId: S3.accessKeyId, secretHint: '…1234', recurrence: 'daily', keep: 30 });
    expect(JSON.stringify(saved.body)).not.toContain(S3.secretAccessKey);
    // Listed, then a small file written and deleted: a backup needs all three rights.
    expect(target.s3.log).toEqual(['GET ', 'PUT carnet/.unlease-essai', 'DELETE carnet/.unlease-essai']);
    expect(target.s3.objects.size).toBe(0);
  });

  it('refuses a key that may list the bucket but not write or delete in it', async () => {
    const target = server();
    target.s3.failOn = method => (method === 'PUT' ? { status: 403, code: 'AccessDenied' } : null);
    expect(await putSettings(target, { backup: S3 })).toMatchObject({ status: 400, body: { error: 'Accès refusé par S3 : vérifiez les droits de la clé' } });
    target.s3.failOn = method => (method === 'DELETE' ? { status: 403, code: 'AccessDenied' } : null);
    expect(await putSettings(target, { backup: S3 })).toMatchObject({ status: 400, body: { error: 'Accès refusé par S3 : vérifiez les droits de la clé' } });
    expect(target.settings.backup()).toBeNull();
  });

  it('refuses a bucket S3 does not know, unreachable S3, and a first save without its secret', async () => {
    const target = server();
    target.s3.failWith = { status: 404, code: 'NoSuchBucket' };
    expect(await putSettings(target, { backup: S3 })).toMatchObject({ status: 400, body: { error: 'Bucket introuvable' } });
    target.s3.failWith = null;
    target.s3.unreachable = true;
    expect(await putSettings(target, { backup: S3 })).toMatchObject({ status: 502, body: { error: 'Stockage S3 injoignable' } });
    const { secretAccessKey: _secret, ...withoutSecret } = S3;
    expect(await putSettings(target, { backup: withoutSecret })).toMatchObject({ status: 400, body: { error: 'Clé secrète manquante' } });
    expect(await putSettings(target, { backup: { recurrence: 'daily' } })).toMatchObject({ status: 400, body: { error: 'Renseignez d’abord le stockage S3' } });
    expect(await putSettings(target, { backup: { ...S3, bucket: 'Pas Un Bucket' } })).toMatchObject({ status: 400, body: { error: 'Nom de bucket invalide' } });
    expect(target.settings.backup()).toBeNull();
  });
});

describe('a backup run', () => {
  it('sends each file once, then a readable snapshot, and keeps the newest ones', async () => {
    const target = server();
    const { photo } = await seedLibrary(target);
    expect((await putSettings(target, { backup: { ...S3, keep: 2 } })).status).toBe(200);
    for (let run = 0; run < 3; run += 1) {
      target.time.value += 3_600_000;
      await target.backups.run('manual');
      expect(target.backups.status().last).toMatchObject({ ok: true, filesSent: run === 0 ? 2 : 0 });
    }
    expect(snapshots(target)).toHaveLength(2);
    expect(target.s3.log.filter(line => line === `PUT carnet/fichiers/${PHOTO}.jpg`)).toHaveLength(1);
    expect(target.s3.objects.get(`carnet/fichiers/${PHOTO}.jpg`)?.data.equals(photo)).toBe(true);
    expect(target.s3.objects.has(`carnet/fichiers/${PDF}.pdf`)).toBe(true);

    const files = await entries(target.s3.objects.get(snapshots(target).at(-1)!)!.data);
    expect([...files.keys()].filter(name => name.endsWith('.md')).sort()).toEqual(['Carnet/Collections/Recettes.md', 'Carnet/Notes/Courses.md', 'Carnet/Pages/Projet.md', 'Carnet/Pages/Projet/Sous-page.md', 'LISEZMOI.md']);
    expect([...files.keys()].some(name => name.startsWith('Fichiers/'))).toBe(false);
    const courses = files.get('Carnet/Notes/Courses.md')!.toString('utf8');
    expect(courses).toContain('titre: "Courses"');
    expect(courses).toContain('- [ ] lait');
    expect(courses).toContain('](<../../Fichiers/Carnet/Notes/Courses/');
    const projet = files.get('Carnet/Pages/Projet.md')!.toString('utf8');
    expect(projet).toContain('[Sous-page](<../../Carnet/Pages/Projet/Sous-page.md>)');
    expect(projet).toContain('[Plan.pdf](<../../Fichiers/Carnet/Pages/Projet/Plan.pdf>)');
    expect(files.get('Carnet/Collections/Recettes.md')!.toString('utf8')).toContain('- [Tarte aux pommes](<https://example.fr/tarte>) · Exemple');
    const document = JSON.parse(files.get('unlease.json')!.toString('utf8'));
    expect(document).toMatchObject({ format: 'unlease-backup', version: 1 });
    expect(document.records).toHaveLength(9);
    expect(document.files.map((file: { stored: string }) => file.stored).sort()).toEqual([`fichiers/${PDF}.pdf`, `fichiers/${PHOTO}.jpg`]);
  });

  it('records a failure in French, and tries again within the hour', async () => {
    const target = server();
    expect((await putSettings(target, { backup: { ...S3, recurrence: 'daily' } })).status).toBe(200);
    target.s3.failWith = { status: 403, code: 'SignatureDoesNotMatch' };
    await target.backups.run('schedule');
    const status = target.backups.status();
    expect(status.last).toMatchObject({ ok: false, error: 'Clés refusées par S3', trigger: 'schedule' });
    expect(status.nextAt).toBe(status.last!.startedAt + 3_600_000);
  });

  it('with Seafile, sends no photo or file to S3: unlease.json says where each one is in Seafile', async () => {
    const target = server();
    await seedLibrary(target);
    expect((await putSettings(target, { drive: SEAFILE(target) })).status).toBe(200);
    await target.drive.run();
    expect((await putSettings(target, { backup: S3 })).status).toBe(200);
    await target.backups.run('manual');
    expect(target.backups.status().last).toMatchObject({ ok: true, filesSent: 0, error: null });
    expect([...target.s3.objects.keys()].filter(key => key.startsWith('carnet/fichiers/'))).toEqual([]);
    const document = JSON.parse((await entries(target.s3.objects.get(snapshots(target)[0]!)!.data)).get('unlease.json')!.toString('utf8'));
    const drive = Object.fromEntries(document.files.map((file: { id: string; drive: string | null }) => [file.id, file.drive]));
    expect(drive[PHOTO]).toMatch(/^\/Unlease\/Carnet\/Notes\/Courses\/.+\.jpg$/);
    expect(drive[PDF]).toBe('/Unlease/Carnet/Pages/Projet/Plan.pdf');
    expect(target.seafile.files()).toEqual(expect.arrayContaining([drive[PHOTO], drive[PDF]]));
  });

  it('removes from S3 the copies sent before Seafile was set, once no kept snapshot names them', async () => {
    const target = server();
    await seedLibrary(target);
    expect((await putSettings(target, { backup: { ...S3, keep: 1 } })).status).toBe(200);
    await target.backups.run('manual');
    expect(target.s3.objects.has(`carnet/fichiers/${PHOTO}.jpg`)).toBe(true);
    expect((await putSettings(target, { drive: SEAFILE(target) })).status).toBe(200);
    await target.drive.run();
    target.time.value += 60_000;
    await target.backups.run('manual');
    target.time.value += 60_000;
    await target.backups.run('manual');
    expect([...target.s3.objects.keys()].filter(key => key.startsWith('carnet/fichiers/'))).toEqual([]);
  });

  it('removes a file from S3 once its blob is gone and no kept snapshot names it', async () => {
    const target = server();
    await seedLibrary(target);
    expect((await putSettings(target, { backup: { ...S3, keep: 1 } })).status).toBe(200);
    await target.backups.run('manual');
    expect(target.s3.objects.has(`carnet/fichiers/${PHOTO}.jpg`)).toBe(true);
    // Its file gone while its photo still shows in the note: S3's copy may be the last one, it stays.
    await target.blobs.remove(PHOTO);
    target.time.value += 60_000;
    await target.backups.run('manual');
    expect(target.s3.objects.has(`carnet/fichiers/${PHOTO}.jpg`)).toBe(true);
    // The photo deleted too: once no kept snapshot names it, it goes.
    await postSync(target, { node: 'phone1', since: 0, records: [rec('attachment', PHOTO, { deletedAt: T0 }, T0)] });
    target.time.value += 60_000;
    await target.backups.run('manual');
    target.time.value += 60_000;
    await target.backups.run('manual');
    expect(snapshots(target)).toHaveLength(1);
    expect(target.s3.objects.has(`carnet/fichiers/${PHOTO}.jpg`)).toBe(false);
    expect(target.s3.objects.has(`carnet/fichiers/${PDF}.pdf`)).toBe(true);
  });

  it('sends a file again when S3 lost it, and not one S3 already holds (a server restored on a new box)', async () => {
    const target = server();
    const { photo } = await seedLibrary(target);
    expect((await putSettings(target, { backup: S3 })).status).toBe(200);
    await target.backups.run('manual');
    target.s3.objects.delete(`carnet/fichiers/${PHOTO}.jpg`);
    target.time.value += 60_000;
    await target.backups.run('manual');
    expect(target.backups.status().last).toMatchObject({ ok: true, filesSent: 1 });
    expect(target.s3.objects.get(`carnet/fichiers/${PHOTO}.jpg`)?.data.equals(photo)).toBe(true);

    // Another server, empty, on the same bucket: restored, its first backup sends nothing again.
    const fresh = server();
    for (const [key, object] of target.s3.objects) fresh.s3.objects.set(key, object);
    expect((await putSettings(fresh, { backup: S3 })).status).toBe(200);
    const name = snapshots(target).at(-1)!.slice('carnet/sauvegardes/'.length);
    await fresh.app.request('/api/admin/restore', { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot: name }) });
    await settle(fresh);
    expect(fresh.restore.status().report).toMatchObject({ files: 2, missingFiles: 0 });
    fresh.time.value += 3_600_000;
    await fresh.backups.run('manual');
    expect(fresh.backups.status().last).toMatchObject({ ok: true, filesSent: 0 });
    expect(fresh.s3.log.filter(line => line.startsWith('PUT carnet/fichiers/'))).toEqual([]);
  });

  it('never deletes another server’s snapshots, and backs up nothing while it holds nothing', async () => {
    const old = server();
    await seedLibrary(old);
    expect((await putSettings(old, { backup: S3 })).status).toBe(200);
    await old.backups.run('manual');
    const theirs = snapshots(old);

    // A new, empty server on the same bucket, keeping one snapshot: about to be restored.
    const fresh = server();
    for (const [key, object] of old.s3.objects) fresh.s3.objects.set(key, object);
    expect((await putSettings(fresh, { backup: { ...S3, keep: 1, recurrence: 'daily' } })).status).toBe(200);
    expect(fresh.backups.hasData()).toBe(false);
    const refused = await fresh.app.request('/api/admin/backups', { method: 'POST', headers: AUTH });
    expect(refused.status).toBe(409);
    expect(snapshots(fresh)).toEqual(theirs);

    // Once it holds something, its own snapshots come and go; the old server's stays, and so do its files.
    await postSync(fresh, { node: 'phone2', since: 0, records: [rec('note', 'note-neuve', { kind: 'text', title: 'Neuve', body: '', labelIds: [], pinned: false, archived: false, trashedAt: null, position: 'a0', createdAt: T0, deletedAt: null }, T0, 'phone2')] });
    for (let run = 0; run < 3; run += 1) {
      fresh.time.value += 3_600_000;
      await fresh.backups.run('manual');
    }
    expect(snapshots(fresh)).toHaveLength(2);
    expect(snapshots(fresh)).toContain(theirs[0]);
    expect(fresh.s3.objects.has(`carnet/fichiers/${PHOTO}.jpg`)).toBe(true);
  });

  it('deletes nothing when its new snapshot is not the newest (the server clock behind)', async () => {
    const target = server();
    await seedLibrary(target);
    expect((await putSettings(target, { backup: { ...S3, keep: 1 } })).status).toBe(200);
    await target.backups.run('manual');
    target.time.value -= 2 * 86_400_000;
    await target.backups.run('manual');
    expect(snapshots(target)).toHaveLength(2);
    expect(target.backups.status().last).toMatchObject({ ok: true, error: 'L’horloge du serveur semble en retard : les anciennes sauvegardes sont gardées' });
  });

  it('tries again what S3 could not answer, and never what it refused', async () => {
    const s3 = new FakeS3('carnet-test');
    const client = new S3Client(S3, s3.fetch, undefined, [0, 0, 0]);
    let failures = 2;
    s3.failOn = () => (failures-- > 0 ? { status: 503, code: 'SlowDown' } : null);
    await client.put('carnet/x.txt', Buffer.from('x'), 'text/plain');
    expect(s3.objects.has('carnet/x.txt')).toBe(true);
    failures = 10;
    await expect(client.put('carnet/y.txt', Buffer.from('y'), 'text/plain')).rejects.toMatchObject({ status: 503 });
    expect(failures).toBe(6);
    let asked = 0;
    s3.failOn = () => {
      asked += 1;
      return { status: 403, code: 'AccessDenied' };
    };
    await expect(client.delete('carnet/x.txt')).rejects.toMatchObject({ status: 403 });
    expect(asked).toBe(1);
  });

  it('lets an original leave the server once Seafile holds it, S3 set or not', async () => {
    const target = server();
    await seedLibrary(target);
    expect((await putSettings(target, { backup: S3 })).status).toBe(200);
    expect((await putSettings(target, { drive: SEAFILE(target) })).status).toBe(200);
    await target.drive.run();
    expect(await target.blobs.localOriginal(PHOTO)).not.toBeNull();
    target.time.value += 11 * 60_000;
    await target.drive.run();
    expect(await target.blobs.localOriginal(PHOTO)).toBeNull();
    expect(existsSync(target.blobs.path(PHOTO, 'display'))).toBe(true);
  });

  it('lists the snapshots, newest first, and downloads one by ticket without the token', async () => {
    const target = server();
    await seedLibrary(target);
    expect((await putSettings(target, { backup: S3 })).status).toBe(200);
    await target.backups.run('manual');
    const list = (await (await target.app.request('/api/admin/backups', { headers: AUTH })).json()) as { snapshots: { name: string; at: number; bytes: number }[] };
    expect(list.snapshots).toHaveLength(1);
    expect(list.snapshots[0]).toMatchObject({ name: 'unlease-2026-10-18T12-00-00Z.tar.gz', at: T0 });
    const ticket = (await (await target.app.request('/api/admin/downloads', { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot: list.snapshots[0]!.name }) })).json()) as { url: string; name: string };
    const download = await target.app.request(ticket.url);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-disposition')).toBe('attachment; filename="unlease-2026-10-18T12-00-00Z.tar.gz"');
    expect((await entries(Buffer.from(await download.arrayBuffer()))).has('unlease.json')).toBe(true);
    expect((await target.app.request('/api/downloads/not-a-ticket')).status).toBe(404);
  });
});

describe('restoring', () => {
  /** A backup on S3 from one server, and a second server pointed at the same bucket. */
  async function backedUp(): Promise<{ source: TestServer; name: string }> {
    const source = server();
    await seedLibrary(source);
    expect((await putSettings(source, { backup: S3 })).status).toBe(200);
    await source.backups.run('manual');
    return { source, name: snapshots(source)[0]!.slice('carnet/sauvegardes/'.length) };
  }

  const restore = (target: TestServer, mode: string, body: unknown, type = 'application/json') =>
    target.app.request(`/api/admin/restore?mode=${mode}`, { method: 'POST', headers: { ...AUTH, 'Content-Type': type }, body: type === 'application/json' ? JSON.stringify(body) : (body as Uint8Array) });

  it('never sends a display copy in place of an original it lost, and the restore brings the original back', async () => {
    const { source, name } = await backedUp();
    const original = source.s3.objects.get(`carnet/fichiers/${PHOTO}.jpg`)!.data;
    // The original lost on the server (the display copy stays), and what it sent forgotten (S3 set again).
    await rm(source.blobs.path(PHOTO, 'original'));
    source.db.exec('DELETE FROM backup_files');
    source.time.value += 60_000;
    await source.backups.run('manual');
    expect(source.backups.status().last).toMatchObject({ ok: true, error: expect.stringMatching(/^1.fichier illisible/) });
    expect(source.s3.objects.get(`carnet/fichiers/${PHOTO}.jpg`)!.data.equals(original)).toBe(true);

    // A restore sees the display copy is not what a backup keeps, and fetches the original.
    expect((await restore(source, 'merge', { snapshot: name })).status).toBe(202);
    await settle(source);
    expect(source.restore.status().report).toMatchObject({ files: 1, missingFiles: 0 });
    expect(readFileSync(source.blobs.path(PHOTO, 'original')).equals(original)).toBe(true);
  });

  it('takes a photo sent again when the server lost its original', async () => {
    const target = server();
    const { photo } = await seedLibrary(target);
    await rm(target.blobs.path(PHOTO, 'original'));
    const again = await target.app.request(`/api/blobs/${PHOTO}`, { method: 'PUT', headers: { ...AUTH, 'Content-Type': 'image/jpeg' }, body: new Uint8Array(photo) });
    expect(again.status).toBe(200);
    expect(readFileSync(target.blobs.path(PHOTO, 'original')).equals(photo)).toBe(true);
  });

  it('starts no backup while a restore runs, and remembers a restore the server stopped', async () => {
    const { source, name } = await backedUp();
    const target = server();
    for (const [key, object] of source.s3.objects) target.s3.objects.set(key, object);
    expect((await putSettings(target, { backup: S3 })).status).toBe(200);
    expect((await restore(target, 'merge', { snapshot: name })).status).toBe(202);
    expect((await target.app.request('/api/admin/backups', { method: 'POST', headers: AUTH })).status).toBe(409);
    await target.backups.run('manual');
    expect(target.backups.status().last).toBeNull();
    await settle(target);

    // A restore under way when the server stops reads, at the next start, as cut short.
    writeMeta(target.db, 'restore', JSON.stringify({ running: true, startedAt: T0, finishedAt: null, error: null, report: null }));
    const restarted = new RestoreService({ sync: target.sync, records: target.records, blobs: target.blobs, settings: target.settings, tmpDir: target.dir });
    expect(restarted.status()).toMatchObject({ running: false, error: expect.stringMatching(/^Interrompue/) });
  });

  /** A server whose files live in Seafile, backed up to S3, and a new one on the same bucket and the same library. */
  async function inSeafile(): Promise<{ source: TestServer; fresh: TestServer; name: string; photo: Buffer; pdf: Buffer }> {
    const source = server();
    const { photo, pdf } = await seedLibrary(source);
    expect((await putSettings(source, { drive: SEAFILE(source) })).status).toBe(200);
    await source.drive.run();
    source.time.value += 11 * 60_000;
    await source.drive.run();
    expect((await putSettings(source, { backup: S3 })).status).toBe(200);
    await source.backups.run('manual');
    const fresh = server();
    for (const [key, object] of source.s3.objects) fresh.s3.objects.set(key, object);
    for (const [path, node] of source.seafile.tree) fresh.seafile.tree.set(path, node);
    return { source, fresh, name: snapshots(source)[0]!.slice('carnet/sauvegardes/'.length), photo, pdf };
  }

  it('takes the files back from Seafile on a new server: previews made again, nothing copied or sent twice', async () => {
    const { source, fresh, name, photo, pdf } = await inSeafile();
    expect((await putSettings(fresh, { backup: S3, drive: SEAFILE(fresh) })).status).toBe(200);
    const before = fresh.seafile.files().sort();
    expect((await restore(fresh, 'merge', { snapshot: name })).status).toBe(202);
    await settle(fresh);
    expect(fresh.restore.status().report).toMatchObject({ files: 2, missingFiles: 0, needDrive: 0 });
    expect(existsSync(fresh.blobs.path(PHOTO, 'display'))).toBe(true);
    expect(await fresh.blobs.localOriginal(PHOTO)).toBeNull();
    expect(await fresh.blobs.localOriginal(PDF)).toBeNull();
    const original = await fresh.app.request(`/api/blobs/${PHOTO}?variant=original`, { headers: AUTH });
    expect(Buffer.from(await original.arrayBuffer()).equals(photo)).toBe(true);
    const file = await fresh.app.request(`/api/blobs/${PDF}`, { headers: AUTH });
    expect(Buffer.from(await file.arrayBuffer()).equals(pdf)).toBe(true);
    await fresh.drive.run();
    expect(fresh.seafile.files().sort()).toEqual(before);
    expect(fresh.drive.status()).toMatchObject({ files: 2, waiting: 0, error: null });
    void source;
  });

  it('says which files wait for Seafile when it is not set yet, and brings them once it is', async () => {
    const { fresh, name } = await inSeafile();
    expect((await putSettings(fresh, { backup: S3 })).status).toBe(200);
    await restore(fresh, 'merge', { snapshot: name });
    await settle(fresh);
    expect(fresh.restore.status().report).toMatchObject({ files: 0, missingFiles: 0, needDrive: 2 });
    expect((await putSettings(fresh, { drive: SEAFILE(fresh) })).status).toBe(200);
    await restore(fresh, 'merge', { snapshot: name });
    await settle(fresh);
    expect(fresh.restore.status().report).toMatchObject({ files: 2, missingFiles: 0, needDrive: 0 });
  });

  it('takes a file already at its place in Seafile instead of sending it a second time', async () => {
    const { source, fresh } = await inSeafile();
    // A full archive (the files inside) restored on a new server linked to the same library.
    const ticket = (await (await source.app.request('/api/admin/downloads', { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ full: true }) })).json()) as { url: string };
    const archive = Buffer.from(await (await source.app.request(ticket.url)).arrayBuffer());
    expect((await putSettings(fresh, { drive: SEAFILE(fresh) })).status).toBe(200);
    const before = fresh.seafile.files().sort();
    await restore(fresh, 'merge', new Uint8Array(archive), 'application/gzip');
    await settle(fresh);
    expect(fresh.restore.status().report).toMatchObject({ files: 2, missingFiles: 0 });
    fresh.seafile.log.length = 0;
    await fresh.drive.run();
    expect(fresh.seafile.log.some(line => line.includes('upload-api'))).toBe(false);
    expect(fresh.seafile.files().sort()).toEqual(before);
    expect(fresh.drive.status()).toMatchObject({ files: 2, waiting: 0 });
  });

  it('brings an empty server back from an S3 snapshot, files included, as a merge', async () => {
    const { source, name } = await backedUp();
    const target = server();
    for (const [key, object] of source.s3.objects) target.s3.objects.set(key, object);
    expect((await putSettings(target, { backup: S3 })).status).toBe(200);
    expect((await restore(target, 'rollback', { snapshot: name })).status).toBe(202);
    await settle(target);
    expect(target.restore.status()).toMatchObject({ error: null, report: { mode: 'merge', source: name, records: 9, files: 2, missingFiles: 0 } });
    const original = await target.app.request(`/api/blobs/${PHOTO}?variant=original`, { headers: AUTH });
    expect(Buffer.from(await original.arrayBuffer()).equals(source.s3.objects.get(`carnet/fichiers/${PHOTO}.jpg`)!.data)).toBe(true);
    expect((await target.app.request(`/api/blobs/${PHOTO}`, { headers: AUTH })).headers.get('content-type')).toBe('image/webp');
    expect(target.records.get('note', NOTE)?.fields.title).toBe('Courses');
  });

  it('rolls back what changed since, under a fresh server clock, and keeps what was created since', async () => {
    const { source, name } = await backedUp();
    const later = T0 + 60_000;
    await postSync(source, { node: 'phone1', since: 0, records: [rec('note', NOTE, { title: 'Courses du samedi' }, later), rec('note', 'note-new', { kind: 'text', title: 'Nouvelle', body: '', createdAt: later, deletedAt: null }, later)] });
    expect((await restore(source, 'rollback', { snapshot: name })).status).toBe(202);
    await settle(source);
    const note = source.records.get('note', NOTE)!;
    expect(note.fields.title).toBe('Courses');
    expect(hlcNode(note.clocks.title!)).toBe('srvtest01');
    expect(source.records.get('note', 'note-new')?.fields.title).toBe('Nouvelle');
  });

  it('a merge keeps later edits and only fills what is missing', async () => {
    const { source, name } = await backedUp();
    await postSync(source, { node: 'phone1', since: 0, records: [rec('note', NOTE, { title: 'Courses du samedi' }, T0 + 60_000)] });
    expect((await restore(source, 'merge', { snapshot: name })).status).toBe(202);
    await settle(source);
    expect(source.records.get('note', NOTE)?.fields.title).toBe('Courses du samedi');
    expect(source.restore.status().report).toMatchObject({ mode: 'merge', records: 0, files: 0 });
  });

  it('restores a downloaded full archive as it is, files and all, without S3', async () => {
    const source = server();
    const { photo, pdf } = await seedLibrary(source);
    const ticket = (await (await source.app.request('/api/admin/downloads', { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ full: true }) })).json()) as { url: string; name: string };
    expect(ticket.name).toBe('unlease-2026-10-18T12-00-00Z-complet.tar.gz');
    const archive = Buffer.from(await (await source.app.request(ticket.url)).arrayBuffer());
    const inside = await entries(archive);
    expect(inside.get(`Fichiers/Carnet/Pages/Projet/Plan.pdf`)?.equals(pdf)).toBe(true);

    const target = server();
    expect((await restore(target, 'merge', new Uint8Array(archive), 'application/gzip')).status).toBe(202);
    await settle(target);
    expect(target.restore.status().report).toMatchObject({ records: 9, files: 2, missingFiles: 0 });
    const original = await target.app.request(`/api/blobs/${PHOTO}?variant=original`, { headers: AUTH });
    expect(Buffer.from(await original.arrayBuffer()).equals(photo)).toBe(true);
    expect(target.s3.log).toEqual([]);
  });

  it('refuses what is not a backup, in French', async () => {
    const target = server();
    expect((await restore(target, 'merge', new TextEncoder().encode('pas une archive'), 'application/gzip')).status).toBe(202);
    await settle(target);
    expect(target.restore.status().error).toBe('Archive illisible : ce n’est pas une sauvegarde .tar.gz');
    expect((await restore(target, 'oops', { snapshot: 'x' })).status).toBe(400);
    expect((await restore(target, 'merge', { snapshot: '../etc/passwd' })).status).toBe(400);
  });
});
