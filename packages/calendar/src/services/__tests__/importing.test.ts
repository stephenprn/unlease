import { setLocale } from '@unlease/core/i18n';
import type { CalendarEvent, CalendarLabel } from '../../models/events';
import { eventFromRecord } from '../../sync/entities';
import { parseIcs } from '../ics';
import { defaultImportChoices, forgetImport, importChanges, importedEvents, importUid, knownCalendar, periodCounts, planImport, type ImportFile } from '../importing';
import { importCounts, importEntries, importReport, importWhen, labelHelp, periodOptions } from '../importWords';
import { deviceZone } from '../time';

const NOW = Date.UTC(2026, 10, 12, 12);

/** Words as read: the narrow spaces the interface puts between a number and its noun, plain. */
const plain = (words: string | undefined): string | undefined => words?.replace(/\u00a0/g, ' ');

const ics = (name: string, ...events: string[][]): string => ['BEGIN:VCALENDAR', ...(name ? [`X-WR-CALNAME:${name}`] : []), ...events.flatMap(lines => ['BEGIN:VEVENT', ...lines, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
const file = (fileName: string, text: string): ImportFile => ({ fileName, calendar: parseIcs(text) });

const counter = () => {
  let n = 0;
  return () => `id${(n += 1)}`;
};

/** What a plan writes, as the store would read it back. */
const written = (creates: readonly { id: string; fields: Record<string, unknown> }[]): CalendarEvent[] => creates.map(entry => eventFromRecord({ type: 'calendarEvent', id: entry.id, fields: entry.fields, clocks: {} }));

const label = (id: string, name: string): CalendarLabel => ({ id, name, color: 'green', position: 'a0', createdAt: 0, deletedAt: null });

const PAST = ['UID:past@test', 'DTSTART;VALUE=DATE:20240310', 'SUMMARY:Anniversaire de mariage'];
const WEEKLY = ['UID:weekly@test', 'DTSTART;TZID=Europe/Paris:20230102T090000', 'DTEND;TZID=Europe/Paris:20230102T100000', 'RRULE:FREQ=WEEKLY;BYDAY=MO', 'SUMMARY:Sport', 'BEGIN:VALARM', 'TRIGGER:-PT30M', 'END:VALARM'];
const ENDED = ['UID:ended@test', 'DTSTART;TZID=Europe/Paris:20230102T090000', 'DTEND;TZID=Europe/Paris:20230102T100000', 'RRULE:FREQ=WEEKLY;COUNT=3', 'SUMMARY:Stage'];
const SOON = ['UID:soon@test', 'DTSTART;TZID=Europe/Paris:20261120T193000', 'DTEND;TZID=Europe/Paris:20261120T220000', 'SUMMARY:Concert', 'LOCATION:Salle Pleyel\\nParis'];
const LAST_SPRING = ['UID:spring@test', 'DTSTART;VALUE=DATE:20260402', 'DTEND;VALUE=DATE:20260405', 'SUMMARY:Week-end à Lyon'];

describe('planning an import', () => {
  beforeEach(() => setLocale('fr'));

  it('keeps the period chosen: a series still repeating counts as to come', () => {
    const files = [file('perso.ics', ics('Perso', PAST, WEEKLY, ENDED, SOON, LAST_SPRING))];
    const keys = (period: 'all' | 'year' | 'upcoming') =>
      planImport(files, [], NOW, counter(), { period })
        .creates.map(entry => entry.fields.uid)
        .sort();
    expect(keys('all')).toEqual(['ended@test', 'past@test', 'soon@test', 'spring@test', 'weekly@test']);
    expect(keys('year')).toEqual(['soon@test', 'spring@test', 'weekly@test']);
    expect(keys('upcoming')).toEqual(['soon@test', 'weekly@test']);
    expect(periodCounts(files, [], NOW, {})).toEqual({ all: 5, year: 3, upcoming: 2 });
    const plan = planImport(files, [], NOW, counter(), { period: 'upcoming' });
    expect(plan.items.find(item => item.event?.uid === 'past@test')).toMatchObject({ fate: 'skip', why: 'past' });
  });

  it('files each calendar under a label of its name, one already here joined, labels written first', () => {
    const files = [file('perso.ics', ics('Perso', SOON)), file('travail.ics', ics('Travail', LAST_SPRING)), file('autre.ics', ics('', WEEKLY))];
    const choices = { ...defaultImportChoices(files), labelNames: ['Perso', 'TRAVAÎL', 'Perso'] };
    const plan = planImport(files, [], NOW, counter(), { ...choices, labels: { l1: label('l1', 'Travail') } });
    // « Perso » made once for the two files that name it; « Travail » is the one here.
    expect(plan.labels).toHaveLength(1);
    expect(plan.labels[0]!.fields).toMatchObject({ name: 'Perso', deletedAt: null });
    expect(plan.labelIds).toEqual([plan.labels[0]!.id, 'l1', plan.labels[0]!.id]);
    const byUid = Object.fromEntries(plan.creates.map(entry => [entry.fields.uid, entry.fields.labelIds]));
    expect(byUid).toEqual({ 'soon@test': [plan.labels[0]!.id], 'spring@test': ['l1'], 'weekly@test': [plan.labels[0]!.id] });
    const batch = importChanges(plan);
    expect(batch[0]).toMatchObject({ type: 'calendarLabel', id: plan.labels[0]!.id });
    expect(forgetImport(plan, 9)).toContainEqual({ type: 'calendarLabel', id: plan.labels[0]!.id, patch: { deletedAt: 9 } });
    expect(labelHelp('travail', { l1: label('l1', 'Travail') })).toBe('Ce libellé existe déjà : les événements le rejoignent.');
    expect(labelHelp('  ', {})).toBe('Sans nom, ces événements ne sont rangés sous aucun libellé.');
  });

  it('takes the file’s reminders, none, or the device’s own', () => {
    const files = [file('perso.ics', ics('Perso', WEEKLY, LAST_SPRING))];
    const reminders = (choice: 'file' | 'none' | 'yours') => Object.fromEntries(planImport(files, [], NOW, counter(), { reminders: choice, defaults: { timed: [10], allDay: [-540] } }).creates.map(entry => [entry.fields.uid, entry.fields.reminders]));
    expect(reminders('file')).toEqual({ 'weekly@test': [30], 'spring@test': [] });
    expect(reminders('none')).toEqual({ 'weekly@test': [], 'spring@test': [] });
    expect(reminders('yours')).toEqual({ 'weekly@test': [10], 'spring@test': [-540] });
  });

  it('leaves out what is unticked, a series with its occurrences', () => {
    const moved = ['UID:weekly@test', 'RECURRENCE-ID;TZID=Europe/Paris:20261116T090000', 'DTSTART;TZID=Europe/Paris:20261116T110000', 'DTEND;TZID=Europe/Paris:20261116T120000', 'SUMMARY:Sport (décalé)'];
    const files = [file('perso.ics', ics('Perso', WEEKLY, moved, SOON))];
    const all = planImport(files, [], NOW, counter());
    expect(all.creates).toHaveLength(3);
    expect(all.items).toHaveLength(2);
    expect(all.items.find(item => item.event?.uid === 'weekly@test')).toMatchObject({ modified: 1, fate: 'new' });
    const weekly = all.items.find(item => item.event?.uid === 'weekly@test')!.key;
    const plan = planImport(files, [], NOW, counter(), { leftOut: new Set([weekly]) });
    expect(plan.creates.map(entry => entry.fields.uid)).toEqual(['soon@test']);
    expect(plan.count).toBe(1);
    expect(plan.items.find(item => item.key === weekly)).toMatchObject({ fate: 'new', leftOut: true });
  });

  it('says what it leaves out: cancelled, unreadable, twice, an occurrence without its series', () => {
    const cancelled = ['UID:off@test', 'STATUS:CANCELLED', 'DTSTART;VALUE=DATE:20261201', 'SUMMARY:Annulé'];
    const noStart = ['UID:nostart@test', 'SUMMARY:Sans date'];
    const lonely = ['UID:lonely@test', 'RECURRENCE-ID:20261201T090000Z', 'DTSTART:20261201T100000Z', 'SUMMARY:Seule'];
    const files = [file('a.ics', ics('A', SOON, cancelled, noStart, lonely)), file('b.ics', ics('B', SOON))];
    const plan = planImport(files, [], NOW, counter());
    const why = (title: string) => plan.items.find(item => (item.event?.title ?? item.unreadable?.title) === title && item.why !== null)?.why;
    expect(why('Annulé')).toBe('cancelled');
    expect(why('Sans date')).toBe('unreadable');
    expect(why('Seule')).toBe('orphan');
    expect(plan.items.filter(item => item.event?.uid === 'soon@test').map(item => [item.fate, item.why, item.twin])).toEqual([
      ['new', null, null],
      ['skip', 'twice', 0],
    ]);
    expect(plan.creates).toHaveLength(1);
    const entries = importEntries(plan, { files, now: NOW });
    expect(entries.find(entry => entry.title === 'Sans date')).toMatchObject({ fate: 'skip', why: 'Illisible : il n’a pas de date de début', glyph: 'alert' });
    expect(entries.filter(entry => entry.title === 'Concert').map(entry => entry.why)).toEqual([undefined, 'En double : déjà dans « A »']);
    const report = importReport(plan, { files, now: NOW }, {});
    expect(report.imported.map(plain)).toEqual(['1 événement importés']);
    expect(report.skipped.map(plain)).toEqual(['1 annulé dans le fichier', '1 illisible faute de date', '1 en double', '1 occurrence sans sa série']);
  });

  it('knows an event without a UID again, and an export of what is here', () => {
    const bare = ['DTSTART;VALUE=DATE:20261224', 'SUMMARY:Réveillon'];
    const files = [file('perso.ics', ics('Perso', bare, SOON))];
    const first = planImport(files, [], NOW, counter());
    expect(first.creates).toHaveLength(2);
    const again = planImport(files, written(first.creates), NOW, counter());
    expect(again.creates).toHaveLength(0);
    expect(again.items.map(item => item.why)).toEqual(['here', 'here']);
    expect(importUid(parseIcs(ics('', bare)).events[0]!)).toBe(first.creates.find(entry => entry.fields.title === 'Réveillon')!.fields.uid);
    // « Retirer ces événements » finds it by the same UID.
    expect(importedEvents(files[0]!.calendar, written(first.creates))).toHaveLength(2);
  });

  it('completes a series here with what a newer export or an invitation changes', () => {
    const series = planImport([file('perso.ics', ics('Perso', WEEKLY))], [], NOW, counter(), { labelNames: ['Perso'] });
    const here = [...written(series.creates)];
    const seriesId = series.creates[0]!.id;
    const moved = ['UID:weekly@test', 'RECURRENCE-ID;TZID=Europe/Paris:20261116T090000', 'DTSTART;TZID=Europe/Paris:20261116T110000', 'DTEND;TZID=Europe/Paris:20261116T120000', 'SUMMARY:Sport (décalé)'];
    const off = ['UID:weekly@test', 'STATUS:CANCELLED', 'RECURRENCE-ID;TZID=Europe/Paris:20261123T090000', 'DTSTART;TZID=Europe/Paris:20261123T090000', 'SUMMARY:Sport'];
    // A newer export: the series and what changed of it.
    const newer = planImport([file('perso.ics', ics('Perso', WEEKLY, moved, off))], here, NOW, counter());
    expect(newer.items).toHaveLength(1);
    expect(newer.items[0]).toMatchObject({ fate: 'update', why: 'adds', adds: { modified: 1, cancelled: 1 } });
    expect(newer.creates).toHaveLength(1);
    expect(newer.creates[0]!.fields).toMatchObject({ recurringId: seriesId, originalStart: '2026-11-16T09:00', labelIds: series.creates[0]!.fields.labelIds });
    expect(newer.updates).toEqual([{ id: seriesId, patch: { exdates: ['2026-11-23T09:00'] }, before: { exdates: [] } }]);
    expect(forgetImport(newer, 9)).toContainEqual({ type: 'calendarEvent', id: seriesId, patch: { exdates: [] } });
    // An invitation's update for one meeting, alone: it joins the series here.
    const invitation = planImport([file('invite.ics', ics('', moved))], here, NOW, counter());
    expect(invitation.items[0]).toMatchObject({ fate: 'new', why: 'joins' });
    expect(invitation.creates[0]!.fields.recurringId).toBe(seriesId);
    expect(importEntries(invitation, { files: [file('invite.ics', ics('', moved))], now: NOW })[0]!.why).toBe('Modifie une date de « Sport », déjà dans votre agenda');
  });

  it('leaves the holidays and birthdays calendars out at first, among others', () => {
    expect(knownCalendar('Jours fériés en France')).toBe('holidays');
    expect(knownCalendar('Holidays in United Kingdom')).toBe('holidays');
    expect(knownCalendar('Anniversaires')).toBe('birthdays');
    expect(knownCalendar('Perso')).toBeNull();
    const files = [file('perso.ics', ics('Perso', SOON)), file('feries.ics', ics('Jours fériés en France', LAST_SPRING))];
    const choices = defaultImportChoices(files);
    expect([...choices.filesOff]).toEqual([1]);
    const plan = planImport(files, [], NOW, counter(), choices);
    expect(plan.items.find(item => item.file === 1)).toMatchObject({ fate: 'skip', why: 'fileOff' });
    // Alone, a calendar comes as asked.
    expect([...defaultImportChoices([files[1]!]).filesOff]).toEqual([]);
    // A named calendar is filed under its name; an invitation's file, one event and no name, under none.
    expect(defaultImportChoices(files).labelNames).toEqual(['Perso', 'Jours fériés en France']);
    expect(defaultImportChoices([file('invite.ics', ics('', SOON))]).labelNames).toBeNull();
    expect(defaultImportChoices([file('club.ics', ics('', SOON, LAST_SPRING))]).labelNames).toEqual(['club']);
  });
});

describe('an import’s words', () => {
  beforeEach(() => setLocale('fr'));

  it('says when in the event’s own zone, how it repeats, sorted by date', () => {
    const away = deviceZone() === 'America/New_York' ? 'Asia/Tokyo' : 'America/New_York';
    const call = ['UID:call@test', `DTSTART;TZID=${away}:20261203T090000`, `DTEND;TZID=${away}:20261203T093000`, 'SUMMARY:Appel'];
    const files = [file('perso.ics', ics('Perso', SOON, WEEKLY, call, LAST_SPRING))];
    const plan = planImport(files, [], NOW, counter());
    const entries = importEntries(plan, { files, now: NOW });
    expect(entries.map(entry => entry.title)).toEqual(['Sport', 'Week-end à Lyon', 'Concert', 'Appel']);
    expect(entries[0]!.note).toBe('Se répète toutes les semaines le lundi');
    expect(entries[0]!.glyph).toBe('refresh');
    expect(plain(entries[1]!.detail)).toBe('Du jeu. 2 avr. au sam. 4 avr.');
    expect(plain(entries[2]!.detail)).toMatch(/^ven\. 20 nov\. · 19:30 – 22:00( \(heure de Paris\))? · Salle Pleyel$/);
    expect(plain(entries[3]!.detail)).toBe(`jeu. 3 déc. · 09:00 – 09:30 (heure de ${away.split('/')[1]!.replace('_', ' ')})`);
    expect(plain(importWhen({ start: '2026-12-24', end: '2026-12-25', timeZone: '' }, NOW))).toBe('jeu. 24 déc. · Toute la journée');
    const counts = importCounts(plan, { files, now: NOW });
    expect(counts.map(line => plain(line.text))).toEqual(['Agenda « Perso »', '4 événements', '4 événements à importer', '2 fuseaux horaires']);
    expect(plain(counts[1]!.meta ?? '')).toBe('Dont 1 série, 1 sur la journée');
  });

  it('counts what each period brings', () => {
    const options = periodOptions({ all: 5, year: 3, upcoming: 2 }, NOW);
    expect(options.map(option => plain(option.meta))).toEqual(['Le passé compris : 5 événements', 'À partir du 12 nov. 2025 : 3 événements', 'À partir d’aujourd’hui : 2 événements']);
  });
});
