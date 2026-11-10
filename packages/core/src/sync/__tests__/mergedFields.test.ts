import { baseAfterAck, baseAfterWrite, resolveTypedText } from '../bases';
import { formatHlc } from '../hlc';
import { parseSyncRequest } from '../protocol';
import { mergeRecord, writeFields, type SyncRecord } from '../record';
import { defineRecordTypes, id, ids, oneOf, schemaFingerprint, str, type Check } from '../schema';
import { mergeSets, mergeValues } from '../textMerge';
import { derivedId } from '../../services/ids';

const days: Check = value => Array.isArray(value) && value.length <= 5 && value.every(day => typeof day === 'string');

// Types of their own, so these tests need no app's package.
defineRecordTypes({
  testSeries: {
    app: 'calendar',
    fields: { title: str(100), off: days },
    merged: { title: { limit: 100 }, off: { limit: 5, set: true } },
  },
  testPrint: { app: 'notes', fields: { name: str(10), size: oneOf(['S', 'L']) } },
});

const clock = (wall: number, node: string) => formatHlc(wall, 0, node);
const series = (off: string[], wall = 1000, node = 'phone00001'): SyncRecord => writeFields({ type: 'testSeries', id: 's1', fields: {}, clocks: {} }, { title: 'Point', off }, clock(wall, node));

describe('a list merged as a set', () => {
  it('keeps what either side added and drops what either side removed', () => {
    expect(mergeSets(['a', 'b'], ['a', 'b', 'c'], ['a', 'b', 'd'], true)).toEqual(['a', 'b', 'c', 'd']);
    expect(mergeSets(['a', 'b'], ['b'], ['a', 'b', 'd'], true)).toEqual(['b', 'd']);
    // Past its limit, the newer side whole.
    expect(mergeSets([], ['a', 'b', 'c'], ['d', 'e', 'f'], true, 5)).toEqual(['d', 'e', 'f']);
    expect(mergeValues('testSeries', 'off', ['x'], ['x', 'y'], ['z'], false)).toEqual(['y', 'z']);
  });

  it('two devices each taking a day out keep both out, through the bases a device keeps', () => {
    const start = series(['2026-11-01']);
    // The phone takes the 3rd out, offline: its base is the list it started from.
    const phone = writeFields(start, { off: ['2026-11-01', '2026-11-03'] }, clock(2000, 'phone00001'));
    const base = baseAfterWrite(undefined, start, { off: phone.fields.off })!;
    expect(base.fields.off).toEqual(['2026-11-01']);
    // The web took the 5th out meanwhile, and its write reaches the phone first.
    const web = writeFields(start, { off: ['2026-11-01', '2026-11-05'] }, clock(3000, 'web0000001'));
    const kept = mergeRecord(phone, web).record;
    const typed = resolveTypedText(phone, web, base, kept, value => value.endsWith('phone00001'));
    expect(typed.patch).toEqual({ off: ['2026-11-01', '2026-11-03', '2026-11-05'] });
    expect(typed.base.fields.off).toEqual(['2026-11-01', '2026-11-05']);
    // Acknowledged, the base moves on as for text.
    expect(baseAfterAck(base, phone, phone)).toBeNull();
  });

  it('travels with its base in a push', () => {
    const record = series(['2026-11-01', '2026-11-03'], 2000);
    const parsed = parseSyncRequest({ node: 'phone00001', since: 0, records: [record], bases: [{ type: 'testSeries', id: 's1', fields: { off: ['2026-11-01'] }, clocks: { off: clock(1000, 'phone00001') } }] });
    expect(parsed.request?.bases).toEqual([{ type: 'testSeries', id: 's1', fields: { off: ['2026-11-01'] }, clocks: { off: clock(1000, 'phone00001') } }]);
  });
});

describe('a schema fingerprint', () => {
  it('changes with a field added or a value a check accepts, and with nothing else', () => {
    const declare = (fields: Record<string, Check>) => defineRecordTypes({ testPrint: { app: 'notes', fields } });
    const print = schemaFingerprint(['testPrint']);
    expect(print).toMatch(/^[0-9a-f]{16}$/);
    expect(schemaFingerprint(['testPrint', 'unknownThing'])).toBe(print);
    // A newer build that knows one more field, or one more value.
    declare({ name: str(10), size: oneOf(['S', 'L']), labelIds: ids(5) });
    const wider = schemaFingerprint(['testPrint']);
    declare({ name: str(10), size: oneOf(['L', 'S', 'XL']) });
    const more = schemaFingerprint(['testPrint']);
    declare({ name: str(10), size: oneOf(['L', 'S']) });
    expect(new Set([print, wider, more]).size).toBe(3);
    // The same declaration, values in another order: the same.
    expect(schemaFingerprint(['testPrint'])).toBe(print);
  });
});

describe('an id derived from a name', () => {
  it('is the same for the same name, UUID-shaped, and passes as a record id', () => {
    const a = derivedId('calendarEvent:s1:exception:2026-11-03T09:00');
    expect(a).toBe(derivedId('calendarEvent:s1:exception:2026-11-03T09:00'));
    expect(a).not.toBe(derivedId('calendarEvent:s1:exception:2026-11-04T09:00'));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id(a)).toBe(true);
  });
});
