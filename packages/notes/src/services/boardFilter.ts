/**
 * The row under the search strip, one the person picks in Réglages (`BoardRow`): the collections
 * (the default), the labels, or the board's filters.
 *
 * The filters (Keep's tabs): every note, those written this week, those with something left to do,
 * the lists. They narrow the notes' own board only, never a label, Rappels, the archive or a search,
 * and keep its order and its « Épinglées ». Another row chosen, the board shows every note.
 */
import { tx } from '@unlease/core/i18n';

import type { CheckItem, Note } from '../models/entities';

/** What the row under the search strip holds: one of them, never two, so the board's top stays calm. */
export const BOARD_ROWS = ['collections', 'labels', 'filters'] as const;

export type BoardRow = (typeof BOARD_ROWS)[number];

export const DEFAULT_BOARD_ROW: BoardRow = 'collections';

/** Each row's name in Réglages' choice, translated where shown. */
export const BOARD_ROW_NAMES: Readonly<Record<BoardRow, string>> = {
  collections: tx('Collections'),
  labels: tx('Labels [notes]'),
  filters: tx('Filters'),
};

/** What each row holds, under its name in Réglages. */
export const BOARD_ROW_HINTS: Readonly<Record<BoardRow, string>> = {
  collections: tx('Your collections of links, to open one.'),
  labels: tx('Your labels, to see the notes that wear one.'),
  filters: tx('All, This week, To do and Lists, to narrow the board.'),
};

/** A stored row read back: anything this version does not know is the default. */
export function asBoardRow(value: unknown): BoardRow {
  return (BOARD_ROWS as readonly unknown[]).includes(value) ? (value as BoardRow) : DEFAULT_BOARD_ROW;
}

export const BOARD_FILTERS = ['all', 'week', 'todo', 'lists'] as const;

export type BoardFilter = (typeof BOARD_FILTERS)[number];

/** Each filter's chip, translated where shown. */
export const BOARD_FILTER_NAMES: Readonly<Record<BoardFilter, string>> = {
  all: tx('All [notes]'),
  week: tx('This week'),
  todo: tx('To do'),
  lists: tx('Lists'),
};

/** « Cette semaine » looks back this far; « À faire » keeps a reminder missed this long ago (Agenda's « En retard » too). */
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** When a note was last written: its own fields, or one of its items (ticked, typed, moved). */
export function lastWritten(note: Note, checks: readonly CheckItem[]): number {
  let at = Math.max(note.editedAt, note.createdAt);
  for (const item of checks) if (item.deletedAt === null && item.editedAt > at) at = item.editedAt;
  return at;
}

/** A list with an item left to tick (one with something written in it: a bare box says nothing). */
export function hasOpenItems(checks: readonly CheckItem[]): boolean {
  return checks.some(item => item.deletedAt === null && !item.checked && item.text.trim() !== '');
}

/** Whether `filter` keeps `note`, given its items. */
export function keptByFilter(filter: BoardFilter, note: Note, checks: readonly CheckItem[], now: number): boolean {
  switch (filter) {
    case 'week':
      return lastWritten(note, checks) >= now - WEEK_MS;
    case 'todo':
      return (note.kind === 'checklist' && hasOpenItems(checks)) || (note.reminderAt !== null && note.reminderAt >= now - WEEK_MS);
    case 'lists':
      return note.kind === 'checklist';
    default:
      return true;
  }
}
