/**
 * The note editor's « Annuler » and « Rétablir » (`notes/services/editHistory`), as the phone's: every
 * batch Carnet's actions write to the open note, its items and its photos is a step (typing grouped
 * until a pause, told by `keystroke`; the body tells where its own steps end, `seal`), and a step
 * taken back or done again is one batch of its own (`replayEditStep`). What is typed and not saved yet
 * is saved first (the editor's `flush`, and each item's, `onFlush`), so it is the first thing taken
 * back. The history ends when the note closes. The fields read it through `NoteHistoryContext`.
 */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { EMPTY_HISTORY, canRedo, canUndo, keyTyped, noteStep, recordEdit, sealTyping, travel, type Direction, type EditHistory } from '@unlease/notes/services/editHistory';

import { replayEditStep } from '../store/actions';
import { watchWrites } from '../store/writes';

export interface NoteHistory {
  /** Off: the note cannot be changed, or it is a drawing (its strokes have their own pair). */
  readonly enabled: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Something was done to the note since it opened: a phone-sized bar shows the pair from then on. */
  readonly started: boolean;
  readonly undo: () => void;
  readonly redo: () => void;
  /** A key typed in one of the note's fields: a pause before it ends the typing step. */
  readonly keystroke: () => void;
  /** What is typed next is a step of its own (the body's own steps: a format, a paste, the caret moved). */
  readonly seal: () => void;
  /** A field's typing not saved yet, saved before a step is taken (an item's draft). Returns the way to stop. */
  readonly onFlush: (flush: () => void) => () => void;
  /** Bumped by every step taken back or done again: the body draws the stored text again then (it may read as it did before the step's own save). */
  readonly replays: number;
}

/** The open note's history, for its fields (none: a note shown elsewhere, as in a page). */
export const NoteHistoryContext = createContext<NoteHistory | null>(null);

export const useNoteHistoryContext = (): NoteHistory | null => useContext(NoteHistoryContext);

interface Shown {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly started: boolean;
  readonly replays: number;
}

const shownOf = (history: EditHistory, replays: number): Shown => ({ canUndo: canUndo(history), canRedo: canRedo(history), started: history.started, replays });

/** `flush`: saves what the editor holds typed now (its title, its body). */
export function useNoteHistory(noteId: string, enabled: boolean, flush: () => void): NoteHistory {
  const history = useRef<EditHistory>(EMPTY_HISTORY);
  const flushRef = useRef(flush);
  useLayoutEffect(() => {
    flushRef.current = flush;
  });
  const flushers = useRef(new Set<() => void>());
  const replays = useRef(0);
  const [shown, setShown] = useState<Shown>(() => shownOf(EMPTY_HISTORY, 0));
  const publish = useCallback(() => {
    const next = shownOf(history.current, replays.current);
    setShown(current => (current.canUndo === next.canUndo && current.canRedo === next.canRedo && current.started === next.started && current.replays === next.replays ? current : next));
  }, []);

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
      for (const each of [...flushers.current]) each();
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
  const onFlush = useCallback((each: () => void) => {
    flushers.current.add(each);
    return () => {
      flushers.current.delete(each);
    };
  }, []);

  return useMemo(
    () => ({ enabled, canUndo: enabled && shown.canUndo, canRedo: enabled && shown.canRedo, started: enabled && shown.started, undo, redo, keystroke, seal, onFlush, replays: shown.replays }),
    [enabled, shown, undo, redo, keystroke, seal, onFlush],
  );
}
