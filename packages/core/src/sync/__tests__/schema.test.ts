import type { AppId } from '../../apps';
import { isMergedTextField, mergeField } from '../textMerge';
import { defineRecordTypes, fitField, isRecordType, isValidField, recordTypeSpec, seededRecords, str } from '../schema';
import { sanitizeRecord } from '../record';

// A type of its own, so these tests need no app's package.
defineRecordTypes({
  testCard: {
    app: 'notes',
    fields: { title: str(10), size: value => value === 'S' || value === 'L' },
    merged: { title: { limit: 10 } },
    defaults: { size: 'S' },
    seeded: ['card-0'],
  },
});

describe('record types an app declares', () => {
  it('checks, fits and merges the fields its declaration names', () => {
    expect(isRecordType('testCard')).toBe(true);
    expect(isValidField('testCard', 'size', 'L')).toBe(true);
    expect(isValidField('testCard', 'size', 'XL')).toBe(false);
    expect(isValidField('testCard', 'constructor', {})).toBe(false);
    expect(fitField('testCard', 'title', 'beaucoup trop long')).toBe('beaucoup t');
    expect(isMergedTextField('testCard', 'title')).toBe(true);
    expect(isMergedTextField('testCard', 'size')).toBe(false);
    expect(mergeField('testCard', 'title', 'a b', 'a b c', 'z a b', true)).toBe('z a b c');
    expect(recordTypeSpec('testCard')?.defaults).toEqual({ size: 'S' });
    expect(seededRecords()).toContainEqual({ type: 'testCard', id: 'card-0' });
  });

  it('refuses a record of a type no loaded app declares, and a type two apps claim', () => {
    expect(sanitizeRecord({ type: 'unknownThing', id: 'x', fields: {}, clocks: {} }).record).toBeNull();
    expect(() => defineRecordTypes({ testCard: { app: 'calendar' as AppId, fields: {} } })).toThrow(/declared by both/);
  });
});
