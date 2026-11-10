import { setLocale } from '@unlease/core/i18n';
import { choiceOf, choiceRule, describeRule, expandRule, parseRule, ruleUntilBefore, serializeRule } from '../recurrence';

const expand = (rrule: string, start: string, from: string, to: string, zone = 'Europe/Paris'): readonly string[] => expandRule(parseRule(rrule)!, start, zone, from, to).starts;

describe('repeat rules', () => {
  beforeEach(() => setLocale('fr'));

  it('reads and writes RRULE values', () => {
    const rule = parseRule('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;UNTIL=20261231T225959Z')!;
    expect(rule.freq).toBe('WEEKLY');
    expect(rule.interval).toBe(2);
    expect(rule.byDay.map(day => day.weekday)).toEqual([1, 4]);
    expect(serializeRule(rule)).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;UNTIL=20261231T225959Z');
    expect(parseRule('FREQ=SECONDLY')).toBeNull();
  });

  it('expands daily, weekly, monthly and yearly rules', () => {
    expect(expand('FREQ=DAILY;COUNT=3', '2026-11-02T09:00', '2026-11-01T00:00', '2026-12-01T00:00')).toEqual(['2026-11-02T09:00', '2026-11-03T09:00', '2026-11-04T09:00']);
    expect(expand('FREQ=WEEKLY;BYDAY=MO,WE', '2026-11-02T09:00', '2026-11-01T00:00', '2026-11-12T00:00')).toEqual(['2026-11-02T09:00', '2026-11-04T09:00', '2026-11-09T09:00', '2026-11-11T09:00']);
    expect(expand('FREQ=MONTHLY;BYDAY=-1FR', '2026-01-30', '2026-01-01', '2026-05-01')).toEqual(['2026-01-30', '2026-02-27', '2026-03-27', '2026-04-24']);
    expect(expand('FREQ=MONTHLY;BYMONTHDAY=31', '2026-01-31', '2026-01-01', '2026-06-01')).toEqual(['2026-01-31', '2026-03-31', '2026-05-31']);
    expect(expand('FREQ=YEARLY', '2024-02-29', '2024-01-01', '2029-01-01')).toEqual(['2024-02-29', '2028-02-29']);
    expect(expand('FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1', '2026-11-30', '2026-11-01', '2027-02-01')).toEqual(['2026-11-30', '2026-12-31', '2027-01-29']);
  });

  it('stops at UNTIL and finds occurrences far from the start', () => {
    expect(expand('FREQ=DAILY;UNTIL=20261104', '2026-11-02', '2026-11-01', '2026-11-30')).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
    expect(expand('FREQ=WEEKLY', '2020-01-06T08:00', '2026-11-01T00:00', '2026-11-10T00:00')).toEqual(['2026-11-02T08:00', '2026-11-09T08:00']);
    // UNTIL in UTC, read against the occurrence's instant in its zone.
    expect(expand('FREQ=DAILY;UNTIL=20261103T080000Z', '2026-11-01T09:00', '2026-11-01T00:00', '2026-11-30T00:00')).toEqual(['2026-11-01T09:00', '2026-11-02T09:00', '2026-11-03T09:00']);
  });

  it('says rules in words, and finds the menu’s choice again', () => {
    expect(describeRule(parseRule('FREQ=WEEKLY;BYDAY=MO,TH')!, '2026-11-02')).toBe('Toutes les semaines le lundi et jeudi');
    expect(describeRule(parseRule('FREQ=MONTHLY;BYDAY=2TU;COUNT=5')!, '2026-11-10')).toBe('Tous les mois le deuxième mardi, 5 fois');
    expect(choiceOf(choiceRule('monthlyWeekday', '2026-11-10'), '2026-11-10')).toBe('monthlyWeekday');
    // A series cut before its 24 November 18:30 (« et les suivants ») ends, in words, the day before.
    const cut = serializeRule(ruleUntilBefore(parseRule('FREQ=WEEKLY;BYDAY=TU,TH')!, '2026-11-24T18:30', 'Europe/Paris'));
    expect(describeRule(parseRule(cut)!, '2026-11-10T18:30', 'Europe/Paris').replace(/\u00a0/g, ' ')).toBe('Toutes les semaines le mardi et jeudi, jusqu’au 23 nov. 2026');
    // An end at the end of a day keeps that day, read in the series' zone.
    expect(describeRule(parseRule('FREQ=DAILY;UNTIL=20261124T225959Z')!, '2026-11-10T08:00', 'Europe/Paris').replace(/\u00a0/g, ' ')).toBe('Tous les jours, jusqu’au 24 nov. 2026');
    expect(choiceOf('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', '2026-11-02')).toBe('workdays');
    expect(choiceOf('FREQ=WEEKLY;INTERVAL=3', '2026-11-02')).toBe('custom');
  });
});
