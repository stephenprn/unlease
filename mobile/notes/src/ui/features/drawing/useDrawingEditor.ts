/**
 * One drawing being drawn: its strokes as the screen shows them, the tools in hand, and this
 * session's steps back and forth. Every stroke kept and every sweep of the eraser is saved at once
 * (what another device drew meanwhile merged in), so leaving keeps everything; a change from
 * elsewhere is taken in between two strokes, never under the finger. The stroke under the finger
 * lives on the UI thread (`DrawingCanvas`), in one of a few live slots, until the stroke kept in
 * its place shows.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { runOnUI, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { t } from '@unlease/core/i18n';
import { DRAWING_LIMITS, type DrawingInk, type DrawingSize, type DrawingTool, type Stroke } from '@unlease/notes/models/drawing';
import { finishStroke, newStrokeId, parseDrawing, withoutStrokes } from '@unlease/notes/services/drawing';
import { showSnack } from '@app/store/uiStore';
import { haptic } from '@platform/haptics';

import { appendStroke, applyStep, insertStrokes, lastChoice, rememberChoice, reuseStrokes, strokesAlong, strokesOf, withPen, withTool, type DrawingStep, type ToolChoice } from './drawingModel';

/** Where a stroke shows while it is drawn, and until the stroke kept in its place shows: its path, and which stroke it holds (0: none). */
export interface LiveSlot {
  readonly d: SharedValue<string>;
  readonly seq: SharedValue<number>;
}

/** Frees the slot holding a stroke: kept, it shows in its place now; dropped, it is gone. */
export function releaseSlot(slots: readonly LiveSlot[], seq: number): void {
  'worklet';
  for (const slot of slots) {
    if (slot.seq.value === seq) {
      slot.seq.value = 0;
      slot.d.value = '';
    }
  }
}

/** What the canvas tells the editor, from the UI thread. */
export interface CanvasEvents {
  /** A finger came down on the sheet. */
  readonly begin: () => void;
  /** A stroke let go, its points in drawing units; `seq` names the live slot showing it. */
  readonly stroke: (points: number[], seq: number) => void;
  /** A stroke or a sweep given up: two fingers meant a scroll, or the system took the touch. */
  readonly drop: () => void;
  /** The eraser went from one point to the next (drawing units), reaching `reach` around it. */
  readonly erase: (fromX: number, fromY: number, toX: number, toY: number, reach: number) => void;
  /** The eraser let go: what it took goes for good, or comes back. */
  readonly eraseEnd: (keep: boolean) => void;
}

export interface DrawingEditorOptions {
  /** The drawing's text as the store holds it. */
  readonly stored: string;
  /** The same, read at the moment (after a gesture that kept nothing). */
  readonly read: () => string;
  /** Keeps what the editor holds, from what it last saved or showed (`since`); returns the text now stored. */
  readonly save: (since: string, typed: string) => string;
  readonly editable: boolean;
}

export interface DrawingEditor {
  readonly strokes: readonly Stroke[];
  readonly editable: boolean;
  readonly choice: ToolChoice;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly chooseTool: (tool: DrawingTool | 'eraser') => void;
  /** A size for the drawing tool, or an ink: picked with the eraser in hand, it takes that tool back. */
  readonly chooseSize: (size: DrawingSize) => void;
  readonly chooseInk: (ink: DrawingInk) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  /** « Tout effacer »: one step, taken back as one. */
  readonly clear: () => void;
  readonly slots: readonly LiveSlot[];
  readonly events: CanvasEvents;
  /** Strokes drawn here, by id: the stroke number their live slot held, so each shows in the frame its slot empties. */
  readonly drawn: ReadonlyMap<string, number>;
  /** Stroke numbers whose stroke already shows in its place (a band drawn again shows it at once). */
  readonly shown: Set<number>;
}

/** How many steps back a session keeps. */
const MAX_STEPS = 200;
/** The eraser clicks as it takes strokes, at most this often (ms). */
const TICK_EVERY = 80;

function useLiveSlot(): LiveSlot {
  const d = useSharedValue('');
  const seq = useSharedValue(0);
  return useMemo(() => ({ d, seq }), [d, seq]);
}

export function useDrawingEditor({ stored, read, save, editable }: DrawingEditorOptions): DrawingEditor {
  const [strokes, setShown] = useState<readonly Stroke[]>(() => strokesOf(stored));
  const held = useRef(strokes);
  const setStrokes = useCallback((next: readonly Stroke[]) => {
    held.current = next;
    setShown(next);
  }, []);
  /** The text as last saved or shown: what the next save starts from. */
  const data = useRef(stored);
  /** A finger is on the sheet: what the store says waits until it lifts. */
  const busy = useRef(false);
  /** What the eraser took in the sweep under way. */
  const erased = useRef(new Map<string, Stroke>());
  const steps = useRef<{ undo: DrawingStep[]; redo: DrawingStep[] }>({ undo: [], redo: [] });
  const [history, setHistory] = useState({ undo: false, redo: false });
  const [choice, setChoice] = useState(lastChoice);
  const chosen = useRef(choice);
  chosen.current = choice;
  const [drawn] = useState(() => new Map<string, number>());
  const [shown] = useState(() => new Set<number>());
  const ticked = useRef(0);
  const first = useLiveSlot();
  const second = useLiveSlot();
  const third = useLiveSlot();
  const slots = useMemo(() => [first, second, third], [first, second, third]);
  const io = useRef({ read, save });
  io.current = { read, save };

  const adopt = useCallback(
    (text: string) => {
      data.current = text;
      setStrokes(reuseStrokes(held.current, parseDrawing(text)));
    },
    [setStrokes],
  );

  // A change from elsewhere (another device, the page's own undo) comes in between two strokes.
  useEffect(() => {
    if (!busy.current && stored !== data.current) adopt(stored);
  }, [stored, adopt]);

  /** A gesture ended keeping nothing: what landed meanwhile comes in. */
  const catchUp = useCallback(() => {
    busy.current = false;
    const latest = io.current.read();
    if (latest !== data.current) adopt(latest);
  }, [adopt]);

  /** Keeps the drawing as the editor holds it now (`shown`: its strokes, when nothing else landed); false when it would not fit. */
  const write = useCallback(
    (typed: string, next?: readonly Stroke[]): boolean => {
      busy.current = false;
      if (typed.length > DRAWING_LIMITS.chars) {
        showSnack(t('Ce dessin est plein : il ne peut rien garder de plus.'), undefined, { tone: 'warning' });
        return false;
      }
      const kept = io.current.save(data.current, typed);
      data.current = kept;
      setStrokes(kept === typed && next ? next : reuseStrokes(held.current, parseDrawing(kept)));
      return true;
    },
    [setStrokes],
  );

  const syncHistory = useCallback(() => setHistory({ undo: steps.current.undo.length > 0, redo: steps.current.redo.length > 0 }), []);

  const push = useCallback(
    (step: DrawingStep) => {
      const { undo } = steps.current;
      undo.push(step);
      if (undo.length > MAX_STEPS) undo.shift();
      steps.current.redo = [];
      syncHistory();
    },
    [syncHistory],
  );

  const release = useCallback((seq: number) => runOnUI(releaseSlot)(slots, seq), [slots]);

  const begin = () => {
    busy.current = true;
    // Drawing ends typing the title.
    if (Keyboard.isVisible()) Keyboard.dismiss();
  };

  const stroke = (points: number[], seq: number) => {
    const { pen, sizes, ink } = chosen.current;
    const made = finishStroke(newStrokeId(), pen, sizes[pen], ink, points);
    if (!made) {
      release(seq);
      catchUp();
      return;
    }
    drawn.set(made.id, seq);
    if (!write(appendStroke(data.current, made), insertStrokes(held.current, [made]))) {
      drawn.delete(made.id);
      release(seq);
      catchUp();
      return;
    }
    push({ kind: 'add', strokes: [made] });
  };

  const erase = (fromX: number, fromY: number, toX: number, toY: number, reach: number) => {
    const hits = strokesAlong(held.current, fromX, fromY, toX, toY, reach);
    if (hits.length === 0) return;
    const ids = new Set(hits);
    const left: Stroke[] = [];
    for (const one of held.current) {
      if (ids.has(one.id)) erased.current.set(one.id, one);
      else left.push(one);
    }
    setStrokes(left);
    const now = Date.now();
    if (now - ticked.current >= TICK_EVERY) {
      ticked.current = now;
      haptic('threshold');
    }
  };

  /** The sweep under way, kept (or put back). */
  const settleErasing = useCallback(
    (keep: boolean) => {
      const gone = [...erased.current.values()];
      erased.current = new Map();
      if (gone.length === 0) return catchUp();
      if (!keep) {
        setStrokes(insertStrokes(held.current, gone));
        return catchUp();
      }
      if (write(withoutStrokes(data.current, new Set(gone.map(one => one.id))))) push({ kind: 'remove', strokes: gone });
    },
    [catchUp, push, setStrokes, write],
  );

  const handlers = useRef({ begin, stroke, drop: catchUp, erase, eraseEnd: settleErasing });
  handlers.current = { begin, stroke, drop: catchUp, erase, eraseEnd: settleErasing };
  // Stable for the gestures, which call them from the UI thread.
  const events = useMemo<CanvasEvents>(
    () => ({
      begin: () => handlers.current.begin(),
      stroke: (points, seq) => handlers.current.stroke(points, seq),
      drop: () => handlers.current.drop(),
      erase: (fromX, fromY, toX, toY, reach) => handlers.current.erase(fromX, fromY, toX, toY, reach),
      eraseEnd: keep => handlers.current.eraseEnd(keep),
    }),
    [],
  );

  // A sweep the screen leaves under is kept, before the screen's own clean-up (a note left empty is discarded).
  const leave = useCallback(() => {
    if (erased.current.size > 0) settleErasing(true);
  }, [settleErasing]);
  useLayoutEffect(() => leave, [leave]);

  const takeStep = (direction: 'undo' | 'redo') => {
    const from = steps.current[direction];
    const step = from.pop();
    if (!step) return;
    if (write(applyStep(data.current, step, direction))) steps.current[direction === 'undo' ? 'redo' : 'undo'].push(step);
    else from.push(step);
    syncHistory();
  };

  const clear = () => {
    const all = held.current;
    if (all.length === 0) return;
    if (write('')) push({ kind: 'remove', strokes: all });
  };

  const choose = (next: ToolChoice) => {
    rememberChoice(next);
    setChoice(next);
  };

  return {
    strokes,
    editable,
    choice,
    canUndo: history.undo,
    canRedo: history.redo,
    chooseTool: tool => choose(withTool(chosen.current, tool)),
    chooseSize: size => choose(withPen(chosen.current, { size })),
    chooseInk: ink => choose(withPen(chosen.current, { ink })),
    undo: () => takeStep('undo'),
    redo: () => takeStep('redo'),
    clear,
    slots,
    events,
    drawn,
    shown,
  };
}
