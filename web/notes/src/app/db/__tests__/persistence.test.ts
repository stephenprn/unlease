import { describe, expect, it } from 'vitest';

import { INBOX_ID } from '@unlease/notes/models/entities';

import { freshLibrary } from '../../../test/library';
import { readStoredFile, removeStoredFile, setFilesDatabase, storeFile, storedFileIds } from '../../media/files';
import { addCheck, createNote, updateNote } from '../../store/actions';
import { acknowledge, countPending, deviceNode, flushLibrary, getRecord, loadLibrary, pendingRecords, readCursor, resetLibrary, useLibraryStore, writeCursor } from '../../store/library';
import { openDatabase, readEverything } from '../database';

describe('IndexedDB persistence', () => {
  it('writes records behind, with their pending marks, and reads them back after a reload', async () => {
    const { db, name } = await freshLibrary({ persistent: true });
    const id = createNote({ kind: 'checklist', title: 'Courses' });
    const item = addCheck(id, 'lait');
    updateNote(id, { title: 'Courses samedi' });
    await flushLibrary();

    const stored = await readEverything(db!);
    const row = stored.rows.find(r => r.key === `note:${id}`)!;
    expect(row.fields.title).toBe('Courses samedi');
    expect(row.pending).toBe(1);
    expect(stored.rows.find(r => r.key === `check:${item}`)?.fields.text).toBe('lait');

    // A reload: a new page reads the same database.
    const node = deviceNode();
    db!.close();
    resetLibrary();
    const again = await openDatabase(name);
    await loadLibrary({ db: again, name });
    const state = useLibraryStore.getState();
    expect(state.notes[id]?.title).toBe('Courses samedi');
    expect(state.checksByNote[id]).toEqual([item]);
    expect(state.notes[INBOX_ID]?.title).toBe('Non classé');
    expect(pendingRecords(400).map(r => r.id).sort()).toEqual([INBOX_ID, id, item].sort());
    // The browser keeps its node id across reloads.
    expect(deviceNode()).toBe(node);
    again.close();
  });

  it('persists acknowledgements and the cursor', async () => {
    const { db, name } = await freshLibrary({ persistent: true });
    createNote({ kind: 'text', title: 'x' });
    acknowledge(pendingRecords(400));
    writeCursor(42);
    await flushLibrary();
    db!.close();
    resetLibrary();
    const again = await openDatabase(name);
    await loadLibrary({ db: again, name });
    expect(countPending()).toBe(0);
    expect(readCursor()).toBe(42);
    expect(getRecord('note', INBOX_ID)).toBeDefined();
    again.close();
  });

  it('keeps photos as bytes until they are uploaded', async () => {
    const { db } = await freshLibrary({ persistent: true });
    setFilesDatabase(db);
    await storeFile('photo01', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'image/png');
    expect(await storedFileIds()).toEqual(['photo01']);
    const blob = await readStoredFile('photo01');
    expect(blob?.type).toBe('image/png');
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    await removeStoredFile('photo01');
    expect(await storedFileIds()).toEqual([]);
    db!.close();
  });
});
