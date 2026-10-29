import { strToU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';

import { INBOX_ID } from '@unlease/notes/models/entities';

import { freshLibrary } from '../../../test/library';
import { readStoredFile, storedFileIds } from '../../media/files';
import { createLabel } from '../../store/actions';
import { countPending, useLibraryStore } from '../../store/library';
import { setReading, setServer } from '../../store/settings';
import { KeepImportError, linkOnlyCount, photoCount, readKeepArchive, runKeepImport } from '../keepImport';

const keep = (over: Record<string, unknown>): string =>
  JSON.stringify({
    color: 'DEFAULT',
    isTrashed: false,
    isPinned: false,
    isArchived: false,
    title: '',
    textContent: '',
    userEditedTimestampUsec: 1_700_000_000_000_000,
    createdTimestampUsec: 1_690_000_000_000_000,
    ...over,
  });

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function takeout(): Blob {
  const zip = zipSync({
    'Takeout/Keep/Courses.json': strToU8(keep({ title: 'Courses', listContent: [{ text: 'lait', isChecked: false }, { text: 'pain', isChecked: true }], labels: [{ name: 'perso' }], isPinned: true })),
    'Takeout/Keep/Idée.json': strToU8(keep({ title: 'Idée', textContent: 'Un vélo cargo', color: 'YELLOW', labels: [{ name: 'Projets' }] })),
    'Takeout/Keep/Lien.json': strToU8(keep({ textContent: 'https://www.exemple.fr/article?utm_source=keep' })),
    'Takeout/Keep/Photo.json': strToU8(keep({ title: 'Balcon', attachments: [{ filePath: 'balcon.png', mimetype: 'image/png' }] })),
    'Takeout/Keep/Corbeille.json': strToU8(keep({ title: 'Jeté', isTrashed: true })),
    'Takeout/Keep/cassé.json': strToU8('{pas du json'),
    'Takeout/Keep/Labels.txt': strToU8('perso\nProjets'),
    'Takeout/Keep/balcon.png': PNG,
    // Another product in the same export: never read.
    'Takeout/Drive/secret.json': strToU8(keep({ title: 'Ne pas importer' })),
  });
  return new Blob([zip], { type: 'application/zip' });
}

describe('Google Keep import from a Takeout zip', () => {
  beforeEach(async () => {
    await freshLibrary({ persistent: true });
    setServer({ url: 'https://carnet.test', token: 'jeton' });
  });

  it('reads only the Keep folder and plans what it will import', async () => {
    const prepared = await readKeepArchive(takeout());
    const { plan } = prepared;
    expect(plan.notes.map(note => note.title).sort()).toEqual(['', 'Balcon', 'Courses', 'Idée']);
    expect(plan.trashed).toBe(1);
    expect(plan.unreadable).toEqual(['cassé.json']);
    expect([...plan.labelNames].sort()).toEqual(['Projets', 'perso']);
    expect(linkOnlyCount(plan)).toBe(1);
    expect(photoCount(plan)).toBe(1);
    expect(prepared.images.has('balcon.png')).toBe(true);
  });

  it('writes notes, checklists, labels, links and photos as pending records', async () => {
    const existing = createLabel('Perso');
    const prepared = await readKeepArchive(takeout());
    const counts = await runKeepImport(prepared, true);
    expect(counts).toEqual({ notes: 3, links: 1, photos: 1 });

    const state = useLibraryStore.getState();
    const notes = Object.values(state.notes).filter(note => note.id !== INBOX_ID);
    const courses = notes.find(note => note.title === 'Courses')!;
    expect(courses).toMatchObject({ kind: 'checklist', pinned: true, labelIds: [existing] });
    expect((state.checksByNote[courses.id] ?? []).map(id => [state.checks[id]!.text, state.checks[id]!.checked])).toEqual([
      ['lait', false],
      ['pain', true],
    ]);
    // "Modifiée le…" keeps Keep's own date.
    expect(courses.editedAt).toBe(1_700_000_000_000);
    const idea = notes.find(note => note.title === 'Idée')!;
    expect(idea.color).toBe('yellow');
    expect(state.labels[idea.labelIds[0]!]?.name).toBe('Projets');

    // The link-only note became an auto-filed link in "Non classé", for the server to read.
    const link = Object.values(state.links)[0]!;
    expect(link).toMatchObject({ noteId: INBOX_ID, url: 'https://www.exemple.fr/article', autoFile: true, status: 'pending' });

    // The photo waits in IndexedDB for the sync loop to upload it.
    const photoNote = notes.find(note => note.title === 'Balcon')!;
    const attachmentId = state.attachmentsByNote[photoNote.id]![0]!;
    expect(state.attachments[attachmentId]).toMatchObject({ mime: 'image/png', uploaded: false, bytes: PNG.length });
    expect(await storedFileIds()).toEqual([attachmentId]);
    expect((await readStoredFile(attachmentId))?.size).toBe(PNG.length);
    expect(countPending()).toBeGreaterThan(5);
  });

  it('keeps imported links plain in "Non classé" when the server does not read links', async () => {
    setReading(false);
    await runKeepImport(await readKeepArchive(takeout()), true);
    const link = Object.values(useLibraryStore.getState().links)[0]!;
    expect(link).toMatchObject({ noteId: INBOX_ID, status: 'skipped', autoFile: false, url: 'https://www.exemple.fr/article' });
  });

  it('keeps link-only notes as notes when asked', async () => {
    const counts = await runKeepImport(await readKeepArchive(takeout()), false);
    expect(counts).toEqual({ notes: 4, links: 0, photos: 1 });
    expect(Object.keys(useLibraryStore.getState().links)).toHaveLength(0);
  });

  it('refuses an archive without Keep notes, and one that is not a zip', async () => {
    const empty = new Blob([zipSync({ 'Takeout/Drive/a.txt': strToU8('x') })]);
    await expect(readKeepArchive(empty)).rejects.toBeInstanceOf(KeepImportError);
    await expect(readKeepArchive(new Blob(['pas un zip']))).rejects.toBeInstanceOf(KeepImportError);
  });
});
