/**
 * An event typed in a few words (« Dîner chez Paul jeudi 20h », "Lunch with Sam at Pizzeria tomorrow
 * 1pm", « Congrès du 12 au 14 mars à Lyon »), read on the device in French and English: the day (a
 * relative word, a weekday, a date spelled or in numbers, a span « du 12 au 14 »), the time or the
 * hours (« 20h », « de 14h à 16h », "2-4pm"), a length (« pendant 2h »), a place (« à Lyon », "at
 * Pizzeria", « @ Le Louvre »), and what is left is the title. Nothing found: Claude may read it
 * (`POST /api/calendar/parse`) when the server has a key.
 */
import { foldText } from '@unlease/core/services/search';
import { validDay } from '@unlease/core/services/richText';
import type { Day } from '../models/events';
import { addDays, addMinutes, dayKey, partsOf, weekdayOf } from './time';

export interface QuickDraft {
  readonly title: string;
  /** A day (all day) or a time of day, in this device's zone. */
  readonly start: string;
  readonly end: string;
  readonly place: string;
  /** What was understood: a day, a time. */
  readonly foundDay: boolean;
  readonly foundTime: boolean;
}

const MONTHS: readonly (readonly string[])[] = [
  ['janvier', 'janv', 'january', 'jan'],
  ['fevrier', 'fevr', 'fev', 'february', 'feb'],
  ['mars', 'march', 'mar'],
  ['avril', 'avr', 'april', 'apr'],
  ['mai', 'may'],
  ['juin', 'june', 'jun'],
  ['juillet', 'juil', 'july', 'jul'],
  ['aout', 'august', 'aug'],
  ['septembre', 'sept', 'september', 'sep'],
  ['octobre', 'october', 'oct'],
  ['novembre', 'november', 'nov'],
  ['decembre', 'december', 'dec'],
];
/** Spelled out only: « sam », "mon", « mer » are names and words too. */
const WEEKDAYS: readonly (readonly string[])[] = [
  ['dimanche', 'sunday'],
  ['lundi', 'monday'],
  ['mardi', 'tuesday'],
  ['mercredi', 'wednesday'],
  ['jeudi', 'thursday'],
  ['vendredi', 'friday'],
  ['samedi', 'saturday'],
];
const MONTH_WORD = MONTHS.flat().sort((a, b) => b.length - a.length).join('|');
const WEEKDAY_WORD = WEEKDAYS.flat().sort((a, b) => b.length - a.length).join('|');
const monthOf = (word: string): number => MONTHS.findIndex(names => names.includes(word.replace(/\.$/, ''))) + 1;
const weekdayIndex = (word: string): number => WEEKDAYS.findIndex(names => names.includes(word));

/** Lowercase without accents, one character for one, so positions still point into what was typed. */
function fold(value: string): string {
  let out = '';
  for (const char of value) {
    const folded = foldText(char);
    out += folded.length === char.length ? folded : char.length === 1 ? (folded[0] ?? char) : folded.padEnd(char.length, ' ').slice(0, char.length);
  }
  return out.replace(/’/g, "'");
}

interface Found {
  readonly from: number;
  readonly to: number;
}

const pad = (value: number): string => String(value).padStart(2, '0');

function clock(hourText: string, minuteText: string | undefined, meridiem: string | undefined): string | null {
  let hour = Number(hourText);
  const minute = minuteText ? Number(minuteText) : 0;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === 'pm' ? 12 : 0);
  }
  return hour <= 23 && minute <= 59 ? `${pad(hour)}:${pad(minute)}` : null;
}

/** The year a day typed without one lands in: this one, or next year's once this year's is more than a month gone. */
function withYear(today: Day, month: number, day: number): Day | null {
  const year = partsOf(today).year;
  const thisYear = validDay(year, month, day);
  if (thisYear && thisYear >= addDays(today, -31)) return thisYear;
  return validDay(year + 1, month, day) ?? thisYear;
}

/** Reads what was typed; `today` and `now` on this device, `length` the default length of a timed event in minutes. */
export function readQuickAdd(typed: string, today: Day, length = 60): QuickDraft {
  const text = typed.replace(/\s+/g, ' ').trim();
  const lower = fold(text);
  const taken: Found[] = [];
  const free = (from: number, to: number): boolean => taken.every(range => to <= range.from || from >= range.to);
  const find = (pattern: RegExp): RegExpExecArray | null => {
    const regex = new RegExp(pattern.source, 'g');
    for (let match = regex.exec(lower); match; match = regex.exec(lower)) {
      if (free(match.index, match.index + match[0].length)) return match;
      if (match[0].length === 0) regex.lastIndex += 1;
    }
    return null;
  };
  const take = (match: RegExpExecArray): void => {
    taken.push({ from: match.index, to: match.index + match[0].length });
  };

  let day: Day | null = null;
  let lastDay: Day | null = null;
  let startClock: string | null = null;
  let endClock: string | null = null;
  let minutes: number | null = null;
  let allDay = false;

  // A span of days: « du 12 au 14 mars », "from March 12 to 14", « 12-14 mars ».
  const span = find(new RegExp(`(?:^|\\s)(?:du |from )?(\\d{1,2})(?:er)?\\s*(?:au|-|–|to)\\s*(\\d{1,2})\\s+(${MONTH_WORD})\\.?(?:\\s+(\\d{4}))?(?=\\s|$|,)`));
  if (span) {
    const month = monthOf(span[3]!);
    const first = span[4] ? validDay(Number(span[4]), month, Number(span[1])) : withYear(today, month, Number(span[1]));
    const last = first ? validDay(partsOf(first).year, month, Number(span[2])) : null;
    if (first && last && last >= first) {
      day = first;
      lastDay = last;
      take(span);
    }
  }
  // Hours: « de 14h à 16h », « 14h-16h », "2-4pm", "from 2pm to 4pm".
  const hours = find(/(?:^|\s)(?:de |from |entre )?(\d{1,2})(?:[:h](\d{2}))?\s*(am|pm|h)?\s*(?:-|–|à|a|to|et|until|jusqu'a)\s*(\d{1,2})(?:[:h](\d{2}))?\s*(am|pm|h)?(?=\s|$|,)/);
  if (hours && (hours[3] || hours[6] || hours[2] || hours[5])) {
    const meridiemEnd = hours[6] === 'am' || hours[6] === 'pm' ? hours[6] : undefined;
    const meridiemStart = hours[3] === 'am' || hours[3] === 'pm' ? hours[3] : meridiemEnd;
    const a = clock(hours[1]!, hours[2], meridiemStart);
    const b = clock(hours[4]!, hours[5], meridiemEnd);
    if (a && b) {
      startClock = a;
      endClock = b;
      take(hours);
    }
  }
  if (!startClock) {
    const single = find(/(?:^|\s)(?:a |à |at |vers |around |@ ?)?(?:(\d{1,2})h(\d{2})?|(\d{1,2}):(\d{2})\s*(am|pm)?|(\d{1,2})\s*(am|pm))(?=\s|$|,)/);
    if (single) {
      const value = single[1] ? clock(single[1], single[2], undefined) : single[3] ? clock(single[3], single[4], single[5]) : clock(single[6]!, undefined, single[7]);
      if (value) {
        startClock = value;
        take(single);
      }
    } else {
      const named = find(/(?:^|\s)(?:a |à |at )?(midi|noon|minuit|midnight)(?=\s|$|,)/);
      if (named) {
        startClock = named[1] === 'midi' || named[1] === 'noon' ? '12:00' : '00:00';
        take(named);
      }
    }
  }
  const lasting = find(/(?:^|\s)(?:pendant|pour|for|durant)\s+(\d+)\s*(?:h|heures?|hours?|hrs?)(?:\s*(\d{1,2}))?|(?:^|\s)(?:pendant|pour|for|durant)\s+(\d+)\s*(?:min|minutes?|mins?)(?=\s|$|,)/);
  if (lasting) {
    minutes = lasting[1] ? Number(lasting[1]) * 60 + Number(lasting[2] ?? 0) : Number(lasting[3]);
    take(lasting);
  }
  const whole = find(/(?:^|\s)(toute la journee|all day|all-day|journee entiere)(?=\s|$|,)/);
  if (whole) {
    allDay = true;
    take(whole);
  }
  if (!day) {
    const relative = find(/(?:^|\s)(aujourd'hui|aujourdhui|today|ce soir|tonight|apres-demain|apres demain|demain|tomorrow|day after tomorrow)(?=\s|$|,)/);
    if (relative) {
      const word = relative[1]!;
      day = word.startsWith('apres') || word === 'day after tomorrow' ? addDays(today, 2) : word === 'demain' || word === 'tomorrow' ? addDays(today, 1) : today;
      if ((word === 'ce soir' || word === 'tonight') && !startClock) startClock = '20:00';
      take(relative);
    }
  }
  if (!day) {
    const inDays = find(/(?:^|\s)(?:dans|in)\s+(\d{1,3})\s+(?:jours?|days?)(?=\s|$|,)/);
    if (inDays) {
      day = addDays(today, Number(inDays[1]));
      take(inDays);
    }
  }
  if (!day) {
    const spelled = find(new RegExp(`(?:^|\\s)(?:le |on )?(?:(?:${WEEKDAY_WORD})\\.? )?(\\d{1,2})(?:er|st|nd|rd|th)?\\s+(${MONTH_WORD})\\.?(?:\\s+(\\d{4}))?(?=\\s|$|,)`));
    const monthFirst = spelled ? null : find(new RegExp(`(?:^|\\s)(?:on )?(${MONTH_WORD})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?=\\s|$|,)`));
    if (spelled) {
      const value = spelled[3] ? validDay(Number(spelled[3]), monthOf(spelled[2]!), Number(spelled[1])) : withYear(today, monthOf(spelled[2]!), Number(spelled[1]));
      if (value) {
        day = value;
        take(spelled);
      }
    } else if (monthFirst) {
      const value = monthFirst[3] ? validDay(Number(monthFirst[3]), monthOf(monthFirst[1]!), Number(monthFirst[2])) : withYear(today, monthOf(monthFirst[1]!), Number(monthFirst[2]));
      if (value) {
        day = value;
        take(monthFirst);
      }
    }
  }
  if (!day) {
    const numeric = find(/(?:^|\s)(?:le |on )?(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}|\d{2}))?(?=\s|$|,)/);
    if (numeric) {
      const year = numeric[3] ? Number(numeric[3]) + (numeric[3].length === 2 ? 2000 : 0) : null;
      const value = year !== null ? validDay(year, Number(numeric[2]), Number(numeric[1])) : withYear(today, Number(numeric[2]), Number(numeric[1]));
      if (value) {
        day = value;
        take(numeric);
      }
    }
  }
  if (!day) {
    const weekday = find(new RegExp(`(?:^|\\s)(?:ce |this |next |le )?(${WEEKDAY_WORD})\\.?(?: (prochain|next))?(?=\\s|$|,)`));
    if (weekday) {
      const index = weekdayIndex(weekday[1]!);
      // « lundi », « lundi prochain », "next Monday": the coming one, never today.
      day = addDays(today, (index - weekdayOf(today) + 7) % 7 || 7);
      take(weekday);
    }
  }
  if (!day) {
    const nextWeek = find(/(?:^|\s)(la semaine prochaine|next week)(?=\s|$|,)/);
    if (nextWeek) {
      day = addDays(today, 7 - ((weekdayOf(today) + 6) % 7));
      take(nextWeek);
    }
  }
  // A place: « à Lyon », "at Pizzeria", « au Louvre », « @ Le Bistrot », written with a capital.
  let place = '';
  const placeMatch = (() => {
    const regex = /(?:^|\s)(?:à|a|at|au|aux|@)\s+((?:[A-ZÀ-ÖØ-Þ0-9][\w'’À-ÿ-]*)(?:\s+(?:de|du|des|la|le|les|of|the|d'|l')?\s*[A-ZÀ-ÖØ-Þ0-9][\w'’À-ÿ-]*)*)/g;
    for (let match = regex.exec(text); match; match = regex.exec(text)) if (free(match.index, match.index + match[0].length)) return match;
    return null;
  })();
  if (placeMatch) {
    place = placeMatch[1]!.trim();
    taken.push({ from: placeMatch.index, to: placeMatch.index + placeMatch[0].length });
  }

  const kept = [...text].map((char, index) => (taken.some(range => index >= range.from && index < range.to) ? ' ' : char)).join('');
  const title = kept.replace(/\s+/g, ' ').replace(/\s+([,.;])/g, '$1').replace(/^[\s,;:-]+|[\s,;:-]+$/g, '').trim();

  const foundDay = day !== null;
  const foundTime = startClock !== null && !allDay;
  const first = day ?? today;
  if (!foundTime) {
    const last = lastDay ?? first;
    return { title, start: first, end: addDays(last, 1), place, foundDay, foundTime: false };
  }
  const start = `${first}T${startClock}`;
  let end: string;
  if (endClock) {
    end = `${first}T${endClock}`;
    if (end <= start) end = `${addDays(first, 1)}T${endClock}`;
  } else end = addMinutes(start, minutes ?? length);
  if (lastDay) end = `${lastDay}T${end.slice(11)}`;
  return { title, start, end, place, foundDay, foundTime };
}

/** A day of this device's calendar from parts (for tests and the forms). */
export const quickDay = (year: number, month: number, day: number): Day => dayKey(year, month, day);
