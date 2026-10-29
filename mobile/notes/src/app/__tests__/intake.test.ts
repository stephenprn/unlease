import { INBOX_ID } from '@unlease/notes/models/entities';
import { closeDatabase, openDatabase } from '@data/db/database';

import { receiveShare } from '../intake';
import { ensureInbox } from '../store/actions';
import { loadLibrary, resetLibrary, useLibraryStore } from '../store/libraryStore';
import { useSettingsStore } from '../store/settingsStore';

const share = (over: Partial<{ text: string; subject: string; files: string[] }>) => ({
  id: 'share-1',
  text: '',
  subject: '',
  files: [],
  mimeType: 'text/plain',
  ...over,
});

beforeEach(() => {
  closeDatabase();
  resetLibrary();
  openDatabase({ name: 'test.sqlite' });
  loadLibrary(1_000);
  ensureInbox();
  useSettingsStore.setState({ server: { url: 'https://carnet.test', token: 'jeton' }, reading: true });
});

describe('a share from another app', () => {
  it('files a shared link automatically, titled by the page title the browser sent', async () => {
    const result = await receiveShare(share({ text: 'https://shop.fr/veste?utm_source=ig', subject: 'Veste en laine' }));
    expect(result).toMatchObject({ kind: 'links', reading: true });
    const id = result.kind === 'links' ? result.links[0]!.id : '';
    expect(useLibraryStore.getState().links[id]).toMatchObject({ noteId: INBOX_ID, autoFile: true, title: 'Veste en laine', url: 'https://shop.fr/veste' });
  });

  it('uses the words around the link when there is no subject', async () => {
    const result = await receiveShare(share({ text: 'Le resto de samedi : https://resto.fr' }));
    const id = result.kind === 'links' ? result.links[0]!.id : '';
    expect(useLibraryStore.getState().links[id]?.title).toBe('Le resto de samedi');
  });

  it('turns plain text into a note', async () => {
    const result = await receiveShare(share({ text: 'Acheter du pain', subject: 'Courses' }));
    expect(result.kind).toBe('note');
    const id = result.kind === 'note' ? result.id : '';
    expect(useLibraryStore.getState().notes[id]).toMatchObject({ title: 'Courses', body: 'Acheter du pain' });
  });

  it('says when links will not be read', async () => {
    useSettingsStore.setState({ reading: false });
    const result = await receiveShare(share({ text: 'https://a.fr' }));
    expect(result).toMatchObject({ kind: 'links', reading: false });
  });

  it('keeps links plain when no server is connected', async () => {
    useSettingsStore.setState({ server: null, reading: null });
    const result = await receiveShare(share({ text: 'https://a.fr' }));
    expect(result).toMatchObject({ kind: 'links', reading: false });
    const id = result.kind === 'links' ? result.links[0]!.id : '';
    expect(useLibraryStore.getState().links[id]).toMatchObject({ status: 'skipped', autoFile: false });
  });
});

describe('a link shared again', () => {
  it('adds nothing when a collection holds it already, and says where', async () => {
    const first = await receiveShare(share({ text: 'https://shop.fr/veste' }));
    const again = await receiveShare({ ...share({ text: 'https://shop.fr/veste?utm_source=ig' }), id: 'share-2' });
    const id = first.kind === 'links' ? first.links[0]!.id : '';
    expect(again).toMatchObject({ kind: 'links', links: [{ id, existing: id, savedIn: [INBOX_ID] }] });
    expect(Object.keys(useLibraryStore.getState().links)).toEqual([id]);
  });
});
