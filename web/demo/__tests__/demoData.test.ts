import { describe, expect, it } from 'vitest';
import type { SyncRecord } from '@unlease/core/sync/record';

import { buildDemoRecords } from '../demoData';

/** Fields that hold keys, addresses, codes or values no one reads as words. */
const NOT_WORDS = new Set(['id', 'type', 'url', 'color', 'position', 'kind', 'pattern', 'icon', 'language', 'imageUrl', 'currency', 'status', 'lang', 'drawing', 'start', 'end', 'timeZone', 'rrule', 'uid', 'photo', 'photoMime', 'mime', 'filedBy', 'readWith', 'emblem', 'templateId', 'code', 'modules', 'targetType']);
/**
 * Where the words are names (people, their e-mails, streets), a table's option keys (`categorie`,
 * `genre`, `themes`), or the server's own sentence on a link that failed, which the apps translate.
 */
const NAMES = /^(contact\.(firstName|lastName|emails|addresses)|block\.cells\.(categorie|genre|themes)|link\.error$)/;
/** Names that hold a French word and keep it: a wine, a restaurant, a café, a street. */
const PROPER_NAMES = ['Domaine des Varinelles', 'Les Terres rouges', 'Le Petit Cambodge', 'Café des Fédérations', 'rue des Lilas'];
/** Short French words no English sentence holds. */
const FRENCH = /(?<!\p{L})(le|la|les|des|du|une|est|pour|avec|dans)(?!\p{L})/iu;

/** Every string of the records that a person reads, with where it is. */
function words(records: readonly SyncRecord[]): [path: string, text: string][] {
  const found: [string, string][] = [];
  const walk = (value: unknown, path: string): void => {
    if (typeof value === 'string') {
      if (/\p{L}{2}/u.test(value) && !/^(demo-|line-|https?:|[0-9a-f-]{20,}|inbox$)/.test(value) && !NAMES.test(path)) found.push([path, value]);
    } else if (Array.isArray(value)) value.forEach(item => walk(item, path));
    else if (value !== null && typeof value === 'object')
      for (const [key, inner] of Object.entries(value)) if (!NOT_WORDS.has(key) && !key.endsWith('Id') && !key.endsWith('Ids')) walk(inner, `${path}.${key}`);
  };
  for (const record of records) walk(record.fields, record.type);
  return found;
}

const NOW = Date.UTC(2026, 10, 10, 12);

describe('the demo’s records', () => {
  const records = buildDemoRecords(NOW);
  const byId = new Map(records.map(record => [`${record.type}:${record.id}`, record]));

  it('are written in English, their mentions, dates and markup kept', () => {
    expect(byId.get('note:line-mode')?.fields.title).toBe('Fashion');
    expect(byId.get('block:demo-page-lisbonne')?.fields.text).toBe('Trip to Lisbon');
    const departure = records.find(record => record.type === 'block' && String(record.fields.text).startsWith('Leaving '));
    expect(departure?.fields.text).toMatch(/^Leaving \{@date=\d{4}-\d{2}-\d{2}T0715\} from Orly, back \{@date=\d{4}-\d{2}-\d{2}\}\.$/);
    expect(byId.get('note:demo-resto')?.fields).toMatchObject({ title: 'Léa’s birthday' });
    expect(byId.get('note:demo-resto')?.fields.body).toContain('{@contact=demo-contact-lea}');
    expect(byId.get('linkTemplate:demo-template-vin')?.fields.name).toBe('Wine');
    expect(byId.get('calendarEvent:demo-cal-diner')?.fields.title).toBe('Dinner at Léa’s');
    expect(byId.get('contact:demo-contact-camille')?.fields.jobTitle).toBe('Architect');
  });

  it('say their links were read in English, the unread ones at English addresses', () => {
    const links = records.filter(record => record.type === 'link');
    expect(links.length).toBeGreaterThan(0);
    expect(links.filter(link => link.fields.lang !== 'en').map(link => link.id)).toEqual([]);
    expect(links.map(link => link.fields.url)).toEqual(expect.arrayContaining(['https://www.slow-loom.example/linen-shirt', 'https://closed-shop.example/tote-bag']));
  });

  it('hold no French sentence', () => {
    const french = words(records)
      .map(([path, text]) => [path, PROPER_NAMES.reduce((left, name) => left.split(name).join(''), text)] as const)
      .filter(([, text]) => FRENCH.test(text))
      .map(([path, text]) => `${path}: ${text}`);
    expect(french).toEqual([]);
  });
});
