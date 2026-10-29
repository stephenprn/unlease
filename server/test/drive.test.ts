import { afterEach, describe, expect, it } from 'vitest';
import { safeName, stamp, uniqueName } from '../src/blobs/names';
import { AUTH, createTestServer, postSync, rec, T0, type TestServer } from './helpers';
import { NOTE, PDF, PHOTO, putSettings, seedLibrary } from './seed';

const servers: TestServer[] = [];
function server(): TestServer {
  const created = createTestServer();
  servers.push(created);
  return created;
}
afterEach(() => {
  for (const created of servers.splice(0)) created.close();
});

const SEAFILE = (target: TestServer) => ({ provider: 'seafile', url: 'http://seafile.lan:8000/', token: target.seafile.token, folder: 'Unlease/' });
const photoPath = (title: string) => `/Unlease/Carnet/Notes/${title}/${stamp(T0 - 60_000)}.jpg`;
const original = async (target: TestServer, id: string) => Buffer.from(await (await target.app.request(`/api/blobs/${id}?variant=original`, { headers: AUTH })).arrayBuffer());

describe('readable names', () => {
  it('makes names every file system takes, unique whatever the case', () => {
    expect(safeName(' Liste : courses/maison? ', 'x')).toBe('Liste - courses-maison-');
    expect(safeName('...', 'Sans titre')).toBe('Sans titre');
    const taken = new Set<string>();
    expect([uniqueName('Plan', taken, 'pdf'), uniqueName('plan', taken, 'pdf'), uniqueName('Plan', taken, 'pdf')]).toEqual(['Plan.pdf', 'plan (2).pdf', 'Plan (3).pdf']);
  });
});

describe('Seafile settings', () => {
  it('checks the library and its rights, and makes the folder, before keeping it', async () => {
    const target = server();
    const saved = await putSettings(target, { drive: SEAFILE(target) });
    expect(saved.status).toBe(200);
    expect(saved.body.drive).toEqual({ provider: 'seafile', url: 'http://seafile.lan:8000', folder: '/Unlease', library: 'Documents', tokenHint: '…cdef', leaving: false });
    expect(JSON.stringify(saved.body)).not.toContain(target.seafile.token);
    expect(target.seafile.dirs()).toEqual(['/Unlease']);
    // Saving again does not make "Unlease (1)": a folder is made only when it is missing.
    expect((await putSettings(target, { drive: { folder: '/Unlease' } })).status).toBe(200);
    expect((await putSettings(target, { drive: { ...SEAFILE(target), folder: '/Unlease/Fichiers' } })).status).toBe(200);
    expect(target.seafile.dirs()).toEqual(['/Unlease', '/Unlease/Fichiers']);
  });

  it('refuses a wrong token, a read-only one, the library root and an address that is not Seafile', async () => {
    const target = server();
    expect(await putSettings(target, { drive: { ...SEAFILE(target), token: 'not-the-token-at-all' } })).toMatchObject({ status: 400, body: { error: 'Jeton refusé par Seafile' } });
    target.seafile.readOnly = true;
    expect(await putSettings(target, { drive: SEAFILE(target) })).toMatchObject({ status: 400, body: { error: 'Ce jeton est en lecture seule : il faut la lecture et l’écriture' } });
    target.seafile.readOnly = false;
    expect(await putSettings(target, { drive: { ...SEAFILE(target), folder: '/' } })).toMatchObject({ status: 400, body: { error: 'Choisissez un dossier de la bibliothèque (pas sa racine)' } });
    target.seafile.unreachable = true;
    expect(await putSettings(target, { drive: SEAFILE(target) })).toMatchObject({ status: 502, body: { error: 'Seafile injoignable' } });
    expect(target.settings.drive()).toBeNull();
  });
});

describe('the drive holds the files', () => {
  async function linked(): Promise<{ target: TestServer; photo: Buffer; pdf: Buffer }> {
    const target = server();
    const seeded = await seedLibrary(target);
    expect((await putSettings(target, { drive: SEAFILE(target) })).status).toBe(200);
    await target.drive.run();
    return { target, ...seeded };
  }

  it('files a note’s photos and a page’s files under their titles, through the address it was given', async () => {
    const { target, photo, pdf } = await linked();
    expect(target.seafile.files()).toEqual([photoPath('Courses'), '/Unlease/Carnet/Pages/Projet/Plan.pdf']);
    expect(target.seafile.file(photoPath('Courses'))?.equals(photo)).toBe(true);
    expect(target.seafile.file('/Unlease/Carnet/Pages/Projet/Plan.pdf')?.equals(pdf)).toBe(true);
    // Seafile's links name its public address; the upload went to the one configured.
    expect(target.seafile.log).toContain('POST seafile.lan:8000/seafhttp/upload-api/tok');
    expect(target.drive.status()).toMatchObject({ files: 2, waiting: 0, error: null });
  });

  it('keeps only the display copy once the original has been in the drive a while, and serves the original from it', async () => {
    const { target, photo, pdf } = await linked();
    expect(await target.blobs.localOriginal(PHOTO)).not.toBeNull();
    target.time.value += 11 * 60_000;
    await target.drive.run();
    expect(await target.blobs.localOriginal(PHOTO)).toBeNull();
    expect(await target.blobs.localOriginal(PDF)).toBeNull();
    expect((await original(target, PHOTO)).equals(photo)).toBe(true);
    expect((await original(target, PDF)).equals(pdf)).toBe(true);
    expect((await target.app.request(`/api/blobs/${PHOTO}`, { headers: AUTH })).headers.get('content-type')).toBe('image/webp');
  });

  it('follows a renamed note and removes the folder it left', async () => {
    const { target } = await linked();
    await postSync(target, { node: 'phone1', since: 0, records: [rec('note', NOTE, { title: 'Courses du samedi' }, T0)] });
    await target.drive.run();
    expect(target.seafile.files()).toContain(photoPath('Courses du samedi'));
    expect(target.seafile.dirs()).not.toContain('/Unlease/Carnet/Notes/Courses');
    expect(target.seafile.dirs()).toContain('/Unlease');
  });

  it('deletes from the drive a file the collector removed', async () => {
    const { target } = await linked();
    await target.blobs.remove(PHOTO);
    await target.drive.run();
    expect(target.seafile.files()).toEqual(['/Unlease/Carnet/Pages/Projet/Plan.pdf']);
    expect(target.seafile.dirs()).not.toContain('/Unlease/Carnet/Notes/Courses');
  });

  it('turned off, brings every original back before forgetting the drive (and leaves the drive’s copy)', async () => {
    const { target, photo } = await linked();
    target.time.value += 11 * 60_000;
    await target.drive.run();
    expect(await target.blobs.localOriginal(PHOTO)).toBeNull();
    const off = await putSettings(target, { drive: null });
    expect(off.body.drive).toMatchObject({ provider: 'seafile', leaving: true });
    await target.drive.run();
    expect(target.settings.drive()).toBeNull();
    expect(await target.blobs.localOriginal(PHOTO)).not.toBeNull();
    expect((await original(target, PHOTO)).equals(photo)).toBe(true);
    expect(target.seafile.files()).toHaveLength(2);
  });

  it('marks a file deleted by hand in the drive as lost, and still shows its display copy', async () => {
    const { target } = await linked();
    target.time.value += 11 * 60_000;
    await target.drive.run();
    target.seafile.tree.delete(photoPath('Courses'));
    await postSync(target, { node: 'phone1', since: 0, records: [rec('note', NOTE, { title: 'Autre titre' }, T0)] });
    await target.drive.run();
    expect(target.drive.status().error).toMatch(/^1.fichier introuvable dans Seafile, sans copie sur le serveur$/);
    expect(target.db.prepare("SELECT state FROM drive_files WHERE blob_id = ?").get(PHOTO)).toEqual({ state: 'lost' });
    expect((await target.app.request(`/api/blobs/${PHOTO}`, { headers: AUTH })).status).toBe(200);
  });

  it('refuses a token for another library while the drive holds files', async () => {
    const { target } = await linked();
    target.seafile.token = 'another-library-token-0000';
    target.seafile.repoId = 'repo-2';
    expect(await putSettings(target, { drive: { token: target.seafile.token } })).toMatchObject({
      status: 400,
      body: { error: 'Ce jeton ouvre une autre bibliothèque : désactivez d’abord Seafile pour rapatrier vos fichiers' },
    });
  });

  it('says when Seafile cannot be reached, and leaves the files where they are', async () => {
    const { target } = await linked();
    await postSync(target, { node: 'phone1', since: 0, records: [rec('note', NOTE, { title: 'Autre titre' }, T0)] });
    target.seafile.unreachable = true;
    await target.drive.run();
    expect(target.drive.status()).toMatchObject({ error: 'Seafile injoignable', files: 2 });
    target.seafile.unreachable = false;
    await target.drive.run();
    expect(target.drive.status().error).toBeNull();
    expect(target.seafile.files()).toContain(photoPath('Autre titre'));
  });
});
