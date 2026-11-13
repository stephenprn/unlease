/**
 * How an import reads, on both clients (`importing.ts` plans it): each event of the preview with its
 * day and time in its own zone, its place, how it repeats and what the file changes of it, and why it
 * is left out; the counts over it; the choices' words, each with what it brings; the report.
 */
import { getLocale, t, tc } from '@unlease/core/i18n';
import { formatNumber, plural } from '@unlease/core/services/format';
import type { PreviewEntry } from '@unlease/core/services/importFlow';
import { foldText } from '@unlease/core/services/search';
import type { GlyphName } from '@unlease/design/glyphs';
import { HOLIDAYS_FEED_ID, type CalendarLabel } from '../models/events';
import { clockWords, reminderWords, shortDay, weekdayDay } from './eventText';
import type { IcsEvent } from './ics';
import { importFileName, knownCalendar, periodStart, type ImportFile, type ImportItem, type ImportPeriod, type ImportPlan } from './importing';
import { describeRule, parseRule } from './recurrence';
import { addDays, clockPart, deviceZone, isDay, partsOf, today as todayOf } from './time';

/** What the preview's words read beside the plan. */
export interface ImportWordsContext {
  readonly files: readonly ImportFile[];
  readonly now: number;
  readonly twelveHours?: boolean;
  /** A subscription's name, by its id. */
  readonly feedName?: (id: string) => string | null;
  /** The period chosen: a « passé » event says before which day. */
  readonly period?: ImportPeriod;
}

const yearOf = (now: number): number => partsOf(todayOf(now)).year;

/** A count as the interface writes it (`plural`'s), when the noun is a whole sentence of its own. */
const counted = (count: number): string => (getLocale() === 'en' ? formatNumber(count, 0) : String(count));
const one = (count: number): boolean => (getLocale() === 'en' ? Math.abs(count) === 1 : Math.abs(count) <= 1);

/** A zone by its place: « New York » for `America/New_York`. */
const zonePlace = (zone: string): string => zone.split('/').pop()!.replace(/_/g, ' ');

/**
 * When an event of the file happens, in its own zone: « lun. 2 nov. · 14:30 – 15:30 », « Du lun. 24 déc.
 * au mer. 26 déc. », with « (heure de New York) » when its zone is not this device's.
 */
export function importWhen(event: Pick<IcsEvent, 'start' | 'end' | 'timeZone'>, now: number, twelveHours = false): string {
  const year = yearOf(now);
  if (isDay(event.start)) {
    const last = addDays(event.end, -1);
    if (last <= event.start) return `${weekdayDay(event.start, year)} · ${t('All day')}`;
    return t('{from} to {to}', { from: weekdayDay(event.start, year), to: weekdayDay(last, year) });
  }
  const clock = (wall: string): string => clockWords(clockPart(wall), twelveHours);
  const day = event.start.slice(0, 10);
  const endDay = event.end.slice(0, 10);
  const when =
    day === endDay
      ? `${weekdayDay(day, year)} · ${clock(event.start)}${event.end > event.start ? ` – ${clock(event.end)}` : ''}`
      : `${weekdayDay(day, year)} ${clock(event.start)} – ${weekdayDay(endDay, year)} ${clock(event.end)}`;
  if (!event.timeZone || event.timeZone === deviceZone()) return when;
  return event.timeZone === 'UTC' ? t('{when} (UTC)', { when }) : t('{when} ({place} time)', { when, place: zonePlace(event.timeZone) });
}

/** How a series repeats: « Se répète toutes les semaines le lundi », or that only its first date will show. */
export function repeatWords(event: Pick<IcsEvent, 'rrule' | 'start' | 'timeZone'>): string | null {
  if (!event.rrule) return null;
  const rule = parseRule(event.rrule);
  if (!rule || rule.partial) return t('Repeats by a rule Agenda cannot read: only its first date will show.');
  const words = describeRule(rule, event.start, event.timeZone || undefined);
  return t('Repeats {rule}', { rule: words.charAt(0).toLocaleLowerCase() + words.slice(1) });
}

/** The occurrences a file changes of a series: « 2 occurrences modifiées, 1 annulée ». */
function changesWords(modified: number, cancelled: number): string {
  return [modified > 0 ? plural(modified, 'occurrence changed', 'occurrences changed') : '', cancelled > 0 ? plural(cancelled, 'occurrence cancelled', 'occurrences cancelled') : ''].filter(Boolean).join(', ');
}

const calendarName = (context: ImportWordsContext, file: number): string => {
  const found = context.files[file];
  return (found ? importFileName(found) : '') || t('Unnamed calendar');
};

/** Why an event does not come as it is, or what it brings to what is here. */
export function whyWords(item: ImportItem, context: ImportWordsContext): string | null {
  switch (item.why) {
    case null:
      return null;
    case 'here':
      return t('Already in your calendar');
    case 'subscribed': {
      if (item.feedId === HOLIDAYS_FEED_ID) return t('Already here: a public holiday');
      const name = item.feedId ? context.feedName?.(item.feedId) : null;
      return name ? t('Already here through the subscription “{name}”', { name }) : t('Already here through a subscription');
    }
    case 'twice':
      return item.twin !== null && item.twin !== item.file ? t('A duplicate: already in “{calendar}”', { calendar: calendarName(context, item.twin) }) : t('A duplicate within the file');
    case 'cancelled':
      return t('Cancelled in the file');
    case 'orphan':
      return t('A changed occurrence whose series is neither in the file nor in your calendar');
    case 'unreadable':
      return item.unreadable?.reason === 'noStart' ? t('Unreadable: it has no start date') : t('Unreadable: its start date cannot be read');
    case 'past': {
      const since = periodStart(context.period ?? 'all', context.now);
      return since ? t('Ended before {day}', { day: shortDay(since, yearOf(context.now)) }) : null;
    }
    case 'fileOff':
      return t('You are leaving out the calendar “{calendar}”', { calendar: calendarName(context, item.file) });
    case 'adds':
      return t('Adds to the series already here: {changes}', { changes: changesWords(item.adds.modified, item.adds.cancelled) });
    case 'joins': {
      const title = item.series?.title.trim() || t('Untitled');
      return item.fate === 'update' ? t('Cancels a date of “{title}”, already in your calendar', { title }) : t('Changes a date of “{title}”, already in your calendar', { title });
    }
  }
}

/** Every line of the preview: its title, when and where, how it repeats, its fate and why. */
export function importEntries(plan: ImportPlan, context: ImportWordsContext): PreviewEntry[] {
  return plan.items.map(item => {
    const event = item.event;
    const title = (event?.title ?? item.unreadable?.title ?? '').trim() || t('Untitled');
    const why = whyWords(item, context);
    if (!event) return { key: item.key, title, detail: '', fate: item.fate, glyph: 'alert', ...(why ? { why } : {}) };
    const place = event.place.split('\n')[0]!.trim();
    const when = importWhen(event, context.now, context.twelveHours);
    const note = [repeatWords(event), item.why === 'joins' ? '' : changesWords(item.modified, item.cancelled)].filter(Boolean).join(' · ');
    const glyph: GlyphName = event.rrule ? 'refresh' : isDay(event.start) ? 'calendar' : 'clock';
    return { key: item.key, title, detail: place ? `${when} · ${place}` : when, fate: item.fate, glyph, ...(why ? { why } : {}), ...(note ? { note } : {}) };
  });
}

export interface ImportCountLine {
  readonly icon: GlyphName;
  readonly text: string;
  readonly meta?: string | null;
}

/** The reasons lines are left out, counted: « 2 annulés dans le fichier », « 340 terminés avant le 12 nov. 2025 ». */
export function leftOutWords(plan: ImportPlan, context: ImportWordsContext): string[] {
  const count = (test: (item: ImportItem) => boolean): number => plan.items.filter(test).length;
  const out: string[] = [];
  const cancelled = count(item => item.why === 'cancelled');
  if (cancelled > 0) out.push(plural(cancelled, 'cancelled in the file', 'cancelled in the file [many]'));
  const past = count(item => item.why === 'past');
  const since = periodStart(context.period ?? 'all', context.now);
  if (past > 0 && since) {
    const words = { count: counted(past), day: shortDay(since, yearOf(context.now)) };
    out.push(one(past) ? t('{count} ended before {day}', words) : tc('many', '{count} ended before {day}', words));
  }
  const unreadable = count(item => item.why === 'unreadable');
  if (unreadable > 0) out.push(plural(unreadable, 'unreadable, with no date', 'unreadable, with no date [many]'));
  const twice = count(item => item.why === 'twice');
  if (twice > 0) out.push(plural(twice, 'duplicate', 'duplicate'));
  const orphans = count(item => item.why === 'orphan');
  if (orphans > 0) out.push(plural(orphans, 'occurrence without its series', 'occurrences without their series'));
  const unticked = count(item => item.leftOut);
  if (unticked > 0) out.push(plural(unticked, 'unticked by you', 'unticked by you [many]'));
  for (const file of new Set(plan.items.filter(item => item.why === 'fileOff').map(item => item.file))) {
    out.push(t('The calendar “{calendar}” ({events})', { calendar: calendarName(context, file), events: plural(count(item => item.file === file), 'event') }));
  }
  return out;
}

/** The time zones the events are written in, the most used first. */
export function importZones(plan: ImportPlan): string[] {
  const zones = new Map<string, number>();
  for (const item of plan.items) if (item.event?.timeZone) zones.set(item.event.timeZone, (zones.get(item.event.timeZone) ?? 0) + 1);
  return [...zones.entries()].sort((a, b) => b[1] - a[1]).map(([zone]) => zone);
}

/** The preview's counts: the calendars, the events, what comes, what is here, what is left out, the zones. */
export function importCounts(plan: ImportPlan, context: ImportWordsContext): ImportCountLine[] {
  const names = context.files.map((_, index) => calendarName(context, index));
  const lines: ImportCountLine[] = [];
  lines.push(
    names.length === 1
      ? { icon: 'calendar', text: t('Calendar “{calendar}”', { calendar: names[0]! }), meta: context.files[0]!.fileName || null }
      : { icon: 'calendar', text: plural(names.length, 'calendar'), meta: names.join(', ') },
  );
  const events = plan.items.filter(item => item.event !== null);
  const series = events.filter(item => item.event!.rrule && item.why !== 'joins').length;
  const allDay = events.filter(item => isDay(item.event!.start)).length;
  const modified = events.reduce((sum, item) => sum + item.modified, 0);
  const holds = [series > 0 ? plural(series, 'series', 'series [many]') : '', allDay > 0 ? plural(allDay, 'all-day', 'all-day') : '', modified > 0 ? plural(modified, 'occurrence changed', 'occurrences changed') : ''].filter(Boolean);
  lines.push({ icon: 'list', text: plural(plan.items.length, 'event'), meta: holds.length > 0 ? t('Including {list}', { list: holds.join(', ') }) : null });
  const updates = plan.items.filter(item => item.fate === 'update' && !item.leftOut).length;
  lines.push({
    icon: 'download',
    text: plan.count > 0 ? t('{count} to import', { count: plural(plan.count, 'event') }) : t('Nothing new to import.'),
    meta: updates > 0 ? t('Including {series} already here, which the file completes', { series: plural(updates, 'series', 'series [many]') }) : null,
  });
  const same = plan.items.filter(item => item.fate === 'same').length;
  if (same > 0) lines.push({ icon: 'check', text: t('{events} already in the calendar', { events: plural(same, 'event') }), meta: t('Recognised by their identifier: imported before, or served by a subscription.') });
  const left = plan.items.filter(item => item.fate === 'skip' || item.leftOut).length;
  if (left > 0) lines.push({ icon: 'eyeOff', text: plural(left, 'left out', 'left out [many]'), meta: leftOutWords(plan, context).join(', ') });
  const zones = importZones(plan);
  if (zones.length > 1) lines.push({ icon: 'globe', text: plural(zones.length, 'time zone', 'time zones'), meta: t('Each event keeps its local time: {zones}', { zones: zones.slice(0, 6).map(zonePlace).join(', ') + (zones.length > 6 ? '…' : '') }) });
  return lines;
}

/** What the period's choices bring: each with how many events it keeps. */
export function periodOptions(counts: Readonly<Record<ImportPeriod, number>>, now: number): { readonly value: ImportPeriod; readonly label: string; readonly meta: string }[] {
  const year = periodStart('year', now)!;
  return [
    { value: 'all', label: t('All events'), meta: t('The past included: {events}', { events: plural(counts.all, 'event') }) },
    { value: 'year', label: t('From a year ago'), meta: t('From {day}: {events}', { day: shortDay(year, yearOf(now)), events: plural(counts.year, 'event') }) },
    { value: 'upcoming', label: t('Upcoming only'), meta: t('From today: {events}', { events: plural(counts.upcoming, 'event') }) },
  ];
}

/** The reminders' choices: the file's (how many have some), none, the device's own for a new event. */
export function reminderOptions(plan: ImportPlan, defaults: { readonly timed: readonly number[]; readonly allDay: readonly number[] }): { readonly value: 'file' | 'none' | 'yours'; readonly label: string; readonly meta: string }[] {
  const withSome = plan.items.filter(item => item.event && item.event.reminders.length > 0 && (item.fate === 'new' || item.fate === 'update')).length;
  const list = (minutes: readonly number[], allDay: boolean): string => minutes.map(each => reminderWords(each, allDay)).join(', ') || t('None');
  const allDay = list(defaults.allDay, true);
  return [
    { value: 'file', label: t('The file’s own'), meta: withSome > 0 ? t('{events} have some in the file.', { events: plural(withSome, 'event') }) : t('This file gives none.') },
    { value: 'none', label: t('None'), meta: t('Nothing will ring for these events.') },
    { value: 'yours', label: t('Your default reminders'), meta: t('{timed}; all-day: {allDay}', { timed: list(defaults.timed, false), allDay: allDay.charAt(0).toLocaleLowerCase() + allDay.slice(1) }) },
  ];
}

/** Under a label's name: whether it is made or joined, or that a name left empty files nothing. */
export function labelHelp(name: string, labels: Readonly<Record<string, CalendarLabel>>): string {
  const folded = foldText(name.trim());
  if (!folded) return t('Without a name, these events go under no label.');
  return Object.values(labels).some(label => label.deletedAt === null && foldText(label.name.trim()) === folded) ? t('This label exists already: the events join it.') : t('A new label, made with the import.');
}

/** A calendar's line among the files: how many events, and why it is left out at first. */
export function calendarMeta(file: ImportFile, events: number): string {
  const known = knownCalendar(importFileName(file));
  if (known === 'holidays') return t('{events} · public holidays: Agenda shows them already, set in the Administration.', { events: plural(events, 'event') });
  if (known === 'birthdays') return t('{events} · birthdays: Agenda shows your contacts’ already.', { events: plural(events, 'event') });
  return plural(events, 'event');
}

/** The report: what came in, then what was left out and why. */
export function importReport(plan: ImportPlan, context: ImportWordsContext, labels: Readonly<Record<string, CalendarLabel>>): { readonly imported: string[]; readonly skipped: string[] } {
  const imported: string[] = [];
  const fresh = plan.items.filter(item => item.fate === 'new' && !item.leftOut).length;
  const updated = plan.items.filter(item => item.fate === 'update' && !item.leftOut).length;
  if (fresh > 0) imported.push(t('{events} imported', { events: plural(fresh, 'event') }));
  if (updated > 0) imported.push(plural(updated, 'series completed', 'series completed [many]'));
  const made = new Map(plan.labels.map(label => [label.id, String(label.fields.name)]));
  const used = [...new Set(plan.labelIds.filter((id): id is string => id !== null))].map(id => made.get(id) ?? labels[id]?.name ?? '').filter(Boolean);
  if (fresh > 0 && used.length === 1) imported.push(t('Filed under the label “{label}”', { label: used[0]! }));
  else if (fresh > 0 && used.length > 1) imported.push(t('Filed under the labels {labels}', { labels: used.map(name => `« ${name} »`).join(', ') }));
  const skipped: string[] = [];
  const same = plan.items.filter(item => item.fate === 'same').length;
  if (same > 0) skipped.push(t('{events} already in the calendar', { events: plural(same, 'event') }));
  skipped.push(...leftOutWords(plan, context));
  return { imported, skipped };
}
