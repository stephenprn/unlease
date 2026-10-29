/**
 * A drawing being edited (a note's, or a page block's): what the sheet shows, each stroke drawn or
 * erased saved at once through `save` (which merges what another device drew meanwhile and returns
 * the text now stored), and the session's own undo and redo. A text changed from elsewhere shows as
 * soon as no hand is on the sheet.
 */
import { useState, type KeyboardEvent } from 'react';

import { t } from '@unlease/core/i18n';
import { DRAWING_LIMITS, type Stroke } from '@unlease/notes/models/drawing';
import { serializeStrokes } from '@unlease/notes/services/drawing';

import { showWarning } from '../../../app/store/ui';
import { isEditable } from '../../dom';
import { changeStrokes, idsOf, rememberStrokes, strokesOf, textWithStroke, type DrawingStep } from './strokes';

/** How many gestures the session can take back. */
const KEPT_STEPS = 100;

interface View {
  /** The text shown, as last saved or read: the base a save merges from. */
  readonly data: string;
  readonly strokes: readonly Stroke[];
}

interface History {
  readonly undo: readonly DrawingStep[];
  readonly redo: readonly DrawingStep[];
}

const NO_HISTORY: History = { undo: [], redo: [] };

export interface DrawingSession {
  readonly strokes: readonly Stroke[];
  /** A hand on the sheet (true) or lifted: while it is down, what comes from elsewhere waits. */
  readonly onGesture: (active: boolean) => void;
  readonly onStroke: (stroke: Stroke) => void;
  readonly onErase: (ids: ReadonlySet<string>) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly clear: () => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Ctrl+Z (⌘Z), and Ctrl+Maj+Z or Ctrl+Y, anywhere in the editor but a text field. */
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

export function useDrawingSession(stored: string, save: (since: string, typed: string) => string): DrawingSession {
  const [view, setView] = useState<View>(() => ({ data: stored, strokes: strokesOf(stored) }));
  const [drawing, setDrawing] = useState(false);
  const [history, setHistory] = useState<History>(NO_HISTORY);
  if (!drawing && view.data !== stored) setView({ data: stored, strokes: strokesOf(stored) });

  /** Saves `next` (its text `typed`); false when the drawing would be too long to keep. */
  const write = (next: readonly Stroke[], typed: string): boolean => {
    if (typed.length > DRAWING_LIMITS.chars) {
      showWarning(t('Ce dessin est plein : effacez des traits pour en ajouter d’autres.'));
      return false;
    }
    const now = save(view.data, typed);
    if (now === typed) rememberStrokes(now, next);
    setView({ data: now, strokes: now === typed ? next : strokesOf(now) });
    return true;
  };

  const record = (step: DrawingStep): void => setHistory(current => ({ undo: [...current.undo, step].slice(-KEPT_STEPS), redo: [] }));

  const onStroke = (stroke: Stroke): void => {
    if (write(changeStrokes(view.strokes, [stroke]), textWithStroke(view.data, view.strokes, stroke))) record({ added: [stroke], removed: [] });
  };

  const onErase = (ids: ReadonlySet<string>): void => {
    const removed = view.strokes.filter(stroke => ids.has(stroke.id));
    if (removed.length === 0) return;
    const next = changeStrokes(view.strokes, [], ids);
    if (write(next, serializeStrokes(next))) record({ added: [], removed });
  };

  const clear = (): void => {
    if (view.strokes.length === 0) return;
    if (write([], '')) record({ added: [], removed: view.strokes });
  };

  /** Takes the last step back (`undo`) or does again the last one taken back. */
  const replay = (direction: 'undo' | 'redo'): void => {
    const from = direction === 'undo' ? history.undo : history.redo;
    const step = from[from.length - 1];
    if (!step) return;
    const next = direction === 'undo' ? changeStrokes(view.strokes, step.removed, idsOf(step.added)) : changeStrokes(view.strokes, step.added, idsOf(step.removed));
    if (!write(next, serializeStrokes(next))) return;
    const rest = from.slice(0, -1);
    setHistory(direction === 'undo' ? { undo: rest, redo: [...history.redo, step] } : { undo: [...history.undo, step], redo: rest });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || isEditable(event.target)) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) replay('undo');
    else if (key === 'z' || key === 'y') replay('redo');
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  return {
    strokes: view.strokes,
    onGesture: setDrawing,
    onStroke,
    onErase,
    undo: () => replay('undo'),
    redo: () => replay('redo'),
    clear,
    canUndo: history.undo.length > 0,
    canRedo: history.redo.length > 0,
    onKeyDown,
  };
}
