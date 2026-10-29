/**
 * A block's words, typed in place on the phone: a native text field drawing the block's runs with
 * their marks, each mention spelled out as its subject's name and each date as it reads today
 * (`core/services/richDisplay`). An edit is read against the selection it was made on and applied
 * to the runs, so formatting, mentions and dates survive typing, autocorrection and pasting. Typing
 * is saved in short bursts (and at once before any gesture: `flushAll`), merged with an edit from
 * elsewhere (`saveBlockText`); the caret and « :word » being typed go to the bar as they move.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TextInput, type TextInputKeyPressEvent, type TextStyle } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { t, tx } from '@unlease/core/i18n';
import { RICH_KINDS, type Block, type BlockTarget } from '@unlease/notes/models/blocks';
import { applyDisplayEdit, displayEdit, displayToModel, modelToDisplay, richDisplay } from '@unlease/core/services/richDisplay';
import { concatRich, parseRich, richLength, serializeRich, sliceRich, type Run } from '@unlease/core/services/richText';
import { blocksFromText } from '@unlease/notes/services/pageText';
import { dateShown, dayStart } from '@unlease/core/services/dates';
import { targetTitle } from '@app/hooks/usePages';
import { useLibraryStore, type LibraryState } from '@app/store/libraryStore';
import { insertDrafts, saveBlockText } from '@app/store/pages';

import { AppText } from '../../components';
import { useTheme } from '../../theme/ThemeProvider';
import { afterTyping, backspaceAtStart, enter } from './blockKeys';
import { focusBlock, registerHandle, setEmojiQuery, setFocused, useEditorStore, type RichHandle } from './editorStore';
import { emojiQueryAt } from './inline';
import { usePageContext } from './PageContext';
import { blockTextStyle, dateStyle, markStyle, mentionStyle } from './richStyle';
import { useToday } from './useToday';

/** Typing resumed within this long is saved as one write. */
const SAVE_AFTER_MS = 350;
/** Leaving one field for another, the caret is nowhere for a moment: the bar waits this long before it goes. */
const LEAVE_MS = 120;

const GONE = tx('(supprimé)');

const keyOf = (target: BlockTarget): string => `${target.type}:${target.id}`;

/** The names of the mentions in these runs, as a map read in one go, so the field re-renders only when one changes. */
function mentionNames(s: LibraryState, runs: readonly Run[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const run of runs) if (run.kind === 'mention') out[keyOf(run.target)] = targetTitle(s, run.target);
  return out;
}

let leaveTimer: ReturnType<typeof setTimeout> | null = null;

export interface RichInputProps {
  readonly block: Block;
  readonly placeholder: string;
  /** A task done: its words in the second ink, struck through. */
  readonly done?: boolean;
  readonly style?: TextStyle;
}

/** The words a date shows depend on the day alone: read at its noon. */
const NOON = 12 * 3_600_000;

function RichInputComponent({ block, placeholder, done = false, style }: RichInputProps) {
  const theme = useTheme();
  const { page, readOnly } = usePageContext();
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [runs, setRuns] = useState<Run[]>(() => parseRich(block.text));
  const runsRef = useRef(runs);
  runsRef.current = runs;
  /** What the field last saved or showed: an edit landing from elsewhere since then is merged in. */
  const saved = useRef(block.text);
  const dirty = useRef(false);
  const [focused, setFocusedHere] = useState(false);
  /** Focused now, without waiting for a render: the first tap's caret arrives before the state does. */
  const focusedNow = useRef(false);
  /** The selection as the field reports it, in its shown text. */
  const selection = useRef({ start: 0, end: 0 });
  /** A caret to set once the field shows what was just rendered (a mention taken whole, a shortcut). */
  const caretAfterRender = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const names = useLibraryStore(useShallow(s => mentionNames(s, runs)));
  // A date reads relative to today: drawn again when the day turns.
  const today = useToday();
  const display = useMemo(() => richDisplay(runs, target => names[keyOf(target)] ?? t(GONE), run => dateShown(run, dayStart(today).getTime() + NOON)), [runs, names, today]);
  const displayRef = useRef(display);
  displayRef.current = display;

  // What the library holds now, when it moved on while this field was not being typed in.
  useEffect(() => {
    if (focused || block.text === saved.current) return;
    saved.current = block.text;
    setRuns(parseRich(block.text));
  }, [block.text, focused]);

  // Undo and redo: every field takes its words back, the focused one too.
  const epoch = useEditorStore(s => s.epoch);
  useEffect(() => {
    if (epoch === 0) return;
    const current = useLibraryStore.getState().blocks[block.id]?.text ?? '';
    if (timer.current) clearTimeout(timer.current);
    dirty.current = false;
    saved.current = current;
    setRuns(parseRich(current));
  }, [epoch, block.id]);

  const save = useCallback(
    (next: readonly Run[]): void => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      dirty.current = false;
      const markup = serializeRich(next);
      if (markup === saved.current) return;
      const stored = saveBlockText(page, block.id, saved.current, markup);
      saved.current = stored;
      if (stored !== markup) setRuns(parseRich(stored));
    },
    [page, block.id],
  );

  const flush = useCallback(() => {
    if (dirty.current) save(runsRef.current);
  }, [save]);

  // Saved when the block goes (merged away, the page left).
  useEffect(() => () => flush(), [flush]);

  const modelSelection = useCallback(() => {
    const shown = displayRef.current;
    const { start, end } = selection.current;
    return { start: displayToModel(shown, start, start === end ? 'end' : 'start'), end: displayToModel(shown, end, 'end') };
  }, []);

  const handle = useMemo<RichHandle>(
    () => ({
      runs: () => runsRef.current,
      selection: modelSelection,
      flush,
      write: (next, caret) => {
        const copy = [...next];
        runsRef.current = copy;
        setRuns(copy);
        save(copy);
        setEmojiQuery(block.id, null);
        if (caret) {
          const shown = richDisplay(copy, target => mentionNames(useLibraryStore.getState(), copy)[keyOf(target)] ?? t(GONE));
          displayRef.current = shown;
          const start = modelToDisplay(shown, caret.start);
          const end = modelToDisplay(shown, caret.end ?? caret.start);
          selection.current = { start, end };
          caretAfterRender.current = start;
          if (end !== start) setTimeout(() => input.current?.setSelection(start, end), 0);
        }
      },
    }),
    [flush, modelSelection, save, block.id],
  );

  useEffect(() => registerHandle(block.id, handle), [block.id, handle]);
  // A field gone (its block removed, or turned into a table) takes the bar with it: its blur never comes.
  useEffect(
    () => () => {
      if (useEditorStore.getState().focused === block.id) setFocused(null);
    },
    [block.id],
  );

  // A caret asked for (a new block, a merge, a block turned into another kind): taken once drawn with the latest words.
  const request = useEditorStore(s => (s.focusRequest?.id === block.id ? s.focusRequest : null));
  useEffect(() => {
    if (!request || readOnly) return;
    useEditorStore.setState({ focusRequest: null });
    const field = input.current;
    if (!field) return;
    const length = richLength(runsRef.current);
    const model = request.at === 'start' ? 0 : request.at === 'end' ? length : Math.min(request.at, length);
    const at = modelToDisplay(displayRef.current, model);
    selection.current = { start: at, end: at };
    field.focus();
    requestAnimationFrame(() => field.setSelection(at, at));
  }, [request, readOnly]);

  useEffect(() => {
    const at = caretAfterRender.current;
    if (at === null) return;
    caretAfterRender.current = null;
    input.current?.setSelection(at, at);
  });

  const onChangeText = (text: string): void => {
    const before = displayRef.current;
    if (text === before.text) return;
    const edit = displayEdit(before.text, text, selection.current);
    // Several lines pasted: the first joins this block, the rest become blocks after it (Markdown read),
    // and what followed the caret goes on after the last of them (the web's): « Hello A », « B world ».
    if (edit.inserted.includes('\n') && edit.inserted.trim().includes('\n')) {
      const [first = '', ...rest] = edit.inserted.split('\n');
      const { runs: next, caret } = applyDisplayEdit(runsRef.current, before, { ...edit, inserted: first });
      const after = sliceRich(next, caret);
      handle.write(sliceRich(next, 0, caret), null);
      const drafts = blocksFromText(rest.join('\n'));
      const last = drafts[drafts.length - 1];
      const tail = richLength(after) > 0 ? after : null;
      const ends = last ? (RICH_KINDS.has(last.kind) ? richLength(parseRich(last.text)) : 0) : 0;
      if (tail && last && RICH_KINDS.has(last.kind)) drafts[drafts.length - 1] = { ...last, text: serializeRich(concatRich(parseRich(last.text), tail)) };
      else if (tail) drafts.push({ kind: 'text', text: serializeRich(tail) });
      const ids = insertDrafts(page, drafts, { afterId: block.id });
      const landed = ids[ids.length - 1];
      // The caret stays where the paste ended, before what followed it.
      if (landed) focusBlock(landed, tail && last && RICH_KINDS.has(last.kind) ? ends : tail ? 0 : 'end');
      return;
    }
    const pending = useEditorStore.getState().pendingMarks;
    const { runs: next, caret } = applyDisplayEdit(runsRef.current, before, edit, pending ? { ...pending } : undefined);
    runsRef.current = next;
    setRuns(next);
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(runsRef.current), SAVE_AFTER_MS);
    const shown = richDisplay(next, target => mentionNames(useLibraryStore.getState(), next)[keyOf(target)] ?? t(GONE));
    // Read at once: the selection's own event may come before the field is drawn again.
    displayRef.current = shown;
    const at = modelToDisplay(shown, caret);
    selection.current = { start: at, end: at };
    // The field shows what was typed; when the runs show something else (a mention taken whole), the caret is put back.
    if (shown.text !== text) caretAfterRender.current = at;
    if (focused) {
      setFocused(block.id, { start: caret, end: caret });
      setEmojiQuery(block.id, emojiQueryAt(next, caret));
    }
    afterTyping(page, useLibraryStore.getState().blocks[block.id] ?? block, handle, caret, edit.inserted);
  };

  const onKeyPress = (event: TextInputKeyPressEvent): void => {
    if (event.nativeEvent.key !== 'Backspace') return;
    const { start, end } = selection.current;
    if (start !== 0 || end !== 0) return;
    backspaceAtStart(page, useLibraryStore.getState().blocks[block.id] ?? block, handle);
  };

  const base = useMemo(() => blockTextStyle(theme, block.kind), [theme, block.kind]);
  const doneStyle: TextStyle | null = done ? { color: theme.color.inkMuted, textDecorationLine: 'line-through' } : null;

  return (
    <TextInput
      ref={input}
      editable={!readOnly}
      multiline
      scrollEnabled={false}
      submitBehavior="submit"
      onSubmitEditing={() => enter(page, useLibraryStore.getState().blocks[block.id] ?? block, handle)}
      onChangeText={onChangeText}
      onKeyPress={onKeyPress}
      onSelectionChange={event => {
        selection.current = event.nativeEvent.selection;
        if (!focusedNow.current) return;
        const range = modelSelection();
        setFocused(block.id, range);
        // « :word » is offered only while the caret stays at its end.
        const query = useEditorStore.getState().emojiQuery;
        if (query?.block === block.id && (range.start !== range.end || range.start !== query.end)) setEmojiQuery(block.id, null);
      }}
      onFocus={() => {
        if (leaveTimer) clearTimeout(leaveTimer);
        leaveTimer = null;
        focusedNow.current = true;
        setFocusedHere(true);
        setFocused(block.id, modelSelection());
      }}
      onBlur={() => {
        flush();
        focusedNow.current = false;
        setFocusedHere(false);
        if (leaveTimer) clearTimeout(leaveTimer);
        leaveTimer = setTimeout(() => {
          leaveTimer = null;
          if (useEditorStore.getState().focused === block.id) setFocused(null);
        }, LEAVE_MS);
      }}
      placeholder={placeholder}
      placeholderTextColor={theme.color.inkFaint}
      selectionColor={theme.color.highlight}
      selectionHandleColor={theme.color.focus}
      cursorColor={theme.color.focus}
      textAlignVertical="top"
      style={[base, styles.field, doneStyle, style]}
      accessibilityLabel={placeholder}
    >
      {runs.map((run, index) =>
        run.kind === 'text' ? (
          <AppText key={index} style={[base, doneStyle, markStyle(theme, block.kind, run.marks)]}>
            {run.text}
          </AppText>
        ) : (
          <AppText key={index} style={run.kind === 'date' ? [base, dateStyle(theme, block.kind), doneStyle] : [base, doneStyle, mentionStyle(theme, names[keyOf(run.target)] == null)]}>
            {display.text.slice(display.spans[index]!.display, display.spans[index]!.display + display.spans[index]!.length)}
          </AppText>
        ),
      )}
    </TextInput>
  );
}

const styles = StyleSheet.create({
  field: { padding: 0, margin: 0, minHeight: 26, includeFontPadding: false },
});

export const RichInput = memo(RichInputComponent);
