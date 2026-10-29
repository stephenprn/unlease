/**
 * The English dictionaries' check: every French sentence the code translates (`t('…')`, `tx('…')`,
 * `tc('context', '…')` as `… [context]`, and the nouns of `plural(n, '…', '…')`) has its English in
 * a dictionary its code can count on: the core's for the core, the core's or the design system's for
 * the design system, and those or the app's own for an app (its package, its phone, its web). An app
 * installed alone then never shows French for want of another app's dictionary. From the repository
 * root:
 *
 *   node tools/i18n/check.mjs                    missing English, then entries no code uses
 *   node tools/i18n/check.mjs --unwrapped <path>  French-looking text left outside t() under <path>
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
/** Each package's dictionary (a file, or a folder of parts). */
const DICTIONARIES = { core: 'packages/core/src/i18n/en', design: 'packages/design/src/i18n/en.ts', notes: 'packages/notes/src/i18n/en' };
/** What each tree translates, and the dictionaries it may count on. */
const GROUPS = [
  { sources: ['packages/core/src'], uses: ['core'] },
  { sources: ['packages/design/src'], uses: ['core', 'design'] },
  { sources: ['packages/notes/src', 'mobile/notes/src', 'web/notes/src'], uses: ['core', 'design', 'notes'] },
];
const SOURCES = GROUPS.flatMap(group => group.sources);
const SKIP = /(__tests__|node_modules|\/i18n\/en\/|\/i18n\/en\.ts$|\.d\.ts$|emojiCatalogue)/;

function walk(path, out = []) {
  for (const name of readdirSync(path)) {
    const full = join(path, name);
    if (SKIP.test(full)) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

/** The JS string literal opening at `at` (a quote or a backtick): its value, or null for a template with slots. */
function readLiteral(source, at) {
  const quote = source[at];
  let value = '';
  for (let index = at + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\') {
      const next = source[index + 1];
      value += next === 'n' ? '\n' : next === 'u' ? String.fromCharCode(parseInt(source.slice(index + 2, index + 6), 16)) : next;
      index += next === 'u' ? 5 : 1;
      continue;
    }
    if (quote === '`' && char === '$' && source[index + 1] === '{') return { value: null, end: index };
    if (char === quote) return { value, end: index + 1 };
    value += char;
  }
  return { value: null, end: source.length };
}

const lineOf = (source, at) => source.slice(0, at).split('\n').length;

/** The French sentences a file translates, with their lines. */
function usedIn(file) {
  const source = readFileSync(file, 'utf8');
  const found = [];
  const call = /\b(t|tx|tc|plural)\(\s*/g;
  for (let match = call.exec(source); match; match = call.exec(source)) {
    let at = match.index + match[0].length;
    if (match[1] === 'plural') {
      // Past the count: up to the first comma at this depth.
      let depth = 0;
      for (; at < source.length; at += 1) {
        const char = source[at];
        if ('([{'.includes(char)) depth += 1;
        else if (')]}'.includes(char)) {
          if (depth === 0) break;
          depth -= 1;
        } else if (char === ',' && depth === 0) break;
      }
      if (source[at] !== ',') continue;
      at += 1;
      while (/\s/.test(source[at])) at += 1;
      if (!`'"\``.includes(source[at])) continue;
      const singular = readLiteral(source, at);
      if (singular.value === null) continue;
      at = singular.end;
      while (/\s/.test(source[at])) at += 1;
      let pluralForm = `${singular.value}s`;
      if (source[at] === ',') {
        at += 1;
        while (/\s/.test(source[at])) at += 1;
        if (`'"\``.includes(source[at])) pluralForm = readLiteral(source, at).value ?? pluralForm;
      }
      found.push({ text: singular.value, line: lineOf(source, match.index) }, { text: pluralForm, line: lineOf(source, match.index) });
      continue;
    }
    if (!`'"\``.includes(source[at])) continue;
    const literal = readLiteral(source, at);
    if (literal.value === null) continue;
    if (match[1] === 'tc') {
      at = literal.end;
      while (/[\s,]/.test(source[at])) at += 1;
      if (!`'"\``.includes(source[at])) continue;
      const sentence = readLiteral(source, at);
      if (sentence.value !== null) found.push({ text: `${sentence.value} [${literal.value}]`, line: lineOf(source, match.index) });
      continue;
    }
    found.push({ text: literal.value, line: lineOf(source, match.index) });
  }
  return found;
}

/** A package's dictionary: each key and the file it is in. */
function dictionary(path) {
  const keys = new Map();
  const files = statSync(path).isDirectory() ? readdirSync(path).filter(name => name !== 'index.ts').map(name => join(path, name)) : [path];
  for (const file of files) {
    const name = relative(ROOT, file);
    const source = readFileSync(file, 'utf8');
    const entry = /^\s*(['"])/gm;
    for (let match = entry.exec(source); match; match = entry.exec(source)) {
      const key = readLiteral(source, match.index + match[0].length - 1);
      if (key.value === null) continue;
      if (!/^\s*:/.test(source.slice(key.end))) continue;
      if (keys.has(key.value) && keys.get(key.value) !== name) continue;
      keys.set(key.value, name);
    }
  }
  return keys;
}

const FRENCH = /[éèàêçùôîûâëïœÉÈÀ’«»]|\b(le|la|les|des|une|un|du|pour|dans|avec|sur|par|vos|votre|aucun|aucune|cette|ce|ces|est|sont|pas|plus|nouvelle|nouveau|ajouter|supprimer|annuler|fermer|ouvrir|enregistrer|rechercher|modifier|choisir|retour|réglages|corbeille|notes?|pages?|liens?)\b/i;

/** French-looking text outside t(): string literals and JSX text, comments and imports aside. */
function unwrapped(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const out = [];
  let inComment = false;
  lines.forEach((raw, index) => {
    let line = raw;
    if (inComment) {
      if (!line.includes('*/')) return;
      line = line.slice(line.indexOf('*/') + 2);
      inComment = false;
    }
    if (/^\s*(\/\/|\*|import |export \* )/.test(line)) return;
    if (line.includes('/*') && !line.includes('*/')) inComment = true;
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
    const literal = /(['"`])((?:\\.|(?!\1).)*)\1/g;
    for (let match = literal.exec(code); match; match = literal.exec(code)) {
      const text = match[2];
      const before = code.slice(0, match.index);
      if (/\b(t|tx|tc|plural)\(\s*$/.test(before) || /\b(plural|tc)\([^)]*,\s*$/.test(before)) continue;
      if (/(import|from|require)\s*\(?\s*$/.test(before) || /(testID|key|name|icon|kind|variant|className|style|accessibilityRole|type)=\{?\s*$/.test(before)) continue;
      if (/^[a-z][a-zA-Z0-9_.:/-]*$/.test(text) || !/[A-Za-zÀ-ÿ]{3}/.test(text) || !FRENCH.test(text)) continue;
      out.push({ line: index + 1, text });
    }
    const jsx = />([^<>{}`]*[A-Za-zÀ-ÿ]{2}[^<>{}`]*)</g;
    for (let match = jsx.exec(code); match; match = jsx.exec(code)) {
      const text = match[1].trim();
      if (text && FRENCH.test(text) && !/^[\w.]+$/.test(text) && !/=>|&&|\|\||===/.test(text)) out.push({ line: index + 1, text });
    }
    // JSX text alone on its line, between tags on the lines around it.
    const alone = code.trim();
    if (alone && !/[<>{}();=`'"]/.test(alone) && /[A-Za-zÀ-ÿ]{2}/.test(alone) && FRENCH.test(alone) && /\s/.test(alone)) out.push({ line: index + 1, text: alone });
  });
  return out;
}

const args = process.argv.slice(2);
if (args[0] === '--unwrapped') {
  const targets = args.slice(1).length > 0 ? args.slice(1) : SOURCES;
  let count = 0;
  for (const target of targets) {
    const files = statSync(target).isDirectory() ? walk(target) : [target];
    for (const file of files) {
      for (const { line, text } of unwrapped(file)) {
        count += 1;
        console.log(`${relative(ROOT, file)}:${line}  ${JSON.stringify(text)}`);
      }
    }
  }
  console.log(`\n${count} French-looking text${count === 1 ? '' : 's'} outside t(): wrap what the interface shows, leave content, keys and comments.`);
  process.exit(0);
}

const dictionaries = Object.fromEntries(Object.entries(DICTIONARIES).map(([owner, path]) => [owner, existsSync(path) ? dictionary(path) : new Map()]));
const allKeys = new Map(Object.values(dictionaries).flatMap(keys => [...keys]));
const used = new Map();
const missing = [];
for (const group of GROUPS) {
  for (const source of group.sources) {
    if (!existsSync(source)) continue;
    for (const file of walk(source)) {
      for (const { text, line } of usedIn(file)) {
        const where = `${relative(ROOT, file)}:${line}`;
        if (!used.has(text)) used.set(text, where);
        if (group.uses.some(owner => dictionaries[owner].has(text))) continue;
        const elsewhere = allKeys.get(text);
        missing.push({ text, where, note: elsewhere ? ` (only in ${elsewhere}: move it to ${group.uses.map(owner => DICTIONARIES[owner]).join(' or ')})` : '' });
      }
    }
  }
}
const seen = new Set();
const reported = missing.filter(entry => (seen.has(entry.text) ? false : (seen.add(entry.text), true)));
const unused = [...allKeys.keys()].filter(text => !used.has(text));
for (const { text, where, note } of reported) console.log(`missing  ${where}  ${JSON.stringify(text)}${note}`);
if (args.includes('--unused')) for (const text of unused) console.log(`unused   ${allKeys.get(text)}  ${JSON.stringify(text)}`);
console.log(`\n${used.size} sentences translated in code, ${allKeys.size} in the dictionaries: ${reported.length} missing, ${unused.length} unused${args.includes('--unused') ? '' : ' (--unused lists them)'}.`);
process.exit(reported.length > 0 ? 1 : 0);
