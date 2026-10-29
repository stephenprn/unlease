import { DRAWING_MIN_HEIGHT, type Stroke } from '../../models/drawing';
import { mergeField } from '@unlease/core/sync/textMerge';
import {
  decodePoints,
  drawingHeight,
  encodePoints,
  finishStroke,
  isDrawingEmpty,
  mergeStrokes,
  newStrokeId,
  noteDrawingRatio,
  parseDrawing,
  serializeStrokes,
  simplifyPoints,
  strokePath,
  strokesAt,
  withoutStrokes,
  withStroke,
} from '../drawing';
import '../../sync/types';

const stroke = (id: string, points: number[], over: Partial<Stroke> = {}): Stroke => ({ id, tool: 'pen', size: 1, ink: 'ink', points, ...over });

describe('drawing points', () => {
  it('encode as differences and decode back, negative steps included', () => {
    const points = [0, 0, 12, 5, 7, 40, 1000, 3, 999, 2500];
    const text = encodePoints(points);
    expect(text).not.toMatch(/[\s\n]/);
    expect(decodePoints(text)).toEqual(points);
  });

  it('refuse text that is no encoding', () => {
    expect(decodePoints('abc def')).toBeNull();
  });

  it('drop points close to the line through their neighbours', () => {
    expect(simplifyPoints([0, 0, 5, 0.1, 10, 0, 10, 10])).toEqual([0, 0, 10, 0, 10, 10]);
  });
});

describe('drawings as text', () => {
  const a = stroke('000000001aaaa', [10, 10, 20, 20]);
  const b = stroke('000000002bbbb', [30, 30], { tool: 'highlighter', size: 2, ink: 'yellow' });

  it('keep strokes one per line, in the order they were drawn', () => {
    const data = serializeStrokes([b, a]);
    expect(data.split('\n')).toHaveLength(2);
    expect(parseDrawing(data)).toEqual([a, b]);
  });

  it('leave out a line they cannot read, and an unknown ink draws in ink', () => {
    const data = `${serializeStrokes([a])}\nnonsense\n000000003cccc p1 plum ${encodePoints([1, 1])}`;
    expect(parseDrawing(data).map(each => [each.id, each.ink])).toEqual([
      ['000000001aaaa', 'ink'],
      ['000000003cccc', 'ink'],
    ]);
  });

  it('add a stroke on top and take strokes away', () => {
    const data = withStroke(withStroke('', a), b);
    expect(parseDrawing(data).map(each => each.id)).toEqual([a.id, b.id]);
    expect(parseDrawing(withoutStrokes(data, new Set([a.id])))).toEqual([b]);
    expect(isDrawingEmpty(withoutStrokes(data, new Set([a.id, b.id])))).toBe(true);
  });

  it('mint ids that sort by time', () => {
    expect(newStrokeId(1000, () => 0) < newStrokeId(2000, () => 0)).toBe(true);
  });
});

describe('merging drawings', () => {
  const a = stroke('000000001aaaa', [1, 1, 2, 2]);
  const b = stroke('000000002bbbb', [3, 3, 4, 4]);
  const c = stroke('000000003cccc', [5, 5, 6, 6]);
  const base = serializeStrokes([a]);

  it('keeps what both sides drew, in time order', () => {
    expect(mergeStrokes(base, serializeStrokes([a, c]), serializeStrokes([a, b]), false)).toBe(serializeStrokes([a, b, c]));
  });

  it('lets either side erase', () => {
    expect(mergeStrokes(base, serializeStrokes([]), serializeStrokes([a, b]), false)).toBe(serializeStrokes([b]));
    expect(mergeStrokes(serializeStrokes([a, b]), serializeStrokes([a]), serializeStrokes([b]), true)).toBe('');
  });

  it('keeps a stroke a newer version wrote, though it cannot draw it', () => {
    const newer = `000000004dddd q9 ink ${encodePoints([1, 1])}`;
    expect(mergeStrokes(base, `${base}\n${newer}`, serializeStrokes([a, b]), false)).toBe(`${serializeStrokes([a, b])}\n${newer}`);
  });

  it('is the merge a drawing field gets through sync', () => {
    expect(mergeField('note', 'drawing', base, serializeStrokes([a, c]), serializeStrokes([a, b]), false)).toBe(serializeStrokes([a, b, c]));
    expect(mergeField('block', 'drawing', base, serializeStrokes([a, c]), serializeStrokes([a, b]), true)).toBe(serializeStrokes([a, b, c]));
  });
});

describe('drawing geometry', () => {
  it('finishes a stroke: whole units, inside the sheet, simplified', () => {
    const done = finishStroke('000000001aaaa', 'marker', 2, 'blue', [-5, 10.4, 500.6, 10.4, 500.6, 10.4, 1200, 10.2]);
    expect(done).toEqual({ id: '000000001aaaa', tool: 'marker', size: 2, ink: 'blue', points: [0, 10, 1000, 10] });
    expect(finishStroke('x', 'pen', 0, 'ink', [])).toBeNull();
  });

  it('keeps the sheet 4:3 until something is drawn lower, then grows in steps', () => {
    expect(drawingHeight([])).toBe(DRAWING_MIN_HEIGHT);
    expect(drawingHeight([stroke('000000001aaaa', [10, 100])])).toBe(DRAWING_MIN_HEIGHT);
    expect(drawingHeight([stroke('000000001aaaa', [10, 900])])).toBe(1000);
  });

  it('draws a smoothed path, a dot for one point', () => {
    expect(strokePath([10, 10])).toBe('M10 10l0.01 0');
    expect(strokePath([0, 0, 10, 0])).toBe('M0 0L10 0');
    expect(strokePath([0, 0, 10, 0, 20, 10])).toBe('M0 0Q10 0 15 5L20 10');
  });

  it('erases the strokes within reach, their width included', () => {
    const strokes = [stroke('000000001aaaa', [0, 0, 100, 0]), stroke('000000002bbbb', [0, 200, 100, 200])];
    expect(strokesAt(strokes, 50, 10)).toEqual(['000000001aaaa']);
    expect(strokesAt(strokes, 50, 100)).toEqual([]);
  });

  it('gives a drawing note its card ratio, none with nothing drawn', () => {
    const note = { kind: 'drawing', drawing: serializeStrokes([stroke('000000001aaaa', [10, 900])]) };
    expect(noteDrawingRatio(note)).toBe(1);
    expect(noteDrawingRatio({ kind: 'drawing', drawing: '' })).toBeNull();
    expect(noteDrawingRatio({ kind: 'text', drawing: note.drawing })).toBeNull();
  });
});
