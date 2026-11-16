/**
 * The contact list's sheet in numbers, at real sizes (one person under a letter, three under another,
 * twenty under a third): every row's place and length, each letter's span, where the rail lands it,
 * which letter is at the top, and where each letter's band is held and pushed.
 */
import { BAND, landing, layOutSheet, letterAt, paperAt, PAPER_MARGIN, PIN, pinnedAt, ROW_HEIGHT, SHEET_PAD, type SheetEntry } from '../sheetLayout';

const filed = (letter: string, count: number): SheetEntry[] => Array.from({ length: count }, (_, index) => ({ id: `${letter}${index + 1}`, letter }));

describe('the contact list’s sheet', () => {
  const sheet = layOutSheet([...filed('A', 1), ...filed('B', 3), ...filed('C', 20)]);

  it('heads each letter’s people once, with a band over their first row', () => {
    expect(sheet.rows.filter(row => row.heading !== null).map(row => [row.id, row.heading])).toEqual([
      ['A1', 'A'],
      ['B1', 'B'],
      ['C1', 'C'],
    ]);
    expect(sheet.rows.filter(row => row.top).map(row => row.id)).toEqual(['A1']);
    expect(sheet.rows.filter(row => row.foot).map(row => row.id)).toEqual(['C20']);
  });

  it('gives every row a fixed length, so the list knows each offset without measuring', () => {
    // The sheet's first row adds its top's inset, a letter's first row its band, the last row the foot's inset.
    expect(sheet.lengths.slice(0, 6)).toEqual([ROW_HEIGHT + SHEET_PAD + BAND, ROW_HEIGHT + BAND, ROW_HEIGHT, ROW_HEIGHT, ROW_HEIGHT + BAND, ROW_HEIGHT]);
    expect(sheet.lengths[23]).toBe(ROW_HEIGHT + SHEET_PAD);
    expect(sheet.offsets.slice(0, 5)).toEqual([0, 96, 188, 248, 308]);
    expect(sheet.length).toBe(1544);
    sheet.offsets.forEach((offset, index) => expect(offset + sheet.lengths[index]!).toBe(sheet.offsets[index + 1] ?? sheet.length));
  });

  it('spans each letter from its band’s top to where the next band starts', () => {
    expect(sheet.letters).toEqual([
      { letter: 'A', row: 0, top: 4, end: 96 },
      { letter: 'B', row: 1, top: 96, end: 308 },
      { letter: 'C', row: 4, top: 308, end: 1540 },
    ]);
    // One person's span is their band and their row.
    expect(sheet.letters[0]!.end - sheet.letters[0]!.top).toBe(BAND + ROW_HEIGHT);
  });

  it('lands a letter at the list’s top, its band pinned under the head’s line at once', () => {
    const b = sheet.letters[1]!;
    expect(landing(b)).toBe(95);
    expect(pinnedAt(b.top, b.end, landing(b))).toBe(PIN);
    expect(letterAt(sheet.letters.map(span => span.top), landing(b))).toBe(1);
  });

  it('names the letter whose people are under the top, none above the first', () => {
    const tops = sheet.letters.map(span => span.top);
    expect(letterAt(tops, 0)).toBe(-1);
    expect(letterAt(tops, 3)).toBe(0);
    expect(letterAt(tops, 94)).toBe(0);
    expect(letterAt(tops, 95)).toBe(1);
    expect(letterAt(tops, 900)).toBe(2);
  });

  it('holds a letter’s band at the top while its people go under it, and the next band pushes it up', () => {
    const [a, b, c] = sheet.letters as [typeof sheet.letters[0], typeof sheet.letters[0], typeof sheet.letters[0]];
    // Over its first row, then held.
    expect(pinnedAt(c.top, c.end, 0)).toBe(308);
    expect(pinnedAt(c.top, c.end, 500)).toBe(PIN);
    // The sheet's end coming: up with its last row.
    expect(pinnedAt(c.top, c.end, 1520)).toBe(1540 - 1520 - BAND);
    // One person under a letter: held while they go under it, then pushed by the next band.
    expect(pinnedAt(a.top, a.end, 0)).toBe(a.top);
    expect(pinnedAt(a.top, a.end, 30)).toBe(PIN);
    expect(pinnedAt(a.top, a.end, 80)).toBe(a.end - 80 - BAND);
    // Two bands never overlap, whatever the scroll.
    for (let y = 0; y <= sheet.length; y += 3) {
      expect(pinnedAt(a.top, a.end, y) + BAND).toBeLessThanOrEqual(pinnedAt(b.top, b.end, y));
      expect(pinnedAt(b.top, b.end, y) + BAND).toBeLessThanOrEqual(pinnedAt(c.top, c.end, y));
    }
  });

  it('lays what a search finds on one sheet, without letters', () => {
    const found = layOutSheet([
      { id: 'x', letter: null },
      { id: 'y', letter: null },
    ]);
    expect(found.letters).toEqual([]);
    expect(found.rows.map(row => row.heading)).toEqual([null, null]);
    expect(found.length).toBe(2 * ROW_HEIGHT + 2 * SHEET_PAD);
    expect(layOutSheet([]).length).toBe(0);
  });

  it('draws a frame’s worth of paper at most, that never changes height as the list scrolls', () => {
    // A short sheet: all of it, where it lies.
    expect(paperAt(120, 300, 800)).toEqual({ y: 120, height: 300 });
    const span = 800 + 2 * PAPER_MARGIN;
    // A long one: following its top, standing still in its middle, following its foot.
    expect(paperAt(100, 5000, 800)).toEqual({ y: 100, height: span });
    expect(paperAt(-1000, 5000, 800)).toEqual({ y: -PAPER_MARGIN, height: span });
    expect(paperAt(-4500, 5000, 800)).toEqual({ y: 500 - span, height: span });
    // Whatever the scroll, the frame is covered wherever the sheet is.
    for (let top = 200; top >= -5200; top -= 37) {
      const at = paperAt(top, 5000, 800);
      expect(at.y).toBeLessThanOrEqual(Math.max(top, 0));
      expect(at.y + at.height).toBeGreaterThanOrEqual(Math.min(top + 5000, 800));
    }
  });
});
