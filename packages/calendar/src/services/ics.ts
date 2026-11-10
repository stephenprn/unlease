/**
 * iCalendar (RFC 5545), read and written: what Google Agenda exports (Takeout's `.ics`) and serves
 * at a calendar's secret address, what Apple and Outlook send, what an invitation carries; and what
 * Agenda publishes and puts in its backups. Read: events (VEVENT) with their times and zones, repeat
 * rules, exceptions, alarms, place, description and address; a zone given as Windows names it, or
 * only by its VTIMEZONE's location, is mapped to its IANA name. Written: one VEVENT per event or
 * exception, times in UTC unless they repeat (then in their IANA zone, as Google writes them).
 */
import { DAY_PATTERN, type CalendarEvent } from '../models/events';
import { addDays, addMinutes, deviceZone, instantToWall, isDay, isKnownZone, wallToInstant } from './time';

export interface IcsEvent {
  readonly uid: string;
  readonly title: string;
  readonly description: string;
  readonly place: string;
  readonly url: string;
  /** As Agenda stores them: `2026-11-02` or `2026-11-02T14:30` in `timeZone`. */
  readonly start: string;
  readonly end: string;
  readonly timeZone: string;
  readonly rrule: string;
  readonly exdates: readonly string[];
  /** The occurrence of its series it replaces (RECURRENCE-ID), '' for a series or a single event. */
  readonly recurrenceId: string;
  readonly cancelled: boolean;
  /** Minutes before the start (VALARM's TRIGGER). */
  readonly reminders: readonly number[];
  readonly categories: readonly string[];
}

export interface IcsCalendar {
  /** X-WR-CALNAME, '' when it has none. */
  readonly name: string;
  readonly events: readonly IcsEvent[];
}

interface Property {
  readonly name: string;
  readonly params: Readonly<Record<string, string>>;
  readonly value: string;
}

/** Lines joined where they were folded (a line starting with a space or a tab goes on the one before). */
function unfold(text: string): string[] {
  const lines: string[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && lines.length > 0) lines[lines.length - 1] += raw.slice(1);
    else if (raw.trim()) lines.push(raw);
  }
  return lines;
}

function parseLine(line: string): Property | null {
  // The value starts at the first colon outside quotes.
  let quoted = false;
  let colon = -1;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') quoted = !quoted;
    else if (char === ':' && !quoted) {
      colon = index;
      break;
    }
  }
  if (colon <= 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const pieces: string[] = [];
  let current = '';
  quoted = false;
  for (const char of head) {
    if (char === '"') quoted = !quoted;
    if (char === ';' && !quoted) {
      pieces.push(current);
      current = '';
    } else current += char;
  }
  pieces.push(current);
  const params: Record<string, string> = {};
  for (const piece of pieces.slice(1)) {
    const at = piece.indexOf('=');
    if (at > 0) params[piece.slice(0, at).toUpperCase()] = piece.slice(at + 1).replace(/^"|"$/g, '');
  }
  return { name: pieces[0]!.toUpperCase(), params, value };
}

/** A TEXT value's characters (`\n`, `\,`, `\;`, `\\`). */
export function unescapeText(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_, char: string) => (char === 'n' || char === 'N' ? '\n' : char));
}

export function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Windows' names for the zones people meet most, as Outlook writes them. */
const WINDOWS_ZONES: Readonly<Record<string, string>> = {
  'Romance Standard Time': 'Europe/Paris',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw',
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'E. Europe Standard Time': 'Europe/Chisinau',
  'FLE Standard Time': 'Europe/Kiev',
  'GTB Standard Time': 'Europe/Bucharest',
  'Russian Standard Time': 'Europe/Moscow',
  'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Atlantic Standard Time': 'America/Halifax',
  'E. South America Standard Time': 'America/Sao_Paulo',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'China Standard Time': 'Asia/Shanghai',
  'India Standard Time': 'Asia/Kolkata',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'Morocco Standard Time': 'Africa/Casablanca',
  UTC: 'UTC',
};

/** A zone's IANA name from a TZID: as it is, from Windows' name, from a VTIMEZONE's location, or from a prefixed path (`/mozilla.org/…/Europe/Paris`). */
function zoneOf(tzid: string | undefined, locations: ReadonlyMap<string, string>): string {
  if (!tzid) return '';
  const clean = tzid.trim();
  for (const candidate of [clean, locations.get(clean), WINDOWS_ZONES[clean], /([A-Za-z_]+\/[A-Za-z_+\-/]+)$/.exec(clean)?.[1]]) {
    if (candidate && isKnownZone(candidate)) return candidate;
  }
  return '';
}

/** A DATE or DATE-TIME as Agenda stores it, in `zone` (the event's): a UTC time is moved into it. */
function readWhen(property: Property, zone: string, locations: ReadonlyMap<string, string>): { readonly value: string; readonly zone: string } | null {
  const raw = property.value.trim();
  const day = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (day) return { value: `${day[1]}-${day[2]}-${day[3]}`, zone: '' };
  const time = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z?)$/.exec(raw);
  if (!time) return null;
  const wall = `${time[1]}-${time[2]}-${time[3]}T${time[4]}:${time[5]}`;
  if (time[7]) {
    // UTC: kept in the event's zone when it has one, else in UTC itself.
    const instant = Date.UTC(Number(time[1]), Number(time[2]) - 1, Number(time[3]), Number(time[4]), Number(time[5]), Number(time[6] ?? 0));
    const target = zone || 'UTC';
    return { value: instantToWall(instant, target), zone: target };
  }
  const own = zoneOf(property.params.TZID, locations);
  if (own) {
    if (zone && zone !== own) return { value: instantToWall(wallToInstant(wall, own), zone), zone };
    return { value: wall, zone: own };
  }
  // Floating: read on this device's clock.
  return { value: wall, zone: zone || deviceZone() };
}

/** A DURATION (`PT1H30M`, `P1D`, `-PT15M`) in minutes; null when it is not one. */
export function durationMinutes(value: string): number | null {
  const match = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!match || value.trim() === 'P' || value.trim() === 'PT') return null;
  const [, sign, weeks, days, hours, minutes, seconds] = match;
  const total = Number(weeks ?? 0) * 10_080 + Number(days ?? 0) * 1440 + Number(hours ?? 0) * 60 + Number(minutes ?? 0) + Math.round(Number(seconds ?? 0) / 60);
  return sign === '-' ? -total : total;
}

/** Every VEVENT of a calendar file; what cannot be read is left out. */
export function parseIcs(text: string): IcsCalendar {
  const lines = unfold(text);
  let name = '';
  const locations = new Map<string, string>();
  // VTIMEZONE blocks name a zone by its location (X-LIC-LOCATION) when their TZID is no IANA name.
  let zoneId: string | null = null;
  for (const line of lines) {
    const property = parseLine(line);
    if (!property) continue;
    if (property.name === 'BEGIN' && property.value.toUpperCase() === 'VTIMEZONE') zoneId = '';
    else if (property.name === 'END' && property.value.toUpperCase() === 'VTIMEZONE') zoneId = null;
    else if (zoneId !== null && property.name === 'TZID') zoneId = property.value.trim();
    else if (zoneId && property.name === 'X-LIC-LOCATION' && isKnownZone(property.value.trim())) locations.set(zoneId, property.value.trim());
    else if (property.name === 'X-WR-CALNAME' && !name) name = unescapeText(property.value).trim();
  }
  const events: IcsEvent[] = [];
  let current: Property[] | null = null;
  let alarm: Property[] | null = null;
  let alarms: Property[][] = [];
  let depth = 0;
  for (const line of lines) {
    const property = parseLine(line);
    if (!property) continue;
    const value = property.value.trim().toUpperCase();
    if (property.name === 'BEGIN') {
      if (value === 'VEVENT' && current === null) {
        current = [];
        alarms = [];
        depth = 0;
      } else if (current !== null && value === 'VALARM') alarm = [];
      else if (current !== null) depth += 1;
      continue;
    }
    if (property.name === 'END') {
      if (value === 'VALARM' && alarm) {
        alarms.push(alarm);
        alarm = null;
      } else if (value === 'VEVENT' && current) {
        const event = readEvent(current, alarms, locations);
        if (event) events.push(event);
        current = null;
      } else if (current !== null && depth > 0) depth -= 1;
      continue;
    }
    if (alarm) alarm.push(property);
    else if (current && depth === 0) current.push(property);
  }
  return { name, events };
}

function readEvent(properties: readonly Property[], alarms: readonly Property[][], locations: ReadonlyMap<string, string>): IcsEvent | null {
  const one = (name: string): Property | undefined => properties.find(property => property.name === name);
  const text = (name: string): string => {
    const property = one(name);
    return property ? unescapeText(property.value).trim() : '';
  };
  const startProperty = one('DTSTART');
  if (!startProperty) return null;
  const firstZone = zoneOf(startProperty.params.TZID, locations);
  const start = readWhen(startProperty, firstZone, locations);
  if (!start) return null;
  const zone = start.zone;
  let end: string | null = null;
  const endProperty = one('DTEND') ?? one('DUE');
  if (endProperty) end = readWhen(endProperty, zone, locations)?.value ?? null;
  if (end && isDay(start.value) !== isDay(end)) end = null;
  if (!end) {
    const duration = one('DURATION');
    const minutes = duration ? durationMinutes(duration.value) : null;
    if (isDay(start.value)) end = addDays(start.value, minutes !== null && minutes >= 1440 ? Math.round(minutes / 1440) : 1);
    else end = addMinutes(start.value, minutes !== null && minutes > 0 ? minutes : 0);
  }
  if (end < start.value || (isDay(start.value) && end === start.value)) end = isDay(start.value) ? addDays(start.value, 1) : start.value;
  const exdates: string[] = [];
  for (const property of properties.filter(each => each.name === 'EXDATE')) {
    for (const piece of property.value.split(',')) {
      const read = readWhen({ ...property, value: piece }, zone, locations);
      if (read) exdates.push(isDay(start.value) ? read.value.slice(0, 10) : read.value.length === 10 ? `${read.value}${start.value.slice(10)}` : read.value);
    }
  }
  const recurrence = one('RECURRENCE-ID');
  const recurrenceId = recurrence ? readWhen(recurrence, zone, locations)?.value ?? '' : '';
  const reminders: number[] = [];
  for (const alarm of alarms) {
    const trigger = alarm.find(property => property.name === 'TRIGGER');
    if (!trigger || trigger.params.VALUE === 'DATE-TIME' || trigger.params.RELATED === 'END') continue;
    const minutes = durationMinutes(trigger.value);
    if (minutes !== null && reminders.length < 5) reminders.push(-minutes);
  }
  const rrule = one('RRULE')?.value.trim() ?? '';
  return {
    uid: one('UID')?.value.trim() ?? '',
    title: text('SUMMARY'),
    description: text('DESCRIPTION'),
    place: text('LOCATION'),
    url: one('URL')?.value.trim() ?? '',
    start: start.value,
    end,
    timeZone: isDay(start.value) ? '' : zone,
    rrule,
    exdates,
    recurrenceId: recurrenceId && isDay(start.value) ? recurrenceId.slice(0, 10) : recurrenceId,
    cancelled: (one('STATUS')?.value.trim().toUpperCase() ?? '') === 'CANCELLED',
    reminders: [...new Set(reminders)],
    categories: properties.filter(property => property.name === 'CATEGORIES').flatMap(property => property.value.split(',').map(each => unescapeText(each).trim()).filter(Boolean)),
  };
}

// ── writing ────────────────────────────────────────────────────────────────

const pad = (value: number): string => String(value).padStart(2, '0');

/** Lines of at most 75 octets, continued on a line starting with a space. */
const utf8Length = (char: string): number => {
  const code = char.codePointAt(0) ?? 0;
  return code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
};

function fold(line: string): string {
  if (line.length <= 25 || [...line].reduce((sum, char) => sum + utf8Length(char), 0) <= 75) return line;
  const out: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const bytes = utf8Length(char);
    if (size + bytes > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += bytes;
  }
  out.push(current);
  return out.join('\r\n ');
}

function utcStamp(instant: number): string {
  const date = new Date(instant);
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

const dayValue = (day: string): string => day.slice(0, 10).replace(/-/g, '');
const wallValue = (wall: string): string => `${wall.replace(/[-:]/g, '')}00`;

/** A time property: a DATE, a UTC time, or a time in its zone (repeating events, so their hour holds). */
function whenLine(name: string, value: string, zone: string, inZone: boolean): string {
  if (DAY_PATTERN.test(value)) return `${name};VALUE=DATE:${dayValue(value)}`;
  if (inZone && zone) return `${name};TZID=${zone}:${wallValue(value)}`;
  if (!zone) return `${name}:${wallValue(value)}`;
  return `${name}:${utcStamp(wallToInstant(value, zone))}`;
}

export interface WriteOptions {
  readonly name: string;
  /** The suite's product id, `-//Unlease//Agenda//FR`. */
  readonly productId: string;
  /** When it is written (DTSTAMP). */
  readonly now: number;
  /** The description as plain text (mentions named): rich text is the suite's own. */
  readonly plain: (event: CalendarEvent) => string;
  /** Its labels' names, as CATEGORIES. */
  readonly categories?: (event: CalendarEvent) => readonly string[];
  /** The UID of an event made here: its id, at the suite's domain. */
  readonly uidOf?: (event: CalendarEvent) => string;
}

/** A calendar file of these events (series, exceptions and single ones; the bin and tombstones left out by the caller). */
export function writeIcs(events: readonly CalendarEvent[], options: WriteOptions): string {
  const byId = new Map(events.map(event => [event.id, event]));
  const uid = (event: CalendarEvent): string => event.uid || options.uidOf?.(event) || `${event.id}@unlease`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${options.productId}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(options.name)}`];
  for (const event of events) {
    const series = event.recurringId ? byId.get(event.recurringId) : undefined;
    if (event.recurringId && !series) continue;
    const zoned = !!event.rrule || !!series;
    lines.push('BEGIN:VEVENT', `UID:${uid(series ?? event)}`, `DTSTAMP:${utcStamp(options.now)}`);
    if (event.createdAt > 0) lines.push(`CREATED:${utcStamp(event.createdAt)}`);
    if (event.editedAt > 0) lines.push(`LAST-MODIFIED:${utcStamp(event.editedAt)}`);
    lines.push(whenLine('DTSTART', event.start, event.timeZone, zoned));
    lines.push(whenLine('DTEND', event.end, event.timeZone, zoned));
    if (series && event.originalStart) lines.push(whenLine('RECURRENCE-ID', event.originalStart, series.timeZone, true));
    if (event.rrule) lines.push(`RRULE:${event.rrule}`);
    for (const exdate of event.exdates) lines.push(whenLine('EXDATE', exdate, event.timeZone, true));
    lines.push(`SUMMARY:${escapeText(event.title)}`);
    const description = options.plain(event).trim();
    if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
    if (event.place.trim()) lines.push(`LOCATION:${escapeText(event.place.trim())}`);
    if (event.url.trim()) lines.push(`URL:${event.url.trim()}`);
    const categories = options.categories?.(event) ?? [];
    if (categories.length > 0) lines.push(`CATEGORIES:${categories.map(escapeText).join(',')}`);
    for (const minutes of event.reminders) {
      const sign = minutes > 0 ? '-' : '';
      const value = Math.abs(minutes);
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(event.title || 'Rappel')}`, `TRIGGER:${sign}P${value % 1440 === 0 && value > 0 ? `${value / 1440}D` : `T${value}M`}`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
