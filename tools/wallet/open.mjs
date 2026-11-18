#!/usr/bin/env node
/**
 * Opens Wallet's cards and papers from a backup, for someone who lost every device: with the recovery
 * code printed on the recovery kit (or the vault's passphrase), it decrypts each item still in use
 * and writes it out, in the clear, one folder per item. From a clone of the repository, once
 * `npm install` has run at its root (for `@noble/ciphers`), with Node 24.7 or later (for Argon2id):
 *
 *   node tools/wallet/open.mjs <backup.tar.gz | unlease.json> --out <dir> [--files <dir>] [--passphrase]
 *
 * - `<backup.tar.gz>`: an archive the server wrote (Administration, Backups; or S3's `sauvegardes/`).
 *   A full archive holds the sealed files under `Fichiers/Wallet/`; a light one only `unlease.json`.
 * - `<unlease.json>`: taken out of an archive. The sealed files are looked for beside it, under
 *   `fichiers/` (as S3 keeps them) and `Fichiers/Wallet/`.
 * - `--files <dir>`: where else the sealed files are: a copy of the drive's `Wallet` folder (Seafile
 *   keeps them as `Wallet/<id>.bin`), or of S3's `fichiers/`.
 * - `--passphrase`: asks the vault's passphrase instead of the recovery code.
 *
 * The code is read from the terminal without echo, or from the first line of stdin when it is not a
 * terminal. Exit codes: 0 when everything was written, 2 when the code or passphrase does not open
 * the vault, 1 otherwise (some item or file could not be read: what could is written all the same).
 *
 * The package's TypeScript is not imported (Node runs this file as it is): the few pieces of the
 * format it needs are written again below, and must stay byte for byte as `packages/wallet/src/crypto`
 * writes them (`bytes.ts`: base64url, Crockford's base32; `vault.ts`: the derived seal, the
 * passphrase's bytes; `seal.ts`: `w1.` seals, `UWB1` files, the places named as associated data;
 * `cipher.ts`: the Argon2id ceiling). `packages/wallet/src/crypto/__tests__/openTool.test.ts` runs it
 * against what the package seals.
 */
import crypto from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { createGunzip } from 'node:zlib';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';

const EXIT_OK = 0;
const EXIT_OTHER = 1;
const EXIT_WRONG_SECRET = 2;

class Failure extends Error {
  constructor(message, code = EXIT_OTHER) {
    super(message);
    this.code = code;
  }
}

// ---------------------------------------------------------------------------------------------
// The format, as packages/wallet/src/crypto writes it.

const VAULT_TYPE = 'walletVault';
const VAULT_ID = 'vault';
const ITEM_TYPE = 'walletItem';
const KEY_BYTES = 32;
const NONCE_BYTES = 24;
const TAG_BYTES = 16;
const SALT_BYTES = 16;
const RECOVERY_BYTES = 20;
/** `cipher.ts` `KDF_CEILING` and `kdfFits`: a vault asking more is refused. */
const KDF_CEILING = { ops: 10, memKiB: 1024 * 1024 };
const SEAL_PREFIX = 'w1.';
const BLOB_MAGIC = Buffer.from('UWB1', 'latin1');

/** `seal.ts` `fieldPlace` and `blobPlace`. */
const fieldPlace = (type, id, field) => `unlease/wallet/1/${type}/${id}/${field}`;
const blobPlace = blobId => `unlease/wallet/1/blob/${blobId}`;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_INDEX = new Map([...B64].map((char, index) => [char, index]));

/** `bytes.ts` `fromBase64Url`: strict, no padding, leftover bits zero; null otherwise. */
function fromBase64Url(text) {
  if (text.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let at = 0;
  for (const char of text) {
    const index = B64_INDEX.get(char);
    if (index === undefined) return null;
    value = (value << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (value >> bits) & 255;
    }
  }
  if ((value & ((1 << bits) - 1)) !== 0) return null;
  return out;
}

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** `bytes.ts` `fromBase32`: as a person copies it (lower case, spaces and dashes, O for 0, I and L for 1); null otherwise. */
function fromBase32(typed, length) {
  const text = typed
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (text.length !== Math.ceil((length * 8) / 5)) return null;
  const out = new Uint8Array(length);
  let bits = 0;
  let value = 0;
  let at = 0;
  for (const char of text) {
    const index = B32.indexOf(char);
    if (index < 0) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      if (at < length) out[at++] = (value >> bits) & 255;
    }
    value &= (1 << bits) - 1;
  }
  return out;
}

/** `vault.ts` `passphraseBytes`: trimmed, NFC, UTF-8 (a lone surrogate as U+FFFD, as `utf8` writes it). */
const passphraseBytes = passphrase => new Uint8Array(Buffer.from(passphrase.trim().normalize('NFC'), 'utf8'));

const utf8 = text => new Uint8Array(Buffer.from(text, 'utf8'));

function aeadOpen(key, nonce, sealed, place) {
  try {
    return xchacha20poly1305(key, nonce, utf8(place)).decrypt(sealed);
  } catch {
    return null;
  }
}

/** `seal.ts` `openBytes`: `w1.` then base64url of the nonce and the ciphertext. */
function openBytes(key, sealed, place) {
  if (typeof sealed !== 'string' || !sealed.startsWith(SEAL_PREFIX)) return null;
  const bytes = fromBase64Url(sealed.slice(SEAL_PREFIX.length));
  if (!bytes || bytes.length < NONCE_BYTES + TAG_BYTES) return null;
  return aeadOpen(key, bytes.subarray(0, NONCE_BYTES), bytes.subarray(NONCE_BYTES), place);
}

/** `seal.ts` `openValue`: JSON, or undefined. */
function openValue(key, sealed, place) {
  const bytes = openBytes(key, sealed, place);
  if (!bytes) return undefined;
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    return undefined;
  }
}

/** `seal.ts` `openBlob`: `UWB1`, the nonce, the ciphertext. */
function openBlob(key, blobId, sealed) {
  const head = BLOB_MAGIC.length;
  if (sealed.length < head + NONCE_BYTES + TAG_BYTES || !BLOB_MAGIC.equals(sealed.subarray(0, head))) return null;
  return aeadOpen(key, sealed.subarray(head, head + NONCE_BYTES), sealed.subarray(head + NONCE_BYTES), blobPlace(blobId));
}

/** `vault.ts` `readDerivedSeal`: `{v, salt, ops, mem, key}` as JSON text, its cost within the ceiling. */
function readDerivedSeal(value) {
  if (typeof value !== 'string') return null;
  let raw;
  try {
    raw = JSON.parse(value);
  } catch {
    return null;
  }
  if (!raw || raw.v !== 1 || typeof raw.salt !== 'string' || typeof raw.key !== 'string' || typeof raw.ops !== 'number' || typeof raw.mem !== 'number') return null;
  const fits = Number.isInteger(raw.ops) && Number.isInteger(raw.mem) && raw.ops >= 1 && raw.mem >= 8 && raw.ops <= KDF_CEILING.ops && raw.mem <= KDF_CEILING.memKiB;
  if (!fits) return null;
  const salt = fromBase64Url(raw.salt);
  if (!salt || salt.length !== SALT_BYTES) return null;
  return { salt, ops: raw.ops, mem: raw.mem, key: raw.key };
}

/** Argon2id v1.3, one lane, 32 bytes: `cipher.ts` `argon2id`, through OpenSSL. */
function argon2id(password, salt, ops, memKiB) {
  return new Uint8Array(crypto.argon2Sync('argon2id', { message: Buffer.from(password), nonce: Buffer.from(salt), parallelism: 1, tagLength: KEY_BYTES, memory: memKiB, passes: ops }));
}

/** `vault.ts` `openWithRecovery` / `openWithPassphrase`: the tier keys, or null when the secret is not this vault's. */
function openVault(fields, secret, field) {
  const derived = readDerivedSeal(fields[field]);
  if (!derived) throw new Failure(`The vault's ${field} seal is unreadable, or asks more than a device may spend`);
  const key = argon2id(secret, derived.salt, derived.ops, derived.mem);
  const master = openBytes(key, derived.key, fieldPlace(VAULT_TYPE, VAULT_ID, field));
  key.fill(0);
  if (!master || master.length !== KEY_BYTES) return null;
  const cards = openBytes(master, fields.cards, fieldPlace(VAULT_TYPE, VAULT_ID, 'cards'));
  const papers = openBytes(master, fields.papers, fieldPlace(VAULT_TYPE, VAULT_ID, 'papers'));
  if (!cards || !papers || cards.length !== KEY_BYTES || papers.length !== KEY_BYTES) throw new Failure('The vault opened, but its tier keys did not: the backup is damaged');
  return { cards, papers };
}

// ---------------------------------------------------------------------------------------------
// The backup: `unlease.json` and the sealed files, from an archive or from folders.

/**
 * The regular files of a tar stream that `want` names (ustar, pax and GNU long names, as
 * `server/src/backup/tar.ts` writes and reads them); the others are skipped as they stream by, so a
 * full archive's photos and videos never sit in memory.
 */
async function* readTar(source, want) {
  let buffer = Buffer.alloc(0);
  const chunks = source[Symbol.asyncIterator]();
  let done = false;
  const fill = async count => {
    const parts = [buffer];
    let length = buffer.length;
    while (length < count && !done) {
      const next = await chunks.next();
      if (next.done) done = true;
      else {
        parts.push(next.value);
        length += next.value.length;
      }
    }
    buffer = parts.length === 1 ? buffer : Buffer.concat(parts);
    return buffer.length >= count;
  };
  const take = async count => {
    if (!(await fill(count))) throw new Failure('The archive is cut short');
    const out = buffer.subarray(0, count);
    buffer = buffer.subarray(count);
    return out;
  };
  const field = (block, start, length) => {
    const raw = block.subarray(start, start + length);
    const end = raw.indexOf(0);
    return raw.subarray(0, end < 0 ? length : end).toString('utf8');
  };
  /** Drops `count` bytes, a chunk at a time. */
  const skip = async count => {
    let left = count;
    while (left > 0) {
      if (buffer.length === 0 && !(await fill(1))) throw new Failure('The archive is cut short');
      const step = Math.min(left, buffer.length);
      buffer = buffer.subarray(step);
      left -= step;
    }
  };
  const padded = size => size + ((512 - (size % 512)) % 512);
  let longName = null;
  for (;;) {
    if (!(await fill(512))) return;
    const block = await take(512);
    if (block.every(byte => byte === 0)) return;
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 0x20 : block[i];
    if (Number.parseInt(field(block, 148, 8).trim(), 8) !== sum) throw new Failure('Not a backup archive (.tar.gz)');
    const size = Number.parseInt(field(block, 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(block[156]);
    const prefix = field(block, 345, 155);
    const name = longName ?? (prefix ? `${prefix}/${field(block, 0, 100)}` : field(block, 0, 100));
    longName = null;
    const regular = type === '0' || type === '\0';
    if ((regular && !want(name)) || (!regular && type !== 'x' && type !== 'L')) {
      await skip(padded(size));
      continue;
    }
    const body = (await take(padded(size))).subarray(0, size);
    if (type === 'x') {
      const path = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString('utf8'));
      longName = path ? path[1] : null;
    } else if (type === 'L') longName = body.toString('utf8').replace(/\0[\s\S]*$/, '');
    else yield { name, body };
  }
}

const BLOB_NAME = /^([A-Za-z0-9_-]{1,64})\.[A-Za-z0-9]+$/;

/** Reads the backup: its document, and the sealed files it holds (by id). */
async function readBackup(input) {
  if (!existsSync(input) || !statSync(input).isFile()) throw new Failure(`No such file: ${input}`);
  const blobs = new Map();
  if (extname(input).toLowerCase() === '.json') return { document: parseDocument(readFileSync(input, 'utf8')), blobs, near: dirname(input) };
  let document = null;
  try {
    // The document, at the archive's root folder; the sealed files, under `Fichiers/Wallet/` (or `fichiers/`).
    const partsOf = name => name.split('/').filter(part => part && part !== '.');
    const isDocument = parts => parts.length <= 2 && parts.at(-1) === 'unlease.json';
    const isBlob = parts => BLOB_NAME.test(parts.at(-1) ?? '') && (parts.at(-2) === 'Wallet' || parts.at(-2) === 'fichiers');
    const want = name => isDocument(partsOf(name)) || isBlob(partsOf(name));
    for await (const entry of readTar(createReadStream(input).pipe(createGunzip()), want)) {
      const parts = partsOf(entry.name);
      if (isDocument(parts)) document = parseDocument(entry.body.toString('utf8'));
      else blobs.set(BLOB_NAME.exec(parts.at(-1))[1], Buffer.from(entry.body));
    }
  } catch (error) {
    if (error instanceof Failure) throw error;
    throw new Failure('Not a backup archive (.tar.gz)');
  }
  if (!document) throw new Failure('No unlease.json in this archive');
  return { document, blobs, near: null };
}

function parseDocument(text) {
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    throw new Failure('unlease.json is not JSON');
  }
  if (!document || document.format !== 'unlease-backup' || !Array.isArray(document.records)) throw new Failure('unlease.json is not a backup’s document');
  return document;
}

/** A sealed file by id: from the archive, else beside the document or under `--files`. */
function findBlob(id, backup, filesDir) {
  const found = backup.blobs.get(id);
  if (found) return found;
  const folders = [];
  for (const root of [filesDir, backup.near]) if (root) folders.push(root, join(root, 'Wallet'), join(root, 'fichiers'), join(root, 'Fichiers', 'Wallet'));
  for (const folder of folders) {
    const exact = join(folder, `${id}.bin`);
    if (existsSync(exact)) return readFileSync(exact);
    if (!existsSync(folder) || !statSync(folder).isDirectory()) continue;
    const other = readdirSync(folder).find(name => BLOB_NAME.exec(name)?.[1] === id);
    if (other) return readFileSync(join(folder, other));
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// What is written out.

const KIND_NAMES = {
  card: 'Card',
  giftCard: 'Gift card',
  emergency: 'Emergency card',
  idCard: 'Identity card',
  passport: 'Passport',
  drivingLicence: 'Driving licence',
  healthCard: 'Health insurance card',
  residencePermit: 'Residence permit',
  otherId: 'Other identity paper',
  document: 'Document',
};

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/avif': 'avif', 'image/gif': 'gif', 'application/pdf': 'pdf', 'text/plain': 'txt' };

/** As the server's `safeName`: no separators or reserved characters, no leading dot, 80 characters at most. */
function safeName(raw, fallback) {
  const cleaned = String(raw)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  const clipped = [...cleaned].slice(0, 80).join('').replace(/[. ]+$/, '').trim();
  return clipped || fallback;
}

/** `name`, or `name (2)`… before the extension, unique in `taken` whatever the case. */
function uniqueName(name, taken, extension = '') {
  const suffix = extension ? `.${extension}` : '';
  let candidate = `${name}${suffix}`;
  for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) candidate = `${name} (${n})${suffix}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

/** A file's name as it was added, its extension from its type when it has none. */
function fileName(file, taken) {
  const known = EXTENSIONS[file.mime];
  const raw = typeof file.name === 'string' ? file.name : '';
  const ext = extname(raw).slice(1);
  const stem = safeName(ext ? raw.slice(0, -ext.length - 1) : raw, file.id);
  const extension = ext && /^[A-Za-z0-9]{1,8}$/.test(ext) ? ext : (known ?? 'bin');
  return uniqueName(stem, taken, extension);
}

const isLive = record => record.fields?.deletedAt === null || record.fields?.deletedAt === undefined;

function writeItems(document, backup, tiers, out, filesDir) {
  const report = { items: 0, files: 0, problems: [] };
  const folders = new Set();
  const items = document.records.filter(record => record?.type === ITEM_TYPE && typeof record.id === 'string' && record.fields && isLive(record));
  for (const record of items) {
    const f = record.fields;
    const tier = f.tier === 'cards' ? 'cards' : 'papers';
    const itemKey = openBytes(tiers[tier], f.key, fieldPlace(ITEM_TYPE, record.id, 'key'));
    if (!itemKey || itemKey.length !== KEY_BYTES) {
      report.problems.push(`item ${record.id}: its key does not open`);
      continue;
    }
    const open = field => openValue(itemKey, f[field], fieldPlace(ITEM_TYPE, record.id, field));
    const kind = typeof open('kind') === 'string' ? open('kind') : tier === 'cards' ? 'card' : 'document';
    const title = typeof open('title') === 'string' ? open('title') : '';
    const details = open('details');
    const notes = open('notes');
    const folder = uniqueName(safeName(title ? `${KIND_NAMES[kind] ?? kind} - ${title}` : (KIND_NAMES[kind] ?? kind), record.id), folders);
    const at = join(out, folder);
    mkdirSync(at, { recursive: true, mode: 0o700 });
    const shown = { kind, title, details: details ?? null, notes: typeof notes === 'string' ? notes : '' };
    writeFileSync(join(at, 'details.json'), `${JSON.stringify(shown, null, 2)}\n`, { mode: 0o600 });
    report.items += 1;
    const taken = new Set(['details.json']);
    const files = details && Array.isArray(details.files) ? details.files : [];
    for (const file of files) {
      if (!file || typeof file.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(file.id)) continue;
      const sealed = findBlob(file.id, backup, filesDir);
      if (!sealed) {
        report.problems.push(`${folder}: file ${file.name || file.id} is not in the backup${filesDir ? ' nor in --files' : ' (pass --files with a copy of the drive’s Wallet folder)'}`);
        continue;
      }
      const plain = openBlob(itemKey, file.id, new Uint8Array(sealed));
      if (!plain) {
        report.problems.push(`${folder}: file ${file.name || file.id} does not open (damaged)`);
        continue;
      }
      writeFileSync(join(at, fileName(file, taken)), plain, { mode: 0o600 });
      report.files += 1;
    }
    itemKey.fill(0);
  }
  return report;
}

// ---------------------------------------------------------------------------------------------
// The command.

function parseArgs(argv) {
  const options = { input: null, out: null, files: null, passphrase: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out' || arg === '--files') {
      const value = argv[++i];
      if (!value) throw new Failure(`${arg} needs a folder`);
      options[arg.slice(2)] = value;
    } else if (arg === '--passphrase') options.passphrase = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('--')) throw new Failure(`Unknown option ${arg}`);
    else if (options.input) throw new Failure('One backup at a time');
    else options.input = arg;
  }
  return options;
}

const USAGE = 'Usage: node tools/wallet/open.mjs <backup.tar.gz | unlease.json> --out <dir> [--files <dir>] [--passphrase]';

/** A secret from the terminal, without echo; or the first line of stdin when it is not a terminal. */
async function askSecret(prompt) {
  const input = process.stdin;
  if (!input.isTTY) {
    let text = '';
    for await (const chunk of input) {
      text += chunk.toString('utf8');
      if (text.includes('\n')) break;
    }
    return text.split(/\r?\n/)[0];
  }
  process.stderr.write(prompt);
  input.setRawMode(true);
  input.resume();
  return new Promise((resolve, reject) => {
    let typed = '';
    const finish = error => {
      input.setRawMode(false);
      input.pause();
      input.off('data', onData);
      process.stderr.write('\n');
      if (error) reject(error);
      else resolve(typed);
    };
    const onData = chunk => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\r' || char === '\n' || char === '\u0004') return finish();
        if (char === '\u0003') return finish(new Failure('Cancelled'));
        if (char === '\u007f' || char === '\b') typed = [...typed].slice(0, -1).join('');
        else if (char >= ' ') typed += char;
      }
    };
    input.on('data', onData);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return EXIT_OK;
  }
  if (!options.input || !options.out) throw new Failure(USAGE);
  if (typeof crypto.argon2Sync !== 'function') throw new Failure('This needs Node 24.7 or later (Argon2id)');
  if (existsSync(options.out) && (!statSync(options.out).isDirectory() || readdirSync(options.out).length > 0)) throw new Failure(`${options.out} is not an empty folder: choose another, nothing is overwritten`);
  if (options.files && !(existsSync(options.files) && statSync(options.files).isDirectory())) throw new Failure(`No such folder: ${options.files}`);

  const backup = await readBackup(options.input);
  const vault = backup.document.records.find(record => record?.type === VAULT_TYPE && record.id === VAULT_ID);
  if (!vault || !vault.fields) throw new Failure('This backup holds no wallet');

  let tiers;
  if (options.passphrase) {
    const secret = passphraseBytes(await askSecret('Passphrase: '));
    tiers = openVault(vault.fields, secret, 'passphrase');
    secret.fill(0);
    if (!tiers) throw new Failure('This passphrase does not open the wallet', EXIT_WRONG_SECRET);
  } else {
    const code = fromBase32(await askSecret('Recovery code: '), RECOVERY_BYTES);
    if (!code) throw new Failure('This is not a recovery code: 32 letters and digits, as on the recovery kit', EXIT_WRONG_SECRET);
    tiers = openVault(vault.fields, code, 'recovery');
    code.fill(0);
    if (!tiers) throw new Failure('This recovery code does not open the wallet', EXIT_WRONG_SECRET);
  }

  mkdirSync(options.out, { recursive: true, mode: 0o700 });
  const report = writeItems(backup.document, backup, tiers, options.out, options.files);
  tiers.cards.fill(0);
  tiers.papers.fill(0);
  process.stdout.write(`${report.items} item${report.items === 1 ? '' : 's'} and ${report.files} file${report.files === 1 ? '' : 's'} written to ${options.out}\n`);
  for (const problem of report.problems) process.stderr.write(`Not written: ${problem}\n`);
  return report.problems.length > 0 ? EXIT_OTHER : EXIT_OK;
}

main().then(
  code => {
    process.exitCode = code;
  },
  error => {
    process.stderr.write(`${error instanceof Failure ? error.message : (error?.stack ?? String(error))}\n`);
    process.exitCode = error instanceof Failure ? error.code : EXIT_OTHER;
  },
);
