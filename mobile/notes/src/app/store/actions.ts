/**
 * Every user action, as one `writeLocal` batch: one clock, one SQLite transaction.
 * Undo writes the old values with a newer clock: it syncs, and no server echo can outrun it.
 */
import { getLocale } from '@unlease/core/i18n';
import { type Emblem } from '@unlease/design/emblems';
import { indexBetween, placeAt, positionBetween, positionsBetween, type Placed } from '@unlease/core/services/fractionalIndex';
import { createId } from '@unlease/core/services/ids';
import { planLinks, savedAddresses, type LinkPlan } from '@unlease/notes/services/savedLinks';
import { normalizeUrl } from '@unlease/core/services/url';
import { asLineColor, nextLineColor, type LineColor, type NoteColor, type NotePattern } from '@unlease/design/colors';
import { INBOX_HINT, INBOX_ID, INBOX_TITLE, shownTitle, type LinkFiler, type LinkKind, type NoteKind } from '@unlease/notes/models/entities';
import { GENESIS_HLC } from '@unlease/core/sync/hlc';
import { attachmentFields, checkFields, labelFields, linkFields, linkTemplateFields, noteFields } from '@unlease/notes/sync/entities';
import type { Fields } from '@unlease/core/sync/record';
import type { SortMove } from '@unlease/notes/sync/sorting';
import { mergeField } from '@unlease/core/sync/textMerge';
import { isDrawingEmpty, noteDrawingRatio } from '@unlease/notes/services/drawing';
import { bodyFromText, bodyText, carryMarks, fitLines, isFormatted, linesText, noteLines, serializeLines, type NoteLine } from '@unlease/notes/services/noteBody';
import { PEOPLE_MAX, TEXT_LIMITS } from '@unlease/notes/sync/types';
import { replayPatch, type Direction, type EditStep } from '@unlease/notes/services/editHistory';
import { finishChanges, type Finish } from '@unlease/notes/services/finishes';
import { TEMPLATE_LIMITS, type TemplateField } from '@unlease/notes/models/templates';
import { erasedCount } from '@unlease/core/services/erase';
import { eraseChanges } from '@unlease/notes/services/erase';
import { listToCollection, undoListToCollection } from '@unlease/notes/services/listToCollection';
import { collectionTemplate, kindTemplateId, otherCollectionsOf, presetFields, sameFields, starterFacts, starterTemplateId } from '@unlease/notes/services/templates';

import { getRecord, mergeRemote, useLibraryStore, writeLocal, type LibraryState, type LocalChange } from './libraryStore';
import { write } from './writes';
import { reportCollectionUsed } from '@platform/shortcuts';
import { selectCanRead, useSettingsStore } from '@shared/app/store/settingsStore';
import { nextEmblem } from '@unlease/notes/models/collections';

export type Undo = () => void;

const state = () => useLibraryStore.getState();

function undoFor(changes: readonly LocalChange[]): Undo {
  const previous: LocalChange[] = changes.map(change => {
    const record = getRecord(change.type, change.id);
    const patch: Fields = {};
    for (const field of Object.keys(change.patch)) patch[field] = record?.fields[field] ?? null;
    return { type: change.type, id: change.id, patch };
  });
  return () => write(previous);
}

/** Write and hand back the way to take it back. */
export function writeWithUndo(changes: LocalChange[]): Undo {
  const undo = undoFor(changes);
  write(changes);
  return undo;
}

/** Seeded on every device with the genesis clock, so the seeds merge and any real edit wins. */
export function ensureInbox(): void {
  if (getRecord('note', INBOX_ID)) return;
  const fields = noteFields({
    kind: 'links',
    title: INBOX_TITLE,
    body: '',
    color: 'grey',
    pinned: false,
    archived: false,
    trashedAt: null,
    labelIds: [],
    // A valid key past every note's: a neighbour to nothing, yet safe if it ever became one.
    position: 'b00',
    reminderAt: null,
    code: '?',
    hint: INBOX_HINT,
    createdAt: 0,
    deletedAt: null,
  });
  const clocks: Record<string, string> = {};
  for (const key of Object.keys(fields)) clocks[key] = GENESIS_HLC;
  const seed = { type: 'note' as const, id: INBOX_ID, fields, clocks };
  // Merged (which persists it), then an empty patch marks it pending without moving a clock.
  mergeRemote([seed]);
  writeLocal([{ type: 'note', id: INBOX_ID, patch: {} }]);
}

/** Before every note: new notes go first, as in Keep. */
function topPosition(): string {
  const { noteOrder, notes } = state();
  const first = noteOrder.find(id => id !== INBOX_ID);
  return positionBetween(null, first ? notes[first]?.position ?? null : null);
}

export interface NewNote {
  readonly kind: NoteKind;
  readonly title?: string;
  readonly body?: string;
  readonly color?: LineColor | null;
  readonly labelIds?: readonly string[];
  readonly pinned?: boolean;
  readonly code?: string;
  readonly emblem?: string;
  readonly hint?: string;
  readonly id?: string;
  /** A collection's own facts (`linkTemplate`), written in the same batch. */
  readonly templateId?: string;
}

/** A new note's record, first on the board. */
function newNote(init: NewNote, now: number): LocalChange {
  return {
    type: 'note',
    id: init.id ?? createId(now),
    patch: noteFields({
      kind: init.kind,
      title: init.title ?? '',
      body: init.body ?? '',
      color: init.color ?? null,
      pinned: init.pinned ?? false,
      archived: false,
      trashedAt: null,
      labelIds: init.labelIds ?? [],
      position: topPosition(),
      reminderAt: null,
      code: init.code ?? '',
      ...(init.emblem !== undefined ? { emblem: init.emblem } : {}),
      ...(init.templateId !== undefined ? { templateId: init.templateId } : {}),
      hint: init.hint ?? '',
      createdAt: now,
      deletedAt: null,
    }),
  };
}

export function createNote(init: NewNote, now: number = Date.now()): string {
  const note = newNote(init, now);
  write([note]);
  return note.id;
}

/**
 * Saves what an editor holds for a typed field (a note's title or body, a checklist line, a
 * link's comment). `since` is what the field held when the editor last saved or showed it: if
 * an edit from another device landed meanwhile, both are merged instead of one overwriting the
 * other (null: not known, the typed text is written as it is). Returns the text now stored, for
 * the editor to show.
 */
export function saveTypedText(type: 'note' | 'check' | 'link', id: string, field: 'title' | 'body' | 'text' | 'comment' | 'caption' | 'drawing', since: string | null, typed: string): string {
  // The library's own `saveTypedField`, through `write`: the note editor's history hears of it.
  const record = getRecord(type, id);
  if (!record) return typed;
  const value = record.fields[field];
  const stored = typeof value === 'string' ? value : '';
  const next = typedOver(type, field, since, typed, stored);
  if (next !== stored) write([{ type, id, patch: { [field]: next } }]);
  return next;
}

/** What was typed from `since`, with what landed in the store meanwhile merged in. */
function typedOver(type: 'note' | 'check' | 'link', field: string, since: string | null, typed: string, stored: string): string {
  return since === null || stored === since || stored === typed ? typed : mergeField(type, field, since, typed, stored, false);
}

/**
 * A text note's lines as its editor holds them (`notes/services/noteBody`), saved as `saveTypedText`
 * saves (an edit from elsewhere merged in). A plain note stays plain text until its first mark or
 * heading: then its body takes the formatted form and the note is formatted for good, in one write.
 * `since` is the body as the editor last saved or showed it. Returns the body now stored.
 */
export function saveNoteLines(noteId: string, since: string | null, lines: readonly NoteLine[]): string {
  const record = getRecord('note', noteId);
  const note = state().notes[noteId];
  if (!record || !note) return '';
  const stored = typeof record.fields.body === 'string' ? record.fields.body : '';
  // The field's limit counts the stored form: marks and escapes take room too, so what passes it is cut at the end, never mid-mark.
  const kept = note.rich || isFormatted(lines) ? fitLines(lines, TEXT_LIMITS.note.body) : lines;
  if (note.rich || !isFormatted(kept)) return saveTypedText('note', noteId, 'body', since, note.rich ? serializeLines(kept) : linesText(kept));
  // Formatted for the first time over an edit from elsewhere: the words merged, then the marks carried onto their own words.
  const body = since === null || stored === since ? serializeLines(kept) : serializeLines(carryMarks(kept, noteLines(mergeField('note', 'body', since, linesText(kept), stored, false), false)));
  write([{ type: 'note', id: noteId, patch: { body, rich: true } }]);
  return body;
}

export function updateNote(id: string, patch: Fields): void {
  write([{ type: 'note', id, patch }]);
}

export function setPinned(id: string, pinned: boolean): Undo {
  return writeWithUndo([{ type: 'note', id, patch: pinned ? { pinned, archived: false } : { pinned } }]);
}

/** Keep unpins what it archives; so does this. */
export function setArchived(id: string, archived: boolean): Undo {
  return writeWithUndo([{ type: 'note', id, patch: archived ? { archived, pinned: false } : { archived } }]);
}

export function setColor(id: string, color: NoteColor | null): void {
  write([{ type: 'note', id, patch: { color } }]);
}

/** The paper under a note's colour: dots, grid, lines, or plain. */
export function setPattern(id: string, pattern: NotePattern | null): void {
  write([{ type: 'note', id, patch: { pattern } }]);
}

/**
 * A colour or a paper for the picked notes (the board's selection), as one batch: each takes it,
 * a collection a pigment only (`notes/services/finishes`). Returns the undo, how many changed, and
 * how many collections kept their own.
 */
export function setFinish(ids: readonly string[], finish: Finish): { readonly undo: Undo; readonly changed: number; readonly kept: number } {
  const { notes } = state();
  const picked = ids.flatMap(id => (notes[id] && notes[id]!.deletedAt === null ? [notes[id]!] : []));
  const { changes, kept } = finishChanges(picked, finish);
  const undo = changes.length > 0 ? writeWithUndo(changes.map(change => ({ type: 'note' as const, id: change.id, patch: { ...change.patch } }))) : () => {};
  return { undo, changed: changes.length, kept };
}

/**
 * A step of the note editor's history (`notes/services/editHistory`) taken back or done again: its
 * old values (or its new ones) written under a fresh clock as one batch, typed text merged with what
 * came from elsewhere since, as `saveTypedText` merges it. False when it had nothing left to write.
 */
export function replayEditStep(step: EditStep, direction: Direction, now: number = Date.now()): boolean {
  const changes = replayPatch(step, direction, (type, id) => getRecord(type as LocalChange['type'], id)?.fields, now);
  if (changes.length === 0) return false;
  write(changes as LocalChange[], now, true);
  return true;
}

export function setLabels(id: string, labelIds: readonly string[]): void {
  write([{ type: 'note', id, patch: { labelIds: [...labelIds] } }]);
}

/** One label put on every one of these notes, or taken off every one: one batch, one undo. */
export function setLabelOn(ids: readonly string[], labelId: string, on: boolean): Undo {
  const { notes } = state();
  const changes: LocalChange[] = [];
  for (const id of ids) {
    const note = notes[id];
    if (!note || note.labelIds.includes(labelId) === on) continue;
    changes.push({ type: 'note', id, patch: { labelIds: on ? [...note.labelIds, labelId] : note.labelIds.filter(other => other !== labelId) } });
  }
  return changes.length > 0 ? writeWithUndo(changes) : () => {};
}

export function setReminder(id: string, at: number | null): Undo {
  return writeWithUndo([{ type: 'note', id, patch: { reminderAt: at } }]);
}

/** The people of Contacts a note or a link names (`contactIds`), each once, as picked: one batch, one undo. */
export function setPeople(type: 'note' | 'link', id: string, contactIds: readonly string[]): Undo {
  return writeWithUndo([{ type, id, patch: { contactIds: [...new Set(contactIds)].slice(0, PEOPLE_MAX) } }]);
}

export function trashNotes(ids: readonly string[], now: number = Date.now()): Undo {
  return writeWithUndo(
    ids.filter(id => id !== INBOX_ID).map(id => ({ type: 'note' as const, id, patch: { trashedAt: now, pinned: false } })),
  );
}

export function restoreNotes(ids: readonly string[]): Undo {
  return writeWithUndo(ids.map(id => ({ type: 'note' as const, id, patch: { trashedAt: null } })));
}

/** Tombstones the note and everything in it. */
export function deleteForever(ids: readonly string[], now: number = Date.now()): void {
  const { checksByNote, linksByNote, attachmentsByNote } = state();
  const changes: LocalChange[] = [];
  for (const id of ids) {
    if (id === INBOX_ID) continue;
    changes.push({ type: 'note', id, patch: { deletedAt: now, title: '', body: '', drawing: '' } });
    for (const child of checksByNote[id] ?? []) changes.push({ type: 'check', id: child, patch: { deletedAt: now } });
    for (const child of linksByNote[id] ?? []) changes.push({ type: 'link', id: child, patch: { deletedAt: now } });
    for (const child of attachmentsByNote[id] ?? [])
      changes.push({ type: 'attachment', id: child, patch: { deletedAt: now } });
  }
  write(changes, now);
}

export function emptyTrash(now: number = Date.now()): number {
  const { noteOrder, notes } = state();
  const trashed = noteOrder.filter(id => notes[id]?.trashedAt !== null);
  deleteForever(trashed, now);
  return trashed.length;
}

/** A copy right after the original, with its checklist. */
export function duplicateNote(id: string, now: number = Date.now()): string | null {
  const { notes, checks, checksByNote, noteOrder } = state();
  const note = notes[id];
  if (!note) return null;
  const copy = createId(now);
  // « Non classé » keeps its own place: never a neighbour.
  const siblings = noteOrder.flatMap(other => (other !== INBOX_ID && notes[other] ? [notes[other]!] : []));
  const { positions, moved } = placeAt(siblings, siblings.findIndex(other => other.id === id) + 1);
  const changes: LocalChange[] = [
    {
      type: 'note',
      id: copy,
      patch: noteFields({ ...note, title: note.title, pinned: false, trashedAt: null, position: positions[0]!, createdAt: now, deletedAt: null }),
    },
    ...movedPositions('note', moved),
  ];
  for (const checkId of checksByNote[id] ?? []) {
    const item = checks[checkId];
    if (!item) continue;
    changes.push({ type: 'check', id: createId(now), patch: checkFields({ ...item, noteId: copy, createdAt: now }) });
  }
  write(changes, now);
  return copy;
}

/** Whether a copy would hold anything: a title, text, a reminder, a written item or a drawing (photos stay with the original). `typed`: what the editor holds that is not saved yet, as plain words. */
export function canDuplicate(noteId: string, typed: { readonly title?: string; readonly body?: string } = {}): boolean {
  const { notes, checks, checksByNote } = state();
  const note = notes[noteId];
  if (!note || note.deletedAt !== null || note.kind === 'links') return false;
  if ((typed.title ?? note.title).trim() || (typed.body ?? bodyText(note)).trim() || note.reminderAt !== null) return true;
  if (note.kind === 'drawing') return noteDrawingRatio(note) !== null;
  return (checksByNote[noteId] ?? []).some(id => checks[id]?.text.trim());
}

// ── link modules ───────────────────────────────────────────────────────────

/** A collection's link modules (`notes/models/modules`): the keys it keeps, a newer client's included. */
export function setLineModules(id: string, modules: readonly string[]): void {
  write([{ type: 'note', id, patch: { modules: [...modules] } }]);
}

/** Lines added to a checklist in one gesture ("Liste de courses"): after its open items, or as a new checklist named `title` when `noteId` is null. Returns the list. */
export function addToChecklist(noteId: string | null, title: string, texts: readonly string[], now: number = Date.now()): string {
  const target = noteId ?? createId(now);
  const changes: LocalChange[] = [];
  if (!noteId) {
    changes.push({
      type: 'note',
      id: target,
      patch: noteFields({ kind: 'checklist', title, body: '', color: null, pinned: false, archived: false, trashedAt: null, labelIds: [], position: topPosition(), reminderAt: null, code: '', hint: '', createdAt: now, deletedAt: null }),
    });
  }
  const siblings = noteId ? checkSiblings(noteId) : [];
  const lastOpen = [...siblings].reverse().find(item => !item.checked);
  const { positions, moved } = placeAt(siblings, lastOpen ? siblings.findIndex(item => item.id === lastOpen.id) + 1 : 0, texts.length);
  const ids = texts.map(() => createId(now));
  ids.forEach((id, k) => changes.push({ type: 'check', id, patch: checkFields({ noteId: target, text: texts[k]!, checked: false, position: positions[k]!, indent: 0, createdAt: now, deletedAt: null }) }));
  changes.push(...movedPositions('check', moved));
  write(changes, now);
  return target;
}

export function addCheck(noteId: string, text: string, afterId: string | null = null, now: number = Date.now()): string {
  const { checks } = state();
  const siblings = checkSiblings(noteId);
  // After `afterId`, or at the end of the open items, before any checked one.
  const anchor = afterId ?? [...siblings].reverse().find(item => !item.checked)?.id ?? null;
  const { positions, moved } = placeAt(siblings, anchor === null ? 0 : siblings.findIndex(item => item.id === anchor) + 1);
  const id = createId(now);
  const indent = afterId ? checks[afterId]?.indent ?? 0 : 0;
  write(
    [
      {
        type: 'check',
        id,
        patch: checkFields({ noteId, text, checked: false, position: positions[0]!, indent, createdAt: now, deletedAt: null }),
      },
      ...movedPositions('check', moved),
    ],
    now,
  );
  return id;
}

/** A checklist's items in order, as `placeAt` reads them, without `except`. */
function checkSiblings(noteId: string, except: string | null = null) {
  const { checks, checksByNote } = state();
  return (checksByNote[noteId] ?? []).flatMap(cid => {
    const item = checks[cid];
    return cid !== except && item ? [item] : [];
  });
}

/** The records `placeAt` moved out of a tie, as position writes for the same batch. */
function movedPositions(type: 'note' | 'check', moved: readonly Placed[]): LocalChange[] {
  return moved.map(item => ({ type, id: item.id, patch: { position: item.position } }));
}

/**
 * Enter inside an item, as in Keep: the text before the caret stays, the rest becomes a new item
 * right after it, at its indent. `text` is what the field holds. Returns the new item's id.
 */
export function splitCheck(id: string, text: string, caret: number, now: number = Date.now()): string | null {
  const item = state().checks[id];
  if (!item) return null;
  const head = text.slice(0, caret);
  const newId = createId(now);
  const changes: LocalChange[] = head === item.text ? [] : [{ type: 'check', id, patch: { text: head } }];
  const siblings = checkSiblings(item.noteId);
  const { positions, moved } = placeAt(siblings, siblings.findIndex(other => other.id === id) + 1);
  changes.push({
    type: 'check',
    id: newId,
    patch: checkFields({
      noteId: item.noteId,
      text: text.slice(caret),
      checked: false,
      position: positions[0]!,
      indent: item.indent,
      createdAt: now,
      deletedAt: null,
    }),
  });
  changes.push(...movedPositions('check', moved));
  write(changes, now);
  return newId;
}

/**
 * A paste of several lines into an item, in one write: the first line is its text (typed from
 * `since`, merged as typing is), each other line an item right after it. Returns the item's text
 * and the new items' ids.
 */
export function pasteChecks(id: string, since: string | null, lines: readonly string[], now: number = Date.now()): { text: string; ids: string[] } {
  const item = state().checks[id];
  const typed = lines[0] ?? '';
  if (!item) return { text: typed, ids: [] };
  const text = typedOver('check', 'text', since, typed, item.text);
  const rest = lines.slice(1);
  const siblings = checkSiblings(item.noteId);
  const { positions, moved } = placeAt(siblings, siblings.findIndex(other => other.id === id) + 1, rest.length);
  const ids = rest.map(() => createId(now));
  write(
    [
      ...(text !== item.text ? [{ type: 'check' as const, id, patch: { text } }] : []),
      ...rest.map((line, k) => ({
        type: 'check' as const,
        id: ids[k]!,
        patch: checkFields({ noteId: item.noteId, text: line, checked: false, position: positions[k]!, indent: item.indent, createdAt: now, deletedAt: null }),
      })),
      ...movedPositions('check', moved),
    ],
    now,
  );
  return { text, ids };
}

/** Backspace at the start of an item: its text joins the end of the item above, and it goes. Returns where the two meet. */
export function mergeIntoPrevious(previousId: string, id: string, text: string, now: number = Date.now()): number {
  const previous = state().checks[previousId];
  if (!previous) return 0;
  const changes: LocalChange[] = text ? [{ type: 'check', id: previousId, patch: { text: previous.text + text } }] : [];
  changes.push({ type: 'check', id, patch: { deletedAt: now } });
  write(changes, now);
  return previous.text.length;
}

export function updateCheck(id: string, patch: Fields): void {
  write([{ type: 'check', id, patch }]);
}

export function toggleCheck(id: string): void {
  const item = state().checks[id];
  if (item) write([{ type: 'check', id, patch: { checked: !item.checked } }]);
}

/** Items ticked or unticked away from the editor (a home-screen widget), as one write; one already so, or gone, is left. */
export function setChecks(ticks: readonly { readonly id: string; readonly checked: boolean }[]): void {
  const { checks } = state();
  write(
    ticks.flatMap(tick => {
      const item = checks[tick.id];
      return item && item.deletedAt === null && item.checked !== tick.checked ? [{ type: 'check' as const, id: tick.id, patch: { checked: tick.checked } }] : [];
    }),
  );
}

export function deleteCheck(id: string, now: number = Date.now()): Undo {
  return writeWithUndo([{ type: 'check', id, patch: { deletedAt: now } }]);
}

export function moveCheck(id: string, beforeId: string | null, afterId: string | null): void {
  const item = state().checks[id];
  if (!item) return;
  const siblings = checkSiblings(item.noteId, id);
  const { positions, moved } = placeAt(siblings, indexBetween(siblings, beforeId, afterId));
  write([{ type: 'check', id, patch: { position: positions[0]! } }, ...movedPositions('check', moved)]);
}

export function uncheckAll(noteId: string): Undo {
  const { checks, checksByNote } = state();
  return writeWithUndo(
    (checksByNote[noteId] ?? [])
      .filter(id => checks[id]?.checked)
      .map(id => ({ type: 'check' as const, id, patch: { checked: false } })),
  );
}

export function deleteChecked(noteId: string, now: number = Date.now()): Undo {
  const { checks, checksByNote } = state();
  return writeWithUndo(
    (checksByNote[noteId] ?? [])
      .filter(id => checks[id]?.checked)
      .map(id => ({ type: 'check' as const, id, patch: { deletedAt: now } })),
  );
}

export interface NewLine {
  readonly title: string;
  readonly code?: string;
  readonly color?: LineColor;
  readonly emblem?: Emblem;
  readonly hint?: string;
  readonly id?: string;
}

/**
 * A collection: a note of kind `links` with a cut-out emblem. A starter (`SUGGESTED_COLLECTIONS`)
 * comes with its own facts, chosen, in the same batch: its list under a fixed id
 * (`starterTemplateId`), named after it, so two devices making « Restaurants » write one. The web's
 * `createLine`.
 */
export function createLine(init: NewLine, now: number = Date.now()): string {
  const { notes, noteOrder } = state();
  const collections = noteOrder.map(id => notes[id]).filter(n => n?.kind === 'links');
  const title = init.title.trim();
  const facts = init.id ? starterFacts(init.id) : null;
  const templateId = init.id && facts ? starterTemplateId(init.id) : undefined;
  const note = newNote(
    {
      kind: 'links',
      id: init.id,
      title,
      code: (init.code ?? title.charAt(0)).toUpperCase().slice(0, 2),
      color: init.color ?? nextLineColor(collections.map(n => asLineColor(n!.color))),
      emblem: init.emblem ?? nextEmblem(collections.map(n => n!)),
      hint: init.hint ?? '',
      templateId,
    },
    now,
  );
  const changes: LocalChange[] = [note];
  if (templateId && facts) {
    changes.unshift({
      type: 'linkTemplate',
      id: templateId,
      patch: linkTemplateFields({ name: title.slice(0, TEMPLATE_LIMITS.name), kind: null, fields: facts, createdAt: now, deletedAt: null }),
    });
  }
  write(changes);
  return note.id;
}

/** False without a server, or when the server said it has no key: unknown (null) counts as on. */
export function readingEnabled(): boolean {
  return selectCanRead(useSettingsStore.getState());
}

export interface AddLinkOptions {
  readonly noteId?: string;
  /** Claude files it: it lands in "Non classé" and the server moves it once read. */
  readonly autoFile?: boolean;
  readonly title?: string;
}

/** An address saved: `id` is its new link, or the saved one (`existing`) when nothing was added. */
export type PlacedLink = LinkPlan & { readonly id: string };

/**
 * Save addresses at the top of a collection, as one batch, once per collection (`notes/services/savedLinks`):
 * a new link whose address another collection holds takes that link's reading. With reading off,
 * a link stays plain where it was put and `autoFile` is dropped.
 */
export function addLinks(urls: readonly string[], options: AddLinkOptions = {}, now: number = Date.now()): PlacedLink[] {
  const noteId = options.noteId ?? INBOX_ID;
  const autoFile = options.autoFile ?? false;
  const reading = readingEnabled();
  const { links, notes, linksByNote, linkTemplates } = state();
  // A reading is copied only from a collection that reads with the same template.
  const plans = planLinks(urls, autoFile ? null : noteId, savedAddresses(links, notes), { templates: linkTemplates, notes });
  const fresh = plans.filter(plan => plan.existing === null);
  const first = linksByNote[noteId]?.[0];
  const positions = positionsBetween(null, first ? links[first]?.position ?? null : null, fresh.length);
  const placed = plans.map(plan => ({ ...plan, id: plan.existing ?? createId(now) }));
  write(
    placed
      .filter(plan => plan.existing === null)
      .map((plan, index) => ({
        type: 'link' as const,
        id: plan.id,
        patch: linkFields({
          noteId,
          url: plan.url,
          status: reading ? 'pending' : 'skipped',
          autoFile: reading && autoFile && !plan.reading,
          filedBy: noteId === INBOX_ID ? null : 'person',
          lang: getLocale(),
          title: options.title ?? '',
          summary: '',
          siteName: '',
          kind: 'other',
          price: null,
          currency: null,
          attributes: [],
          imageIds: [],
          imageUrl: null,
          error: null,
          analyzedAt: null,
          // A page kept of the article is the first link's: this one keeps its own.
          copy: null,
          ...plan.reading,
          done: false,
          doneAt: null,
          comment: '',
          position: positions[index]!,
          createdAt: now,
          deletedAt: null,
        }),
      })),
    now,
  );
  // Put there by the person: the collection rises in the share sheet's first row.
  if (noteId !== INBOX_ID && !autoFile && placed.length > 0) reportCollectionUsed(noteId);
  return placed;
}

/** One address: the id of its link, new or already saved there. */
export function addLink(url: string, options: AddLinkOptions = {}, now: number = Date.now()): string {
  return addLinks([url], options, now)[0]!.id;
}

export function updateLink(id: string, patch: Fields): void {
  write([{ type: 'link', id, patch }]);
}

/** Done is a stamp: the link stays, at the foot of its line. */
export function setLinkDone(id: string, done: boolean, now: number = Date.now()): Undo {
  return writeWithUndo([{ type: 'link', id, patch: { done, doneAt: done ? now : null } }]);
}

export function moveLink(id: string, toNoteId: string): Undo {
  const { links, linksByNote } = state();
  if (toNoteId !== INBOX_ID) reportCollectionUsed(toNoteId);
  const first = linksByNote[toNoteId]?.[0];
  return writeWithUndo([
    {
      type: 'link',
      id,
      patch: { noteId: toNoteId, autoFile: false, filedBy: 'person', position: positionBetween(null, first ? links[first]?.position ?? null : null) },
    },
  ]);
}

/** The links in `ids`, at the top of `toNoteId` in their order: the changes for one batch. */
function moveToTop(ids: readonly string[], toNoteId: string, filedBy: LinkFiler | null): LocalChange[] {
  const { links, linksByNote } = state();
  const first = linksByNote[toNoteId]?.[0];
  const positions = positionsBetween(null, first ? links[first]?.position ?? null : null, ids.length);
  return ids.map((id, index) => ({ type: 'link' as const, id, patch: { noteId: toNoteId, autoFile: false, filedBy, position: positions[index]! } }));
}

/**
 * Sorted links, as one batch: each goes to the top of its new collection, unless it has left `from`
 * meanwhile (the person moved it) or that collection is gone. Returns the moves made.
 */
export function applyMoves(from: string, moves: readonly SortMove[], filedBy: LinkFiler): { readonly moved: readonly SortMove[]; readonly undo: Undo } {
  const { links, notes } = state();
  const live = (id: string) => id === INBOX_ID || (notes[id]?.kind === 'links' && notes[id]!.deletedAt === null && notes[id]!.trashedAt === null);
  const seen = new Set<string>();
  const moved = moves.filter(move => {
    const link = links[move.link];
    const ok = !seen.has(move.link) && link?.noteId === from && link.deletedAt === null && move.to !== from && live(move.to);
    seen.add(move.link);
    return ok;
  });
  if (moved.length === 0) return { moved, undo: () => {} };
  // Each collection takes its newcomers in the order they had where they came from.
  const rank = new Map((state().linksByNote[from] ?? []).map((id, index) => [id, index]));
  const targets = [...new Set(moved.map(move => move.to))];
  const changes = targets.flatMap(to => {
    const ids = moved.filter(move => move.to === to).map(move => move.link);
    return moveToTop(ids.sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0)), to, filedBy);
  });
  return { moved, undo: writeWithUndo(changes) };
}

/**
 * "Supprimer" for notes that include collections holding links: all go to the bin, and the
 * collections' links with them (`linksTo` null) or to the top of `linksTo`, in the same batch.
 */
export function trashLines(ids: readonly string[], linksTo: string | null, now: number = Date.now()): Undo {
  const { linksByNote } = state();
  const trashed = ids.filter(id => id !== INBOX_ID);
  const target = linksTo !== null && !trashed.includes(linksTo) ? linksTo : null;
  const links = target === null ? [] : trashed.flatMap(id => linksByNote[id] ?? []);
  return writeWithUndo([
    ...trashed.map(id => ({ type: 'note' as const, id, patch: { trashedAt: now, pinned: false } })),
    ...(links.length > 0 ? moveToTop(links, target!, target === INBOX_ID ? null : 'person') : []),
  ]);
}

/** Read again, in the interface's language now. */
export function reanalyzeLink(id: string): void {
  write([{ type: 'link', id, patch: { status: 'pending', error: null, lang: getLocale() } }]);
}

/** After a key is set: read every link that was kept plain while reading was off. */
export function readSkippedLinks(): number {
  const { links } = state();
  const skipped = Object.values(links).filter(link => link.status === 'skipped' && link.deletedAt === null);
  write(skipped.map(link => ({ type: 'link' as const, id: link.id, patch: { status: 'pending', error: null, lang: getLocale() } })));
  return skipped.length;
}

/** A collection's « Tout lire » (its links kept unread) or « Tout réessayer » (those that failed): one batch, in the interface's language now. */
export function readLinks(ids: readonly string[]): number {
  const { links } = state();
  const live = ids.filter(id => links[id] && links[id]!.deletedAt === null);
  if (live.length > 0) write(live.map(id => ({ type: 'link' as const, id, patch: { status: 'pending', error: null, lang: getLocale() } })));
  return live.length;
}

/** Live links whose address still carries trackers (saved before a rule knew them). */
export function trackedLinkIds(links: LibraryState['links']): string[] {
  return Object.values(links)
    .filter(link => link.deletedAt === null && normalizeUrl(link.url) !== link.url)
    .map(link => link.id);
}

export function cleanSavedLinks(): { readonly count: number; readonly undo: Undo } {
  const { links } = state();
  const ids = trackedLinkIds(links);
  const undo = writeWithUndo(ids.map(id => ({ type: 'link' as const, id, patch: { url: normalizeUrl(links[id]!.url) } })));
  return { count: ids.length, undo };
}

export function deleteLink(id: string, now: number = Date.now()): Undo {
  return writeWithUndo([{ type: 'link', id, patch: { deletedAt: now } }]);
}

export function createLabel(name: string, now: number = Date.now()): string {
  const { labels, labelOrder } = state();
  const last = labelOrder[labelOrder.length - 1];
  const id = createId(now);
  write([
    {
      type: 'label',
      id,
      patch: labelFields({
        name: name.trim().slice(0, 60),
        color: nextLineColor(labelOrder.map(lid => labels[lid]?.color ?? null)),
        position: positionBetween(last ? labels[last]?.position ?? null : null, null),
        createdAt: now,
        deletedAt: null,
      }),
    },
  ]);
  return id;
}

export function updateLabel(id: string, patch: Fields): void {
  write([{ type: 'label', id, patch }]);
}

export function deleteLabel(id: string, now: number = Date.now()): Undo {
  const { notes, noteOrder } = state();
  const changes: LocalChange[] = [{ type: 'label', id, patch: { deletedAt: now } }];
  for (const noteId of noteOrder) {
    const note = notes[noteId];
    if (note?.labelIds.includes(id)) {
      changes.push({ type: 'note', id: noteId, patch: { labelIds: note.labelIds.filter(l => l !== id) } });
    }
  }
  return writeWithUndo(changes);
}

export function addAttachment(
  noteId: string,
  file: { id: string; mime: string; width: number; height: number; bytes: number },
  now: number = Date.now(),
): void {
  const { attachments, attachmentsByNote } = state();
  const ids = attachmentsByNote[noteId] ?? [];
  const last = ids[ids.length - 1];
  write([
    {
      type: 'attachment',
      id: file.id,
      patch: attachmentFields({
        noteId,
        mime: file.mime,
        width: file.width,
        height: file.height,
        bytes: file.bytes,
        position: positionBetween(last ? attachments[last]?.position ?? null : null, null),
        uploaded: false,
        createdAt: now,
        deletedAt: null,
      }),
    },
  ]);
}

export function markAttachmentUploaded(id: string): void {
  write([{ type: 'attachment', id, patch: { uploaded: true } }]);
}

export function removeAttachment(id: string, now: number = Date.now()): Undo {
  return writeWithUndo([{ type: 'attachment', id, patch: { deletedAt: now } }]);
}

export function convertToChecklist(noteId: string, now: number = Date.now()): void {
  const note = state().notes[noteId];
  if (!note || note.kind !== 'text') return;
  const lines = bodyText(note).split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const changes: LocalChange[] = [{ type: 'note', id: noteId, patch: { kind: 'checklist', body: '' } }];
  let position: string | null = null;
  for (const text of lines) {
    position = positionBetween(position, null);
    changes.push({
      type: 'check',
      id: createId(now),
      patch: checkFields({ noteId, text: text.slice(0, 5000), checked: false, position, indent: 0, createdAt: now, deletedAt: null }),
    });
  }
  write(changes, now);
}

/** Checked items are kept, unmarked. */
export function convertToText(noteId: string, now: number = Date.now()): void {
  const { notes, checks, checksByNote } = state();
  const note = notes[noteId];
  if (!note || note.kind !== 'checklist') return;
  const ids = checksByNote[noteId] ?? [];
  const body = ids
    .map(id => checks[id])
    .filter(item => !!item)
    .map(item => item!.text)
    .join('\n');
  // A note formatted before it became a list keeps its form: its lines come back as text in it.
  const changes: LocalChange[] = [{ type: 'note', id: noteId, patch: { kind: 'text', body: bodyFromText(body, note.rich) } }];
  for (const id of ids) changes.push({ type: 'check', id, patch: { deletedAt: now } });
  write(changes, now);
}

/** What « Transformer en collection » did: the collection made, with the way back; or why it could not. */
export type ConvertOutcome =
  | { readonly status: 'empty' }
  | { readonly status: 'notLinks'; readonly lines: readonly string[] }
  | { readonly status: 'ok'; readonly collectionId: string; readonly title: string; readonly links: number; readonly undo: Undo };

/**
 * « Transformer en collection » (`notes/services/listToCollection`): a checklist, or a text note's
 * lines, made a collection of links in one batch, first among the collections as a new one is, the
 * note to the bin. Its undo erases the collection and its links and brings the note back as it was.
 */
export function convertToCollection(noteId: string, now: number = Date.now()): ConvertOutcome {
  const note = state().notes[noteId];
  if (!note) return { status: 'empty' };
  const done = listToCollection(note, state(), { position: topPosition(), reading: readingEnabled(), now });
  if (done.status !== 'ok') return done;
  write(done.changes, now);
  return { status: 'ok', collectionId: done.collectionId, title: done.title, links: done.links, undo: () => write(undoListToCollection(note, done, Date.now())) };
}

/** « Effacer des données » (`notes/services/erase`): the parts chosen erased as one batch; how many records went. */
export function eraseData(chosen: ReadonlySet<string>, now: number = Date.now()): number {
  const changes = eraseChanges(state(), chosen, now);
  write(changes as LocalChange[], now);
  return erasedCount(changes);
}

/** True when leaving the note should discard it, as Keep discards an empty note. */
export function isEmptyNote(noteId: string): boolean {
  const { notes, checks, checksByNote, attachmentsByNote } = state();
  const note = notes[noteId];
  // A note deleted for good is already gone: nothing left to discard.
  if (!note || note.deletedAt !== null || note.kind === 'links') return false;
  if (note.title.trim() || bodyText(note).trim() || note.reminderAt !== null || (note.kind === 'drawing' && !isDrawingEmpty(note.drawing))) return false;
  if ((attachmentsByNote[noteId]?.length ?? 0) > 0) return false;
  return !(checksByNote[noteId] ?? []).some(id => checks[id]?.text.trim());
}

/** A template being shaped (« Modèle de fiche »): a kind's (`kind` set), or one of the person's own (`id` null until it is first saved). */
export interface TemplateDraft {
  readonly id: string | null;
  readonly name: string;
  readonly kind: LinkKind | null;
  readonly fields: readonly TemplateField[];
}

/**
 * A template saved whole, as one batch (`linkTemplateFields`, its words trimmed): a kind's under its
 * fixed id, or, set back to what its preset says, its record deleted so the preset reads again; one
 * of the person's own under its id (minted when new). `forCollection`: a new one made from a
 * collection's « Modèle de fiche » is chosen for it in the same batch. Returns its id and the undo
 * (a template that did not exist goes back to the bin of deleted ones).
 */
export function saveTemplate(draft: TemplateDraft, options: { readonly forCollection?: string } = {}, now: number = Date.now()): { readonly id: string; readonly undo: Undo } {
  const { linkTemplates, notes } = state();
  const fields = draft.fields.map(field => ({ id: field.id, name: field.name.trim(), type: field.type, hint: field.hint.trim() }));
  const id = draft.kind !== null ? kindTemplateId(draft.kind) : (draft.id ?? createId(now));
  const existing = linkTemplates[id];
  const changes: LocalChange[] = [];
  if (draft.kind !== null && sameFields(fields, presetFields(draft.kind))) {
    if (existing && existing.deletedAt === null) changes.push({ type: 'linkTemplate', id, patch: { deletedAt: now } });
  } else {
    const kept = linkTemplateFields({ name: draft.kind !== null ? '' : draft.name.trim(), kind: draft.kind, fields, createdAt: existing?.createdAt ?? now, deletedAt: null });
    changes.push({ type: 'linkTemplate', id, patch: kept });
  }
  const collection = options.forCollection ? notes[options.forCollection] : undefined;
  if (draft.kind === null && collection && collection.id !== INBOX_ID && collection.kind === 'links' && collection.deletedAt === null) {
    changes.push({ type: 'note', id: collection.id, patch: { templateId: id } });
  }
  if (changes.length === 0) return { id, undo: () => {} };
  // Each record as it was; one that did not exist is deleted again.
  const previous = changes.map(change => {
    const record = getRecord(change.type, change.id);
    if (!record) return null;
    const patch: Fields = {};
    for (const field of Object.keys(change.patch)) patch[field] = record.fields[field] ?? null;
    return { type: change.type, id: change.id, patch };
  });
  write(changes, now);
  return {
    id,
    undo: () =>
      write(changes.map((change, index) => previous[index] ?? { type: change.type, id: change.id, patch: { deletedAt: Date.now() } })),
  };
}

/** « Rétablir l'original »: a kind's changed template goes, its preset reads again. */
export function resetKindTemplate(kind: LinkKind, now: number = Date.now()): Undo {
  return deleteTemplate(kindTemplateId(kind), now);
}

/** « Supprimer le modèle »: the collections that picked it read their links by kind again (their `templateId` is left: a deleted template reads as none). */
export function deleteTemplate(id: string, now: number = Date.now()): Undo {
  const template = state().linkTemplates[id];
  if (!template || template.deletedAt !== null) return () => {};
  return writeWithUndo([{ type: 'linkTemplate', id, patch: { deletedAt: now } }]);
}

/** A collection's « Modèle de fiche »: one of the person's own, or null (« Selon le type de lien »). « Non classé » never takes one. */
/**
 * A collection's « Ce que Claude relève », saved whole in one batch: Claude's usual facts (`fields`
 * null: its links read by their kind again, and its own list deleted when no other collection notes
 * with it), or its own list (its template's fields changed, or a template made for it, named after it,
 * and chosen). « Non classé » has none of its own. The web's `saveCollectionFacts`.
 */
export function saveCollectionFacts(lineId: string, fields: readonly TemplateField[] | null, now: number = Date.now()): Undo {
  const { notes, linkTemplates } = state();
  const line = notes[lineId];
  if (lineId === INBOX_ID || !line || line.kind !== 'links') return () => {};
  const current = collectionTemplate(linkTemplates, line);
  if (fields === null) {
    if (!line.templateId) return () => {};
    const changes: LocalChange[] = [{ type: 'note', id: lineId, patch: { templateId: null } }];
    if (current && otherCollectionsOf(current.id, notes, lineId).length === 0) changes.push({ type: 'linkTemplate', id: current.id, patch: { deletedAt: now } });
    return writeWithUndo(changes);
  }
  const name = shownTitle(line).trim().slice(0, TEMPLATE_LIMITS.name);
  if (current) {
    const kept = fields.map(field => ({ id: field.id, name: field.name.trim(), type: field.type, hint: field.hint.trim() }));
    return writeWithUndo([{ type: 'linkTemplate', id: current.id, patch: { name, fields: kept } }]);
  }
  return saveTemplate({ id: null, name, kind: null, fields }, { forCollection: lineId }, now).undo;
}

export function setCollectionTemplate(lineId: string, templateId: string | null): Undo {
  const line = state().notes[lineId];
  if (!line || lineId === INBOX_ID || line.kind !== 'links' || (line.templateId ?? null) === templateId) return () => {};
  return writeWithUndo([{ type: 'note', id: lineId, patch: { templateId } }]);
}
