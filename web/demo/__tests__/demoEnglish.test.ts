import { describe, expect, it } from 'vitest';
import type { SyncRecord } from '@unlease/core/sync/record';

import { buildDemoRecords } from '../demoData';
import { DEMO_ENGLISH, DEMO_ENGLISH_URLS, demoTextKey } from '../demoEnglish';

/** Fields that hold keys, addresses, codes or values no one reads as words. */
const NOT_WORDS = new Set(['id', 'type', 'url', 'color', 'position', 'kind', 'pattern', 'icon', 'language', 'imageUrl', 'currency', 'status', 'lang', 'drawing', 'start', 'end', 'timeZone', 'rrule', 'photo', 'photoMime', 'mime', 'filedBy', 'readWith', 'emblem', 'templateId', 'code', 'modules', 'targetType']);
/** Where the words are names (people, their e-mails, streets) or a select's option keys (a table's `categorie`, `genre`, `themes`): the same in both languages. */
const NAMES = /^(contact\.(firstName|lastName|emails|addresses)|block\.cells\.(categorie|genre|themes))/;

/** Every string of the records that a person reads, with where it is. */
function words(records: readonly SyncRecord[]): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (value: unknown, path: string): void => {
    if (typeof value === 'string') {
      if (/[A-Za-zÀ-ÿ]{2}/.test(value) && !/^(demo-|line-|https?:|[0-9a-f-]{20,}|inbox$)/.test(value) && !NAMES.test(path)) found.set(demoTextKey(value), path);
    } else if (Array.isArray(value)) value.forEach(item => walk(item, path));
    else if (value !== null && typeof value === 'object')
      for (const [key, inner] of Object.entries(value)) if (!NOT_WORDS.has(key) && !key.endsWith('Id') && !key.endsWith('Ids')) walk(inner, `${path}.${key}`);
  };
  for (const record of records) walk(record.fields, record.type);
  return found;
}

const NOW = Date.UTC(2026, 10, 10, 12);

describe('the demo in English', () => {
  it('has the English of every French word its records hold, and no English for words they no longer hold', () => {
    const french = words(buildDemoRecords(NOW, 'fr'));
    expect([...french].filter(([text]) => !DEMO_ENGLISH.has(text)).map(([text, path]) => `${path}: ${text}`)).toEqual([]);
    expect([...DEMO_ENGLISH.keys()].filter(text => !french.has(text))).toEqual([]);
  });

  it('writes its records in English, their dates and mentions kept, a link’s reading in English and its unread addresses in English', () => {
    const records = buildDemoRecords(NOW, 'en');
    const byId = new Map(records.map(record => [record.id, record]));
    expect(byId.get('line-mode')?.fields.title).toBe('Fashion');
    const trip = records.find(record => record.type === 'block' && String(record.fields.text).startsWith('Leaving '));
    expect(trip?.fields.text).toMatch(/^Leaving \{@date=\d{4}-\d{2}-\d{2}T0715\} from Orly, back \{@date=\d{4}-\d{2}-\d{2}\}\.$/);
    expect(byId.get('demo-resto')?.fields.body).toContain('{@contact=demo-contact-lea}');
    const links = records.filter(record => record.type === 'link');
    expect(links.every(link => link.fields.lang === 'en')).toBe(true);
    expect(links.map(link => link.fields.url)).toEqual(expect.arrayContaining([...DEMO_ENGLISH_URLS.values()]));
    // Read with its template's English fields, so the link is not shown as read with an older one.
    const template = records.find(record => record.type === 'linkTemplate' && record.fields.name === 'Wine');
    expect(template).toBeDefined();
    const french = buildDemoRecords(NOW, 'fr');
    const readWith = (list: readonly SyncRecord[]): Set<unknown> => new Set(list.filter(record => record.type === 'link' && record.fields.readWith).map(record => record.fields.readWith));
    expect([...readWith(records)]).not.toEqual([...readWith(french)]);
  });

  it('leaves the French as it is', () => {
    expect(buildDemoRecords(NOW).find(record => record.id === 'line-mode')?.fields.title).toBe('Mode');
  });
});
