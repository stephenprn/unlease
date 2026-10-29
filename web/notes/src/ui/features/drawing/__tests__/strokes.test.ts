import { describe, expect, it } from 'vitest';

import { DRAWING_MIN_HEIGHT, DRAWING_SIZES, DRAWING_TOOLS, type Stroke } from '@unlease/notes/models/drawing';
import { parseDrawing, serializeStrokes, strokeLine, strokePath } from '@unlease/notes/services/drawing';

import { changeStrokes, idsOf, inkName, lowestPoint, pathOf, rememberStrokes, SHEET_ROOM, sheetHeight, sizeDot, strokesAlong, strokesOf, textWithStroke } from '../strokes';

const stroke = (id: string, points: number[], over: Partial<Stroke> = {}): Stroke => ({ id, tool: 'pen', size: 1, ink: 'ink', points, ...over });

const A = stroke('000000001aaaa', [10, 10, 100, 10]);
const B = stroke('000000002bbbb', [10, 50, 100, 50], { tool: 'marker', ink: 'blue' });
const C = stroke('000000003cccc', [500, 600, 520, 640], { tool: 'highlighter', size: 2 });

describe('reading a drawing', () => {
  it('reads each text once, in the order strokes lie, each id once', () => {
    const data = serializeStrokes([B, A]);
    const strokes = strokesOf(data);
    expect(strokes.map(each => each.id)).toEqual([A.id, B.id]);
    expect(strokesOf(data)).toBe(strokes);
    // Two lines for one stroke (never written so, unless by hand): the later one is kept.
    const twice = strokesOf(`${strokeLine(A)}\n${strokeLine({ ...A, ink: 'red' })}`);
    expect(twice).toHaveLength(1);
    expect(twice[0]!.ink).toBe('red');
    expect(strokesOf('')).toEqual([]);
  });

  it('takes a text the editor already knows as it is', () => {
    const data = `${serializeStrokes([A])}\n`;
    const known = [A];
    rememberStrokes(data, known);
    expect(strokesOf(data)).toBe(known);
  });

  it('draws each stroke’s path once', () => {
    expect(pathOf(A)).toBe(strokePath(A.points));
    expect(pathOf(A)).toBe(pathOf(A));
  });

  it('names the inks in the interface’s language', () => {
    expect(inkName('ink')).toBe('Encre');
    expect(inkName('blue')).toBe('Bleu');
  });
});

describe('the editor’s sheet', () => {
  it('is a new sheet at least, with room under the lowest stroke, grown by steps', () => {
    expect(lowestPoint([])).toBe(0);
    expect(sheetHeight(0)).toBe(DRAWING_MIN_HEIGHT);
    // The highlighter at its thickest is 52 wide: its lowest edge is 26 under its lowest point.
    expect(lowestPoint([A, B, C])).toBe(666);
    expect(sheetHeight(666)).toBe(Math.ceil((666 + SHEET_ROOM) / 50) * 50);
    expect(sheetHeight(666) % 50).toBe(0);
  });
});

describe('the eraser', () => {
  it('takes what it touches along its whole way, even swept quickly past a thin line', () => {
    const across = stroke('000000004dddd', [300, 0, 300, 400], { size: 0 });
    // From one side of the line to the other in one move: no point of the way lies on it.
    expect(strokesAlong([A, B, across], 200, 200, 400, 200, 14)).toEqual([across.id]);
    expect(strokesAlong([A, B], 50, 30, 50, 30, 5)).toEqual([]);
    expect(strokesAlong([A, B], 50, 12, 50, 48, 14).sort()).toEqual([A.id, B.id]);
  });

  it('leaves aside what it has taken already', () => {
    expect(strokesAlong([A, B], 50, 12, 50, 48, 14, new Set([A.id]))).toEqual([B.id]);
  });
});

describe('the sizes', () => {
  it('draws each tool’s three sizes as three dots that tell apart and fit their button', () => {
    for (const tool of DRAWING_TOOLS) {
      const dots = DRAWING_SIZES.map(size => sizeDot(tool, size));
      expect(new Set(dots).size).toBe(3);
      expect([...dots].sort((a, b) => a - b)).toEqual(dots);
      for (const dot of dots) expect(dot).toBeGreaterThanOrEqual(4);
      for (const dot of dots) expect(dot).toBeLessThanOrEqual(22);
    }
  });
});

describe('changes', () => {
  it('lays strokes in by id and takes them out, each id once', () => {
    expect(changeStrokes([B], [A]).map(each => each.id)).toEqual([A.id, B.id]);
    expect(changeStrokes([A, B], [A]).map(each => each.id)).toEqual([A.id, B.id]);
    expect(changeStrokes([A, B, C], [], idsOf([A, C])).map(each => each.id)).toEqual([B.id]);
    const strokes = [A];
    expect(changeStrokes(strokes, [])).toBe(strokes);
  });

  it('adds a stroke drawn last as one more line, and writes the whole text again otherwise', () => {
    const data = serializeStrokes([A, B]);
    expect(textWithStroke(data, [A, B], C)).toBe(`${data}\n${strokeLine(C)}`);
    expect(textWithStroke('', [], A)).toBe(strokeLine(A));
    // A stroke dated before the last (another device's clock) goes in its place.
    expect(textWithStroke(serializeStrokes([A, C]), [A, C], B)).toBe(serializeStrokes([A, B, C]));
    expect(parseDrawing(textWithStroke(`${data}\n`, [A, B], C)).map(each => each.id)).toEqual([A.id, B.id, C.id]);
  });
});
