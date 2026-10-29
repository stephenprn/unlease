import { DRAWING_MIN_HEIGHT, type Stroke } from '@unlease/notes/models/drawing';
import { parseDrawing, serializeStrokes, strokePath, withStroke } from '@unlease/notes/services/drawing';

import {
  appendStroke,
  applyStep,
  insertStrokes,
  keepSameBands,
  reuseStrokes,
  sheetUnits,
  sizeDot,
  strokesAlong,
  strokesByBand,
  withPen,
  withTool,
  type ToolChoice,
} from '../drawingModel';
import { pathCurve, pathEnd, pathStart } from '../livePath';

const stroke = (id: string, points: number[], tool: Stroke['tool'] = 'pen'): Stroke => ({ id, tool, size: 1, ink: 'ink', points });

/** The path the canvas grows on the UI thread, a point at a time. */
function grown(points: readonly number[]): string {
  let settled = pathStart(points[0]!, points[1]!);
  let path = settled + pathEnd(1, points[0]!, points[1]!);
  for (let at = 2, count = 1; at + 1 < points.length; at += 2) {
    if (count >= 2) settled += pathCurve(points[at - 2]!, points[at - 1]!, points[at]!, points[at + 1]!);
    count += 1;
    path = settled + pathEnd(count, points[at]!, points[at + 1]!);
  }
  return path;
}

describe('the stroke under the finger', () => {
  it('grows into the very path the kept stroke draws, whatever its length', () => {
    const points = [10, 20, 14, 26, 30, 31, 52, 33, 70, 40, 71, 60, 90, 64];
    for (let count = 1; count <= points.length / 2; count += 1) {
      const some = points.slice(0, count * 2);
      expect(grown(some)).toBe(strokePath(some));
    }
  });

  it('rounds as the kept path does, points between whole units included', () => {
    const points = [10.04, 20.26, 14.55, 26.31, 30.95, 31.05, 52.5, 33.45];
    expect(grown(points)).toBe(strokePath(points));
  });
});

describe('keeping strokes', () => {
  const first = stroke('aaaaaa0001', [0, 0, 10, 10]);
  const second = stroke('aaaaaa0002', [5, 5, 20, 20]);
  const late = stroke('aaaaaa0003', [1, 1, 2, 2]);

  it('writes a stroke drawn last after the last line, and one that sorts earlier in its place', () => {
    const data = serializeStrokes([first, late]);
    expect(appendStroke('', first)).toBe(serializeStrokes([first]));
    expect(appendStroke(serializeStrokes([first]), late)).toBe(withStroke(serializeStrokes([first]), late));
    expect(appendStroke(data, second)).toBe(serializeStrokes([first, second, late]));
    expect(parseDrawing(appendStroke(data, second)).map(one => one.id)).toEqual([first.id, second.id, late.id]);
  });

  it('adds strokes in the order they lie, never twice', () => {
    expect(insertStrokes([first, late], [second, first]).map(one => one.id)).toEqual([first.id, second.id, late.id]);
    expect(insertStrokes([first], [late]).map(one => one.id)).toEqual([first.id, late.id]);
  });

  it('keeps the strokes it holds when the drawing is read again, and the list itself when nothing changed', () => {
    const held = [first, second];
    const read = parseDrawing(serializeStrokes([first, second]));
    expect(reuseStrokes(held, read)).toBe(held);
    const more = reuseStrokes(held, parseDrawing(serializeStrokes([first, second, late])));
    expect(more[0]).toBe(first);
    expect(more[1]).toBe(second);
    expect(more[2]!.id).toBe(late.id);
  });

  it('takes a step back and does it again: drawn strokes go and come back, erased ones come back in their place', () => {
    const data = serializeStrokes([first, second, late]);
    const drawn = { kind: 'add', strokes: [late] } as const;
    const erased = { kind: 'remove', strokes: [second] } as const;
    expect(applyStep(data, drawn, 'undo')).toBe(serializeStrokes([first, second]));
    expect(applyStep(serializeStrokes([first, second]), drawn, 'redo')).toBe(data);
    expect(applyStep(serializeStrokes([first, late]), erased, 'undo')).toBe(data);
    expect(applyStep(data, erased, 'redo')).toBe(serializeStrokes([first, late]));
    // A stroke another device already took or brought back changes nothing.
    expect(applyStep(data, erased, 'undo')).toBe(data);
  });
});

describe('the sheet', () => {
  it('fills the view while what is drawn leaves room, then keeps 250 under the lowest stroke, by steps of 50', () => {
    expect(sheetUnits([], 1500)).toBe(1500);
    expect(sheetUnits([stroke('aaaaaa0002', [100, 100, 200, 100])], 1500)).toBe(1500);
    // Down to 1400, half the pen's width under it: 1402.75 + 250, up to the next 50.
    expect(sheetUnits([stroke('aaaaaa0001', [100, 1400, 200, 1400])], 1500)).toBe(1700);
  });

  it('is a new 4:3 sheet at least, however short the view', () => {
    expect(sheetUnits([], 600)).toBe(DRAWING_MIN_HEIGHT);
    expect(sheetUnits([stroke('aaaaaa0002', [0, 10, 5, 10])], 600)).toBe(DRAWING_MIN_HEIGHT);
  });

  it('draws a stroke in every band it reaches, its width included, and keeps the bands nothing changed in', () => {
    const top = stroke('aaaaaa0001', [10, 10, 50, 50]);
    const across = stroke('aaaaaa0002', [10, 390, 10, 420]);
    const edge = stroke('aaaaaa0003', [10, 797, 30, 797], 'marker');
    const bands = strokesByBand([top, across, edge], 400, 3);
    expect(bands.map(list => list.map(one => one.id))).toEqual([[top.id, across.id], [across.id, edge.id], [edge.id]]);
    const again = keepSameBands(bands, strokesByBand([top, across, edge, stroke('aaaaaa0004', [10, 1000, 20, 1010])], 400, 3));
    expect(again[0]).toBe(bands[0]);
    expect(again[1]).toBe(bands[1]);
    expect(again[2]).not.toBe(bands[2]);
  });
});

describe('the eraser', () => {
  const line = stroke('aaaaaa0001', [500, 0, 500, 1000]);
  const far = stroke('aaaaaa0002', [900, 900, 950, 950]);

  it('takes a stroke a quick sweep crosses, though neither end of the sweep is near it', () => {
    expect(strokesAlong([line, far], 100, 500, 900, 520, 14)).toEqual([line.id]);
  });

  it('leaves what it never reaches', () => {
    expect(strokesAlong([line, far], 100, 500, 400, 500, 14)).toEqual([]);
  });
});

describe('the tools in hand', () => {
  const start: ToolChoice = { tool: 'pen', pen: 'pen', sizes: { pen: 1, marker: 1, highlighter: 1 }, ink: 'ink' };

  it('keeps each tool its own size, and one ink for all, as the web does', () => {
    const red = withPen(withPen(withTool(start, 'marker'), { ink: 'red' }), { size: 2 });
    expect(red.sizes).toEqual({ pen: 1, marker: 2, highlighter: 1 });
    expect(red.ink).toBe('red');
    const highlighter = withTool(red, 'highlighter');
    expect(highlighter.sizes.highlighter).toBe(1);
    expect(highlighter.ink).toBe('red');
  });

  it('takes the last drawing tool back when an ink or a size is picked with the eraser in hand', () => {
    const erasing = withTool(withTool(start, 'highlighter'), 'eraser');
    expect(erasing.pen).toBe('highlighter');
    const picked = withPen(erasing, { ink: 'green' });
    expect(picked.tool).toBe('highlighter');
    expect(picked.ink).toBe('green');
    expect(withPen(erasing, { size: 0 }).sizes.highlighter).toBe(0);
  });

  it('shows sizes as dots of the tool’s widths that tell apart, the thickest fitting its button', () => {
    for (const tool of ['pen', 'marker', 'highlighter'] as const) {
      expect(sizeDot(tool, 0)).toBeLessThan(sizeDot(tool, 1));
      expect(sizeDot(tool, 1)).toBeLessThan(sizeDot(tool, 2));
      expect(sizeDot(tool, 2)).toBeLessThanOrEqual(22);
    }
    expect(sizeDot('pen', 2)).toBeLessThan(sizeDot('highlighter', 2));
  });
});
