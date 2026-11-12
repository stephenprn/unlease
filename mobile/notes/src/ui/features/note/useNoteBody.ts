/**
 * A text note's body as its editor holds it: its lines as typed (`notes/services/noteBody`), each
 * change of the field's text read against the selection it was made on and applied to the lines
 * (`notes/services/noteEdits`), so headings and marks survive typing, autocorrection and pasting;
 * a Backspace at a heading's start turns it back into text first, as a page's heading does.
 * Typing is saved in short bursts, formatting at once, both merged with an edit from another device
 * (`saveNoteLines`); while nothing is being typed, an edit from elsewhere comes straight in. A plain
 * note stays plain text until its first mark, heading or mention.
 *
 * The field shows a mention as its person's name (« @Léa Martin », `richDisplay`), and a date in words,
 * while the lines count each as one character: the field's text and its selection are « display »
 * offsets, mapped to the lines' at every edit, so a mention is whole or gone. While the caret stands
 * after « @word » (the « @ » where a word starts), the word is a question (`mentionQuery`): the
 * suggestions ride on the keyboard, and the one picked takes the place of « @word » (`mention`).
 *
 * In the note editor, its history (`useNoteHistory`) hears each key (a pause ends a step of typing),
 * and a format, a mention or a heading taken off is a step of its own: what was typed before it is
 * saved first.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TextInput } from 'react-native';

import { cutNotice } from '@unlease/core/services/format';
import { dateShown } from '@unlease/core/services/dates';
import type { Ref } from '@unlease/core/refs';
import { headingShortcut, lineStarts, linesText, noteLines, serializeLines, type NoteLine } from '@unlease/notes/services/noteBody';
import { mentionName, mentionsVersion } from '@unlease/notes/services/noteMentions';
import { applyNoteEdit, backspaceHeading, offsetAfter, textChange, type NoteEdit } from '@unlease/notes/services/noteEdits';
import { displayEdit, displayToModel, modelToDisplay, richDisplay, type RichDisplay } from '@unlease/core/services/richDisplay';
import { displayMentionQuery } from '@unlease/core/services/mentionSearch';
import { lineLinkAt } from '@unlease/core/services/url';
import { insertRich, type Run } from '@unlease/core/services/richText';
import { TEXT_LIMITS } from '@unlease/notes/sync/types';
import { saveNoteLines } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@shared/app/store/uiStore';

/** Typing resumed within this long is saved as one write. */
const SAVE_AFTER_MS = 350;

export interface TextRange {
  readonly start: number;
  readonly end: number;
}

interface Shown {
  readonly lines: readonly NoteLine[];
  /** Their words as the field shows them: a mention as its name, a date in words. */
  readonly text: string;
  /** How the shown words map onto the lines' offsets. */
  readonly display: RichDisplay;
  /** The names it was spelled with (`mentionsVersion`). */
  readonly names: number;
}

const BREAK: Run = { kind: 'text', text: '\n', marks: {} };

/** The lines as the field shows them: one run of words, a line break between lines (one character both ways). */
function displayOf(lines: readonly NoteLine[]): RichDisplay {
  const runs: Run[] = [];
  lines.forEach((line, index) => {
    if (index > 0) runs.push(BREAK);
    runs.push(...line.runs);
  });
  return richDisplay(runs, mentionName, run => dateShown(run, Date.now()));
}

const shownOf = (lines: readonly NoteLine[]): Shown => {
  const display = displayOf(lines);
  return { lines, text: display.text, display, names: mentionsVersion() };
};

/** A shown range in the lines' offsets. */
const toModel = (shown: Shown, range: TextRange): TextRange => {
  const at = ordered(range);
  if (at.start === at.end) {
    const caret = displayToModel(shown.display, at.start, 'end');
    return { start: caret, end: caret };
  }
  return { start: displayToModel(shown.display, at.start, 'start'), end: displayToModel(shown.display, at.end, 'end') };
};

/** A range of the lines, as shown. */
const toDisplay = (shown: Shown, range: TextRange): TextRange => ({ start: modelToDisplay(shown.display, range.start), end: modelToDisplay(shown.display, range.end) });

/** « @word » the caret stands after: where its « @ » is in the lines, and the word so far. */
export interface MentionQuery {
  readonly start: number;
  readonly query: string;
}

const sameQuery = (a: MentionQuery | null, b: MentionQuery | null): boolean => a === b || (!!a && !!b && a.start === b.start && a.query === b.query);

const ordered = (range: TextRange): TextRange => (range.start <= range.end ? range : { start: range.end, end: range.start });

const isRich = (id: string): boolean => useLibraryStore.getState().notes[id]?.rich ?? false;

/** The body as the record keeps it: formatted lines, or plain words. */
const stored = (lines: readonly NoteLine[], rich: boolean): string => (rich ? serializeLines(lines) : linesText(lines));

export interface NoteBodyEditor {
  readonly lines: readonly NoteLine[];
  /** What the field shows (a mention as its name). */
  readonly text: string;
  /** Bumped when the people mentioned were renamed: the field's runs draw again. */
  readonly names: number;
  /** The words selected while the field holds the caret, in the lines' offsets, or null (nothing selected, or the field left). */
  readonly range: TextRange | null;
  /** The mention the caret stands on or right after, while the field holds it: a way to open its person. */
  readonly mentionAtCaret: Ref | null;
  /** The address the caret stands in or right against, while the field holds it: a way to open it (`CaretLink`). */
  readonly linkAtCaret: string | null;
  /** « @word » the caret stands after while the field holds it (the « @ » where a word starts): who or what to mention; null otherwise. */
  readonly mentionQuery: MentionQuery | null;
  /** The person picked for the « @ »: a mention takes its place, the note becomes formatted. */
  readonly mention: (target: Ref) => void;
  readonly input: React.RefObject<React.ComponentRef<typeof TextInput> | null>;
  readonly onChangeText: (text: string) => void;
  readonly onSelectionChange: (selection: TextRange) => void;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
  /** A key pressed in the field (`onKeyPress`): Backspace at the very start may take a heading off. */
  readonly onKeyPress: (key: string) => void;
  /** The selection the field is to take once it shows the latest lines, given once. */
  readonly takeSelection: () => TextRange | null;
  /** A change to the selected words (a mark, a heading), saved at once; the selection stays. Its range is in the lines' offsets. */
  readonly format: (change: (lines: readonly NoteLine[], range: TextRange) => NoteLine[]) => void;
  /** What is typed and not saved yet, saved now. */
  readonly flush: () => void;
}

/** The note editor's history, as the body tells it of its keys and its formats. */
export interface NoteBodyHistory {
  readonly keystroke: () => void;
  readonly seal: () => void;
}

export function useNoteBody(id: string, note: { readonly body: string; readonly rich: boolean } | undefined, canMention: () => boolean = () => false, history: NoteBodyHistory | null = null): NoteBodyEditor {
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [shown, setShown] = useState<Shown>(() => shownOf(noteLines(note?.body ?? '', note?.rich ?? false)));
  const latest = useRef(shown);
  /** What the body was when last saved or shown: an edit landing from elsewhere since then is merged in. */
  const saved = useRef(note?.body ?? '');
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The selection as the field last reported it, in the shown text's offsets. */
  const selection = useRef<TextRange>({ start: 0, end: 0 });
  const focused = useRef(false);
  const pending = useRef<TextRange | null>(null);
  const [range, setRange] = useState<TextRange | null>(null);
  const rangeShown = useRef<TextRange | null>(null);
  const [mentionAtCaret, setMentionAtCaret] = useState<Ref | null>(null);
  const [linkAtCaret, setLinkAtCaret] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<MentionQuery | null>(null);
  const mayMention = useRef(canMention);
  mayMention.current = canMention;
  const told = useRef(history);
  told.current = history;

  const show = useCallback((next: Shown) => {
    latest.current = next;
    setShown(next);
  }, []);

  // Only a selection that starts, moves or ends draws again: the caret moving as one types does not.
  const reportRange = useCallback(() => {
    const at = ordered(selection.current);
    const next = focused.current && at.start !== at.end ? toModel(latest.current, at) : null;
    // The mention the caret stands on: within its name, or right after it.
    const span = focused.current && at.start === at.end ? latest.current.display.spans.find(entry => entry.run.kind === 'mention' && at.start > entry.display && at.start <= entry.display + entry.length) : undefined;
    const target = span && span.run.kind === 'mention' ? span.run.target : null;
    setMentionAtCaret(current => (current?.type === target?.type && current?.id === target?.id ? current : target));
    // The address the caret stands on, read in its line (an address never crosses one).
    const href = focused.current && at.start === at.end ? lineLinkAt(latest.current.text, at.start) : null;
    setLinkAtCaret(href);
    // « @word » just before the caret: the suggestions follow the word.
    const found = focused.current && at.start === at.end && mayMention.current() ? displayMentionQuery(latest.current.display, at.start) : null;
    const query = found ? { start: found.start, query: found.query } : null;
    setMentionQuery(current => (sameQuery(current, query) ? current : query));
    const current = rangeShown.current;
    if (current === next || (current && next && current.start === next.start && current.end === next.end)) return;
    rangeShown.current = next;
    setRange(next);
  }, []);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current || !useLibraryStore.getState().notes[id]) return;
    dirty.current = false;
    const typed = latest.current;
    const body = saveNoteLines(id, saved.current, typed.lines);
    saved.current = body;
    const rich = isRich(id);
    if (body === stored(typed.lines, rich)) return;
    // What the record holds now (an edit from elsewhere merged in, the marks kept): shown, the selection kept on its words.
    const next = shownOf(noteLines(body, rich));
    const change = textChange(typed.text, next.text);
    const at = ordered(selection.current);
    selection.current = { start: offsetAfter(at.start, change), end: offsetAfter(at.end, change) };
    if (focused.current) pending.current = selection.current;
    show(next);
  }, [id, show]);

  // The people or the events mentioned renamed (or merged, or gone): the same lines, spelled again, the caret kept on its words.
  useLibraryStore(s => s.people);
  useLibraryStore(s => s.agenda.events);
  const names = mentionsVersion();
  useEffect(() => {
    const before = latest.current;
    if (before.names === names) return;
    const next = shownOf(before.lines);
    if (next.text === before.text) {
      latest.current = next;
      return;
    }
    selection.current = toDisplay(next, toModel(before, selection.current));
    if (focused.current) pending.current = selection.current;
    show(next);
  }, [names, show]);

  // An edit from another device, while nothing is being typed here.
  useEffect(() => {
    if (!note || note.body === saved.current || dirty.current) return;
    saved.current = note.body;
    const next = shownOf(noteLines(note.body, note.rich));
    const change = textChange(latest.current.text, next.text);
    const at = ordered(selection.current);
    selection.current = { start: offsetAfter(at.start, change), end: offsetAfter(at.end, change) };
    if (focused.current) pending.current = selection.current;
    show(next);
  }, [note, show]);

  /** The lines changed where they stand (a mark, a heading taken off): saved at once, the field told where the selection stays. */
  const rewrite = useCallback(
    (lines: readonly NoteLine[], keep: TextRange) => {
      // A step of its own: what was typed before it is saved first, and what is typed after starts anew.
      if (told.current) {
        if (dirty.current) flush();
        told.current.seal();
      }
      show(shownOf(lines));
      selection.current = keep;
      pending.current = keep;
      dirty.current = true;
      flush();
      told.current?.seal();
    },
    [flush, show],
  );

  const onChangeText = useCallback(
    (text: string) => {
      const before = latest.current;
      if (text === before.text) return;
      told.current?.keystroke();
      const shownEdit = displayEdit(before.text, text, selection.current);
      // The edit in the lines' offsets: one that touches part of a mention's name takes all of it.
      const collapsed = shownEdit.start === shownEdit.end;
      const from = displayToModel(before.display, shownEdit.start, collapsed ? 'end' : 'start');
      const edit: NoteEdit = { start: from, end: collapsed ? from : displayToModel(before.display, shownEdit.end, 'end'), inserted: shownEdit.inserted };
      // Backspace at a heading's start takes the heading off first: the line break the field took away comes back.
      const unheaded = backspaceHeading(before.lines, edit, toModel(before, selection.current));
      if (unheaded) {
        rewrite(unheaded, selection.current);
        return;
      }
      let { lines, caret } = applyNoteEdit(before.lines, edit);
      // « # », « ## » or « ### » typed at a line's start makes it a heading.
      if (edit.inserted.endsWith(' ') && !edit.inserted.includes('\n')) {
        const shortcut = headingShortcut(lines, caret);
        if (shortcut) ({ lines, caret } = shortcut);
      }
      // A paste the limit cut, which the field does without a word.
      const limit = TEXT_LIMITS.note.body;
      if (text.length >= limit && text.length - before.text.length > 1) showSnack(cutNotice('Texte', limit), undefined, { tone: 'warning' });
      const next = shownOf(lines);
      show(next);
      const shownCaret = modelToDisplay(next.display, caret);
      selection.current = { start: shownCaret, end: shownCaret };
      // « @word » before the caret: the suggestions follow it as it grows.
      reportRange();
      // The field shows what was typed; when the lines read otherwise (a heading's « # » taken away), the caret is put back.
      if (next.text !== text) pending.current = selection.current;
      dirty.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_AFTER_MS);
    },
    [flush, rewrite, show, reportRange],
  );

  const onSelectionChange = useCallback(
    (next: TextRange) => {
      selection.current = next;
      reportRange();
    },
    [reportRange],
  );

  const onFocus = useCallback(() => {
    focused.current = true;
    reportRange();
  }, [reportRange]);

  const onBlur = useCallback(() => {
    focused.current = false;
    reportRange();
    flush();
  }, [flush, reportRange]);

  // Backspace with the caret at the very start: the field changes nothing, a heading there is taken off.
  const onKeyPress = useCallback(
    (key: string) => {
      if (key !== 'Backspace') return;
      const unheaded = backspaceHeading(latest.current.lines, null, toModel(latest.current, selection.current));
      if (unheaded) rewrite(unheaded, { start: 0, end: 0 });
    },
    [rewrite],
  );

  const takeSelection = useCallback(() => {
    const next = pending.current;
    pending.current = null;
    return next;
  }, []);

  const format = useCallback(
    (change: (lines: readonly NoteLine[], range: TextRange) => NoteLine[]) => {
      const at = ordered(selection.current);
      if (at.start !== at.end) rewrite(change(latest.current.lines, toModel(latest.current, at)), at);
    },
    [rewrite],
  );

  const mention = useCallback(
    (target: Ref) => {
      const asked = mentionQuery;
      setMentionQuery(null);
      if (asked === null) return;
      const before = latest.current;
      const at = asked.start;
      // « @word » (as long as it still reads so) gives way to the mention, and a space unless one follows.
      const typed = `@${asked.query}`;
      const text = linesText(before.lines);
      const end = text.slice(at, at + typed.length) === typed ? at + typed.length : text[at] === '@' ? at + 1 : at;
      const spaced = text[end] === ' ';
      const { lines } = applyNoteEdit(before.lines, { start: at, end, inserted: '' });
      const starts = lineStarts(lines);
      let row = 0;
      while (row + 1 < starts.length && starts[row + 1]! <= at) row += 1;
      const offset = at - starts[row]!;
      const atom: Run[] = spaced ? [{ kind: 'mention', target }] : [{ kind: 'mention', target }, { kind: 'text', text: ' ', marks: {} }];
      const withMention = lines.map((line, index) => (index === row ? { ...line, runs: insertRich(line.runs, offset, atom) } : line));
      const next = shownOf(withMention);
      const caret = modelToDisplay(next.display, at + 2);
      rewrite(withMention, { start: caret, end: caret });
      requestAnimationFrame(() => input.current?.focus());
    },
    [mentionQuery, rewrite],
  );

  return useMemo(
    () => ({ lines: shown.lines, text: shown.text, names: shown.names, range, mentionAtCaret, linkAtCaret, mentionQuery, mention, input, onChangeText, onSelectionChange, onFocus, onBlur, onKeyPress, takeSelection, format, flush }),
    [shown, range, mentionAtCaret, linkAtCaret, mentionQuery, mention, onChangeText, onSelectionChange, onFocus, onBlur, onKeyPress, takeSelection, format, flush],
  );
}
