/**
 * Everything the person can do to their notes, as library writes. A port of the
 * phone's `mobile/notes/src/app/store/actions.ts`, kept in step with it on purpose: both
 * clients must write the same fields for the same gesture, or the two screens
 * would disagree about what "archive" or "move" means once they sync.
 *
 * Each action is one `writeLocal` batch, so it is one clock. Destructive actions
 * return an `undo` that writes the previous values back with a newer clock:
 * undo is an edit like any other, so it syncs, and it cannot be outrun by the
 * server echoing the original change.
 */
import { getLocale } from '@unlease/core/i18n';
import { type Emblem } from '@unlease/design/emblems';
import { indexBetween, placeAt, positionBetween, positionsBetween } from '@unlease/core/services/fractionalIndex';
import { createId } from '@unlease/core/services/ids';
import { planLinks, savedAddresses, type LinkPlan } from '@unlease/notes/services/savedLinks';
import { normalizeUrl } from '@unlease/core/services/url';
import { asLineColor, nextLineColor, type LineColor, type NoteColor, type NotePattern } from '@unlease/design/colors';
import { INBOX_HINT, INBOX_ID, INBOX_TITLE, type LinkFiler, type NoteKind } from '@unlease/notes/models/entities';
import { GENESIS_HLC } from '@unlease/core/sync/hlc';
import { attachmentFields, checkFields, labelFields, linkFields, noteFields } from '@unlease/notes/sync/entities';
import type { Fields } from '@unlease/core/sync/record';
import type { SortMove } from '@unlease/notes/sync/sorting';
import { mergeField } from '@unlease/core/sync/textMerge';
import { isDrawingEmpty, noteDrawingRatio } from '@unlease/notes/services/drawing';
import { bodyFromText, bodyText, carryMarks, fitLines, isFormatted, linesText, noteLines, serializeLines, type NoteLine } from '@unlease/notes/services/noteBody';
import { TEXT_LIMITS } from '@unlease/notes/sync/types';

import { checkSiblings } from './editing';
import { getRecord, mergeRemote, useLibraryStore, writeLocal, type LibraryState, type LocalChange } from './library';
import { selectCanRead, useSettingsStore } from './settings';
import { nextEmblem } from '@unlease/notes/models/collections';

export type Undo = () => void;

const state = () => useLibraryStore.getState();

/** Restore exactly these fields of these records to what they were. */
function undoFor(changes: readonly LocalChange[]): Undo {
  const previous: LocalChange[] = changes.map(change => {
    const record = getRecord(change.type, change.id);
    const patch: Fields = {};
    for (const field of Object.keys(change.patch)) patch[field] = record?.fields[field] ?? null;
    return { type: change.type, id: change.id, patch };
  });
  return () => writeLocal(previous);
}

/** Write and hand back the way to take it back. */
export function writeWithUndo(changes: LocalChange[]): Undo {
  const undo = undoFor(changes);
  writeLocal(changes);
  return undo;
}

// ── the inbox ──────────────────────────────────────────────────────────────

/**
 * "Non classé" exists on every device under one id, created with the genesis
 * clock: every device writes the same seed, the seeds merge into one record,
 * and any real edit (a rename, a colour) outranks it everywhere.
 */
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
    // A valid key past every note's ('a0' and below): it is a neighbour to nothing,
    // but an invalid key would throw if it ever became one.
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
  // Through the merge door (which persists it), then marked pending so the
  // server learns of it; an empty patch writes no field and moves no clock.
  mergeRemote([seed]);
  writeLocal([{ type: 'note', id: INBOX_ID, patch: {} }]);
}

// ── notes ──────────────────────────────────────────────────────────────────

/** The position before every note: new notes go first, as in Keep. */
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
}

export function createNote(init: NewNote, now: number = Date.now()): string {
  const id = init.id ?? createId(now);
  writeLocal([
    {
      type: 'note',
      id,
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
        hint: init.hint ?? '',
        createdAt: now,
        deletedAt: null,
      }),
    },
  ]);
  return id;
}

/**
 * Saves what an editor holds for a typed field (a note's title or body, a checklist line, a
 * link's comment). `since` is what the field held when the editor last saved or showed it: if
 * an edit from another device landed meanwhile, both are merged instead of one overwriting the
 * other (null: not known, the typed text is written as it is). Returns the text now stored, for
 * the editor to show.
 */
export function saveTypedText(type: 'note' | 'check' | 'link' | 'block', id: string, field: 'title' | 'body' | 'text' | 'comment' | 'caption' | 'drawing', since: string | null, typed: string): string {
  const record = getRecord(type, id);
  if (!record) return typed;
  const value = record.fields[field];
  const stored = typeof value === 'string' ? value : '';
  const next = since === null || stored === since || stored === typed ? typed : mergeField(type, field, since, typed, stored, false);
  if (next !== stored) writeLocal([{ type, id, patch: { [field]: next } }]);
  return next;
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
  writeLocal([{ type: 'note', id: noteId, patch: { body, rich: true } }]);
  return body;
}

export function updateNote(id: string, patch: Fields): void {
  writeLocal([{ type: 'note', id, patch }]);
}

export function setPinned(id: string, pinned: boolean): Undo {
  return writeWithUndo([{ type: 'note', id, patch: pinned ? { pinned, archived: false } : { pinned } }]);
}

/** Keep unpins what it archives; so does this. */
export function setArchived(id: string, archived: boolean): Undo {
  return writeWithUndo([{ type: 'note', id, patch: archived ? { archived, pinned: false } : { archived } }]);
}

export function setColor(id: string, color: NoteColor | null): void {
  writeLocal([{ type: 'note', id, patch: { color } }]);
}

/** The paper under a note's colour: dots, grid, lines, or plain. */
export function setPattern(id: string, pattern: NotePattern | null): void {
  writeLocal([{ type: 'note', id, patch: { pattern } }]);
}

export function setLabels(id: string, labelIds: readonly string[]): void {
  writeLocal([{ type: 'note', id, patch: { labelIds: [...labelIds] } }]);
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

export function trashNotes(ids: readonly string[], now: number = Date.now()): Undo {
  return writeWithUndo(
    ids.filter(id => id !== INBOX_ID).map(id => ({ type: 'note' as const, id, patch: { trashedAt: now, pinned: false } })),
  );
}

export function restoreNotes(ids: readonly string[]): Undo {
  return writeWithUndo(ids.map(id => ({ type: 'note' as const, id, patch: { trashedAt: null } })));
}

/** Gone for good: the note and everything in it get a tombstone. */
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
  writeLocal(changes, now);
}

export function emptyTrash(now: number = Date.now()): number {
  const { noteOrder, notes } = state();
  const trashed = noteOrder.filter(id => notes[id]?.trashedAt !== null);
  deleteForever(trashed, now);
  return trashed.length;
}

/** A copy placed right after the original, children included. */
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
    ...moved.map(other => ({ type: 'note' as const, id: other.id, patch: { position: other.position } })),
  ];
  for (const checkId of checksByNote[id] ?? []) {
    const item = checks[checkId];
    if (!item) continue;
    changes.push({ type: 'check', id: createId(now), patch: checkFields({ ...item, noteId: copy, createdAt: now }) });
  }
  writeLocal(changes, now);
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
  writeLocal([{ type: 'note', id, patch: { modules: [...modules] } }]);
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
  changes.push(...moved.map(item => ({ type: 'check' as const, id: item.id, patch: { position: item.position } })));
  writeLocal(changes, now);
  return target;
}

// ── checklists ─────────────────────────────────────────────────────────────

export function addCheck(noteId: string, text: string, afterId: string | null = null, now: number = Date.now()): string {
  const { checks } = state();
  const siblings = checkSiblings(noteId);
  // After `afterId`, or at the end of the open items, before any checked one.
  const anchor = afterId ?? [...siblings].reverse().find(item => !item.checked)?.id ?? null;
  const { positions, moved } = placeAt(siblings, anchor === null ? 0 : siblings.findIndex(item => item.id === anchor) + 1);
  const id = createId(now);
  const indent = afterId ? checks[afterId]?.indent ?? 0 : 0;
  writeLocal(
    [
      {
        type: 'check',
        id,
        patch: checkFields({ noteId, text, checked: false, position: positions[0]!, indent, createdAt: now, deletedAt: null }),
      },
      ...moved.map(item => ({ type: 'check' as const, id: item.id, patch: { position: item.position } })),
    ],
    now,
  );
  return id;
}

export function updateCheck(id: string, patch: Fields): void {
  writeLocal([{ type: 'check', id, patch }]);
}

export function toggleCheck(id: string): void {
  const item = state().checks[id];
  if (item) writeLocal([{ type: 'check', id, patch: { checked: !item.checked } }]);
}

export function deleteCheck(id: string, now: number = Date.now()): Undo {
  return writeWithUndo([{ type: 'check', id, patch: { deletedAt: now } }]);
}

/** Move `id` to sit between two neighbours (either may be null at an end). */
export function moveCheck(id: string, beforeId: string | null, afterId: string | null): void {
  const item = state().checks[id];
  if (!item) return;
  const siblings = checkSiblings(item.noteId, id);
  const { positions, moved } = placeAt(siblings, indexBetween(siblings, beforeId, afterId));
  writeLocal([
    { type: 'check', id, patch: { position: positions[0]! } },
    ...moved.map(other => ({ type: 'check' as const, id: other.id, patch: { position: other.position } })),
  ]);
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

// ── links and collections ──────────────────────────────────────────────────

export interface NewLine {
  readonly title: string;
  readonly code?: string;
  readonly color?: LineColor;
  readonly emblem?: Emblem;
  readonly hint?: string;
  readonly id?: string;
}

/** A collection: a note of kind `links` with a cut-out emblem. */
export function createLine(init: NewLine, now: number = Date.now()): string {
  const { notes, noteOrder } = state();
  const collections = noteOrder.map(id => notes[id]).filter(n => n?.kind === 'links');
  return createNote(
    {
      kind: 'links',
      id: init.id,
      title: init.title.trim(),
      code: (init.code ?? init.title.trim().charAt(0)).toUpperCase().slice(0, 2),
      color: init.color ?? nextLineColor(collections.map(n => asLineColor(n!.color))),
      emblem: init.emblem ?? nextEmblem(collections.map(n => n!)),
      hint: init.hint ?? '',
    },
    now,
  );
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
 * Save addresses at the top of a line, as one batch, once per line (`notes/services/savedLinks`):
 * a new link whose address another line holds takes that link's reading. When reading is off,
 * a link is kept plain where it was put, and nothing is filed.
 */
export function addLinks(urls: readonly string[], options: AddLinkOptions = {}, now: number = Date.now()): PlacedLink[] {
  const noteId = options.noteId ?? INBOX_ID;
  const autoFile = options.autoFile ?? false;
  const reading = readingEnabled();
  const { links, notes, linksByNote } = state();
  const plans = planLinks(urls, autoFile ? null : noteId, savedAddresses(links, notes));
  const fresh = plans.filter(plan => plan.existing === null);
  const first = linksByNote[noteId]?.[0];
  const positions = positionsBetween(null, first ? links[first]?.position ?? null : null, fresh.length);
  const placed = plans.map(plan => ({ ...plan, id: plan.existing ?? createId(now) }));
  writeLocal(
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
  return placed;
}

/** One address: the id of its link, new or already saved there. */
export function addLink(url: string, options: AddLinkOptions = {}, now: number = Date.now()): string {
  return addLinks([url], options, now)[0]!.id;
}

export function updateLink(id: string, patch: Fields): void {
  writeLocal([{ type: 'link', id, patch }]);
}

/** Done is a stamp: the link stays, punched, at the foot of its line. */
export function setLinkDone(id: string, done: boolean, now: number = Date.now()): Undo {
  return writeWithUndo([{ type: 'link', id, patch: { done, doneAt: done ? now : null } }]);
}

/** Transfer a link to another line, at its top: the person's choice. */
export function moveLink(id: string, toNoteId: string): Undo {
  const { links, linksByNote } = state();
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
  const live = (id: string): boolean => id === INBOX_ID || (notes[id]?.kind === 'links' && notes[id]!.deletedAt === null && notes[id]!.trashedAt === null);
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
  writeLocal([{ type: 'link', id, patch: { status: 'pending', error: null, lang: getLocale() } }]);
}

/** After a key is set: read every link that was kept plain while reading was off. */
export function readSkippedLinks(): number {
  const { links } = state();
  const skipped = Object.values(links).filter(link => link.status === 'skipped' && link.deletedAt === null);
  writeLocal(skipped.map(link => ({ type: 'link' as const, id: link.id, patch: { status: 'pending', error: null, lang: getLocale() } })));
  return skipped.length;
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

// ── labels ─────────────────────────────────────────────────────────────────

export function createLabel(name: string, now: number = Date.now()): string {
  const { labels, labelOrder } = state();
  const last = labelOrder[labelOrder.length - 1];
  const id = createId(now);
  writeLocal([
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
  writeLocal([{ type: 'label', id, patch }]);
}

/** Removes the label and takes it off every note that wore it. */
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

// ── photos ─────────────────────────────────────────────────────────────────

export function addAttachment(
  noteId: string,
  file: { id: string; mime: string; width: number; height: number; bytes: number },
  now: number = Date.now(),
): void {
  const { attachments, attachmentsByNote } = state();
  const ids = attachmentsByNote[noteId] ?? [];
  const last = ids[ids.length - 1];
  writeLocal([
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
  writeLocal([{ type: 'attachment', id, patch: { uploaded: true } }]);
}

export function removeAttachment(id: string, now: number = Date.now()): Undo {
  return writeWithUndo([{ type: 'attachment', id, patch: { deletedAt: now } }]);
}

// ── converting between kinds ────────────────────────────────────────────────

/** Text to checklist: every non-empty line becomes an item, as Keep does. */
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
  writeLocal(changes, now);
}

/** Checklist to text: items become lines; checked ones are kept, unmarked. */
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
  writeLocal(changes, now);
}

/** True when leaving the note should discard it, as Keep discards an empty note. */
export function isEmptyNote(noteId: string): boolean {
  const { notes, checks, checksByNote, attachmentsByNote } = state();
  const note = notes[noteId];
  if (!note || note.kind === 'links') return false;
  if (note.title.trim() || bodyText(note).trim() || note.reminderAt !== null || (note.kind === 'drawing' && !isDrawingEmpty(note.drawing))) return false;
  if ((attachmentsByNote[noteId]?.length ?? 0) > 0) return false;
  return !(checksByNote[noteId] ?? []).some(id => checks[id]?.text.trim());
}
