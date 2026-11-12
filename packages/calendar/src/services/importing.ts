/**
 * Calendar files imported (Google Agenda's export: one `.ics` per calendar, from its settings or
 * Takeout; an `.ics` shared to the phone, from Apple or Outlook; an invitation): their events become
 * one's own, written as one batch, labels first. The import wizard (`core/services/importFlow`) plans
 * it again at every choice and shows what becomes of each event:
 *
 * - `new`: it comes, a series with its modified occurrences, its cancelled ones as exceptions taken out;
 * - `update`: a series of one's own here already, which gains the occurrences the file changed or
 *   cancelled since (a newer export, an invitation's update for one meeting);
 * - `same`: here already by its UID (imported before, or served by a subscription or the holidays);
 * - `skip`: cancelled, unreadable, a modified occurrence whose series is nowhere, twice in the files,
 *   before the period chosen, or in a calendar the person leaves out.
 *
 * What is in the bin is on its way out: the file brings it back. An event the file gives no UID is
 * known by its words and times (`importUid`), so the same file twice brings it once. An import is
 * taken back whole on its slip (`forgetImport`), or later by picking the same file again
 * (`importedEvents`, `trashImported`).
 */
import { createId, derivedId } from '@unlease/core/services/ids';
import { positionsBetween } from '@unlease/core/services/fractionalIndex';
import type { ImportFate } from '@unlease/core/services/importFlow';
import { markupFromPlain } from '@unlease/core/services/richText';
import { foldText } from '@unlease/core/services/search';
import type { Fields } from '@unlease/core/sync/record';
import { LINE_COLORS } from '@unlease/design/colors';
import { EVENT_LIMITS, isLive, isOwn, REMINDER_RANGE, type CalendarEvent, type CalendarLabel, type Day } from '../models/events';
import { nextColor } from './colors';
import type { EventChange } from './editing';
import type { IcsCalendar, IcsEvent, IcsUnreadable } from './ics';
import { feedKey, feedUrl } from './feeds';
import { cleanEventUrl } from './links';
import { expandRule, parseRule, ruleEnds } from './recurrence';
import { addDays, addMonths, daysBetween, isDay, today as todayOf } from './time';

/** One file read: its name as picked (`Perso.ics`, '' for a share without one), and what it holds. */
export interface ImportFile {
  readonly fileName: string;
  readonly calendar: IcsCalendar;
}

/** A calendar's name for people: its own (X-WR-CALNAME), else its file's without `.ics`. */
export function importFileName(file: ImportFile): string {
  return file.calendar.name.trim() || file.fileName.replace(/\.(ics|ical|ifb|icalendar)$/i, '').trim();
}

/** Which events come, by when they happen: all, those of the last year on, those to come. */
export const IMPORT_PERIODS = ['all', 'year', 'upcoming'] as const;
export type ImportPeriod = (typeof IMPORT_PERIODS)[number];

/** Their reminders: the file's (its alarms), none, or the device's for a new event. */
export const IMPORT_REMINDERS = ['file', 'none', 'yours'] as const;
export type ImportReminders = (typeof IMPORT_REMINDERS)[number];

/** What the person decides, each with its default (`defaultImportChoices`). */
export interface ImportChoices {
  readonly period: ImportPeriod;
  readonly reminders: ImportReminders;
  /** Each file's label (by its index): a name ('' none); null files nothing under a label. */
  readonly labelNames: readonly string[] | null;
  /** Files left out whole, by index. */
  readonly filesOff: ReadonlySet<number>;
  /** The events the person unticked, by their key. */
  readonly leftOut: ReadonlySet<string>;
}

/** What the plan reads beside the files. */
export interface ImportOptions extends Partial<ImportChoices> {
  /** The labels here: a name already taken is that label. */
  readonly labels?: Readonly<Record<string, CalendarLabel>>;
  /** The device's reminders for a new event, timed and all day (`yours`). */
  readonly defaults?: { readonly timed: readonly number[]; readonly allDay: readonly number[] };
}

/** Why an event does not come as it is. */
export type ImportWhy = 'here' | 'subscribed' | 'twice' | 'cancelled' | 'orphan' | 'unreadable' | 'past' | 'fileOff' | 'adds' | 'joins';

/** One line of the preview: a single event or a series (its modified occurrences folded under it), or what could not be read. */
export interface ImportItem {
  /** Stable while the files stay the same: `<file>:<index>`. */
  readonly key: string;
  readonly file: number;
  /** As read; null when unreadable. */
  readonly event: IcsEvent | null;
  readonly unreadable: IcsUnreadable | null;
  readonly fate: ImportFate;
  readonly why: ImportWhy | null;
  /** `subscribed`: the calendar serving it. */
  readonly feedId: string | null;
  /** `twice`: the file it is in first. */
  readonly twin: number | null;
  /** `joins`: the series here it changes one occurrence of. */
  readonly series: CalendarEvent | null;
  /** Its occurrences the file modifies, and those it cancels. */
  readonly modified: number;
  readonly cancelled: number;
  /** `update`: what it adds to the series here. */
  readonly adds: { readonly modified: number; readonly cancelled: number };
  /** Unticked: a `new` or `update` the person leaves out. */
  readonly leftOut: boolean;
}

/** A new record: its id and its fields. */
export interface ImportCreate {
  readonly id: string;
  readonly fields: Fields;
}

export interface ImportPlan {
  /** Every event of the files, sorted by when it starts. */
  readonly items: readonly ImportItem[];
  /** New events, series first. */
  readonly creates: readonly ImportCreate[];
  /** New labels, written before the events. */
  readonly labels: readonly ImportCreate[];
  /** Series here gaining the occurrences the file cancels: their exdates, and what they were. */
  readonly updates: readonly { readonly id: string; readonly patch: Fields; readonly before: Fields }[];
  /** The label each file's events wear (by index), null for none. */
  readonly labelIds: readonly (string | null)[];
  /** How many lines come (`new` and `update`, ticked). */
  readonly count: number;
  /** Lines here already. */
  readonly skipped: number;
  /** Lines left out: cancelled, unreadable, orphans, twins. */
  readonly dropped: number;
}

/** A change an import writes or takes back: an event or a label. */
export interface ImportChange {
  readonly type: 'calendarEvent' | 'calendarLabel';
  readonly id: string;
  readonly patch: Fields;
}

/** An event's UID: its own, else one made of its words and times, the same every time it is read. */
export function importUid(event: Pick<IcsEvent, 'uid' | 'start' | 'end' | 'title' | 'rrule' | 'recurrenceId'>): string {
  if (event.uid) return event.uid.slice(0, EVENT_LIMITS.uid);
  return `${derivedId(`ics|${event.start}|${event.end}|${event.title}|${event.rrule}|${event.recurrenceId}`)}@import`;
}

/** A calendar that would bring in double what Agenda has already: public holidays (the Administration's), birthdays (Contacts'). */
export function knownCalendar(name: string): 'holidays' | 'birthdays' | null {
  const folded = foldText(name);
  if (/\b(jours? feries|holidays?|feiertage|festivos|festivita)\b/.test(folded)) return 'holidays';
  if (/^(anniversaires|birthdays|contacts)$/.test(folded.trim())) return 'birthdays';
  return null;
}

/** Each calendar's label at its name (the file's when it has none), as the switch turned on gives them. */
export function importLabelNames(files: readonly ImportFile[]): string[] {
  return files.map(file => importFileName(file).slice(0, EVENT_LIMITS.labelName));
}

/**
 * What the wizard starts from: everything, the file's reminders, a label per named calendar (an
 * invitation's file, one event and no name, files nothing); among several calendars, the holidays'
 * and the birthdays' left out (one given alone comes as asked).
 */
export function defaultImportChoices(files: readonly ImportFile[]): ImportChoices {
  const names = files.map(file => (file.calendar.name.trim() || file.calendar.events.length > 1 ? importFileName(file).slice(0, EVENT_LIMITS.labelName) : ''));
  return {
    period: 'all',
    reminders: 'file',
    labelNames: names.some(Boolean) ? names : null,
    filesOff: new Set(files.length > 1 ? files.flatMap((file, index) => (knownCalendar(importFileName(file)) ? [index] : [])) : []),
    leftOut: new Set(),
  };
}

/** The first day a period keeps (null: all of them). */
export function periodStart(period: ImportPeriod, now: number): Day | null {
  const day = todayOf(now);
  return period === 'all' ? null : period === 'year' ? addMonths(day, -12) : day;
}

/** Whether an event happens on or after `since`: a single one by its last day, a series while it still repeats then. */
export function happensSince(event: Pick<IcsEvent, 'start' | 'end' | 'rrule' | 'timeZone' | 'exdates'>, since: Day | null): boolean {
  if (since === null) return true;
  const lastDay = isDay(event.end) ? addDays(event.end, -1) : event.end.slice(0, 10);
  if (lastDay >= since) return true;
  const rule = event.rrule ? parseRule(event.rrule) : null;
  if (!rule || rule.partial) return false;
  if (!ruleEnds(rule)) return true;
  // An occurrence still running on `since` counts: it started at most its length before.
  const length = Math.max(0, daysBetween(event.start.slice(0, 10), lastDay));
  const from = addDays(since, -length);
  const excluded = new Set(event.exdates);
  const { starts } = expandRule(rule, event.start, event.timeZone, isDay(event.start) ? from : `${from}T00:00`, '9999-12-31', 50);
  return starts.some(start => !excluded.has(start)) || starts.length === 50;
}

const keepReminders = (minutes: readonly number[]): number[] => [...new Set(minutes)].filter(each => each >= REMINDER_RANGE.min && each <= REMINDER_RANGE.max).slice(0, EVENT_LIMITS.reminders);

function importFields(event: IcsEvent, uid: string, recurringId: string | null, exdates: readonly string[], reminders: readonly number[], labelIds: readonly string[], now: number): Fields {
  return {
    title: event.title.slice(0, EVENT_LIMITS.title),
    // The file's words are only words (a `{` never reads as a link or a mention).
    description: markupFromPlain(event.description, EVENT_LIMITS.description),
    place: event.place.slice(0, EVENT_LIMITS.place),
    start: event.start,
    end: event.end,
    timeZone: event.timeZone,
    rrule: recurringId ? '' : event.rrule.slice(0, EVENT_LIMITS.rrule),
    exdates: [...new Set(exdates)].slice(0, EVENT_LIMITS.exdates),
    recurringId,
    originalStart: recurringId ? event.recurrenceId : '',
    reminders: keepReminders(reminders),
    labelIds: [...labelIds],
    contactIds: [],
    files: [],
    feedId: null,
    uid,
    // A web address only, kept as a link typed in Agenda is: its tracking off (`cleanEventUrl`).
    url: feedUrl(cleanEventUrl(event.url).url),
    color: null,
    trashedAt: null,
    createdAt: now,
    deletedAt: null,
  };
}

/** A sort key for when an item starts: its day and time as written (unreadable ones last). */
const startKey = (item: ImportItem): string => item.event?.start ?? '~';

interface Line {
  key: string;
  file: number;
  event: IcsEvent | null;
  unreadable: IcsUnreadable | null;
  uid: string;
  fate: ImportFate;
  why: ImportWhy | null;
  feedId: string | null;
  twin: number | null;
  series: CalendarEvent | null;
  modified: number;
  cancelled: number;
  adds: { modified: number; cancelled: number };
  leftOut: boolean;
  /** Its own modified occurrences, to write with it. */
  exceptions: IcsEvent[];
  /** The occurrences the files cancel, as its exdates. */
  cancels: string[];
}

/**
 * What importing the files would write, against the events and labels here, as the choices say.
 * A single calendar (`IcsCalendar`) reads as one file; without choices, everything comes as the file
 * has it, under no label.
 */
export function planImport(source: IcsCalendar | readonly ImportFile[], existing: Iterable<CalendarEvent>, now: number, makeId: () => string = () => createId(now), options: ImportOptions = {}): ImportPlan {
  const files: readonly ImportFile[] = Array.isArray(source) ? (source as readonly ImportFile[]) : [{ fileName: '', calendar: source as IcsCalendar }];
  const since = periodStart(options.period ?? 'all', now);
  const filesOff = options.filesOff ?? new Set<number>();
  const leftOut = options.leftOut ?? new Set<string>();
  const reminderChoice = options.reminders ?? 'file';

  // What is here, by UID and occurrence: what is in the bin is on its way out, the file brings it back.
  const here = new Map<string, CalendarEvent>();
  const seriesHere = new Map<string, CalendarEvent>();
  for (const event of existing) {
    if (!isLive(event) || !event.uid) continue;
    here.set(feedKey(event.uid, event.recurringId ? event.originalStart : ''), event);
    if (event.recurringId === null && !seriesHere.has(event.uid)) seriesHere.set(event.uid, event);
  }

  const lines: Line[] = [];
  const masters = new Map<string, Line>();
  const line = (fields: Partial<Line> & Pick<Line, 'key' | 'file' | 'event' | 'uid' | 'fate'>): Line => ({ unreadable: null, why: null, feedId: null, twin: null, series: null, modified: 0, cancelled: 0, adds: { modified: 0, cancelled: 0 }, leftOut: false, exceptions: [], cancels: [], ...fields });

  // Series and single events first, file by file, so an occurrence finds its series wherever it lies.
  files.forEach((file, at) => {
    file.calendar.events.forEach((event, index) => {
      if (event.recurrenceId) return;
      const key = `${at}:${index}`;
      const uid = importUid(event);
      const first = masters.get(uid);
      if (first) {
        lines.push(line({ key, file: at, event, uid, fate: 'skip', why: 'twice', twin: first.file }));
        return;
      }
      const found = here.get(feedKey(uid, ''));
      let entry: Line;
      if (filesOff.has(at)) entry = line({ key, file: at, event, uid, fate: 'skip', why: 'fileOff' });
      else if (event.cancelled) entry = line({ key, file: at, event, uid, fate: 'skip', why: 'cancelled' });
      else if (found) entry = line({ key, file: at, event, uid, fate: 'same', why: isOwn(found) ? 'here' : 'subscribed', feedId: found.feedId, series: isOwn(found) ? found : null });
      else if (!happensSince(event, since)) entry = line({ key, file: at, event, uid, fate: 'skip', why: 'past' });
      else entry = line({ key, file: at, event, uid, fate: 'new', leftOut: leftOut.has(key) });
      masters.set(uid, entry);
      lines.push(entry);
    });
    (file.calendar.unreadable ?? []).forEach((unreadable, index) => {
      lines.push(line({ key: `${at}:u${index}`, file: at, event: null, unreadable, uid: '', fate: 'skip', why: 'unreadable' }));
    });
  });

  // Then the occurrences a series' file modifies or cancels: folded under their series.
  const seen = new Set<string>();
  files.forEach((file, at) => {
    file.calendar.events.forEach((event, index) => {
      if (!event.recurrenceId) return;
      const uid = importUid({ ...event, recurrenceId: '' });
      const occurrence = feedKey(uid, event.recurrenceId);
      if (seen.has(occurrence)) return;
      seen.add(occurrence);
      const master = masters.get(uid);
      if (master) {
        if (event.cancelled) master.cancelled += 1;
        else master.modified += 1;
        if (master.fate === 'new') {
          if (event.cancelled) master.cancels.push(event.recurrenceId);
          else master.exceptions.push(event);
        } else if (master.why === 'here' && master.series && !here.has(occurrence)) {
          // A series of one's own here: the file's newer changes come into it.
          if (event.cancelled) {
            if (!master.series.exdates.includes(event.recurrenceId)) master.cancels.push(event.recurrenceId);
          } else master.exceptions.push(event);
        }
        return;
      }
      // An occurrence alone (an invitation's update for one meeting): it joins its series here, if it is.
      const key = `${at}:${index}`;
      const series = seriesHere.get(uid) ?? null;
      if (filesOff.has(at)) lines.push(line({ key, file: at, event, uid, fate: 'skip', why: 'fileOff' }));
      else if (here.has(occurrence)) lines.push(line({ key, file: at, event, uid, fate: 'same', why: isOwn(here.get(occurrence)!) ? 'here' : 'subscribed', feedId: here.get(occurrence)!.feedId }));
      else if (!series) lines.push(line({ key, file: at, event, uid, fate: 'skip', why: event.cancelled ? 'cancelled' : 'orphan' }));
      else if (!isOwn(series)) lines.push(line({ key, file: at, event, uid, fate: 'same', why: 'subscribed', feedId: series.feedId }));
      else if (event.cancelled) {
        if (series.exdates.includes(event.recurrenceId)) lines.push(line({ key, file: at, event, uid, fate: 'same', why: 'here', series }));
        else lines.push(line({ key, file: at, event, uid, fate: 'update', why: 'joins', series, cancels: [event.recurrenceId], adds: { modified: 0, cancelled: 1 }, leftOut: leftOut.has(key) }));
      } else lines.push(line({ key, file: at, event, uid, fate: 'new', why: 'joins', series, exceptions: [event], leftOut: leftOut.has(key) }));
    });
  });

  // A series here that the file changes since: completed.
  for (const entry of lines) {
    if (entry.why !== 'here' || !entry.series || (entry.exceptions.length === 0 && entry.cancels.length === 0)) continue;
    entry.fate = 'update';
    entry.why = 'adds';
    entry.adds = { modified: entry.exceptions.length, cancelled: entry.cancels.length };
    entry.leftOut = leftOut.has(entry.key);
  }

  const coming = lines.filter(entry => (entry.fate === 'new' || entry.fate === 'update') && !entry.leftOut);

  // The labels: each file's, an existing one by its name, a new one made once for a name given twice.
  const labelIds: (string | null)[] = files.map(() => null);
  const labels: ImportCreate[] = [];
  if (options.labelNames) {
    const live = Object.values(options.labels ?? {})
      .filter(label => label.deletedAt === null)
      .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
    const byName = new Map(live.map(label => [foldText(label.name.trim()), label.id]));
    const wanted: { file: number; name: string }[] = [];
    files.forEach((_, at) => {
      const name = (options.labelNames?.[at] ?? '').trim().slice(0, EVENT_LIMITS.labelName);
      if (name && coming.some(entry => entry.file === at && entry.fate === 'new' && entry.why !== 'joins')) wanted.push({ file: at, name });
    });
    const fresh = new Map<string, string>();
    const used = live.map(label => label.color);
    const names: { id: string; name: string }[] = [];
    for (const { file, name } of wanted) {
      const folded = foldText(name);
      const id = byName.get(folded) ?? fresh.get(folded);
      if (id) {
        labelIds[file] = id;
        continue;
      }
      const made = makeId();
      fresh.set(folded, made);
      names.push({ id: made, name });
      labelIds[file] = made;
    }
    const positions = names.length > 0 ? positionsBetween(live.at(-1)?.position ?? null, null, names.length) : [];
    names.forEach(({ id, name }, index) => {
      const color = nextColor(used, LINE_COLORS);
      used.push(color);
      labels.push({ id, fields: { name, color, position: positions[index]!, createdAt: now, deletedAt: null } });
    });
  }

  const remindersOf = (event: IcsEvent, series: CalendarEvent | null): readonly number[] => {
    if (series) return series.reminders;
    if (reminderChoice === 'none') return [];
    if (reminderChoice === 'yours') return (isDay(event.start) ? options.defaults?.allDay : options.defaults?.timed) ?? [];
    return event.reminders;
  };

  // Series first, then the occurrences they hold.
  const creates: ImportCreate[] = [];
  const updates: { id: string; patch: Fields; before: Fields }[] = [];
  const later: ImportCreate[] = [];
  for (const entry of coming) {
    const event = entry.event!;
    const labelId = labelIds[entry.file] ?? null;
    if (entry.series) {
      // Into a series of one's own here: its labels and reminders, its id.
      const series = entry.series;
      for (const exception of entry.exceptions) later.push({ id: makeId(), fields: importFields(exception, entry.uid, series.id, [], remindersOf(exception, series), series.labelIds, now) });
      if (entry.cancels.length > 0) updates.push({ id: series.id, patch: { exdates: [...new Set([...series.exdates, ...entry.cancels])].slice(0, EVENT_LIMITS.exdates) }, before: { exdates: [...series.exdates] } });
      continue;
    }
    const id = makeId();
    const labelList = labelId ? [labelId] : [];
    creates.push({ id, fields: importFields(event, entry.uid, null, [...event.exdates, ...entry.cancels], remindersOf(event, null), labelList, now) });
    for (const exception of entry.exceptions) later.push({ id: makeId(), fields: importFields(exception, entry.uid, id, [], remindersOf(exception, null), labelList, now) });
  }

  const items: ImportItem[] = lines
    .map(entry => ({ key: entry.key, file: entry.file, event: entry.event, unreadable: entry.unreadable, fate: entry.fate, why: entry.why, feedId: entry.feedId, twin: entry.twin, series: entry.series, modified: entry.modified, cancelled: entry.cancelled, adds: entry.adds, leftOut: entry.leftOut }))
    .sort((a, b) => (startKey(a) < startKey(b) ? -1 : startKey(a) > startKey(b) ? 1 : 0));
  return {
    items,
    creates: [...creates, ...later],
    labels,
    updates,
    labelIds,
    count: coming.length,
    skipped: lines.filter(entry => entry.fate === 'same').length,
    dropped: lines.filter(entry => entry.why === 'cancelled' || entry.why === 'unreadable' || entry.why === 'orphan' || entry.why === 'twice').length,
  };
}

/** The batch an import writes: its labels, then its events, then the series it completes. */
export function importChanges(plan: ImportPlan): ImportChange[] {
  return [
    ...plan.labels.map(entry => ({ type: 'calendarLabel' as const, id: entry.id, patch: entry.fields })),
    ...plan.creates.map(entry => ({ type: 'calendarEvent' as const, id: entry.id, patch: entry.fields })),
    ...plan.updates.map(entry => ({ type: 'calendarEvent' as const, id: entry.id, patch: entry.patch })),
  ];
}

/** How many lines each period would bring, the other choices as they are. */
export function periodCounts(files: readonly ImportFile[], existing: readonly CalendarEvent[], now: number, options: ImportOptions): Readonly<Record<ImportPeriod, number>> {
  const counted = (period: ImportPeriod): number => planImport(files, existing, now, () => '', { ...options, period, labelNames: null }).count;
  return { all: counted('all'), year: counted('year'), upcoming: counted('upcoming') };
}

const eventChange = (id: string, patch: Fields): EventChange => ({ type: 'calendarEvent', id, patch });

/** « Annuler » on an import's slip: every record it made gets its tombstone, a series it completed its exdates back, as if the files had never come (they can come again). */
export function forgetImport(plan: ImportPlan, now: number): ImportChange[] {
  return [
    ...plan.creates.map(entry => eventChange(entry.id, { deletedAt: now })),
    ...plan.updates.map(entry => eventChange(entry.id, entry.before)),
    ...plan.labels.map(entry => ({ type: 'calendarLabel' as const, id: entry.id, patch: { deletedAt: now } })),
  ];
}

/**
 * The events of one's own a file brought here (« Retirer ces événements », the file picked again):
 * each single event or series whose UID the file holds, out of the bin, changed since or not. A
 * subscription's are the server's, and a series the person split off one is their own (no UID).
 */
export function importedEvents(calendar: IcsCalendar, events: Iterable<CalendarEvent>): CalendarEvent[] {
  const uids = new Set(calendar.events.map(event => importUid({ ...event, recurrenceId: '' })));
  return [...events].filter(event => isOwn(event) && isLive(event) && event.recurringId === null && event.uid !== '' && uids.has(event.uid));
}

/** The batch putting them in the bin, each series with its exceptions, at one moment (`restoreEvent` brings them back together). */
export function trashImported(imported: readonly CalendarEvent[], events: Iterable<CalendarEvent>, now: number): EventChange[] {
  const ids = new Set(imported.map(event => event.id));
  const out = imported.map(event => eventChange(event.id, { trashedAt: now }));
  for (const event of events) if (event.recurringId !== null && ids.has(event.recurringId) && isLive(event)) out.push(eventChange(event.id, { trashedAt: now }));
  return out;
}
