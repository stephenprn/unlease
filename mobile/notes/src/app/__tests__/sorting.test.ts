import { INBOX_ID } from '@unlease/notes/models/entities';
import { closeDatabase, openDatabase } from '@data/db/database';

import { applyReview, fillLine, reviewLine, sortInbox, sortIntoLines } from '../sorting';
import { addLink, createLine, createNote, ensureInbox, moveLink, trashLines, updateLink } from '../store/actions';
import { loadLibrary, resetLibrary, useLibraryStore } from '../store/libraryStore';
import { useSettingsStore } from '../store/settingsStore';
import { sortLinks, SyncError } from '../sync/transport';

jest.mock('../sync/transport', () => ({ ...jest.requireActual('../sync/transport'), sortLinks: jest.fn() }));

const sortCall = sortLinks as jest.MockedFunction<typeof sortLinks>;
const state = () => useLibraryStore.getState();
const sent = (index = 0) => sortCall.mock.calls[index]![1];

beforeEach(() => {
  closeDatabase();
  resetLibrary();
  openDatabase({ name: 'test.sqlite' });
  loadLibrary(1_000);
  ensureInbox();
  useSettingsStore.setState({ server: { url: 'https://carnet.test', token: 'jeton' }, reading: true });
  sortCall.mockReset();
});

/** A link as its reading leaves it. */
function readLink(name: string, noteId: string): string {
  const id = addLink(`https://example.fr/${name}`, { noteId });
  updateLink(id, { status: 'ready', title: name });
  return id;
}

describe('sorting "Non classé"', () => {
  it('asks about the links nobody put there by hand, and files the answer at the top of each collection', async () => {
    const mode = createLine({ title: 'Mode', hint: 'Vêtements' });
    const films = createLine({ title: 'Films' });
    const kept = readLink('jupe', mode);
    const veste = readLink('veste', INBOX_ID);
    const film = readLink('film', INBOX_ID);
    const mine = readLink('mine', INBOX_ID);
    moveLink(mine, mode);
    moveLink(mine, INBOX_ID);
    addLink('https://example.fr/en-lecture', { noteId: INBOX_ID });
    sortCall.mockResolvedValue({ moves: [{ link: veste, to: mode }, { link: film, to: films }], incomplete: null });

    const { moved, undo } = await sortInbox();

    expect(sent()).toMatchObject({ task: 'file', from: null });
    expect(sent().targets.map(target => target.id).sort()).toEqual([films, mode].sort());
    expect(sent().targets.find(target => target.id === mode)).toEqual({ id: mode, title: 'Mode', hint: 'Vêtements', examples: ['jupe'] });
    expect(sent().links.map(link => link.id).sort()).toEqual([veste, film].sort());
    expect(moved).toHaveLength(2);
    expect(state().links[veste]).toMatchObject({ noteId: mode, filedBy: 'claude', autoFile: false });
    expect(state().linksByNote[mode]).toEqual([veste, kept]);
    expect(state().links[film]).toMatchObject({ noteId: films, filedBy: 'claude' });

    undo();
    expect(state().links[veste]).toMatchObject({ noteId: INBOX_ID, filedBy: null });
    expect(state().links[film]?.noteId).toBe(INBOX_ID);
  });

  it('leaves a link the person moved while Claude was answering, and a collection gone meanwhile', async () => {
    const mode = createLine({ title: 'Mode' });
    const films = createLine({ title: 'Films' });
    const a = readLink('a', INBOX_ID);
    const b = readLink('b', INBOX_ID);
    sortCall.mockImplementation(async () => {
      moveLink(a, films);
      trashLines([mode], null);
      return { moves: [{ link: a, to: mode }, { link: b, to: mode }], incomplete: null };
    });

    const { moved } = await sortInbox();
    expect(moved).toEqual([]);
    expect(state().links[a]?.noteId).toBe(films);
    expect(state().links[b]?.noteId).toBe(INBOX_ID);
  });

  it('asks nothing when nothing can be sorted', async () => {
    createLine({ title: 'Mode' });
    await expect(sortInbox()).resolves.toMatchObject({ moved: [] });
    expect(sortCall).not.toHaveBeenCalled();
  });

  it('passes the server’s words on', async () => {
    createLine({ title: 'Mode' });
    readLink('a', INBOX_ID);
    sortCall.mockRejectedValue(new SyncError('http', 'Budget mensuel atteint', 409));
    await expect(sortInbox()).rejects.toThrow('Budget mensuel atteint');
  });
});

describe('a new collection', () => {
  it('looks for its links in "Non classé" only, the person’s choices there included', async () => {
    const mode = createLine({ title: 'Mode' });
    const inMode = readLink('jupe', mode);
    const mine = readLink('mine', INBOX_ID);
    moveLink(mine, INBOX_ID);
    const recettes = createLine({ title: 'Recettes', hint: 'Plats à cuisiner' });
    sortCall.mockResolvedValue({ moves: [{ link: mine, to: recettes }], incomplete: null });

    const { moved } = await fillLine(recettes);

    expect(sent().targets).toEqual([{ id: recettes, title: 'Recettes', hint: 'Plats à cuisiner', examples: [] }]);
    expect(sent().links.map(link => link.id)).toEqual([mine]);
    expect(moved).toEqual([{ link: mine, to: recettes }]);
    expect(state().links[inMode]?.noteId).toBe(mode);
  });
});

describe('reviewing a collection', () => {
  it('sends its links without its own examples, and makes the kept moves the person’s', async () => {
    const mode = createLine({ title: 'Mode' });
    const films = createLine({ title: 'Films' });
    readLink('film ancien', films);
    const jupe = readLink('jupe', mode);
    const tarte = readLink('tarte', mode);
    sortCall.mockResolvedValue({ moves: [{ link: tarte, to: INBOX_ID }], incomplete: null });

    const { moves } = await reviewLine(mode);
    expect(sent()).toMatchObject({ task: 'review', from: mode });
    expect(sent().targets.find(target => target.id === mode)?.examples).toEqual([]);
    expect(sent().targets.find(target => target.id === films)?.examples).toEqual(['film ancien']);
    expect(sent().links.map(link => link.id).sort()).toEqual([jupe, tarte].sort());
    expect(state().links[tarte]?.noteId).toBe(mode);

    const { moved, undo } = applyReview(mode, moves);
    expect(moved).toHaveLength(1);
    expect(state().links[tarte]).toMatchObject({ noteId: INBOX_ID, filedBy: 'person' });
    undo();
    expect(state().links[tarte]?.noteId).toBe(mode);
  });
});

describe('deleting a collection', () => {
  it('moves its links to "Non classé" in the same batch, then Claude sorts them; its undo takes all of it back', async () => {
    const mode = createLine({ title: 'Mode' });
    const films = createLine({ title: 'Films' });
    const a = readLink('a', mode);
    const b = readLink('b', mode);
    const before = state().links[a]!.position;

    const undo = trashLines([mode], INBOX_ID);
    expect(state().notes[mode]?.trashedAt).not.toBeNull();
    expect(state().links[a]).toMatchObject({ noteId: INBOX_ID, filedBy: null });
    expect(state().linksByNote[INBOX_ID]?.slice(0, 2)).toEqual([b, a]);

    sortCall.mockResolvedValue({ moves: [{ link: a, to: films }], incomplete: 'Tri refusé par Claude' });
    const { moved, incomplete } = await sortIntoLines([a, b]);
    expect(sent().targets.map(target => target.id)).toEqual([films]);
    expect(moved).toEqual([{ link: a, to: films }]);
    // Part of the links went unread: the moves of the rest are made all the same.
    expect(incomplete).toBe('Tri refusé par Claude');

    undo();
    expect(state().notes[mode]?.trashedAt).toBeNull();
    expect(state().links[a]).toMatchObject({ noteId: mode, filedBy: 'person', position: before });
    expect(state().links[b]?.noteId).toBe(mode);
  });

  it('deletes a selection holding several collections, plain notes included, in one batch', () => {
    const mode = createLine({ title: 'Mode' });
    const films = createLine({ title: 'Films' });
    const note = createNote({ kind: 'text', title: 'Idée' });
    const a = readLink('a', mode);
    const b = readLink('b', films);
    const undo = trashLines([mode, films, note, INBOX_ID], INBOX_ID);
    expect([mode, films, note].map(id => state().notes[id]?.trashedAt !== null)).toEqual([true, true, true]);
    expect(state().notes[INBOX_ID]?.trashedAt).toBeNull();
    expect(state().links[a]?.noteId).toBe(INBOX_ID);
    expect(state().links[b]?.noteId).toBe(INBOX_ID);
    undo();
    expect(state().links[b]?.noteId).toBe(films);
    expect(state().notes[note]?.trashedAt).toBeNull();
  });

  it('can send them to another collection as the person’s choice, or to the bin with it', () => {
    const mode = createLine({ title: 'Mode' });
    const films = createLine({ title: 'Films' });
    const a = readLink('a', mode);
    trashLines([mode], films);
    expect(state().links[a]).toMatchObject({ noteId: films, filedBy: 'person' });

    const b = readLink('b', films);
    trashLines([films], null);
    expect(state().links[b]?.noteId).toBe(films);
    expect(state().notes[films]?.trashedAt).not.toBeNull();
  });
});
