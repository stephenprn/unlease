/** Carnet's protected section on the phone: protected notes show in it alone, and the lock's record reaches the shell's store. */
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { lockState } from '@shared/app/lock';
import { useSettingsStore } from '@shared/app/store/settingsStore';
import { INBOX_ID } from '@unlease/notes/models/entities';
import { formatHlc } from '@unlease/core/sync/hlc';

import { sectionsFor } from '../hooks/useBoard';
import { linesOf } from '../hooks/useLines';
import { createLine, createNote, ensureInbox, setLocked, trashNotes } from '../store/actions';
import { getRecord, loadLibrary, mergeRemote, resetLibrary, useLibraryStore } from '../store/libraryStore';
import { notePayload } from '../widgetPayloads';

const state = () => useLibraryStore.getState();
const ids = (view: Parameters<typeof sectionsFor>[0], open = false) =>
  sectionsFor(view, state().noteOrder, state().notes, 1_000, open).sections.flatMap(section => section.ids);

beforeEach(() => {
  closeDatabase();
  resetLibrary();
  openDatabase({ name: 'test.sqlite' });
  loadLibrary(1_000);
  ensureInbox();
  useSettingsStore.setState({ server: { url: 'https://carnet.test', token: 'jeton' }, reading: null });
});

describe('the protected section', () => {
  it('keeps a protected note off every other view, in its own alone', () => {
    const kept = createNote({ kind: 'text', title: 'Secret', locked: true });
    const other = createNote({ kind: 'text', title: 'Courses' });
    expect(ids('notes')).toEqual([other]);
    expect(ids('protected')).toEqual([kept]);
    expect(notePayload(state(), kept)).toMatchObject({ gone: true });
  });

  it('shows a protected note in the bin only while the lock is open', () => {
    const kept = createNote({ kind: 'text', title: 'Secret', locked: true });
    trashNotes([kept]);
    expect(ids('trash')).toEqual([]);
    expect(ids('trash', true)).toEqual([kept]);
  });

  it('protects and gives back in one batch, undone even for a note never protected', () => {
    const a = createNote({ kind: 'text', title: 'Un' });
    const b = createNote({ kind: 'text', title: 'Deux' });
    const undo = setLocked([a, b, INBOX_ID], true);
    expect(ids('protected').sort()).toEqual([a, b].sort());
    expect(getRecord('note', INBOX_ID)?.fields.locked).toBeUndefined();
    undo();
    expect(ids('protected')).toEqual([]);
    expect(state().notes[a]?.locked).toBe(false);
  });

  it('leaves a protected collection out of the collections', () => {
    const line = createLine({ title: 'Cadeaux' });
    setLocked([line], true);
    expect(linesOf(state().noteOrder, state().notes).map(note => note.id)).not.toContain(line);
  });

  it('hands the lock’s record to the shell', () => {
    mergeRemote([{ type: 'lock', id: 'lock', fields: { section: true, setAt: 5 }, clocks: { section: formatHlc(5_000, 0, 'webapp1'), setAt: formatHlc(5_000, 0, 'webapp1') } }]);
    expect(lockState().section).toBe(true);
  });
});
