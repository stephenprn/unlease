/**
 * A text note's body as its editor holds it: its lines as typed (`notes/services/noteBody`), each
 * change of the field's text read against the selection it was made on and applied to the lines
 * (`notes/services/noteEdits`), so headings and marks survive typing, autocorrection and pasting;
 * a Backspace at a heading's start turns it back into text first, as a page's heading does.
 * Typing is saved in short bursts, formatting at once, both merged with an edit from another device
 * (`saveNoteLines`); while nothing is being typed, an edit from elsewhere comes straight in. A plain
 * note stays plain text until its first mark or heading.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TextInput } from 'react-native';

import { cutNotice } from '@unlease/core/services/format';
import { headingShortcut, linesText, noteLines, serializeLines, type NoteLine } from '@unlease/notes/services/noteBody';
import { applyNoteEdit, backspaceHeading, offsetAfter, textChange } from '@unlease/notes/services/noteEdits';
import { displayEdit } from '@unlease/core/services/richDisplay';
import { TEXT_LIMITS } from '@unlease/notes/sync/types';
import { saveNoteLines } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@app/store/uiStore';

/** Typing resumed within this long is saved as one write. */
const SAVE_AFTER_MS = 350;

export interface TextRange {
  readonly start: number;
  readonly end: number;
}

interface Shown {
  readonly lines: readonly NoteLine[];
  /** Their words alone: what the field shows. */
  readonly text: string;
}

const shownOf = (lines: readonly NoteLine[]): Shown => ({ lines, text: linesText(lines) });

const ordered = (range: TextRange): TextRange => (range.start <= range.end ? range : { start: range.end, end: range.start });

const isRich = (id: string): boolean => useLibraryStore.getState().notes[id]?.rich ?? false;

/** The body as the record keeps it: formatted lines, or plain words. */
const stored = (lines: readonly NoteLine[], rich: boolean): string => (rich ? serializeLines(lines) : linesText(lines));

export interface NoteBodyEditor {
  readonly lines: readonly NoteLine[];
  readonly text: string;
  /** The words selected while the field holds the caret, or null (nothing selected, or the field left). */
  readonly range: TextRange | null;
  readonly input: React.RefObject<React.ComponentRef<typeof TextInput> | null>;
  readonly onChangeText: (text: string) => void;
  readonly onSelectionChange: (selection: TextRange) => void;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
  /** A key pressed in the field (`onKeyPress`): Backspace at the very start may take a heading off. */
  readonly onKeyPress: (key: string) => void;
  /** The selection the field is to take once it shows the latest lines, given once. */
  readonly takeSelection: () => TextRange | null;
  /** A change to the selected words (a mark, a heading), saved at once; the selection stays. */
  readonly format: (change: (lines: readonly NoteLine[], range: TextRange) => NoteLine[]) => void;
  /** What is typed and not saved yet, saved now. */
  readonly flush: () => void;
}

export function useNoteBody(id: string, note: { readonly body: string; readonly rich: boolean } | undefined): NoteBodyEditor {
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [shown, setShown] = useState<Shown>(() => shownOf(noteLines(note?.body ?? '', note?.rich ?? false)));
  const latest = useRef(shown);
  /** What the body was when last saved or shown: an edit landing from elsewhere since then is merged in. */
  const saved = useRef(note?.body ?? '');
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The selection as the field last reported it. */
  const selection = useRef<TextRange>({ start: 0, end: 0 });
  const focused = useRef(false);
  const pending = useRef<TextRange | null>(null);
  const [range, setRange] = useState<TextRange | null>(null);
  const rangeShown = useRef<TextRange | null>(null);

  const show = useCallback((next: Shown) => {
    latest.current = next;
    setShown(next);
  }, []);

  // Only a selection that starts, moves or ends draws again: the caret moving as one types does not.
  const reportRange = useCallback(() => {
    const at = ordered(selection.current);
    const next = focused.current && at.start !== at.end ? at : null;
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
      show(shownOf(lines));
      selection.current = keep;
      pending.current = keep;
      dirty.current = true;
      flush();
    },
    [flush, show],
  );

  const onChangeText = useCallback(
    (text: string) => {
      const before = latest.current;
      if (text === before.text) return;
      const edit = displayEdit(before.text, text, selection.current);
      // Backspace at a heading's start takes the heading off first: the line break the field took away comes back.
      const unheaded = backspaceHeading(before.lines, edit, selection.current);
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
      selection.current = { start: caret, end: caret };
      // The field shows what was typed; when the lines read otherwise (a heading's « # » taken away), the caret is put back.
      if (next.text !== text) pending.current = selection.current;
      dirty.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_AFTER_MS);
    },
    [flush, rewrite, show],
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
      const unheaded = backspaceHeading(latest.current.lines, null, selection.current);
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
      if (at.start !== at.end) rewrite(change(latest.current.lines, at), at);
    },
    [rewrite],
  );

  return useMemo(
    () => ({ lines: shown.lines, text: shown.text, range, input, onChangeText, onSelectionChange, onFocus, onBlur, onKeyPress, takeSelection, format, flush }),
    [shown, range, onChangeText, onSelectionChange, onFocus, onBlur, onKeyPress, takeSelection, format, flush],
  );
}
