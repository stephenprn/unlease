import { INBOX_ID } from '@unlease/notes/models/entities';
import { planKeepImport } from '@unlease/notes/services/keepImport';
import { formatHlc } from '@unlease/core/sync/hlc';
import { closeDatabase, openDatabase } from '@data/db/database';
import { countPending, loadAllRecords } from '@data/repositories/recordRepository';

import { runKeepImport } from '../../keepImport';
import {
  addCheck,
  addLink,
  addLinks,
  convertToChecklist,
  createLabel,
  createNote,
  deleteForever,
  deleteLabel,
  duplicateNote,
  ensureInbox,
  isEmptyNote,
  mergeIntoPrevious,
  readSkippedLinks,
  setLabels,
  splitCheck,
  toggleCheck,
  trashNotes,
  updateCheck,
  updateNote,
  cleanSavedLinks,
  createLine,
  trackedLinkIds,
  updateLink,
} from '../actions';
import { getRecord, loadLibrary, mergeRemote, resetLibrary, useLibraryStore } from '../libraryStore';
import { useSettingsStore } from '../settingsStore';

const state = () => useLibraryStore.getState();

beforeEach(() => {
  closeDatabase();
  resetLibrary();
  openDatabase({ name: 'test.sqlite' });
  loadLibrary(1_000);
  ensureInbox();
  useSettingsStore.setState({ server: { url: 'https://carnet.test', token: 'jeton' }, reading: null });
});

describe('local writes', () => {
  it('persists every action as a pending record', () => {
    const before = countPending();
    const id = createNote({ kind: 'text', title: 'Idée' });
    expect(state().notes[id]?.title).toBe('Idée');
    expect(countPending()).toBe(before + 1);
    expect(loadAllRecords().some(stored => stored.record.id === id && stored.pending)).toBe(true);
  });

  it('puts new notes first, before every existing one', () => {
    const first = createNote({ kind: 'text', title: 'Premier' });
    const second = createNote({ kind: 'text', title: 'Second' });
    const order = state().noteOrder.filter(id => id !== INBOX_ID);
    expect(order.indexOf(second)).toBeLessThan(order.indexOf(first));
  });

  it('keeps the inbox single and its seed outranked by any real edit', () => {
    ensureInbox();
    expect(state().noteOrder.filter(id => id === INBOX_ID)).toHaveLength(1);
    mergeRemote([{ type: 'note', id: INBOX_ID, fields: { hint: 'Tout le reste' }, clocks: { hint: formatHlc(5_000, 0, 'webapp1') } }]);
    expect(state().notes[INBOX_ID]?.hint).toBe('Tout le reste');
  });

  it('undoes a trash with a newer write, not by forgetting', () => {
    const id = createNote({ kind: 'text', title: 'À jeter' });
    const undo = trashNotes([id]);
    expect(state().notes[id]?.trashedAt).not.toBeNull();
    undo();
    expect(state().notes[id]?.trashedAt).toBeNull();
  });
});

describe('re-render discipline', () => {
  it('replaces only the entity that changed', () => {
    const a = createNote({ kind: 'text', title: 'A' });
    const b = createNote({ kind: 'text', title: 'B' });
    const beforeB = state().notes[b];
    updateNote(a, { title: 'A2' });
    expect(state().notes[b]).toBe(beforeB);
  });

  it('keeps a note without children out of the child index, and other notes’ arrays stable', () => {
    const list = createNote({ kind: 'checklist', title: 'Courses' });
    const other = createNote({ kind: 'checklist', title: 'Autre' });
    addCheck(other, 'x');
    expect(list in state().checksByNote).toBe(false);
    const otherIds = state().checksByNote[other];
    addCheck(list, 'lait');
    expect(state().checksByNote[other]).toBe(otherIds);
  });
});

describe('checklists', () => {
  it('adds new items after the last open one, before checked ones', () => {
    const id = createNote({ kind: 'checklist' });
    const a = addCheck(id, 'a');
    const b = addCheck(id, 'b');
    toggleCheck(a);
    const c = addCheck(id, 'c');
    const ids = state().checksByNote[id]!;
    expect(ids.indexOf(b)).toBeLessThan(ids.indexOf(c));
    expect(ids).toContain(a);
  });

  it('turns a text note into a checklist line by line', () => {
    const id = createNote({ kind: 'text', body: 'lait\n\npain\n  œufs ' });
    convertToChecklist(id);
    expect(state().notes[id]?.kind).toBe('checklist');
    expect(state().checksByNote[id]!.map(cid => state().checks[cid]!.text)).toEqual(['lait', 'pain', 'œufs']);
  });

  it('recognises an empty note, and not one already deleted for good', () => {
    const id = createNote({ kind: 'checklist' });
    addCheck(id, '');
    expect(isEmptyNote(id)).toBe(true);
    expect(isEmptyNote(createNote({ kind: 'text', title: 'x' }))).toBe(false);
    deleteForever([id]);
    expect(isEmptyNote(id)).toBe(false);
  });
});

describe('checklist keys', () => {
  const texts = (noteId: string) => state().checksByNote[noteId]!.map(cid => state().checks[cid]!.text);

  it('splits an item at the caret in one batch, the new item just after it (a checked one between included)', () => {
    const id = createNote({ kind: 'checklist' });
    const first = addCheck(id, 'painlait', null, 2_000);
    const ticked = addCheck(id, 'sel', first, 2_001);
    toggleCheck(ticked);
    const last = addCheck(id, 'beurre', ticked, 2_002);
    updateCheck(first, { indent: 1 });
    expect(state().checksByNote[id]).toEqual([first, ticked, last]);

    const added = splitCheck(first, 'painlait', 4, 3_000)!;
    expect(state().checksByNote[id]).toEqual([first, added, ticked, last]);
    expect(texts(id)).toEqual(['pain', 'lait', 'sel', 'beurre']);
    expect(state().checks[added]).toMatchObject({ noteId: id, checked: false, indent: 1, deletedAt: null });
    // One gesture, one clock: the shortened item and every field of the new one.
    const clock = getRecord('check', first)!.clocks.text;
    expect(new Set(Object.values(getRecord('check', added)!.clocks))).toEqual(new Set([clock]));
  });

  it('leaves the item untouched when Enter comes at its end', () => {
    const id = createNote({ kind: 'checklist' });
    const first = addCheck(id, 'lait');
    const before = getRecord('check', first)!.clocks.text;
    const added = splitCheck(first, 'lait', 4)!;
    expect(texts(id)).toEqual(['lait', '']);
    expect(getRecord('check', first)!.clocks.text).toBe(before);
    expect(state().checks[added]?.text).toBe('');
  });

  it('joins an item to the one above in one batch, and says where they meet', () => {
    const id = createNote({ kind: 'checklist' });
    const first = addCheck(id, 'pain');
    const second = addCheck(id, 'lait', first);
    const third = addCheck(id, 'sel', second);
    expect(mergeIntoPrevious(first, second, 'lait', 4_000)).toBe(4);
    expect(texts(id)).toEqual(['painlait', 'sel']);
    expect(state().checks[second]!.deletedAt).toBe(4_000);
    expect(getRecord('check', first)!.clocks.text).toBe(getRecord('check', second)!.clocks.deletedAt);
    expect(state().checksByNote[id]).toEqual([first, third]);
  });
});

describe('labels', () => {
  it('takes a deleted label off every note, undoably', () => {
    const label = createLabel('Perso');
    const note = createNote({ kind: 'text', title: 'n' });
    setLabels(note, [label]);
    const undo = deleteLabel(label);
    expect(state().notes[note]?.labelIds).toEqual([]);
    expect(state().labelOrder).not.toContain(label);
    undo();
    expect(state().notes[note]?.labelIds).toEqual([label]);
  });
});

describe('duplicates and links', () => {
  it('duplicates the note just before Non classé without touching its key', () => {
    const id = createNote({ kind: 'text', title: 'Dernière' });
    expect(() => duplicateNote(id)).not.toThrow();
  });

  it('sends links to be read, or keeps them plain when reading is off', () => {
    const read = addLink('https://example.com/a?utm_source=x', { autoFile: true });
    expect(state().links[read]).toMatchObject({ status: 'pending', autoFile: true, noteId: INBOX_ID, url: 'https://example.com/a' });
    useSettingsStore.setState({ reading: false });
    const plain = addLink('https://example.com/b', { autoFile: true });
    expect(state().links[plain]).toMatchObject({ status: 'skipped', autoFile: false });
    useSettingsStore.setState({ reading: true });
    expect(readSkippedLinks()).toBe(1);
    expect(state().links[plain]?.status).toBe('pending');
  });

  it('gives a new collection an emblem nobody wears yet', () => {
    const first = createLine({ title: 'Cadeaux' });
    const second = createLine({ title: 'Jeux' });
    expect(state().notes[first]?.emblem).toBeTruthy();
    expect(state().notes[second]?.emblem).not.toBe(state().notes[first]?.emblem);
    const chosen = createLine({ title: 'Vins', emblem: 'goutte' });
    expect(state().notes[chosen]?.emblem).toBe('goutte');
  });

  it('cleans the trackers off links saved before a rule knew them, undoably', () => {
    const id = addLink('https://example.com/a', { noteId: INBOX_ID });
    updateLink(id, { url: 'https://example.com/a?utm_source=x&id=4' });
    expect(trackedLinkIds(state().links)).toEqual([id]);
    const { count, undo } = cleanSavedLinks();
    expect(count).toBe(1);
    expect(state().links[id]?.url).toBe('https://example.com/a?id=4');
    undo();
    expect(state().links[id]?.url).toBe('https://example.com/a?utm_source=x&id=4');
  });

  it('keeps imported links plain when reading is off, as a saved one', async () => {
    const note = (url: string) => ({ name: `${url.length}.json`, text: JSON.stringify({ isTrashed: false, title: '', textContent: url, userEditedTimestampUsec: 1_700_000_000_000_000, createdTimestampUsec: 1_690_000_000_000_000 }) });
    const imported = () => Object.values(state().links).filter(link => link.url.startsWith('https://keep.example/'));
    useSettingsStore.setState({ reading: false });
    await runKeepImport({ plan: planKeepImport([note('https://keep.example/a')]), dir: '/tmp/keep', images: new Map() }, true);
    expect(imported()).toEqual([expect.objectContaining({ status: 'skipped', autoFile: false, noteId: INBOX_ID })]);
    useSettingsStore.setState({ reading: true });
    await runKeepImport({ plan: planKeepImport([note('https://keep.example/bb')]), dir: '/tmp/keep', images: new Map() }, true);
    expect(imported().find(link => link.url.endsWith('/bb'))).toMatchObject({ status: 'pending', autoFile: true });
  });

  it('keeps links plain without a server, whatever was last heard', () => {
    useSettingsStore.setState({ server: null, reading: true });
    const plain = addLink('https://example.com/c', { autoFile: true });
    expect(state().links[plain]).toMatchObject({ status: 'skipped', autoFile: false });
  });
});

describe('an address saved once per collection', () => {
  const linksAt = (url: string) => Object.values(state().links).filter(link => link.url === url);

  it('adds nothing to a collection that holds the address, trackers or not', () => {
    const films = createLine({ title: 'Films' });
    const [first] = addLinks(['https://example.com/cleo'], { noteId: films });
    const pending = countPending();
    const [again] = addLinks(['https://example.com/cleo?utm_source=x'], { noteId: films });
    expect(again).toMatchObject({ id: first!.id, existing: first!.id, savedIn: [films] });
    expect(linksAt('https://example.com/cleo')).toHaveLength(1);
    expect(countPending()).toBe(pending);
  });

  it('adds one another collection holds with its reading, so the server does not read it again', () => {
    const films = createLine({ title: 'Films' });
    const cadeaux = createLine({ title: 'Cadeaux' });
    const read = addLink('https://example.com/cleo', { noteId: films });
    updateLink(read, { status: 'ready', title: 'Cléo de 5 à 7', summary: 'Varda', kind: 'film', imageIds: ['img-1'], analyzedAt: 50, comment: 'À revoir', done: true });
    const [copy] = addLinks(['https://example.com/cleo'], { noteId: cadeaux });
    expect(copy).toMatchObject({ existing: null, savedIn: [films] });
    expect(state().links[copy!.id]).toMatchObject({ noteId: cadeaux, status: 'ready', title: 'Cléo de 5 à 7', kind: 'film', imageIds: ['img-1'], analyzedAt: 50, filedBy: 'person', comment: '', done: false });
  });

  it('files nothing Claude would put beside itself', () => {
    const films = createLine({ title: 'Films' });
    const saved = addLink('https://example.com/cleo', { noteId: films });
    const [shared, fresh] = addLinks(['https://example.com/cleo', 'https://example.com/nuit'], { autoFile: true });
    expect(shared).toMatchObject({ id: saved, existing: saved, savedIn: [films] });
    expect(state().links[fresh!.id]).toMatchObject({ noteId: INBOX_ID, autoFile: true, status: 'pending' });
    expect(linksAt('https://example.com/cleo')).toHaveLength(1);
  });

  it('adds again an address whose link is gone or in the bin', () => {
    const films = createLine({ title: 'Films' });
    const old = addLink('https://example.com/cleo', { noteId: films });
    trashNotes([films]);
    expect(addLinks(['https://example.com/cleo'], { autoFile: true })[0]).toMatchObject({ existing: null, savedIn: [] });
    expect(addLink('https://example.com/cleo', { noteId: INBOX_ID })).not.toBe(old);
  });

  it('keeps the order of a paste at the top of the collection', () => {
    const films = createLine({ title: 'Films' });
    addLink('https://example.com/ancien', { noteId: films });
    addLinks(['https://example.com/a', 'https://example.com/b'], { noteId: films });
    expect(state().linksByNote[films]!.map(id => state().links[id]!.url)).toEqual(['https://example.com/a', 'https://example.com/b', 'https://example.com/ancien']);
  });
});
