/**
 * Repeating events, as iCalendar writes them (RFC 5545's RRULE: `FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH`):
 * read, written back, expanded into occurrences, said in words, and offered as the editor's choices.
 *
 * Expanded: DAILY, WEEKLY, MONTHLY and YEARLY with INTERVAL, COUNT, UNTIL, BYDAY (with its ordinals,
 * « le 2e mardi », « le dernier vendredi »), BYMONTHDAY (from the end too), BYMONTH, BYSETPOS and
 * WKST: what Google, Apple and Outlook write. A rule with parts this build does not expand (BYWEEKNO,
 * BYYEARDAY, an hourly rule) is kept as it is, and only its first occurrence shows.
 */
import { localized, t, tx } from '@unlease/core/i18n';
import { formatIsoDay, monthNames, weekdayNames } from '@unlease/core/services/format';
import { addDays, addMonths, civilMinutes, daysBetween, daysInMonth, dayKey, instantToWall, isDay, partsOf, startOfWeek, wallToInstant, weekdayOf } from './time';

export const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

export interface WeekdayRule {
  /** 0 Sunday to 6 Saturday. */
  readonly weekday: number;
  /** Which of the month's (or year's) such days: 1 the first, -1 the last; 0 every one. */
  readonly nth: number;
}

/** When a rule stops: on a day, at an instant (UNTIL in UTC), or at a time of day in the event's zone. */
export type Until = { readonly kind: 'day'; readonly day: string } | { readonly kind: 'instant'; readonly at: number } | { readonly kind: 'wall'; readonly wall: string };

export interface Rule {
  readonly freq: Frequency;
  readonly interval: number;
  readonly count: number | null;
  readonly until: Until | null;
  readonly byDay: readonly WeekdayRule[];
  readonly byMonthDay: readonly number[];
  readonly byMonth: readonly number[];
  readonly bySetPos: readonly number[];
  /** 0 Sunday to 6 Saturday; Monday unless the rule says. */
  readonly weekStart: number;
  /** Parts kept as they came (BYHOUR, X-…), written back unchanged. */
  readonly extra: readonly string[];
  /** Parts this build cannot expand: only the first occurrence shows. */
  readonly partial: boolean;
}

const pad = (value: number, size = 2): string => String(value).padStart(size, '0');

function readUntil(value: string): Until | null {
  const day = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (day) return { kind: 'day', day: `${day[1]}-${day[2]}-${day[3]}` };
  const time = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!time) return null;
  if (time[7]) return { kind: 'instant', at: Date.UTC(Number(time[1]), Number(time[2]) - 1, Number(time[3]), Number(time[4]), Number(time[5]), Number(time[6])) };
  return { kind: 'wall', wall: `${time[1]}-${time[2]}-${time[3]}T${time[4]}:${time[5]}` };
}

function writeUntil(until: Until): string {
  switch (until.kind) {
    case 'day':
      return until.day.replace(/-/g, '');
    case 'wall':
      return `${until.wall.replace(/[-:]/g, '')}00`;
    case 'instant': {
      const date = new Date(until.at);
      return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
    }
  }
}

const numbers = (value: string, min: number, max: number): number[] | null => {
  const list = value.split(',').map(part => Number(part.trim()));
  return list.every(number => Number.isInteger(number) && number !== 0 && Math.abs(number) >= min && Math.abs(number) <= max) ? list : null;
};

/** An RRULE's value (with or without `RRULE:`), or null when it names no frequency this build knows. */
export function parseRule(text: string): Rule | null {
  const body = text.trim().replace(/^RRULE:/i, '');
  if (!body) return null;
  let freq: Frequency | null = null;
  let interval = 1;
  let count: number | null = null;
  let until: Until | null = null;
  let byDay: WeekdayRule[] = [];
  let byMonthDay: number[] = [];
  let byMonth: number[] = [];
  let bySetPos: number[] = [];
  let weekStart = 1;
  const extra: string[] = [];
  let partial = false;
  for (const part of body.split(';')) {
    const at = part.indexOf('=');
    if (at <= 0) continue;
    const key = part.slice(0, at).trim().toUpperCase();
    const value = part.slice(at + 1).trim().toUpperCase();
    switch (key) {
      case 'FREQ':
        if ((FREQUENCIES as readonly string[]).includes(value)) freq = value as Frequency;
        else return null;
        break;
      case 'INTERVAL': {
        const number = Number(value);
        if (Number.isInteger(number) && number >= 1 && number <= 1000) interval = number;
        break;
      }
      case 'COUNT': {
        const number = Number(value);
        if (Number.isInteger(number) && number >= 1) count = Math.min(number, 100_000);
        break;
      }
      case 'UNTIL':
        until = readUntil(value);
        break;
      case 'BYDAY': {
        const days: WeekdayRule[] = [];
        for (const item of value.split(',')) {
          const match = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(item.trim());
          if (!match) continue;
          days.push({ weekday: WEEKDAY_CODES.indexOf(match[2] as (typeof WEEKDAY_CODES)[number]), nth: match[1] ? Number(match[1]) : 0 });
        }
        byDay = days;
        break;
      }
      case 'BYMONTHDAY':
        byMonthDay = numbers(value, 1, 31) ?? [];
        break;
      case 'BYMONTH':
        byMonth = numbers(value, 1, 12)?.filter(month => month > 0) ?? [];
        break;
      case 'BYSETPOS':
        bySetPos = numbers(value, 1, 366) ?? [];
        break;
      case 'WKST': {
        const index = WEEKDAY_CODES.indexOf(value as (typeof WEEKDAY_CODES)[number]);
        if (index >= 0) weekStart = index;
        break;
      }
      default:
        extra.push(`${key}=${part.slice(at + 1).trim()}`);
        if (key === 'BYWEEKNO' || key === 'BYYEARDAY' || key === 'BYHOUR' || key === 'BYMINUTE' || key === 'BYSECOND') partial = true;
    }
  }
  if (!freq) return null;
  return { freq, interval, count, until, byDay, byMonthDay, byMonth, bySetPos, weekStart, extra, partial };
}

/** A rule as RRULE's value, its parts in a fixed order. */
export function serializeRule(rule: Rule): string {
  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.byDay.length > 0) parts.push(`BYDAY=${rule.byDay.map(day => `${day.nth || ''}${WEEKDAY_CODES[day.weekday]}`).join(',')}`);
  if (rule.byMonthDay.length > 0) parts.push(`BYMONTHDAY=${rule.byMonthDay.join(',')}`);
  if (rule.byMonth.length > 0) parts.push(`BYMONTH=${rule.byMonth.join(',')}`);
  if (rule.bySetPos.length > 0) parts.push(`BYSETPOS=${rule.bySetPos.join(',')}`);
  if (rule.weekStart !== 1) parts.push(`WKST=${WEEKDAY_CODES[rule.weekStart]}`);
  if (rule.count !== null) parts.push(`COUNT=${rule.count}`);
  else if (rule.until) parts.push(`UNTIL=${writeUntil(rule.until)}`);
  return [...parts, ...rule.extra].join(';');
}

/** A rule with its parts set to these (the editor's). */
export function makeRule(parts: Partial<Rule> & { readonly freq: Frequency }): Rule {
  return { interval: 1, count: null, until: null, byDay: [], byMonthDay: [], byMonth: [], bySetPos: [], weekStart: 1, extra: [], partial: false, ...parts };
}

// ── expansion ──────────────────────────────────────────────────────────────

/** The days of a month that are this weekday, in order. */
function weekdaysOfMonth(year: number, month: number, weekday: number): string[] {
  const first = dayKey(year, month, 1);
  const offset = (weekday - weekdayOf(first) + 7) % 7;
  const out: string[] = [];
  for (let day = 1 + offset; day <= daysInMonth(year, month); day += 7) out.push(dayKey(year, month, day));
  return out;
}

function weekdaysOfYear(year: number, weekday: number): string[] {
  const out: string[] = [];
  for (let month = 1; month <= 12; month += 1) out.push(...weekdaysOfMonth(year, month, weekday));
  return out;
}

function pick<T>(list: readonly T[], nth: number): T[] {
  if (nth === 0) return [...list];
  const item = nth > 0 ? list[nth - 1] : list[list.length + nth];
  return item === undefined ? [] : [item];
}

function monthDays(year: number, month: number, days: readonly number[]): string[] {
  const length = daysInMonth(year, month);
  return days.map(day => (day > 0 ? day : length + day + 1)).filter(day => day >= 1 && day <= length).map(day => dayKey(year, month, day));
}

function byDayInMonth(rule: Rule, year: number, month: number): string[] {
  return rule.byDay.flatMap(day => pick(weekdaysOfMonth(year, month, day.weekday), day.nth));
}

/** A period's candidate days, before BYSETPOS. */
function candidates(rule: Rule, period: string, startDay: string): string[] {
  const start = partsOf(startDay);
  const p = partsOf(period);
  const monthOk = (day: string): boolean => rule.byMonth.length === 0 || rule.byMonth.includes(partsOf(day).month);
  const weekdayOk = (day: string): boolean => rule.byDay.length === 0 || rule.byDay.some(entry => entry.weekday === weekdayOf(day));
  const monthDayOk = (day: string): boolean => rule.byMonthDay.length === 0 || monthDays(partsOf(day).year, partsOf(day).month, rule.byMonthDay).includes(day);
  switch (rule.freq) {
    case 'DAILY':
      return [period].filter(day => monthOk(day) && weekdayOk(day) && monthDayOk(day));
    case 'WEEKLY': {
      const days = Array.from({ length: 7 }, (_, index) => addDays(period, index));
      const wanted = rule.byDay.length > 0 ? rule.byDay.map(day => day.weekday) : [weekdayOf(startDay)];
      return days.filter(day => wanted.includes(weekdayOf(day)) && monthOk(day));
    }
    case 'MONTHLY': {
      if (!monthOk(period)) return [];
      if (rule.byMonthDay.length > 0 && rule.byDay.length > 0) return monthDays(p.year, p.month, rule.byMonthDay).filter(weekdayOk);
      if (rule.byMonthDay.length > 0) return monthDays(p.year, p.month, rule.byMonthDay);
      if (rule.byDay.length > 0) return byDayInMonth(rule, p.year, p.month);
      return monthDays(p.year, p.month, [start.day]).filter(day => partsOf(day).day === start.day);
    }
    case 'YEARLY': {
      const months = rule.byMonth.length > 0 ? rule.byMonth : null;
      if (rule.byMonthDay.length > 0) {
        const days = (months ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).flatMap(month => monthDays(p.year, month, rule.byMonthDay));
        return rule.byDay.length > 0 ? days.filter(weekdayOk) : days;
      }
      if (rule.byDay.length > 0) {
        if (months) return months.flatMap(month => byDayInMonth(rule, p.year, month));
        return rule.byDay.flatMap(day => pick(weekdaysOfYear(p.year, day.weekday), day.nth));
      }
      return (months ?? [start.month]).flatMap(month => monthDays(p.year, month, [start.day]).filter(day => partsOf(day).day === start.day));
    }
  }
}

function applySetPos(days: string[], setPos: readonly number[]): string[] {
  if (setPos.length === 0) return days;
  return [...new Set(setPos.flatMap(position => pick(days, position)))].sort();
}

/** The first day of the `index`th period after the start's. */
function periodStart(rule: Rule, startDay: string, index: number): string {
  const step = index * rule.interval;
  switch (rule.freq) {
    case 'DAILY':
      return addDays(startDay, step);
    case 'WEEKLY':
      return addDays(startOfWeek(startDay, rule.weekStart), step * 7);
    case 'MONTHLY':
      return addMonths(`${startDay.slice(0, 7)}-01`, step);
    case 'YEARLY':
      return `${String(Number(startDay.slice(0, 4)) + step).padStart(4, '0')}-01-01`;
  }
}

/** How many whole periods lie between the start's and `day`'s: where a search far from the start may begin. */
function periodsBefore(rule: Rule, startDay: string, day: string): number {
  const s = partsOf(startDay);
  const d = partsOf(day);
  let span: number;
  switch (rule.freq) {
    case 'DAILY':
      span = daysBetween(startDay, day);
      break;
    case 'WEEKLY':
      span = Math.floor(daysBetween(startOfWeek(startDay, rule.weekStart), day) / 7);
      break;
    case 'MONTHLY':
      span = (d.year - s.year) * 12 + (d.month - s.month);
      break;
    case 'YEARLY':
      span = d.year - s.year;
      break;
  }
  return Math.max(0, Math.floor(span / rule.interval) - 1);
}

export interface Expansion {
  /** Occurrences' starts, in the start's form (`2026-11-02` or `2026-11-02T14:30`), sorted. */
  readonly starts: readonly string[];
  /** More than the limit were there: the caller asked too wide a window. */
  readonly cut: boolean;
}

/**
 * The occurrences of a rule from `start` (its DTSTART, which always counts as the first) whose start
 * lies in [from, to), both a day or a time of day in the event's zone. `zone` reads an UNTIL given
 * in UTC.
 */
export function expandRule(rule: Rule, start: string, zone: string, from: string, to: string, limit = 2000): Expansion {
  const startDay = start.slice(0, 10);
  const time = isDay(start) ? '' : start.slice(10);
  const fromKey = civilMinutes(from);
  const toKey = civilMinutes(to);
  const out: string[] = [];
  const passed = (occurrence: string): boolean => {
    const until = rule.until;
    if (!until) return false;
    switch (until.kind) {
      case 'day':
        return occurrence.slice(0, 10) > until.day;
      case 'wall':
        return isDay(occurrence) ? occurrence > until.wall.slice(0, 10) : occurrence > until.wall;
      case 'instant':
        return wallToInstant(occurrence, zone) > until.at;
    }
  };
  const take = (occurrence: string): boolean => {
    const key = civilMinutes(occurrence);
    if (key >= fromKey && key < toKey) {
      if (out.length >= limit) return false;
      out.push(occurrence);
    }
    return true;
  };
  if (rule.partial) {
    take(start);
    return { starts: out, cut: false };
  }
  // DTSTART is the first occurrence even when the rule would not give it.
  take(start);
  let counted = 1;
  if (rule.count !== null && counted >= rule.count) return { starts: out, cut: false };
  const first = rule.count === null ? periodsBefore(rule, startDay, from.slice(0, 10)) : 0;
  for (let index = first; index < first + 200_000; index += 1) {
    const period = periodStart(rule, startDay, index);
    if (civilMinutes(period) >= toKey && rule.count === null) break;
    if (period.slice(0, 4) > '9999') break;
    const days = applySetPos([...new Set(candidates(rule, period, startDay))].sort(), rule.bySetPos);
    for (const day of days) {
      const occurrence = `${day}${time}`;
      if (occurrence <= start) continue;
      if (passed(occurrence)) return { starts: out, cut: false };
      if (civilMinutes(occurrence) >= toKey) return { starts: out, cut: false };
      if (!take(occurrence)) return { starts: out, cut: true };
      counted += 1;
      if (rule.count !== null && counted >= rule.count) return { starts: out, cut: false };
    }
  }
  return { starts: out, cut: false };
}

/** Whether a rule's occurrences have an end (a count or a last day). */
export const ruleEnds = (rule: Rule): boolean => rule.count !== null || rule.until !== null;

/** The rule stopped just before an occurrence (« cette occurrence et les suivantes » keeps the earlier ones). */
export function ruleUntilBefore(rule: Rule, occurrence: string, zone: string): Rule {
  const until: Until = isDay(occurrence) ? { kind: 'day', day: addDays(occurrence, -1) } : { kind: 'instant', at: wallToInstant(occurrence, zone) - 1000 };
  return { ...rule, count: null, until };
}

// ── words ──────────────────────────────────────────────────────────────────

const ORDINALS: Readonly<Record<string, string>> = localized({
  '1': tx('first'),
  '2': tx('second'),
  '3': tx('third'),
  '4': tx('fourth'),
  '5': tx('fifth'),
  '-1': tx('last'),
  '-2': tx('second-to-last'),
});

const ordinal = (nth: number): string => ORDINALS[String(nth)] ?? String(nth);

function weekdayList(days: readonly WeekdayRule[]): string {
  const names = weekdayNames();
  const sorted = [...days].sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7));
  const words = sorted.map(day => (day.nth ? t('the {nth} {weekday}', { nth: ordinal(day.nth), weekday: names[day.weekday]! }) : names[day.weekday]!));
  if (words.length <= 1) return words[0] ?? '';
  return t('{list} and {last}', { list: words.slice(0, -1).join(', '), last: words[words.length - 1]! });
}

const WORKDAYS = [1, 2, 3, 4, 5];
const isWorkdays = (days: readonly WeekdayRule[]): boolean => days.length === 5 && days.every(day => day.nth === 0) && WORKDAYS.every(weekday => days.some(day => day.weekday === weekday));

/**
 * The last day a timed series can still fall on before `until` (a wall time): its day, or the day
 * before when the series' hour comes after it (a series cut by « Cet événement et les suivants » stops
 * a second before that occurrence: the day before is its last).
 */
function lastDayBy(until: string, start: string): string {
  return !isDay(start) && until.slice(11, 16) < start.slice(11, 16) ? addDays(until.slice(0, 10), -1) : until.slice(0, 10);
}

/**
 * A rule in words: « Toutes les 2 semaines le lundi et le jeudi, jusqu’au 3 déc. 2026 ». `zone` is
 * the series' own (`timeZone`), to read an end set as an instant on its days.
 */
export function describeRule(rule: Rule, start: string, zone?: string): string {
  const startParts = partsOf(start);
  const names = weekdayNames();
  let head: string;
  switch (rule.freq) {
    case 'DAILY':
      head = rule.byDay.length > 0 && isWorkdays(rule.byDay) ? t('Every weekday (Monday to Friday)') : rule.interval === 1 ? t('Daily') : t('Every {count} days', { count: rule.interval });
      break;
    case 'WEEKLY': {
      if (rule.interval === 1 && isWorkdays(rule.byDay)) {
        head = t('Every weekday (Monday to Friday)');
        break;
      }
      const days = rule.byDay.length > 0 ? weekdayList(rule.byDay) : names[weekdayOf(start)]!;
      head = rule.interval === 1 ? t('Weekly on {days}', { days }) : t('Every {count} weeks on {days}', { count: rule.interval, days });
      break;
    }
    case 'MONTHLY': {
      let which: string;
      if (rule.byDay.length > 0 && rule.bySetPos.length === 0) which = weekdayList(rule.byDay);
      else if (rule.byMonthDay.length > 0) which = rule.byMonthDay.map(day => (day === -1 ? t('the last day') : t('on day {day}', { day }))).join(', ');
      else which = t('on day {day}', { day: startParts.day });
      head = rule.interval === 1 ? t('Monthly {which}', { which }) : t('Every {count} months {which}', { count: rule.interval, which });
      break;
    }
    case 'YEARLY': {
      const month = monthNames()[(rule.byMonth[0] ?? startParts.month) - 1]!;
      const which = rule.byDay.length > 0 ? t('{days} of {month}', { days: weekdayList(rule.byDay), month }) : t('on {month} {day}', { day: rule.byMonthDay[0] ?? startParts.day, month });
      head = rule.interval === 1 ? t('Annually {which}', { which }) : t('Every {count} years {which}', { count: rule.interval, which });
      break;
    }
  }
  if (rule.count !== null) return t('{rule}, {count} times', { rule: head, count: rule.count });
  if (rule.until) {
    const until = rule.until;
    const day = until.kind === 'day' ? until.day : until.kind === 'wall' ? lastDayBy(until.wall, start) : zone !== undefined ? lastDayBy(instantToWall(until.at, zone), start) : new Date(until.at).toISOString().slice(0, 10);
    return t('{rule}, until {day}', { rule: head, day: formatIsoDay(day) });
  }
  return head;
}

// ── the editor's choices ───────────────────────────────────────────────────

/** What the « Répéter » menu offers, from the event's start (Google's list). */
export const REPEAT_CHOICES = ['none', 'daily', 'workdays', 'weekly', 'monthlyDay', 'monthlyWeekday', 'monthlyLast', 'yearly', 'custom'] as const;
export type RepeatChoice = (typeof REPEAT_CHOICES)[number];

/** Which of the month's such weekdays a day is: 1 to 5. */
const nthOfMonth = (day: string): number => Math.floor((partsOf(day).day - 1) / 7) + 1;
/** Whether it is the month's last such weekday. */
const lastOfMonth = (day: string): boolean => partsOf(day).day + 7 > daysInMonth(partsOf(day).year, partsOf(day).month);

/** The choices that make sense for a start (« le dernier lundi » only on one). */
export function repeatChoices(start: string): RepeatChoice[] {
  return REPEAT_CHOICES.filter(choice => (choice === 'monthlyLast' ? lastOfMonth(start) : true));
}

/** A choice's rule from the start; '' for « Ne se répète pas », and for « Personnaliser » (the editor builds it). */
export function choiceRule(choice: RepeatChoice, start: string): string {
  const weekday = weekdayOf(start);
  switch (choice) {
    case 'none':
    case 'custom':
      return '';
    case 'daily':
      return 'FREQ=DAILY';
    case 'workdays':
      return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    case 'weekly':
      return `FREQ=WEEKLY;BYDAY=${WEEKDAY_CODES[weekday]}`;
    case 'monthlyDay':
      return `FREQ=MONTHLY;BYMONTHDAY=${partsOf(start).day}`;
    case 'monthlyWeekday':
      return `FREQ=MONTHLY;BYDAY=${nthOfMonth(start)}${WEEKDAY_CODES[weekday]}`;
    case 'monthlyLast':
      return `FREQ=MONTHLY;BYDAY=-1${WEEKDAY_CODES[weekday]}`;
    case 'yearly':
      return `FREQ=YEARLY;BYMONTH=${partsOf(start).month};BYMONTHDAY=${partsOf(start).day}`;
  }
}

/** The choice a rule is, for the menu to show it ticked; `custom` for any other. */
export function choiceOf(rrule: string, start: string): RepeatChoice {
  if (!rrule.trim()) return 'none';
  const rule = parseRule(rrule);
  if (!rule) return 'custom';
  const canonical = serializeRule(rule);
  return repeatChoices(start).find(choice => choice !== 'custom' && choice !== 'none' && choiceRule(choice, start) === canonical) ?? 'custom';
}

/** A choice in words, from the start: « Toutes les semaines le lundi ». */
export function choiceWords(choice: RepeatChoice, start: string): string {
  if (choice === 'none') return t('Does not repeat');
  if (choice === 'custom') return t('Custom…');
  return describeRule(parseRule(choiceRule(choice, start))!, start);
}

/** Every weekday code, Monday first: the custom editor's toggles. */
export const WEEK_CODES_FROM_MONDAY = [1, 2, 3, 4, 5, 6, 0] as const;

/** Every weekday code from the week's first day (0 Sunday, 1 Monday, 6 Saturday): the custom editor's toggles, as the views order the days. */
export const weekCodesFrom = (weekStart: number): number[] => Array.from({ length: 7 }, (_, index) => (weekStart + index) % 7);
