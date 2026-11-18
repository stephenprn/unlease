/**
 * A day as a person types it on a phone's number pad: « 12/03/2031 », « 12.03.31 », « 12 3 2031 »,
 * « 2031-03-12 », day first as France writes it (a two-figure year in this century, or the last one
 * for a birth date). Shown back as « 12/03/2031 ».
 */
import { DAY_PATTERN } from '@unlease/calendar/models/events';

export function readDay(typed: string, past = false): string | null {
  const text = typed.trim();
  if (!text) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const parts = iso ? [iso[3]!, iso[2]!, iso[1]!] : text.split(/[\s./-]+/);
  if (parts.length !== 3 || parts.some(part => !/^\d+$/.test(part))) return null;
  const [d, m, y] = parts.map(Number) as [number, number, number];
  let year = y;
  if (parts[2]!.length === 2) {
    const now = new Date().getUTCFullYear() % 100;
    year = past && y > now ? 1900 + y : 2000 + y;
  } else if (parts[2]!.length !== 4) return null;
  const day = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (!DAY_PATTERN.test(day)) return null;
  const date = new Date(`${day}T00:00:00Z`);
  return date.getUTCMonth() + 1 === m && date.getUTCDate() === d ? day : null;
}

/** « 12/03/2031 », as a field shows a stored day. */
export const typedDay = (day: string | null): string => (day ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : '');
