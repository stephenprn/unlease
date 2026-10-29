import { beforeEach, describe, expect, it } from 'vitest';

import { GENESIS_HLC, hlcWall, parseHlc } from '@unlease/core/sync/hlc';
import { INBOX_ID } from '@unlease/notes/models/entities';

import { freshLibrary } from '../../../test/library';
import {
  addCheck,
  addLink,
  cleanSavedLinks,
  createLabel,
  createLine,
  createNote,
  deleteCheck,
  deleteForever,
  deleteLabel,
  deleteLink,
  duplicateNote,
  isEmptyNote,
  moveCheck,
  readSkippedLinks,
  reanalyzeLink,
  moveLink,
  setArchived,
  setLinkDone,
  setPinned,
  toggleCheck,
  trackedLinkIds,
  trashNotes,
  updateLink,
  updateNote,
} from '../actions';
import { mergeIntoPrevious, pasteLines, splitCheck } from '../editing';
import { acknowledge, countPending, getRecord, mergeRemote, pendingRecords, receiveFromTab, useLibraryStore, writeLocal } from '../library';
import { setReading, setServer } from '../settings';

// Ahead of the wall clock: seeding "Non classé" ticks at the real time, and a clock never runs back.
const T0 = Date.now() + 3_600_000;
const state = () => useLibraryStore.getState();

describe('the web library, like the phone’s', () => {
  beforeEach(async () => {
    await freshLibrary({ now: T0 });
    setServer({ url: 'https://carnet.test', token: 'jeton' });
  });

  it('seeds "Non classé" with the genesis clock, pending so the server learns of it', () => {
    const inbox = getRecord('note', INBOX_ID)!;
    // A valid fractional key past every note's, so it never breaks a neighbour's insert.
    expect(inbox.fields).toMatchObject({ kind: 'links', title: 'Non classé', code: '?', color: 'grey', position: 'b00' });
    expect(Object.values(inbox.clocks).every(clock => clock === GENESIS_HLC)).toBe(true);
    expect(pendingRecords(10).map(r => r.id)).toContain(INBOX_ID);
  });

  it('writes a new note as one batch with one fresh clock, first on the board', () => {
    const older = createNote({ kind: 'text', title: 'Ancienne' }, T0 + 1_000);
    const id = createNote({ kind: 'text', title: 'Courses', body: 'lait' }, T0 + 2_000);
    const record = getRecord('note', id)!;
    const clocks = new Set(Object.values(record.clocks));
    expect(clocks.size).toBe(1);
    expect(record.fields).toMatchObject({ kind: 'text', title: 'Courses', body: 'lait', pinned: false, archived: false, trashedAt: null, deletedAt: null, createdAt: T0 + 2_000 });
    // New notes go first, before the older one; the inbox stays last.
    const order = state().noteOrder;
    expect(order.indexOf(id)).toBeLessThan(order.indexOf(older));
    expect(order[order.length - 1]).toBe(INBOX_ID);
    expect(state().notes[id]!.editedAt).toBe(hlcWall([...clocks][0]!));
  });

  it('patches only the fields it is given, each with the new clock', () => {
    const id = createNote({ kind: 'text', title: 'A' }, T0);
    const before = getRecord('note', id)!;
    updateNote(id, { title: 'B' });
    const after = getRecord('note', id)!;
    expect(after.fields.title).toBe('B');
    expect(after.clocks.title! > before.clocks.title!).toBe(true);
    expect(after.clocks.body).toBe(before.clocks.body);
  });

  it('undoes by writing the old values back with a newer clock', () => {
    const id = createNote({ kind: 'text', title: 'À archiver', pinned: true }, T0);
    const undo = setArchived(id, true);
    expect(state().notes[id]).toMatchObject({ archived: true, pinned: false });
    const archivedClock = getRecord('note', id)!.clocks.archived!;
    undo();
    expect(state().notes[id]).toMatchObject({ archived: false, pinned: true });
    expect(getRecord('note', id)!.clocks.archived! > archivedClock).toBe(true);
  });

  it('keeps Keep’s rules: archiving unpins, pinning unarchives, the bin unpins', () => {
    const id = createNote({ kind: 'text', title: 'x', pinned: true }, T0);
    setArchived(id, true);
    expect(state().notes[id]!.pinned).toBe(false);
    setPinned(id, true);
    expect(state().notes[id]).toMatchObject({ pinned: true, archived: false });
    trashNotes([id], T0 + 5);
    expect(state().notes[id]).toMatchObject({ trashedAt: T0 + 5, pinned: false });
    // "Non classé" never goes to the bin.
    trashNotes([INBOX_ID]);
    expect(state().notes[INBOX_ID]!.trashedAt).toBeNull();
  });

  it('indexes checklist lines per note, open ones before checked, and re-indexes on moves', () => {
    const id = createNote({ kind: 'checklist', title: 'Courses' }, T0);
    const milk = addCheck(id, 'lait', null, T0 + 1);
    const bread = addCheck(id, 'pain', milk, T0 + 2);
    const eggs = addCheck(id, 'œufs', bread, T0 + 3);
    expect(state().checksByNote[id]).toEqual([milk, bread, eggs]);
    toggleCheck(milk);
    // A new line goes after the last open one, before any checked line in position order.
    const butter = addCheck(id, 'beurre', null, T0 + 4);
    const order = state().checksByNote[id]!;
    expect(order.indexOf(butter)).toBe(order.indexOf(eggs) + 1);
    moveCheck(eggs, null, bread);
    expect(state().checksByNote[id]!.indexOf(eggs)).toBeLessThan(state().checksByNote[id]!.indexOf(bread));
    deleteCheck(bread, T0 + 9);
    expect(state().checksByNote[id]).not.toContain(bread);
  });

  it('keeps unrelated entries and indexes identical across a write (re-render discipline)', () => {
    const a = createNote({ kind: 'checklist', title: 'A' }, T0);
    const b = createNote({ kind: 'text', title: 'B' }, T0 + 1);
    addCheck(a, 'x', null, T0 + 2);
    const before = state();
    updateNote(b, { title: 'B2' });
    const after = state();
    expect(after.notes[a]).toBe(before.notes[a]);
    expect(after.notes[b]).not.toBe(before.notes[b]);
    expect(after.checksByNote).toBe(before.checksByNote);
    expect(after.noteOrder).toBe(before.noteOrder);
    expect(after.revision).toBe(before.revision + 1);
  });

  it('moves a link between lines and updates both indexes', () => {
    const films = createLine({ title: 'Films', id: 'line-films' }, T0);
    const link = addLink('https://exemple.fr/film?utm_source=x', { noteId: INBOX_ID, autoFile: true }, T0 + 1);
    expect(state().links[link]).toMatchObject({ url: 'https://exemple.fr/film', autoFile: true, status: 'pending' });
    expect(state().linksByNote[INBOX_ID]).toEqual([link]);
    const undo = moveLink(link, films);
    expect(state().linksByNote[films]).toEqual([link]);
    expect(state().linksByNote[INBOX_ID]).toBeUndefined();
    expect(state().links[link]!.autoFile).toBe(false);
    undo();
    expect(state().linksByNote[INBOX_ID]).toEqual([link]);
  });

  it('keeps links plain without a server, whatever was last heard', () => {
    setServer(null);
    setReading(true);
    const plain = addLink('https://exemple.fr/sans-serveur', { autoFile: true }, T0);
    expect(state().links[plain]).toMatchObject({ status: 'skipped', autoFile: false, noteId: INBOX_ID });
  });

  it('gives each new collection the next free emblem, or the one chosen, and writes the emblem only on collections', () => {
    const first = createLine({ title: 'Mode' }, T0);
    const second = createLine({ title: 'Films' }, T0 + 1);
    const chosen = createLine({ title: 'Voyages', emblem: 'oiseau' }, T0 + 2);
    expect([first, second, chosen].map(id => state().notes[id]!.emblem)).toEqual(['feuille', 'etoile', 'oiseau']);
    expect(getRecord('note', first)!.fields).toMatchObject({ kind: 'links', code: 'M', emblem: 'feuille' });
    expect('emblem' in getRecord('note', createNote({ kind: 'text', title: 'x' }, T0 + 3))!.fields).toBe(false);
  });

  it('finds saved links that still carry trackers and cleans them in one undoable batch', () => {
    const tracked = addLink('https://exemple.fr/veste', {}, T0);
    updateLink(tracked, { url: 'https://exemple.fr/veste?utm_source=x&taille=m' });
    const clean = addLink('https://exemple.fr/pull', {}, T0 + 1);
    const gone = addLink('https://exemple.fr/sac', {}, T0 + 2);
    updateLink(gone, { url: 'https://exemple.fr/sac?fbclid=y' });
    deleteLink(gone, T0 + 3);
    expect(trackedLinkIds(state().links)).toEqual([tracked]);
    const { count, undo } = cleanSavedLinks();
    expect(count).toBe(1);
    expect(state().links[tracked]!.url).toBe('https://exemple.fr/veste?taille=m');
    expect(state().links[clean]!.url).toBe('https://exemple.fr/pull');
    expect(trackedLinkIds(state().links)).toEqual([]);
    undo();
    expect(state().links[tracked]!.url).toBe('https://exemple.fr/veste?utm_source=x&taille=m');
  });

  it('keeps links plain ("skipped", not filed) when the server is known not to read them', () => {
    // Unknown counts as reading: links wait for the server.
    const unknown = addLink('https://exemple.fr/a', { autoFile: true }, T0);
    expect(state().links[unknown]).toMatchObject({ status: 'pending', autoFile: true });
    setReading(false);
    const plain = addLink('https://exemple.fr/b', { autoFile: true }, T0 + 1);
    expect(state().links[plain]).toMatchObject({ status: 'skipped', autoFile: false, noteId: INBOX_ID });
    setReading(true);
    const again = addLink('https://exemple.fr/c', { autoFile: true }, T0 + 2);
    expect(state().links[again]).toMatchObject({ status: 'pending', autoFile: true });
  });

  it('sends every unread link to be read in one batch once reading is on', () => {
    setReading(false);
    const a = addLink('https://exemple.fr/a', {}, T0);
    const b = addLink('https://exemple.fr/b', {}, T0 + 1);
    setReading(true);
    expect(readSkippedLinks()).toBe(2);
    expect(state().links[a]).toMatchObject({ status: 'pending', error: null });
    expect(getRecord('link', a)!.clocks.status).toBe(getRecord('link', b)!.clocks.status);
    expect(readSkippedLinks()).toBe(0);
    // "Lire" on one link is the same write.
    setReading(false);
    const c = addLink('https://exemple.fr/c', {}, T0 + 2);
    reanalyzeLink(c);
    expect(state().links[c]!.status).toBe('pending');
  });

  it('stamps a link done with its time, and takes the stamp back', () => {
    const link = addLink('https://exemple.fr/a', {}, T0);
    const undo = setLinkDone(link, true, T0 + 10);
    expect(state().links[link]).toMatchObject({ done: true, doneAt: T0 + 10 });
    undo();
    expect(state().links[link]).toMatchObject({ done: false, doneAt: null });
  });

  it('deletes for ever with tombstones on the note and its children', () => {
    const id = createNote({ kind: 'checklist', title: 'x' }, T0);
    const item = addCheck(id, 'y', null, T0 + 1);
    deleteForever([id], T0 + 2);
    expect(state().notes[id]!.deletedAt).toBe(T0 + 2);
    expect(state().checks[item]!.deletedAt).toBe(T0 + 2);
    expect(state().noteOrder).not.toContain(id);
    expect(state().checksByNote[id]).toBeUndefined();
  });

  it('takes a deleted label off every note that wore it, and puts it back on undo', () => {
    const label = createLabel('Perso', T0);
    const id = createNote({ kind: 'text', title: 'x', labelIds: [label] }, T0 + 1);
    const undo = deleteLabel(label, T0 + 2);
    expect(state().notes[id]!.labelIds).toEqual([]);
    expect(state().labelOrder).not.toContain(label);
    undo();
    expect(state().notes[id]!.labelIds).toEqual([label]);
  });

  it('duplicates a note right after it, the inbox included as a neighbour', () => {
    const id = createNote({ kind: 'checklist', title: 'Valise' }, T0);
    addCheck(id, 'passeport', null, T0 + 1);
    const copy = duplicateNote(id, T0 + 2)!;
    expect(state().notes[copy]).toMatchObject({ title: 'Valise', pinned: false });
    expect(state().checksByNote[copy]).toHaveLength(1);
    const order = state().noteOrder;
    expect(order.indexOf(copy)).toBe(order.indexOf(id) + 1);
  });

  it('tells an empty new note from a real one', () => {
    const id = createNote({ kind: 'checklist' }, T0);
    addCheck(id, '', null, T0 + 1);
    expect(isEmptyNote(id)).toBe(true);
    const other = createNote({ kind: 'text', title: 'Titre' }, T0 + 2);
    expect(isEmptyNote(other)).toBe(false);
    expect(isEmptyNote(INBOX_ID)).toBe(false);
  });

  it('splits, merges and pastes checklist lines as single batches', () => {
    const id = createNote({ kind: 'checklist' }, T0);
    const first = addCheck(id, 'painlait', null, T0 + 1);
    const second = splitCheck(first, 'painlait', 4, T0 + 2)!;
    expect(state().checks[first]!.text).toBe('pain');
    expect(state().checks[second]!.text).toBe('lait');
    expect(new Set(Object.values(getRecord('check', second)!.clocks)).size).toBe(1);
    expect(getRecord('check', second)!.clocks.text).toBe(getRecord('check', first)!.clocks.text);
    expect(mergeIntoPrevious(first, second, 'lait', T0 + 3)).toBe(4);
    expect(state().checks[first]!.text).toBe('painlait');
    expect(state().checks[second]!.deletedAt).toBe(T0 + 3);
    const added = pasteLines(first, 'painlait', 4, 4, ['beurre', 'œufs', 'sel'], T0 + 4);
    expect(added).toHaveLength(2);
    expect(state().checksByNote[id]!.map(cid => state().checks[cid]!.text)).toEqual(['painbeurre', 'œufs', 'sellait']);
  });

  it('acknowledges only the copy the server stored: an edit made meanwhile stays pending', () => {
    const id = createNote({ kind: 'text', title: 'v1' }, T0);
    const sent = pendingRecords(400);
    updateNote(id, { title: 'v2' });
    acknowledge(sent);
    expect(pendingRecords(400).map(r => r.id)).toEqual([id]);
    acknowledge(pendingRecords(400));
    expect(countPending()).toBe(0);
  });

  it('merges remote records field by field and keeps local unsynced edits', () => {
    const id = createNote({ kind: 'text', title: 'local' }, T0);
    const remote = { ...getRecord('note', id)!, fields: { body: 'distant' }, clocks: { body: '00000000z-0000-phone1' } };
    // An older remote clock loses; a newer one wins, field by field.
    expect(mergeRemote([remote], T0)).toHaveLength(0);
    const newer = { type: 'note' as const, id, fields: { body: 'distant' }, clocks: { body: `${(T0 + 60_000).toString(36).padStart(9, '0')}-0000-phone1` } };
    mergeRemote([newer], T0 + 1);
    expect(state().notes[id]).toMatchObject({ title: 'local', body: 'distant' });
    // The local title is still waiting for the server.
    expect(pendingRecords(400).map(r => r.id)).toContain(id);
  });

  it('adopts what another tab wrote, pending marks included', () => {
    const id = 'othertab01';
    const clock = `${(T0 + 5_000).toString(36).padStart(9, '0')}-0000-tabtwo01`;
    receiveFromTab({ records: [{ type: 'note', id, fields: { kind: 'text', title: 'Autre onglet', position: 'a5' }, clocks: { kind: clock, title: clock, position: clock } }], pending: [`note:${id}`], acked: [] });
    expect(state().notes[id]!.title).toBe('Autre onglet');
    expect(pendingRecords(400).map(r => r.id)).toContain(id);
    // A later local write ticks past the other tab's clock.
    writeLocal([{ type: 'note', id, patch: { title: 'Ici' } }], T0);
    expect(getRecord('note', id)!.clocks.title! > clock).toBe(true);
    expect(parseHlc(getRecord('note', id)!.clocks.title!)!.wall).toBe(T0 + 5_000);
  });
});
