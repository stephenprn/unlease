/**
 * Generate packages/design/src/emojiCatalogue.json, the emoji picker's catalogue for both apps, from
 * emojibase-data (Unicode CLDR names and keywords, a dev dependency of the web app): every emoji a
 * page or a callout can wear, in Unicode's order and groups, with its French and English name and
 * keywords so a search finds it in either language. Skin tones, the bare components and emoji
 * newer than Unicode 15.1 (most systems cannot draw them yet) are left out. Run from the
 * repository root:
 *
 *   node tools/emoji/build_emoji.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

// The web app's devDependency, wherever the workspace installed it.
const DATA = dirname(createRequire(resolve('web/notes/package.json')).resolve('emojibase-data/package.json'));
const read = file => JSON.parse(readFileSync(resolve(DATA, file), 'utf8'));

/** Newer than this, an emoji draws as a blank box on many systems still. */
const MAX_VERSION = 15.1;

/** Unicode's groups, in its order, named as the picker shows them; `component` (bare skin tones, hair) is left out. */
const GROUPS = [
  { key: 'smileys-emotion', fr: 'Smileys et émotions', en: 'Smileys & emotion' },
  { key: 'people-body', fr: 'Personnes', en: 'People & body' },
  null,
  { key: 'animals-nature', fr: 'Animaux et nature', en: 'Animals & nature' },
  { key: 'food-drink', fr: 'Nourriture et boissons', en: 'Food & drink' },
  { key: 'travel-places', fr: 'Voyages et lieux', en: 'Travel & places' },
  { key: 'activities', fr: 'Activités', en: 'Activities' },
  { key: 'objects', fr: 'Objets', en: 'Objects' },
  { key: 'symbols', fr: 'Symboles', en: 'Symbols' },
  { key: 'flags', fr: 'Drapeaux', en: 'Flags' },
];

const fr = read('fr/compact.json');
const en = new Map(read('en/compact.json').map(entry => [entry.hexcode, entry]));
const versions = new Map(read('en/data.json').map(entry => [entry.hexcode, Number(entry.version)]));

const groups = GROUPS.map((group, index) => (group ? { ...group, index } : null)).filter(Boolean);
const groupAt = new Map(groups.map((group, position) => [group.index, position]));

const words = list => [...new Set((list ?? []).map(word => word.trim()).filter(Boolean))].join('|');

const emojis = fr
  .filter(entry => groupAt.has(entry.group) && (versions.get(entry.hexcode) ?? 99) <= MAX_VERSION)
  .sort((a, b) => a.order - b.order)
  .map(entry => {
    const english = en.get(entry.hexcode);
    // [emoji, group, French name, French keywords, English name, English keywords]
    return [entry.unicode, groupAt.get(entry.group), entry.label, words(entry.tags), english?.label ?? '', words(english?.tags)];
  });

const out = { groups: groups.map(({ key, fr: french, en: english }) => ({ key, fr: french, en: english })), emojis };
writeFileSync(resolve('packages/design/src/emojiCatalogue.json'), `${JSON.stringify(out)}\n`);
console.log(`${emojis.length} emoji in ${groups.length} groups`);
