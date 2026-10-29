import { INBOX_ID } from '@unlease/notes/models/entities';
import { closeDatabase, openDatabase } from '@data/db/database';

import {
  addCheck,
  addLinks,
  createLabel,
  createLine,
  createNote,
  setArchived,
  setChecks,
  setLabels,
  setLinkDone,
  setPinned,
  toggleCheck,
  trashNotes,
  updateCheck,
  updateLink,
  ensureInbox,
} from '../store/actions';
import { loadLibrary, resetLibrary, useLibraryStore } from '../store/libraryStore';
import { useSettingsStore } from '../store/settingsStore';
import { collectionPayload, labelPayload, notePayload, WIDGET_LIMITS, type CollectionPayload, type LabelPayload, type NotePayload } from '../widgetPayloads';

const state = () => useLibraryStore.getState();
const NOW = 2_000_000;

beforeEach(() => {
  closeDatabase();
  resetLibrary();
  openDatabase({ name: 'test.sqlite' });
  loadLibrary(1_000);
  ensureInbox();
  useSettingsStore.setState({ server: { url: 'https://carnet.test', token: 'jeton' }, reading: null });
});

describe('collection widget', () => {
  it('lists the links still to do, as the row writes them, and counts the done ones', () => {
    const line = createLine({ title: 'Mode', color: 'blue' });
    const [first, second, third] = addLinks(['https://shop.example/a', 'https://shop.example/b', 'https://shop.example/c'], { noteId: line });
    updateLink(first!.id, { title: 'Veste en laine', siteName: 'Komono', price: 49.9, currency: 'EUR', status: 'ready', imageIds: ['blob-1'] });
    setLinkDone(third!.id, true);
    const payload = collectionPayload(state(), line) as CollectionPayload;
    expect(payload.gone).toBe(false);
    expect(payload.title).toBe('Mode');
    expect(payload.color).toBe('blue');
    expect(payload.count).toBe('2 liens');
    expect(payload.done).toBe('1 déjà fait');
    expect(payload.links.map(link => link.id).sort()).toEqual([first!.id, second!.id].sort());
    const veste = payload.links.find(link => link.id === first!.id)!;
    expect(veste).toMatchObject({ title: 'Veste en laine', source: 'Komono · 49,90 €', image: 'blob-1', reading: false });
  });

  it('wears the tray for "Non classé" and says a link is being read', () => {
    addLinks(['https://news.example/article'], { autoFile: true });
    const payload = collectionPayload(state(), INBOX_ID) as CollectionPayload;
    expect(payload.emblem).toBe('bac');
    expect(payload.title).toBe('Non classé');
    expect(payload.links[0]?.reading).toBe(true);
  });

  it('is gone once its collection is in the bin, and never shows a note', () => {
    const line = createLine({ title: 'Films' });
    trashNotes([line]);
    expect(collectionPayload(state(), line)).toEqual({ v: 1, kind: 'collection', id: line, gone: true });
    expect(collectionPayload(state(), createNote({ kind: 'text', title: 'Pas une collection' })).gone).toBe(true);
  });

  it('stops at its limit', () => {
    const line = createLine({ title: 'Beaucoup' });
    addLinks(Array.from({ length: WIDGET_LIMITS.links + 5 }, (_, i) => `https://many.example/${i}`), { noteId: line });
    expect((collectionPayload(state(), line) as CollectionPayload).links).toHaveLength(WIDGET_LIMITS.links);
  });
});

describe('label widget', () => {
  it('shows the label view: pinned first, the archive and the bin left out', () => {
    const label = createLabel('Courses');
    const older = createNote({ kind: 'text', title: 'Marché', body: 'Tomates\n\n\n\nBasilic', labelIds: [label] });
    const pinned = createNote({ kind: 'text', title: 'Épinglée', labelIds: [label] });
    setPinned(pinned, true);
    const archived = createNote({ kind: 'text', title: 'Archivée', labelIds: [label] });
    setArchived(archived, true);
    const binned = createNote({ kind: 'text', title: 'Jetée', labelIds: [label] });
    trashNotes([binned]);
    createNote({ kind: 'text', title: 'Sans label' });
    const payload = labelPayload(state(), label, NOW) as LabelPayload;
    expect(payload.name).toBe('Courses');
    expect(payload.notes.map(note => note.id)).toEqual([pinned, older]);
    expect(payload.notes[1]?.body).toBe('Tomates\n\nBasilic');
  });

  it('shows a list by its first open items and says what is left', () => {
    const label = createLabel('Maison');
    const list = createNote({ kind: 'checklist', title: 'À acheter', labelIds: [label], color: 'yellow' });
    const ids = ['Lait', 'Pain', 'Œufs', 'Café', 'Thé', 'Riz'].map(text => addCheck(list, text));
    toggleCheck(ids[0]!);
    const card = (labelPayload(state(), label, NOW) as LabelPayload).notes[0]!;
    expect(card.wash).toBe('yellow');
    expect(card.items.map(item => item.text)).toEqual(['Pain', 'Œufs', 'Café', 'Thé']);
    expect(card.more).toBe('+ 1\u00A0élément · 1\u00A0élément coché');
  });

  it('is gone once the label is deleted', () => {
    const label = createLabel('Éphémère');
    useLibraryStore.setState(s => ({ labels: { ...s.labels, [label]: { ...s.labels[label]!, deletedAt: 5 } } }));
    expect(labelPayload(state(), label, NOW).gone).toBe(true);
  });

  it('follows a label put on a note', () => {
    const label = createLabel('Travail');
    const note = createNote({ kind: 'text', title: 'Réunion' });
    expect((labelPayload(state(), label, NOW) as LabelPayload).notes).toHaveLength(0);
    setLabels(note, [label]);
    expect((labelPayload(state(), label, NOW) as LabelPayload).notes.map(card => card.id)).toEqual([note]);
  });
});

describe('note widget', () => {
  it('hands over a checklist in its order, written items only', () => {
    const list = createNote({ kind: 'checklist', title: 'Valise' });
    const passport = addCheck(list, 'Passeport');
    addCheck(list, '');
    const charger = addCheck(list, 'Chargeur');
    toggleCheck(passport);
    const payload = notePayload(state(), list) as NotePayload;
    expect(payload.list).toBe(true);
    expect(payload.items.map(item => [item.text, item.checked])).toEqual([
      ['Passeport', true],
      ['Chargeur', false],
    ]);
    expect(payload.items[1]?.id).toBe(charger);
  });

  it('hands over a text note as its paragraphs', () => {
    const note = createNote({ kind: 'text', title: '', body: 'Première ligne\n\nTroisième\n\n' });
    expect((notePayload(state(), note) as NotePayload).lines).toEqual(['Première ligne', '', 'Troisième']);
    const empty = createNote({ kind: 'text', body: '' });
    expect((notePayload(state(), empty) as NotePayload).lines).toEqual([]);
  });

  it('is gone in the bin', () => {
    const note = createNote({ kind: 'text', title: 'Partie' });
    trashNotes([note]);
    expect(notePayload(state(), note).gone).toBe(true);
  });
});

describe('ticks from the home screen', () => {
  it('writes them as one change, leaving an item already so or gone', () => {
    const list = createNote({ kind: 'checklist', title: 'Courses' });
    const milk = addCheck(list, 'Lait');
    const bread = addCheck(list, 'Pain');
    const gone = addCheck(list, 'Beurre');
    updateCheck(gone, { deletedAt: 10 });
    const revision = state().revision;
    setChecks([
      { id: milk, checked: true },
      { id: bread, checked: false },
      { id: gone, checked: true },
      { id: 'unknown', checked: true },
    ]);
    expect(state().revision).toBe(revision + 1);
    expect(state().checks[milk]?.checked).toBe(true);
    expect(state().checks[bread]?.checked).toBe(false);
    expect(state().checks[gone]?.checked).toBe(false);
  });

  it('writes nothing when nothing changes', () => {
    const list = createNote({ kind: 'checklist', title: 'Rien' });
    const item = addCheck(list, 'Déjà fait');
    toggleCheck(item);
    const revision = state().revision;
    setChecks([{ id: item, checked: true }]);
    expect(state().revision).toBe(revision);
  });
});
