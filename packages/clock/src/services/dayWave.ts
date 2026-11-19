/**
 * The world clocks' day wave (`design/waves.ts`): here and every city as a mark riding one wave of the
 * day, at the hour it is there (noon on the crest, midnight in the trough), lit as the sky is there.
 * Who is up and who sleeps, read at a glance; slid on the ruler, they all ride along. The names stand
 * over their marks, lifted a row where two would touch, so both clients lay them out alike.
 */
import { zoneCityName, daylight, wallIn, type Daylight } from './worldClocks';
import type { WorldClock } from '../models/worldClock';
import { dayShare, dayWaveY } from '@unlease/design/waves';

export interface WaveMark {
  readonly key: string;
  readonly name: string;
  /** The share of the day it is there (0 midnight, 0.5 noon). */
  readonly share: number;
  readonly light: Daylight;
  /** This device's own place. */
  readonly here: boolean;
}

/** Here first, then each city, at a moment. */
export function waveMarks(clocks: readonly Pick<WorldClock, 'id' | 'zone' | 'name' | 'lat' | 'lon'>[], at: number, hereZone: string): WaveMark[] {
  return [
    { key: 'here', name: zoneCityName(hereZone), share: dayShare(wallIn('', at)), light: daylight({ zone: '', lat: null, lon: null }, at), here: true },
    ...clocks.map(clock => ({ key: clock.id, name: clock.name, share: dayShare(wallIn(clock.zone, at)), light: daylight(clock, at), here: false })),
  ];
}

export interface WaveGeometry {
  readonly width: number;
  /** The horizon, from the top. */
  readonly middle: number;
  readonly amplitude: number;
  /** A name's height, and the room between two names. */
  readonly line: number;
  /** About how wide a character of a name is drawn. */
  readonly charWidth: number;
}

export interface PlacedMark extends WaveMark {
  readonly x: number;
  readonly y: number;
  /** The name's centre and baseline box: its middle across, its top. */
  readonly labelX: number;
  readonly labelTop: number;
  readonly labelWidth: number;
}

/** Most rows a name is lifted before it is left where it lands. */
const ROWS = 3;

/** Where each mark and its name go: a name over its mark, a row higher while it would touch one already placed. */
export function placeMarks(marks: readonly WaveMark[], geometry: WaveGeometry): PlacedMark[] {
  const { width, middle, amplitude, line, charWidth } = geometry;
  const boxes: { left: number; right: number; top: number; bottom: number }[] = [];
  const placed: PlacedMark[] = [];
  // Here first, so it keeps the row next to its mark; then west to east on the wave.
  const order = [...marks].sort((a, b) => Number(b.here) - Number(a.here) || a.share - b.share);
  for (const mark of order) {
    const x = mark.share * width;
    const y = dayWaveY(mark.share, middle, amplitude);
    const labelWidth = Math.min(width, Math.ceil(mark.name.length * charWidth) + 8);
    const labelX = Math.min(width - labelWidth / 2, Math.max(labelWidth / 2, x));
    let top = y - 12 - line;
    for (let row = 0; row < ROWS; row += 1) {
      const box = { left: labelX - labelWidth / 2, right: labelX + labelWidth / 2, top: y - 12 - line * (row + 1) - 2 * row, bottom: y - 12 - line * row - 2 * row };
      top = box.top;
      if (!boxes.some(other => box.left < other.right + 4 && other.left < box.right + 4 && box.top < other.bottom && other.top < box.bottom)) break;
    }
    boxes.push({ left: labelX - labelWidth / 2, right: labelX + labelWidth / 2, top, bottom: top + line });
    placed.push({ ...mark, x, y, labelX, labelTop: top, labelWidth });
  }
  return placed;
}
