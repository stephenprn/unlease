/**
 * The watermark laid over a copy sent to someone (as the French government's « Filigrane Facile »
 * does): whom the copy is for, what for, and when, repeated in diagonal rows over the whole picture,
 * so a copy cannot be passed off as sent to another or reused for another purpose.
 *
 * Pure geometry: the web (a canvas) and the phone draw the same rows from the same numbers. The
 * colour and opacity are each client's (the design system's ink at about a third).
 */
import { t } from '@unlease/core/i18n';
import { formatIsoDay } from '@unlease/core/services/format';

export interface WatermarkWords {
  /** Whom the copy is for: a landlord, an agency. */
  readonly recipient?: string;
  /** What for: « dossier de location ». */
  readonly purpose?: string;
  /** The day it is sent, `2026-11-18` (written as typed when it is not one). */
  readonly date: string;
}

/** Each part on one line, at most so long: the watermark must stay one line across a page. */
const PART_LIMIT = 80;
const tidy = (text: string | undefined): string => [...(text ?? '').replace(/\s+/g, ' ').trim()].slice(0, PART_LIMIT).join('');

/** The watermark's line: « Copie destinée à Agence Martin – dossier de location – 18 nov. 2026 ». */
export function watermarkText(words: WatermarkWords): string {
  const recipient = tidy(words.recipient);
  const purpose = tidy(words.purpose);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(words.date.trim()) ? formatIsoDay(words.date.trim()) : tidy(words.date);
  if (recipient && purpose) return t('Copy for {recipient} – {purpose} – {date}', { recipient, purpose, date });
  if (recipient) return t('Copy for {recipient} – {date}', { recipient, date });
  if (purpose) return t('Copy – {purpose} – {date}', { purpose, date });
  return t('Copy – {date}', { date });
}

export interface WatermarkOptions {
  /** The letters' size in the image's pixels; by default a 28th of its diagonal. */
  readonly fontSize?: number;
  /** The rows' angle in degrees, clockwise on screen (y downwards); by default -30: rising to the right. */
  readonly angleDeg?: number;
  /** A letter's mean advance as a share of the font size (Signika's is about 0.52); 0.55 errs long. */
  readonly charWidth?: number;
}

export interface WatermarkLine {
  /** Where the line's baseline starts, in the image's pixels (from its top left). */
  readonly x: number;
  readonly y: number;
  readonly text: string;
}

export interface WatermarkLayout {
  /** In degrees, clockwise on screen: each line is drawn from its start, turned by this. */
  readonly angle: number;
  readonly fontSize: number;
  readonly lines: readonly WatermarkLine[];
}

/** Between two repeats: two em spaces, as wide as two letters' height in any font. */
const GAP = '  ';
const GAP_EM = 2;
/** From one row to the next, in font sizes. */
const ROW_EM = 3;

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * The rows covering a `width` × `height` picture: each starts left of the picture and runs past it,
 * a row every three font sizes, every other one shifted by half a repeat (like bricks), so the
 * words never line up in columns. Each line is drawn with its baseline at (x, y), turned by `angle`
 * about that point: on a canvas `translate(x, y); rotate(angle * π / 180); fillText(text, 0, 0)`.
 * Numbers are rounded to hundredths, so every engine gives the same.
 */
export function watermarkLayout(width: number, height: number, text: string, options: WatermarkOptions = {}): WatermarkLayout {
  const angle = options.angleDeg ?? -30;
  const fontSize = round(Math.max(1, options.fontSize ?? Math.hypot(width, height) / 28));
  const charWidth = options.charWidth ?? 0.55;
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const words = text.trim() || ' ';
  // One repeat's length along the row, the gap included.
  const unit = [...words].length * charWidth * fontSize + GAP_EM * fontSize;
  const rowGap = ROW_EM * fontSize;
  // The picture's half extent in the turned frame (u along the rows, v across them), about its centre.
  const halfU = (width * Math.abs(cos) + height * Math.abs(sin)) / 2;
  const halfV = (width * Math.abs(sin) + height * Math.abs(cos)) / 2;
  const cx = width / 2;
  const cy = height / 2;
  // Rows a whole row past each edge across, so a baseline's band covers the edges too.
  const rows = Math.ceil(halfV / rowGap) + 1;
  // Repeats from a whole one before the left edge (and half more for a shifted row) to past the right.
  const repeats = Math.ceil((2 * halfU) / unit) + 3;
  const line = Array.from({ length: repeats }, () => words).join(GAP);
  const lines: WatermarkLine[] = [];
  for (let row = -rows; row <= rows; row++) {
    const v = row * rowGap;
    const u = -halfU - unit - (Math.abs(row) % 2 === 1 ? unit / 2 : 0);
    lines.push({ x: round(cx + u * cos - v * sin), y: round(cy + u * sin + v * cos), text: line });
  }
  return { angle, fontSize, lines };
}
