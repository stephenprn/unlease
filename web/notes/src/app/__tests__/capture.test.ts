import { beforeEach, describe, expect, it } from 'vitest';

import { INBOX_ID } from '@unlease/notes/models/entities';

import { freshLibrary } from '../../test/library';
import { classifyText, receiveShare } from '../capture';
import { addLink, createLine } from '../store/actions';
import { useLibraryStore } from '../store/library';
import { setReading, setServer } from '../store/settings';
import { useUiStore } from '../store/ui';

const links = () => Object.values(useLibraryStore.getState().links);

describe('links in, from a paste or a share', () => {
  beforeEach(async () => {
    await freshLibrary();
    setServer({ url: 'https://carnet.test', token: 'jeton' });
  });

  it('files a link with the transfer panel when the server reads links, counting the trackers taken off', () => {
    const [id] = classifyText('Regarde ça : https://www.exemple.fr/veste?utm_source=x&fbclid=y&taille=m');
    expect(links()[0]).toMatchObject({ id, url: 'https://www.exemple.fr/veste?taille=m', status: 'pending', autoFile: true, noteId: INBOX_ID, title: 'Regarde ça' });
    expect(useUiStore.getState().transfers).toMatchObject([{ linkId: id, cleaned: 2 }]);
  });

  it('gives each link of a paste its own count', () => {
    const [a, b] = classifyText('https://www.exemple.fr/a?utm_source=x https://www.exemple.fr/b');
    expect(useUiStore.getState().transfers.map(t => [t.linkId, t.cleaned])).toEqual([
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
    expect(useUiStore.getState().transfers).toEqual([]);
    expect(useUiStore.getState().snack?.message).toBe('2 liens ajoutés à Non classé · 1 traceur retiré');
    const result = receiveShare({ title: 'Un film', text: '', url: 'https://www.exemple.fr/film' });
    expect(result.kind).toBe('links');
    expect(useUiStore.getState().snack?.message).toBe('Ajouté à Non classé');
  });

  it('keeps links plain without a server, whatever was last heard', () => {
    setServer(null);
    setReading(true);
    classifyText('https://www.exemple.fr/film?fbclid=z&gclid=w');
    expect(links()[0]).toMatchObject({ url: 'https://www.exemple.fr/film', status: 'skipped', autoFile: false });
    expect(useUiStore.getState().transfers).toEqual([]);
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
    expect(useUiStore.getState().transfers.map(t => t.linkId)).toEqual([fresh]);
    expect(useUiStore.getState().snack?.message).toBe('1 lien déjà dans Films');
    receiveShare({ title: 'Cléo', text: '', url: 'https://www.exemple.fr/cleo' });
    expect(useUiStore.getState().snack?.message).toBe('Ce lien est déjà dans Films');
    expect(links()).toHaveLength(2);
  });
});
