/**
 * How an import reads, on both clients (`importing.ts` plans it): each event of the preview with its
 * day and time in its own zone, its place, how it repeats and what the file changes of it, and why it
 * is left out; the counts over it; the choices' words, each with what it brings; the report.
 */
import { getLocale, t } from '@unlease/core/i18n';
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
    if (last <= event.start) return `${weekdayDay(event.start, year)} · ${t('Toute la journée')}`;
    return t('Du {from} au {to}', { from: weekdayDay(event.start, year), to: weekdayDay(last, year) });
  }
  const clock = (wall: string): string => clockWords(clockPart(wall), twelveHours);
  const day = event.start.slice(0, 10);
  const endDay = event.end.slice(0, 10);
  const when =
    day === endDay
      ? `${weekdayDay(day, year)} · ${clock(event.start)}${event.end > event.start ? ` – ${clock(event.end)}` : ''}`
      : `${weekdayDay(day, year)} ${clock(event.start)} – ${weekdayDay(endDay, year)} ${clock(event.end)}`;
  if (!event.timeZone || event.timeZone === deviceZone()) return when;
  return event.timeZone === 'UTC' ? t('{when} (UTC)', { when }) : t('{when} (heure de {place})', { when, place: zonePlace(event.timeZone) });
}

/** How a series repeats: « Se répète toutes les semaines le lundi », or that only its first date will show. */
export function repeatWords(event: Pick<IcsEvent, 'rrule' | 'start' | 'timeZone'>): string | null {
  if (!event.rrule) return null;
  const rule = parseRule(event.rrule);
  if (!rule || rule.partial) return t('Se répète selon une règle qu’Agenda ne sait pas lire : seule sa première date s’affichera.');
  const words = describeRule(rule, event.start, event.timeZone || undefined);
  return t('Se répète {rule}', { rule: words.charAt(0).toLocaleLowerCase() + words.slice(1) });
}

/** The occurrences a file changes of a series: « 2 occurrences modifiées, 1 annulée ». */
function changesWords(modified: number, cancelled: number): string {
  return [modified > 0 ? plural(modified, 'occurrence modifiée', 'occurrences modifiées') : '', cancelled > 0 ? plural(cancelled, 'occurrence annulée', 'occurrences annulées') : ''].filter(Boolean).join(', ');
}

const calendarName = (context: ImportWordsContext, file: number): string => {
  const found = context.files[file];
  return (found ? importFileName(found) : '') || t('Agenda sans nom');
};

/** Why an event does not come as it is, or what it brings to what is here. */
export function whyWords(item: ImportItem, context: ImportWordsContext): string | null {
  switch (item.why) {
    case null:
      return null;
    case 'here':
      return t('Déjà dans votre agenda');
    case 'subscribed': {
      if (item.feedId === HOLIDAYS_FEED_ID) return t('Déjà là : un jour férié');
      const name = item.feedId ? context.feedName?.(item.feedId) : null;
      return name ? t('Déjà là par l’abonnement « {name} »', { name }) : t('Déjà là par un abonnement');
    }
    case 'twice':
      return item.twin !== null && item.twin !== item.file ? t('En double : déjà dans « {calendar} »', { calendar: calendarName(context, item.twin) }) : t('En double dans le fichier');
    case 'cancelled':
      return t('Annulé dans le fichier');
    case 'orphan':
      return t('Une occurrence modifiée dont la série n’est ni dans le fichier ni dans votre agenda');
    case 'unreadable':
      return item.unreadable?.reason === 'noStart' ? t('Illisible : il n’a pas de date de début') : t('Illisible : sa date de début ne se lit pas');
    case 'past': {
      const since = periodStart(context.period ?? 'all', context.now);
      return since ? t('Terminé avant le {day}', { day: shortDay(since, yearOf(context.now)) }) : null;
    }
    case 'fileOff':
      return t('Vous laissez de côté l’agenda « {calendar} »', { calendar: calendarName(context, item.file) });
    case 'adds':
      return t('Ajoute à la série déjà là : {changes}', { changes: changesWords(item.adds.modified, item.adds.cancelled) });
    case 'joins': {
      const title = item.series?.title.trim() || t('Sans titre');
      return item.fate === 'update' ? t('Annule une date de « {title} », déjà dans votre agenda', { title }) : t('Modifie une date de « {title} », déjà dans votre agenda', { title });
    }
  }
}

/** Every line of the preview: its title, when and where, how it repeats, its fate and why. */
export function importEntries(plan: ImportPlan, context: ImportWordsContext): PreviewEntry[] {
  return plan.items.map(item => {
    const event = item.event;
    const title = (event?.title ?? item.unreadable?.title ?? '').trim() || t('Sans titre');
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
  if (cancelled > 0) out.push(plural(cancelled, 'annulé dans le fichier', 'annulés dans le fichier'));
  const past = count(item => item.why === 'past');
  const since = periodStart(context.period ?? 'all', context.now);
  if (past > 0 && since) {
    const words = { count: counted(past), day: shortDay(since, yearOf(context.now)) };
    out.push(one(past) ? t('{count} terminé avant le {day}', words) : t('{count} terminés avant le {day}', words));
  }
  const unreadable = count(item => item.why === 'unreadable');
  if (unreadable > 0) out.push(plural(unreadable, 'illisible faute de date', 'illisibles faute de date'));
  const twice = count(item => item.why === 'twice');
  if (twice > 0) out.push(plural(twice, 'en double', 'en double'));
  const orphans = count(item => item.why === 'orphan');
  if (orphans > 0) out.push(plural(orphans, 'occurrence sans sa série', 'occurrences sans leur série'));
  const unticked = count(item => item.leftOut);
  if (unticked > 0) out.push(plural(unticked, 'décoché par vous', 'décochés par vous'));
  for (const file of new Set(plan.items.filter(item => item.why === 'fileOff').map(item => item.file))) {
    out.push(t('L’agenda « {calendar} » ({events})', { calendar: calendarName(context, file), events: plural(count(item => item.file === file), 'événement') }));
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
      ? { icon: 'calendar', text: t('Agenda « {calendar} »', { calendar: names[0]! }), meta: context.files[0]!.fileName || null }
      : { icon: 'calendar', text: plural(names.length, 'agenda'), meta: names.join(', ') },
  );
  const events = plan.items.filter(item => item.event !== null);
  const series = events.filter(item => item.event!.rrule && item.why !== 'joins').length;
  const allDay = events.filter(item => isDay(item.event!.start)).length;
  const modified = events.reduce((sum, item) => sum + item.modified, 0);
  const holds = [series > 0 ? plural(series, 'série', 'séries') : '', allDay > 0 ? plural(allDay, 'sur la journée', 'sur la journée') : '', modified > 0 ? plural(modified, 'occurrence modifiée', 'occurrences modifiées') : ''].filter(Boolean);
  lines.push({ icon: 'list', text: plural(plan.items.length, 'événement'), meta: holds.length > 0 ? t('Dont {list}', { list: holds.join(', ') }) : null });
  const updates = plan.items.filter(item => item.fate === 'update' && !item.leftOut).length;
  lines.push({
    icon: 'download',
    text: plan.count > 0 ? t('{count} à importer', { count: plural(plan.count, 'événement') }) : t('Rien de nouveau à importer.'),
    meta: updates > 0 ? t('Dont {series} déjà là, que le fichier complète', { series: plural(updates, 'série', 'séries') }) : null,
  });
  const same = plan.items.filter(item => item.fate === 'same').length;
  if (same > 0) lines.push({ icon: 'check', text: t('{events} déjà dans l’agenda', { events: plural(same, 'événement') }), meta: t('Reconnus à leur identifiant : importés avant, ou servis par un abonnement.') });
  const left = plan.items.filter(item => item.fate === 'skip' || item.leftOut).length;
  if (left > 0) lines.push({ icon: 'eyeOff', text: plural(left, 'laissé de côté', 'laissés de côté'), meta: leftOutWords(plan, context).join(', ') });
  const zones = importZones(plan);
  if (zones.length > 1) lines.push({ icon: 'globe', text: plural(zones.length, 'fuseau horaire', 'fuseaux horaires'), meta: t('Chaque événement garde son heure sur place : {zones}', { zones: zones.slice(0, 6).map(zonePlace).join(', ') + (zones.length > 6 ? '…' : '') }) });
  return lines;
}

/** What the period's choices bring: each with how many events it keeps. */
export function periodOptions(counts: Readonly<Record<ImportPeriod, number>>, now: number): { readonly value: ImportPeriod; readonly label: string; readonly meta: string }[] {
  const year = periodStart('year', now)!;
  return [
    { value: 'all', label: t('Tous les événements'), meta: t('Le passé compris : {events}', { events: plural(counts.all, 'événement') }) },
    { value: 'year', label: t('Depuis un an'), meta: t('À partir du {day} : {events}', { day: shortDay(year, yearOf(now)), events: plural(counts.year, 'événement') }) },
    { value: 'upcoming', label: t('À venir seulement'), meta: t('À partir d’aujourd’hui : {events}', { events: plural(counts.upcoming, 'événement') }) },
  ];
}

/** The reminders' choices: the file's (how many have some), none, the device's own for a new event. */
export function reminderOptions(plan: ImportPlan, defaults: { readonly timed: readonly number[]; readonly allDay: readonly number[] }): { readonly value: 'file' | 'none' | 'yours'; readonly label: string; readonly meta: string }[] {
  const withSome = plan.items.filter(item => item.event && item.event.reminders.length > 0 && (item.fate === 'new' || item.fate === 'update')).length;
  const list = (minutes: readonly number[], allDay: boolean): string => minutes.map(each => reminderWords(each, allDay)).join(', ') || t('Aucun');
  const allDay = list(defaults.allDay, true);
  return [
    { value: 'file', label: t('Ceux du fichier'), meta: withSome > 0 ? t('{events} en ont dans le fichier.', { events: plural(withSome, 'événement') }) : t('Ce fichier n’en donne aucun.') },
    { value: 'none', label: t('Aucun'), meta: t('Rien ne sonnera pour ces événements.') },
    { value: 'yours', label: t('Vos rappels par défaut'), meta: t('{timed} ; sur la journée : {allDay}', { timed: list(defaults.timed, false), allDay: allDay.charAt(0).toLocaleLowerCase() + allDay.slice(1) }) },
  ];
}

/** Under a label's name: whether it is made or joined, or that a name left empty files nothing. */
export function labelHelp(name: string, labels: Readonly<Record<string, CalendarLabel>>): string {
  const folded = foldText(name.trim());
  if (!folded) return t('Sans nom, ces événements ne sont rangés sous aucun libellé.');
  return Object.values(labels).some(label => label.deletedAt === null && foldText(label.name.trim()) === folded) ? t('Ce libellé existe déjà : les événements le rejoignent.') : t('Un nouveau libellé, créé avec l’import.');
}

/** A calendar's line among the files: how many events, and why it is left out at first. */
export function calendarMeta(file: ImportFile, events: number): string {
  const known = knownCalendar(importFileName(file));
  if (known === 'holidays') return t('{events} · des jours fériés : Agenda les montre déjà, réglés dans l’Administration.', { events: plural(events, 'événement') });
  if (known === 'birthdays') return t('{events} · des anniversaires : Agenda montre déjà ceux de vos contacts.', { events: plural(events, 'événement') });
  return plural(events, 'événement');
}

/** The report: what came in, then what was left out and why. */
export function importReport(plan: ImportPlan, context: ImportWordsContext, labels: Readonly<Record<string, CalendarLabel>>): { readonly imported: string[]; readonly skipped: string[] } {
  const imported: string[] = [];
  const fresh = plan.items.filter(item => item.fate === 'new' && !item.leftOut).length;
  const updated = plan.items.filter(item => item.fate === 'update' && !item.leftOut).length;
  if (fresh > 0) imported.push(t('{events} importés', { events: plural(fresh, 'événement') }));
  if (updated > 0) imported.push(plural(updated, 'série complétée', 'séries complétées'));
  const made = new Map(plan.labels.map(label => [label.id, String(label.fields.name)]));
  const used = [...new Set(plan.labelIds.filter((id): id is string => id !== null))].map(id => made.get(id) ?? labels[id]?.name ?? '').filter(Boolean);
  if (fresh > 0 && used.length === 1) imported.push(t('Rangés sous le libellé « {label} »', { label: used[0]! }));
  else if (fresh > 0 && used.length > 1) imported.push(t('Rangés sous les libellés {labels}', { labels: used.map(name => `« ${name} »`).join(', ') }));
  const skipped: string[] = [];
  const same = plan.items.filter(item => item.fate === 'same').length;
  if (same > 0) skipped.push(t('{events} déjà dans l’agenda', { events: plural(same, 'événement') }));
  skipped.push(...leftOutWords(plan, context));
  return { imported, skipped };
}
