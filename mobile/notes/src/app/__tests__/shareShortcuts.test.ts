import { INBOX_ID } from '@unlease/notes/models/entities';
import { LINES } from '@unlease/design/palette';
import { closeDatabase, openDatabase } from '@shared/data/db/database';

import { collectionOfShortcut, sharedCollections, sharingShortcut } from '../shareShortcuts';
import { addLinks, createLine, ensureInbox } from '../store/actions';
import { loadLibrary, resetLibrary, useLibraryStore } from '../store/libraryStore';

beforeEach(() => {
  closeDatabase();
  resetLibrary();
  openDatabase({ name: 'test.sqlite' });
  loadLibrary(1_000);
  ensureInbox();
});

describe('the collections offered in the share sheet', () => {
  it('puts first those links were last saved into, never « Non classé », four at most', () => {
    const lines = ['Films', 'Livres', 'Recettes', 'Voyages', 'Cadeaux'].map((title, index) => createLine({ title }, 2_000 + index));
    addLinks(['https://a.fr'], { noteId: lines[0] }, 10_000);
    addLinks(['https://b.fr'], { noteId: lines[2] }, 9_000);
    addLinks(['https://c.fr'], {}, 11_000);
    const offered = sharedCollections(useLibraryStore.getState()).map(line => line.id);
    expect(offered).toEqual([lines[0], lines[2], lines[4], lines[3]]);
    expect(offered).not.toContain(INBOX_ID);
  });

  it('draws each as its emblem in its pigment on its wash, opening the collection', () => {
    const id = createLine({ title: 'Films', color: 'blue', emblem: 'etoile' });
    const shortcut = sharingShortcut(useLibraryStore.getState().notes[id]!);
    expect(shortcut).toMatchObject({ id: `collection:${id}`, label: 'Films', uri: `carnet://line/${id}`, evenOdd: false, stone: LINES.light.blue.tint, ink: LINES.light.blue.fill });
    expect(shortcut.path.startsWith('M')).toBe(true);
  });

  it('reads a share\'s shortcut as its collection while it lives', () => {
    const id = createLine({ title: 'Films' });
    expect(collectionOfShortcut(`collection:${id}`)).toBe(id);
    expect(collectionOfShortcut(`collection:${INBOX_ID}`)).toBeNull();
    expect(collectionOfShortcut('collection:gone')).toBeNull();
    expect(collectionOfShortcut('')).toBeNull();
    expect(collectionOfShortcut(undefined)).toBeNull();
  });
});
