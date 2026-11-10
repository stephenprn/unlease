import { beforeEach, describe, expect, it } from 'vitest';

import { INBOX_ID } from '@unlease/notes/models/entities';

import { freshLibrary } from '@test/library';
import { classifyText, readShare } from '../capture';
import { addLink, createLine } from '../store/actions';
import { useLibraryStore } from '../store/library';
import { setServer } from '@shared/app/store/settings';
import { setReading } from '../store/prefs';
import { useUiStore } from '@shared/app/store/ui';
import { useNotesUiStore } from '@notes/app/store/notesUi';

const links = () => Object.values(useLibraryStore.getState().links);

describe('links in, from a paste or a share', () => {
  beforeEach(async () => {
    await freshLibrary();
    setServer({ url: 'https://carnet.test', token: 'jeton' });
  });

  it('files a link with the transfer panel when the server reads links, counting the trackers taken off', () => {
    const [id] = classifyText('Regarde ça : https://www.exemple.fr/veste?utm_source=x&fbclid=y&taille=m');
    expect(links()[0]).toMatchObject({ id, url: 'https://www.exemple.fr/veste?taille=m', status: 'pending', autoFile: true, noteId: INBOX_ID, title: 'Regarde ça' });
    expect(useNotesUiStore.getState().transfers).toMatchObject([{ linkId: id, cleaned: 2 }]);
  });

  it('gives each link of a paste its own count', () => {
    const [a, b] = classifyText('https://www.exemple.fr/a?utm_source=x https://www.exemple.fr/b');
    expect(useNotesUiStore.getState().transfers.map(t => [t.linkId, t.cleaned])).toEqual([
      [a, 1],
      [b, 0],
    ]);
  });

  it('keeps it plain in "Non classé" with a snackbar, and no transfer, when reading is off', () => {
    setReading(false);
    classifyText('https://www.exemple.fr/a https://www.exemple.fr/b?utm_source=x');
    expect(links().map(link => [link.status, link.autoFile, link.noteId])).toEqual([
      ['skipped', false, INBOX_ID],
      ['skipped', false, INBOX_ID],
    ]);
    expect(useNotesUiStore.getState().transfers).toEqual([]);
    expect(useUiStore.getState().snack?.message).toBe('2 liens ajoutés à Non classé · 1 traceur retiré');
  });

  it('keeps links plain without a server, whatever was last heard', () => {
    setServer(null);
    setReading(true);
    classifyText('https://www.exemple.fr/film?fbclid=z&gclid=w');
    expect(links()[0]).toMatchObject({ url: 'https://www.exemple.fr/film', status: 'skipped', autoFile: false });
    expect(useNotesUiStore.getState().transfers).toEqual([]);
    expect(useUiStore.getState().snack?.message).toBe('Ajouté à Non classé · 2 traceurs retirés');
  });
});

describe('a link saved already', () => {
  beforeEach(async () => {
    await freshLibrary();
    setServer({ url: 'https://carnet.test', token: 'jeton' });
  });

  it('is not filed again: the snackbar says where it is, and the others travel', () => {
    const films = createLine({ title: 'Films' });
    const saved = addLink('https://www.exemple.fr/cleo', { noteId: films });
    const [again, fresh] = classifyText('https://www.exemple.fr/cleo?utm_source=x https://www.exemple.fr/nuit');
    expect(again).toBe(saved);
    expect(links()).toHaveLength(2);
    expect(useNotesUiStore.getState().transfers.map(t => t.linkId)).toEqual([fresh]);
    expect(useUiStore.getState().snack?.message).toBe('1 lien déjà dans Films');
  });
});

describe('a share, read before anything is saved', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  it('gives the capture dialog its links, with the page title sent beside them, and saves nothing', () => {
    expect(readShare({ title: 'Un film', text: '', url: 'https://www.exemple.fr/film' })).toEqual({ kind: 'links', text: 'https://www.exemple.fr/film', title: 'Un film' });
    expect(readShare({ title: '', text: 'Regarde : https://www.exemple.fr/a', url: 'https://www.exemple.fr/b' })).toEqual({
      kind: 'links',
      text: 'Regarde : https://www.exemple.fr/a https://www.exemple.fr/b',
      title: '',
    });
    expect(readShare({ title: 'https://www.exemple.fr/titre', text: '', url: '' })).toMatchObject({ kind: 'links', text: 'https://www.exemple.fr/titre' });
    expect(links()).toEqual([]);
  });

  it('keeps text without a link for a note the person asks for, and nothing at all for an empty share', () => {
    const before = Object.keys(useLibraryStore.getState().notes);
    expect(readShare({ title: 'Courses', text: 'Acheter du pain', url: '' })).toEqual({ kind: 'note', title: 'Courses', body: 'Acheter du pain' });
    expect(readShare({ title: ' ', text: '', url: '' })).toEqual({ kind: 'none' });
    expect(Object.keys(useLibraryStore.getState().notes)).toEqual(before);
  });
});
