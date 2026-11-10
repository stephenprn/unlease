/**
 * The note editor's « Annuler » and « Rétablir » (`notes/services/editHistory`): every batch Carnet's
 * actions write to the open note, its items and its photos is a step (typing grouped until a pause,
 * told by `keystroke`), and a step taken back or done again is one batch of its own (`replayEditStep`).
 * What is typed and not saved yet is saved first (`flush`), so it is the first thing taken back. The
 * history ends when the note closes. The fields read it through `NoteHistoryContext`: an item being
 * typed in takes the stored text when a step is taken back (`replays`).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { EMPTY_HISTORY, canRedo, canUndo, keyTyped, noteStep, recordEdit, sealTyping, travel, type Direction, type EditHistory } from '@unlease/notes/services/editHistory';

import { replayEditStep } from '../store/actions';
import { watchWrites } from '../store/writes';

export interface NoteHistory {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Something was done to the note since it opened: the bar shows the pair from then on. */
  readonly started: boolean;
  readonly undo: () => void;
  readonly redo: () => void;
  /** A key typed in one of the note's fields: a pause before it ends the typing step. */
  readonly keystroke: () => void;
  /** What is typed next is a step of its own (a format, a mention). */
  readonly seal: () => void;
  /** Bumped by every step taken back or done again. */
  readonly replays: number;
}

/** The open note's history, for its fields (none: a note shown elsewhere). */
export const NoteHistoryContext = createContext<NoteHistory | null>(null);

export const useNoteHistoryContext = (): NoteHistory | null => useContext(NoteHistoryContext);

interface Shown {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly started: boolean;
  readonly replays: number;
}

const shownOf = (history: EditHistory, replays: number): Shown => ({ canUndo: canUndo(history), canRedo: canRedo(history), started: history.started, replays });

/** `enabled`: the note can be changed and is not a drawing (its strokes have their own pair). `flush`: saves what is typed now. */
export function useNoteHistory(noteId: string, enabled: boolean, flush: () => void): NoteHistory {
  const history = useRef<EditHistory>(EMPTY_HISTORY);
  const replays = useRef(0);
  const flushRef = useRef(flush);
  flushRef.current = flush;
  const [shown, setShown] = useState<Shown>(() => shownOf(EMPTY_HISTORY, 0));
  const publish = useCallback(() => {
    const next = shownOf(history.current, replays.current);
    setShown(current => (current.canUndo === next.canUndo && current.canRedo === next.canRedo && current.started === next.started && current.replays === next.replays ? current : next));
  }, []);

  // Another note: another session.
  useEffect(() => {
    history.current = EMPTY_HISTORY;
    publish();
  }, [noteId, publish]);

  useEffect(() => {
    if (!enabled) return;
    return watchWrites((written, at, replayed) => {
      if (replayed) return;
      const step = noteStep(noteId, written, at);
      if (!step) return;
      history.current = recordEdit(history.current, step);
      publish();
    });
  }, [noteId, enabled, publish]);

  const go = useCallback(
    (direction: Direction) => {
      if (!enabled) return;
      flushRef.current();
      const { history: next, moved } = travel(history.current, direction, step => replayEditStep(step, direction));
      history.current = next;
      if (moved) replays.current += 1;
      publish();
    },
    [enabled, publish],
  );
  const undo = useCallback(() => go('undo'), [go]);
  const redo = useCallback(() => go('redo'), [go]);
  const keystroke = useCallback(() => {
    history.current = keyTyped(history.current, Date.now());
  }, []);
  const seal = useCallback(() => {
    history.current = sealTyping(history.current);
  }, []);

  return useMemo(
    () => ({ canUndo: enabled && shown.canUndo, canRedo: enabled && shown.canRedo, started: enabled && shown.started, undo, redo, keystroke, seal, replays: shown.replays }),
    [enabled, shown, undo, redo, keystroke, seal],
  );
}
