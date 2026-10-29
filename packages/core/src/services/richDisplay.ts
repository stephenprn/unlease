/**
 * Rich text as an editor without inline objects shows it (the phone's text fields): each mention
 * spelled out as its name, each date as its words, and every edit made to that text mapped back
 * onto the runs. A mention or a date is whole or gone: an edit that touches part of its words takes
 * all of it, and typing inside it lands after it.
 */
import type { Ref } from '../refs';
import { dateShown } from './dates';
import { deleteRich, insertRich, marksAt, MENTION_CHAR, type DateRun, type Marks, type Run } from './richText';

export interface RichSpan {
  readonly run: Run;
  /** Where the run starts in the shown text, and in the runs' offsets (a mention counts one). */
  readonly display: number;
  readonly model: number;
  /** Its length as shown. */
  readonly length: number;
}

export interface RichDisplay {
  readonly text: string;
  readonly spans: readonly RichSpan[];
}

/** What a mention shows: its target's name after an at sign. */
export const mentionText = (name: string): string => `@${name.replace(/\s+/g, ' ').trim()}`;

/** A mention spelled as its name, a date as it reads today (`dateName`), each whole or gone. */
export function richDisplay(runs: readonly Run[], name: (target: Ref) => string, dateName: (run: DateRun) => string = run => dateShown(run, Date.now())): RichDisplay {
  const spans: RichSpan[] = [];
  let text = '';
  let model = 0;
  for (const run of runs) {
    const shown = run.kind === 'mention' ? mentionText(name(run.target)) : run.kind === 'date' ? dateName(run) : run.text;
    spans.push({ run, display: text.length, model, length: shown.length });
    text += shown;
    model += run.kind === 'text' ? run.text.length : 1;
  }
  return { text, spans };
}

/** A shown offset in the runs' terms; inside a mention's name, its start or its end as `side` says. */
export function displayToModel(display: RichDisplay, offset: number, side: 'start' | 'end'): number {
  for (const span of display.spans) {
    if (offset > span.display + span.length) continue;
    if (span.run.kind === 'text') return span.model + Math.max(0, offset - span.display);
    if (offset <= span.display) return span.model;
    if (offset >= span.display + span.length) return span.model + 1;
    return side === 'start' ? span.model : span.model + 1;
  }
  const last = display.spans[display.spans.length - 1];
  return last ? last.model + (last.run.kind === 'text' ? last.length : 1) : 0;
}

/** An offset in the runs, as shown. */
export function modelToDisplay(display: RichDisplay, offset: number): number {
  for (const span of display.spans) {
    const length = span.run.kind === 'text' ? span.length : 1;
    if (offset > span.model + length) continue;
    if (span.run.kind === 'text') return span.display + (offset - span.model);
    return offset <= span.model ? span.display : span.display + span.length;
  }
  return display.text.length;
}

export interface DisplayEdit {
  /** The range of the shown text that was replaced, and what took its place. */
  readonly start: number;
  readonly end: number;
  readonly inserted: string;
}

/**
 * What changed between two versions of a field's text, read from where the selection was: a
 * typed or pasted text over the selection, a backspace, else what lies between the longest
 * common start and end (an autocorrection).
 */
export function displayEdit(before: string, after: string, selection: { readonly start: number; readonly end: number }): DisplayEdit {
  const start = Math.max(0, Math.min(selection.start, selection.end, before.length));
  const end = Math.max(start, Math.min(Math.max(selection.start, selection.end), before.length));
  const delta = after.length - before.length;
  const insertedLength = end - start + delta;
  if (insertedLength >= 0 && after.slice(0, start) === before.slice(0, start) && after.slice(start + insertedLength) === before.slice(end)) {
    return { start, end, inserted: after.slice(start, start + insertedLength) };
  }
  if (start === end && delta < 0 && start + delta >= 0 && after === before.slice(0, start + delta) + before.slice(start)) {
    return { start: start + delta, end: start, inserted: '' };
  }
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1;
  return { start: prefix, end: before.length - suffix, inserted: after.slice(prefix, after.length - suffix) };
}

/**
 * An edit of the shown text applied to the runs: what it inserts wears `marks` (the marks typing
 * continues when none are given). Returns the runs and the caret after it, in the runs' offsets.
 */
export function applyDisplayEdit(runs: readonly Run[], display: RichDisplay, edit: DisplayEdit, marks?: Marks): { readonly runs: Run[]; readonly caret: number } {
  const collapsed = edit.start === edit.end;
  const from = displayToModel(display, edit.start, collapsed ? 'end' : 'start');
  const to = collapsed ? from : displayToModel(display, edit.end, 'end');
  const inserted = edit.inserted.split(MENTION_CHAR).join('');
  const kept = deleteRich(runs, from, to);
  const next = inserted ? insertRich(kept, from, [{ kind: 'text', text: inserted, marks: marks ?? marksAt(runs, from) }]) : kept;
  return { runs: next, caret: from + inserted.length };
}
