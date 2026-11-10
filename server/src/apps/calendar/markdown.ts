/**
 * Agenda in a backup, as people read it and as other calendars import it: `Agenda/Agenda.ics`,
 * one's own events (series, exceptions, single ones) as iCalendar, which Google Agenda, a phone or
 * Thunderbird read back; and `Agenda/Agenda.md`, the same as a list by month, with their places,
 * people, descriptions (mentions named) and files linked where the archive keeps them. Subscribed
 * calendars and holidays are left out: their addresses bring them back.
 */
import { APP_NAME } from '@unlease/calendar/brand';
import { isAllDay, type CalendarEvent, type CalendarLabel } from '@unlease/calendar/models/events';
import { writeIcs } from '@unlease/calendar/services/ics';
import { describeRule, parseRule } from '@unlease/calendar/services/recurrence';
import { labelFromRecord } from '@unlease/calendar/sync/entities';
import { SUITE_NAME, SUITE_SLUG } from '@unlease/core/apps';
import { markupToPlain } from '@unlease/core/services/richText';
import { escapeLabel, FILES_DIR, relativeLink, type MarkdownFile } from '../../backup/markdown';
import type { StoredRecord } from '../../sync/records';
import { FOLDER } from './files';
import { calendarNamer, publishedNamer, UNNAMED } from './names';

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** One's own live events: no subscription's, nothing in the bin, no exception whose series is gone. */
export function ownEvents(events: readonly CalendarEvent[]): CalendarEvent[] {
  const live = events.filter(event => event.feedId === null && event.deletedAt === null && event.trashedAt === null);
  const ids = new Set(live.map(event => event.id));
  return live.filter(event => !event.recurringId || ids.has(event.recurringId));
}

function labelsOf(all: readonly StoredRecord[]): Map<string, CalendarLabel> {
  const out = new Map<string, CalendarLabel>();
  for (const record of all) if (record.type === 'calendarLabel') out.set(record.id, labelFromRecord(record));
  return out;
}

/**
 * The calendar file of one's own events: the backup's, its mentions named as the apps name them;
 * or the published address's (`published`), which names only contacts and the events it holds.
 */
export function ownIcs(events: readonly CalendarEvent[], all: readonly StoredRecord[], now: number, options: { readonly published?: boolean } = {}): string {
  const labels = labelsOf(all);
  const own = ownEvents(events);
  const name = options.published ? publishedNamer(all, own) : calendarNamer(all);
  const unnamed = options.published ? UNNAMED : '?';
  return writeIcs(own, {
    name: APP_NAME,
    productId: `-//${SUITE_NAME}//${APP_NAME}//FR`,
    now,
    plain: event => markupToPlain(event.description, target => name(target) ?? unnamed),
    categories: event => event.labelIds.map(id => labels.get(id)).filter(label => label && label.deletedAt === null).map(label => label!.name),
    uidOf: event => `${event.id}@${SUITE_SLUG}`,
  });
}

/** « 2 novembre 2026, 14:30 – 15:30 (Europe/Paris) », « 24 – 26 décembre 2026 ». */
function whenWords(event: CalendarEvent): string {
  const day = (value: string): string => `${Number(value.slice(8, 10))} ${MONTHS[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`;
  if (isAllDay(event)) {
    const last = new Date(Date.parse(`${event.end}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    return last === event.start ? `${day(event.start)}, toute la journée` : `${day(event.start)} – ${day(last)}`;
  }
  const zone = event.timeZone ? ` (${event.timeZone})` : '';
  return event.end.slice(0, 10) === event.start.slice(0, 10) ? `${day(event.start)}, ${event.start.slice(11)} – ${event.end.slice(11)}${zone}` : `${day(event.start)} ${event.start.slice(11)} – ${day(event.end)} ${event.end.slice(11)}${zone}`;
}

export function calendarMarkdown(events: readonly CalendarEvent[], all: readonly StoredRecord[], files: ReadonlyMap<string, string>, now: number): MarkdownFile[] {
  const own = ownEvents(events);
  if (own.length === 0) return [];
  const labels = labelsOf(all);
  const name = calendarNamer(all);
  const listPath = `${FOLDER}/${FOLDER}.md`;
  const byId = new Map(own.map(event => [event.id, event]));
  const lines = [`# ${FOLDER}`, ''];
  let month = '';
  for (const event of [...own].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.title.localeCompare(b.title)))) {
    const eventMonth = event.start.slice(0, 7);
    if (eventMonth !== month) {
      month = eventMonth;
      lines.push(`## ${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`, '');
    }
    lines.push(`### ${escapeLabel(event.title.trim() || 'Sans titre')}`, '');
    lines.push(`- Quand : ${whenWords(event)}`);
    const series = event.recurringId ? byId.get(event.recurringId) : undefined;
    if (series) lines.push(`- Remplace une occurrence de « ${escapeLabel(series.title.trim() || 'Sans titre')} » (${event.originalStart.replace('T', ' ')})`);
    const rule = event.rrule ? parseRule(event.rrule) : null;
    if (rule) lines.push(`- Répétition : ${describeRule(rule, event.start, event.timeZone)}`);
    if (event.place.trim()) lines.push(`- Lieu : ${escapeLabel(event.place.trim())}`);
    const people = event.contactIds.map(id => name({ type: 'contact', id })).filter((each): each is string => !!each);
    if (people.length > 0) lines.push(`- Avec : ${people.map(escapeLabel).join(', ')}`);
    const names = event.labelIds.map(id => labels.get(id)).filter(label => label && label.deletedAt === null).map(label => label!.name);
    if (names.length > 0) lines.push(`- Libellés : ${names.map(escapeLabel).join(', ')}`);
    if (event.url.trim()) lines.push(`- Adresse : <${event.url.trim()}>`);
    for (const file of event.files) {
      const path = files.get(file.id);
      lines.push(path ? `- Fichier : [${escapeLabel(file.name || 'fichier')}](${relativeLink(listPath, `${FILES_DIR}/${path}`)})` : `- Fichier : ${escapeLabel(file.name || 'fichier')}`);
    }
    const description = markupToPlain(event.description, target => {
      const found = name(target);
      return found !== null ? `@${found}` : '@indisponible';
    }).trim();
    if (description) lines.push('', ...description.split('\n').map(line => `> ${line}`));
    lines.push('');
  }
  return [
    { path: `${FOLDER}/${FOLDER}.ics`, text: ownIcs(events, all, now) },
    { path: listPath, text: `${lines.join('\n').trimEnd()}\n` },
  ];
}
