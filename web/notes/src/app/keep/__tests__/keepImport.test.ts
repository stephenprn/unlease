import { strToU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';

import { INBOX_ID } from '@unlease/notes/models/entities';

import { freshLibrary } from '@test/library';
import { readStoredFile, storedFileIds } from '@shared/app/media/files';
import { createLabel } from '../../store/actions';
import { countPending } from '@shared/app/store/records';
import { useLibraryStore } from '../../store/library';
import { setServer } from '@shared/app/store/settings';
import { setReading } from '../../store/prefs';
import { keepPlanCounts, singleLinkNotes } from '@unlease/notes/services/keepImport';

import { KeepImportError, alreadyHere, readKeepArchive, runKeepImport, type KeepChoices } from '../keepImport';

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
    'Takeout/Keep/Films.json': strToU8(keep({ title: 'Films', textContent: 'Dune https://www.exemple.fr/dune\nhttps://www.exemple.fr/alien', createdTimestampUsec: 1_690_000_000_500_000 })),
    'Takeout/Keep/Corbeille.json': strToU8(keep({ title: 'Jeté', isTrashed: true })),
    'Takeout/Keep/cassé.json': strToU8('{pas du json'),
    'Takeout/Keep/Labels.txt': strToU8('perso\nProjets\nVide'),
    'Takeout/Keep/balcon.png': PNG,
    // Another product in the same export: never read.
    'Takeout/Drive/secret.json': strToU8(keep({ title: 'Ne pas importer' })),
  });
  return new Blob([zip], { type: 'application/zip' });
}

const ALL: KeepChoices = { singleLinks: true, collections: new Set(['Films.json']) };

describe('Google Keep import from a Takeout zip', () => {
  beforeEach(async () => {
    await freshLibrary({ persistent: true });
    setServer({ url: 'https://carnet.test', token: 'jeton' });
  });

  it('reads only the Keep folder and plans what it will import', async () => {
    const prepared = await readKeepArchive(takeout());
    const { plan } = prepared;
    expect(plan.notes.map(note => note.title).sort()).toEqual(['', 'Balcon', 'Courses', 'Films', 'Idée']);
    expect(plan.trashed).toBe(1);
    expect(plan.unreadable).toEqual(['cassé.json']);
    expect([...plan.labelNames].sort()).toEqual(['Projets', 'Vide', 'perso']);
    expect(singleLinkNotes(plan)).toHaveLength(1);
    expect(keepPlanCounts(plan).photos).toBe(1);
    expect(prepared.files.has('Takeout/Keep/balcon.png')).toBe(true);
    expect(alreadyHere(plan)).toBe(0);
  });

  it('writes notes, checklists, labels, links and photos as pending records', async () => {
    const existing = createLabel('Perso');
    const prepared = await readKeepArchive(takeout());
    const report = await runKeepImport(prepared, ALL);
    expect(report).toMatchObject({ notes: 3, collections: 1, links: 3, photos: 1, labels: 2, trashed: 1, unreadable: 1 });

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
    const link = Object.values(state.links).find(item => item.noteId === INBOX_ID)!;
    expect(link).toMatchObject({ url: 'https://www.exemple.fr/article', autoFile: true, status: 'pending' });
    // The list of links became a collection, the words beside a link its comment.
    const films = Object.values(state.notes).find(note => note.title === 'Films')!;
    expect(films.kind).toBe('links');
    expect((state.linksByNote[films.id] ?? []).map(id => [state.links[id]!.url, state.links[id]!.comment, state.links[id]!.filedBy])).toEqual([
      ['https://www.exemple.fr/dune', 'Dune', 'person'],
      ['https://www.exemple.fr/alien', '', 'person'],
    ]);

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
    await runKeepImport(await readKeepArchive(takeout()), ALL);
    const link = Object.values(useLibraryStore.getState().links).find(item => item.noteId === INBOX_ID)!;
    expect(link).toMatchObject({ status: 'skipped', autoFile: false, url: 'https://www.exemple.fr/article' });
  });

  it('keeps notes made of links as notes when asked', async () => {
    const report = await runKeepImport(await readKeepArchive(takeout()), { singleLinks: false, collections: new Set() });
    expect(report).toMatchObject({ notes: 5, collections: 0, links: 0, photos: 1 });
    expect(Object.keys(useLibraryStore.getState().links)).toHaveLength(0);
    expect(Object.values(useLibraryStore.getState().notes).find(note => note.title === 'Films')?.body).toBe('Dune https://www.exemple.fr/dune\nhttps://www.exemple.fr/alien');
  });

  it('imports the same archive twice without doubling anything', async () => {
    await runKeepImport(await readKeepArchive(takeout()), ALL);
    const before = useLibraryStore.getState();
    const counts = [Object.keys(before.notes).length, Object.keys(before.links).length, Object.keys(before.labels).length, Object.keys(before.attachments).length];
    const again = await readKeepArchive(takeout());
    expect(alreadyHere(again.plan)).toBe(4);
    const report = await runKeepImport(again, ALL);
    expect(report).toMatchObject({ notes: 0, links: 0, labels: 0, photos: 0, already: 5 });
    const after = useLibraryStore.getState();
    expect([Object.keys(after.notes).length, Object.keys(after.links).length, Object.keys(after.labels).length, Object.keys(after.attachments).length]).toEqual(counts);
  });

  it('reads the Keep folder’s files given as they are, and an export split in several zips', async () => {
    const loose = [
      new File([keep({ title: 'Seule', attachments: [{ filePath: 'p.jpeg', mimetype: 'image/jpeg' }] })], 'Seule.json'),
      new File([PNG], 'p.jpg', { type: 'image/jpeg' }),
      new File(['Perso'], 'Labels.txt'),
    ];
    const prepared = await readKeepArchive(loose);
    expect(prepared.plan.notes.map(note => note.title)).toEqual(['Seule']);
    expect(prepared.plan.labelNames).toEqual(['Perso']);
    const report = await runKeepImport(prepared, ALL);
    expect(report).toMatchObject({ notes: 1, photos: 1, missingPhotos: 0 });

    const first = new File([zipSync({ 'Takeout/Keep/Deux.json': strToU8(keep({ title: 'Deux', createdTimestampUsec: 1_690_000_000_900_000, attachments: [{ filePath: 'q.png', mimetype: 'image/png' }] })) })], 'takeout-001.zip', { type: 'application/zip' });
    const second = new File([zipSync({ 'Takeout/Keep/q.png': PNG })], 'takeout-002.zip', { type: 'application/zip' });
    const split = await readKeepArchive([first, second]);
    expect((await runKeepImport(split, ALL)).photos).toBe(1);
  });

  it('refuses an archive without Keep notes, and one that is not a zip', async () => {
    const empty = new Blob([zipSync({ 'Takeout/Drive/a.txt': strToU8('x') })]);
    await expect(readKeepArchive(empty)).rejects.toBeInstanceOf(KeepImportError);
    await expect(readKeepArchive(new Blob(['pas un zip']))).rejects.toBeInstanceOf(KeepImportError);
  });
});
