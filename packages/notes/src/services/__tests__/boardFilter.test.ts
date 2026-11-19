import { describe, expect, it } from 'vitest';

import type { CheckItem, Note } from '../../models/entities';
import { hasOpenItems, keptByFilter, lastWritten, WEEK_MS } from '../boardFilter';

const NOW = Date.UTC(2026, 10, 19, 12);
const DAY = 24 * 60 * 60 * 1000;

const note = (over: Partial<Note>): Note =>
  ({ id: 'n', kind: 'text', title: '', body: '', rich: false, drawing: '', color: null, pattern: null, pinned: false, archived: false, trashedAt: null, labelIds: [], position: 'a', reminderAt: null, code: '', emblem: null, hint: '', modules: null, contactIds: [], createdAt: NOW - 30 * DAY, deletedAt: null, editedAt: NOW - 30 * DAY, ...over }) as Note;
const item = (over: Partial<CheckItem>): CheckItem => ({ id: 'c', noteId: 'n', text: 'Lait', checked: false, position: 'a', indent: 0, createdAt: NOW - 30 * DAY, deletedAt: null, editedAt: NOW - 30 * DAY, ...over });

describe('the board’s filters', () => {
  it('keeps every note for « Toutes »', () => {
    expect(keptByFilter('all', note({}), [], NOW)).toBe(true);
  });

  it('keeps the notes written this week, an item ticked counting as writing', () => {
    expect(keptByFilter('week', note({ editedAt: NOW - 2 * DAY }), [], NOW)).toBe(true);
    expect(keptByFilter('week', note({}), [], NOW)).toBe(false);
    const list = note({ kind: 'checklist' });
    expect(lastWritten(list, [item({ editedAt: NOW - DAY })])).toBe(NOW - DAY);
    expect(keptByFilter('week', list, [item({ editedAt: NOW - DAY })], NOW)).toBe(true);
    // An item deleted long ago and one deleted this week alike: only live items count.
    expect(keptByFilter('week', list, [item({ editedAt: NOW - DAY, deletedAt: NOW - DAY })], NOW)).toBe(false);
  });

  it('keeps what is left to do: a list with a written item to tick, a reminder coming or missed this week', () => {
    const list = note({ kind: 'checklist' });
    expect(keptByFilter('todo', list, [item({})], NOW)).toBe(true);
    expect(keptByFilter('todo', list, [item({ checked: true })], NOW)).toBe(false);
    expect(hasOpenItems([item({ text: '  ' })])).toBe(false);
    expect(keptByFilter('todo', note({ reminderAt: NOW + DAY }), [], NOW)).toBe(true);
    expect(keptByFilter('todo', note({ reminderAt: NOW - 2 * DAY }), [], NOW)).toBe(true);
    expect(keptByFilter('todo', note({ reminderAt: NOW - WEEK_MS - 1 }), [], NOW)).toBe(false);
    expect(keptByFilter('todo', note({}), [], NOW)).toBe(false);
  });

  it('keeps the lists, never a collection', () => {
    expect(keptByFilter('lists', note({ kind: 'checklist' }), [], NOW)).toBe(true);
    expect(keptByFilter('lists', note({ kind: 'links', pinned: true }), [], NOW)).toBe(false);
    expect(keptByFilter('lists', note({}), [], NOW)).toBe(false);
  });
});
