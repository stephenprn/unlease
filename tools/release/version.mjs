/**
 * The repository's one version (SemVer), written everywhere it lives: the four package.json and
 * their lockfiles, and Carnet's APK (`versionName`, and `versionCode` computed from it so that every
 * release installs over the one before). From the repository root:
 *
 *   npm run bump -- 0.2.0             sets 0.2.0 everywhere and dates CHANGELOG.md's Unreleased as it
 *   npm run bump -- 0.2.0-rc.1        a release candidate: the version only, its notes are Unreleased as it
 *                                     stands (the final release dates them); the image's `latest` stays put
 *   node tools/release/version.mjs --check v0.2.0   every file says 0.2.0 and the changelog has it (CI)
 *   node tools/release/version.mjs --notes v0.2.0   that version's section of the changelog (the release notes)
 *
 * Only `X.Y.Z` and `X.Y.Z-rc.N` are taken, with Y and Z under 100 and N from 1 to 98.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PACKAGES = ['package.json', 'server/package.json', 'web/notes/package.json', 'mobile/notes/package.json'];
const LOCKS = {
  'package-lock.json': ['', 'server', 'web/notes'],
  'mobile/notes/package-lock.json': [''],
};
const GRADLE = 'mobile/notes/android/app/build.gradle';
const CHANGELOG = 'CHANGELOG.md';
const REPOSITORY = 'https://github.com/stephenprn/unlease';

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?$/;

function parse(raw) {
  const version = raw.replace(/^v/, '');
  const found = VERSION.exec(version);
  if (!found) fail(`"${raw}" is not a version this repository takes: X.Y.Z or X.Y.Z-rc.N`);
  const [major, minor, patch, rc] = found.slice(1).map(part => (part === undefined ? undefined : Number(part)));
  if (minor > 99 || patch > 99 || (rc !== undefined && (rc < 1 || rc > 98))) fail(`"${version}": minor and patch go up to 99, a release candidate from 1 to 98`);
  return { version, major, minor, patch, rc };
}

/** Grows with every release, a release candidate below its release: 0.2.0-rc.1 is 20001, 0.2.0 is 20099. */
function versionCode({ major, minor, patch, rc }) {
  return (major * 10_000 + minor * 100 + patch) * 100 + (rc ?? 99);
}

function fail(message) {
  console.error(`version: ${message}`);
  process.exit(1);
}

const read = path => readFileSync(path, 'utf8');
const readJson = path => JSON.parse(read(path));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

/** Every place that holds the version, and what it holds now. */
function versionsFound() {
  const found = [];
  for (const path of PACKAGES) found.push([path, readJson(path).version]);
  for (const [path, entries] of Object.entries(LOCKS)) {
    const lock = readJson(path);
    found.push([`${path} (version)`, lock.version]);
    for (const entry of entries) found.push([`${path} (packages["${entry}"])`, lock.packages[entry]?.version]);
  }
  const gradle = read(GRADLE);
  found.push([`${GRADLE} (versionName)`, /versionName "([^"]+)"/.exec(gradle)?.[1]]);
  found.push([`${GRADLE} (versionCode)`, /versionCode (\d+)/.exec(gradle)?.[1]]);
  return found;
}

/** A version's section of the changelog, without its heading; null when it has none. */
function section(changelog, version) {
  const heading = new RegExp(`^## \\[${version.replace(/[.]/g, '\\.')}\\][^\\n]*\\n`, 'm');
  const start = heading.exec(changelog);
  if (!start) return null;
  const rest = changelog.slice(start.index + start[0].length);
  const end = rest.search(/^## \[|^\[[^\]]+\]: /m);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

function setVersion(target) {
  const { version } = target;
  for (const path of PACKAGES) {
    const manifest = readJson(path);
    manifest.version = version;
    writeJson(path, manifest);
  }
  for (const [path, entries] of Object.entries(LOCKS)) {
    const lock = readJson(path);
    lock.version = version;
    for (const entry of entries) lock.packages[entry].version = version;
    writeJson(path, lock);
  }
  const gradle = read(GRADLE)
    .replace(/versionCode \d+/, `versionCode ${versionCode(target)}`)
    .replace(/versionName "[^"]+"/, `versionName "${version}"`);
  writeFileSync(GRADLE, gradle);
}

/** The changelog with Unreleased become the version, dated today, an empty Unreleased above it, and the compare links. */
function rolledChangelog(version) {
  const changelog = read(CHANGELOG);
  if (section(changelog, version) !== null) fail(`${CHANGELOG} already has ${version}`);
  const unreleased = section(changelog, 'Unreleased');
  if (unreleased === null) fail(`${CHANGELOG} has no "## [Unreleased]" section`);
  if (!unreleased) fail(`${CHANGELOG}'s Unreleased section is empty: write what this release changes first`);
  const today = new Date().toISOString().slice(0, 10);
  const previous = /^## \[(\d+\.\d+\.\d+(?:-rc\.\d+)?)\]/m.exec(changelog.slice(changelog.indexOf('## [Unreleased]') + 1))?.[1] ?? null;
  let next = changelog.replace(/^## \[Unreleased\][^\n]*\n/m, `## [Unreleased]\n\n## [${version}] - ${today}\n`);
  const links = [`[Unreleased]: ${REPOSITORY}/compare/v${version}...HEAD`, previous ? `[${version}]: ${REPOSITORY}/compare/v${previous}...v${version}` : `[${version}]: ${REPOSITORY}/releases/tag/v${version}`];
  next = next.replace(/^\[Unreleased\]: .*$/m, links.join('\n'));
  if (!next.includes(links[0])) next = `${next.trimEnd()}\n\n${links.join('\n')}\n`;
  return next;
}

/** A release's notes: its own section, or for a release candidate, Unreleased as it stands. */
function notesOf(target) {
  const changelog = read(CHANGELOG);
  if (target.rc === undefined) return section(changelog, target.version);
  const unreleased = section(changelog, 'Unreleased');
  return unreleased ? `A release candidate for ${target.major}.${target.minor}.${target.patch}.\n\n${unreleased}` : null;
}

const args = process.argv.slice(2);
if (args[0] === '--check') {
  const target = parse(args[1] ?? '');
  const wrong = versionsFound().filter(([where, value]) => (where.endsWith('(versionCode)') ? Number(value) !== versionCode(target) : value !== target.version));
  for (const [where, value] of wrong) console.error(`version: ${where} says ${value ?? 'nothing'}, the tag says ${where.endsWith('(versionCode)') ? versionCode(target) : target.version}`);
  const noted = notesOf(target) !== null;
  if (!noted) console.error(target.rc === undefined ? `version: ${CHANGELOG} has no "## [${target.version}]" section` : `version: ${CHANGELOG}'s Unreleased section is empty`);
  if (wrong.length > 0 || !noted) fail('run `npm run bump -- <version>` and commit before tagging');
  console.log(`${target.version}: every file agrees, and the changelog has its notes`);
} else if (args[0] === '--notes') {
  const target = parse(args[1] ?? '');
  const notes = notesOf(target);
  if (notes === null) fail(`${CHANGELOG} has no notes for ${target.version}`);
  process.stdout.write(`${notes}\n`);
} else if (args.length === 1 && !args[0].startsWith('-')) {
  const target = parse(args[0]);
  if (target.rc !== undefined && !section(read(CHANGELOG), 'Unreleased')) fail(`${CHANGELOG}'s Unreleased section is empty: write what this release changes first`);
  const changelog = target.rc === undefined ? rolledChangelog(target.version) : null;
  setVersion(target);
  if (changelog !== null) writeFileSync(CHANGELOG, changelog);
  console.log(`${target.version} everywhere (Carnet's versionCode ${versionCode(target)})${target.rc === undefined ? `, and ${CHANGELOG} dated` : ''}.`);
  console.log(`Next: review the changes, commit them ("chore: release v${target.version}"), then: git tag v${target.version} && git push origin main v${target.version}`);
} else {
  fail('usage: npm run bump -- <version> | node tools/release/version.mjs --check <tag> | --notes <tag>');
}
