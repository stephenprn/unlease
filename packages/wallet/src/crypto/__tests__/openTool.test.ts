/** `tools/wallet/open.mjs`, run as a person who lost every device would, on what the package seals. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatHlc } from '@unlease/core/sync/hlc';
import type { Fields, SyncRecord } from '@unlease/core/sync/record';
import { EMPTY_DETAILS, type ItemDetails, type WalletFile } from '../../models/item';
import { newItemFields } from '../../sync/entities';
import { sealBlob } from '../seal';
import { createVault, ITEM_TYPE, VAULT_ID, VAULT_TYPE, type NewVault } from '../vault';
import { TEST_KDF, testCipher } from './testCipher';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const TOOL = join(ROOT, 'tools/wallet/open.mjs');
const PASSPHRASE = 'Le chat dort sur la valise';

const clocksOf = (fields: Fields): Record<string, string> => Object.fromEntries(Object.keys(fields).map(field => [field, formatHlc(1_700_000_000_000, 0, 'device')]));
const record = (type: string, id: string, fields: Fields): SyncRecord => ({ type, id, fields, clocks: clocksOf(fields) });

const file = (id: string, name: string, mime: string): WalletFile => ({ id, role: 'page', mime, name, width: 0, height: 0, bytes: 0, thumb: null });

const PASSPORT = '0192f3a4-0000-7000-8000-00000000000a';
const CARD = '0192f3a4-0000-7000-8000-00000000000b';
const GONE = '0192f3a4-0000-7000-8000-00000000000c';
const FRONT = '0192f3a4-0000-7000-8000-0000000000f1';
const SCAN = '0192f3a4-0000-7000-8000-0000000000f2';
const PHOTO = '0192f3a4-0000-7000-8000-0000000000f3';

interface Fixture {
  readonly vault: NewVault;
  readonly records: SyncRecord[];
  /** Each file's plain bytes, and its sealed ones as the server keeps them. */
  readonly plain: Map<string, Uint8Array>;
  readonly sealed: Map<string, Uint8Array>;
}

async function fixture(): Promise<Fixture> {
  const now = 1_700_000_000_000;
  const vault = await createVault(testCipher, PASSPHRASE, now, TEST_KDF);
  const plain = new Map<string, Uint8Array>([
    [FRONT, testCipher.random(3000)],
    [SCAN, testCipher.random(5000)],
    [PHOTO, testCipher.random(100)],
  ]);
  const sealed = new Map<string, Uint8Array>();

  const passportDetails: ItemDetails = {
    ...EMPTY_DETAILS,
    number: '12AB34567',
    expiresOn: '2031-05-01',
    // Two files of the same name: both kept. A name without an extension takes its type's.
    files: [file(FRONT, 'Passeport recto.jpg', 'image/jpeg'), file(SCAN, 'Passeport recto.jpg', 'image/jpeg'), file(PHOTO, 'photo', 'application/pdf')],
  };
  const passport = newItemFields(testCipher, vault.keys.papers, PASSPORT, { kind: 'passport', title: 'Passeport : Élise / 2031', details: passportDetails, notes: 'Renouveler avant l’été', text: '' }, now);
  for (const [id, bytes] of plain) sealed.set(id, sealBlob(testCipher, passport.itemKey, id, bytes));

  const card = newItemFields(testCipher, vault.keys.cards, CARD, { kind: 'card', title: 'Bibliothèque', details: { ...EMPTY_DETAILS, number: '0042' }, notes: '', text: '' }, now);
  const gone = newItemFields(testCipher, vault.keys.cards, GONE, { kind: 'giftCard', title: 'In the bin', details: EMPTY_DETAILS, notes: '', text: '' }, now);

  const records = [
    record(VAULT_TYPE, VAULT_ID, { ...vault.fields }),
    record(ITEM_TYPE, PASSPORT, passport.fields),
    record(ITEM_TYPE, CARD, card.fields),
    record(ITEM_TYPE, GONE, { ...gone.fields, deletedAt: now + 5 }),
    record('note', 'n1', { title: 'Another app’s record' }),
  ];
  return { vault, records, plain, sealed };
}

/** `unlease.json` as `server/src/backup/archive.ts` writes it. */
function backupDocument(records: readonly SyncRecord[], sealed: ReadonlyMap<string, Uint8Array>): string {
  const files = [...sealed].map(([id, bytes]) => ({
    id,
    mime: 'application/octet-stream',
    width: 0,
    height: 0,
    bytes: bytes.length,
    displayMime: 'application/octet-stream',
    displayBytes: bytes.length,
    source: 'upload',
    createdAt: 1_700_000_000_000,
    path: `Fichiers/Wallet/${id}.bin`,
    stored: `fichiers/${id}.bin`,
    drive: `/Wallet/${id}.bin`,
  }));
  return JSON.stringify({ format: 'unlease-backup', version: 1, createdAt: '2026-11-18T03:00:00.000Z', server: '0.2.0', epoch: 'e1', records, files }, null, 1);
}

function run(args: readonly string[], secret: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [TOOL, ...args], { cwd: ROOT, input: `${secret}\n`, encoding: 'utf8', timeout: 60_000 });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('tools/wallet/open.mjs', () => {
  let dir: string;
  let fx: Fixture;

  beforeAll(async () => {
    fx = await fixture();
  });
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wallet-open-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** A backup's document with the sealed files beside it, as S3 keeps them. */
  function s3Copy(): string {
    mkdirSync(join(dir, 'backup', 'fichiers'), { recursive: true });
    writeFileSync(join(dir, 'backup', 'unlease.json'), backupDocument(fx.records, fx.sealed));
    for (const [id, bytes] of fx.sealed) writeFileSync(join(dir, 'backup', 'fichiers', `${id}.bin`), bytes);
    return join(dir, 'backup', 'unlease.json');
  }

  function checkOutput(out: string): void {
    expect(readdirSync(out).sort()).toEqual(['Card - Bibliothèque', 'Passport - Passeport - Élise - 2031']);
    const passport = join(out, 'Passport - Passeport - Élise - 2031');
    const details = JSON.parse(readFileSync(join(passport, 'details.json'), 'utf8')) as Record<string, unknown>;
    expect(details).toMatchObject({ kind: 'passport', title: 'Passeport : Élise / 2031', notes: 'Renouveler avant l’été', details: { number: '12AB34567', expiresOn: '2031-05-01' } });
    expect(readdirSync(passport).sort()).toEqual(['Passeport recto (2).jpg', 'Passeport recto.jpg', 'details.json', 'photo.pdf']);
    expect(Buffer.from(readFileSync(join(passport, 'Passeport recto.jpg'))).equals(Buffer.from(fx.plain.get(FRONT)!))).toBe(true);
    expect(Buffer.from(readFileSync(join(passport, 'Passeport recto (2).jpg'))).equals(Buffer.from(fx.plain.get(SCAN)!))).toBe(true);
    expect(Buffer.from(readFileSync(join(passport, 'photo.pdf'))).equals(Buffer.from(fx.plain.get(PHOTO)!))).toBe(true);
    const card = JSON.parse(readFileSync(join(out, 'Card - Bibliothèque', 'details.json'), 'utf8')) as Record<string, unknown>;
    expect(card).toMatchObject({ kind: 'card', title: 'Bibliothèque', details: { number: '0042' } });
  }

  it('opens a backup with the recovery code, typed as a person copies it', () => {
    const out = join(dir, 'out');
    const result = run([s3Copy(), '--out', out], fx.vault.recoveryCode.toLowerCase().replace(/-/g, ' '));
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('2 items and 3 files');
    checkOutput(out);
  });

  it('opens a full archive with the passphrase', () => {
    const root = join(dir, 'unlease-2026-11-18T03-00-00Z-complet');
    mkdirSync(join(root, 'Fichiers', 'Wallet'), { recursive: true });
    writeFileSync(join(root, 'unlease.json'), backupDocument(fx.records, fx.sealed));
    writeFileSync(join(root, 'LISEZMOI.md'), '# Sauvegarde\n');
    // Another app's file, long-named: skipped as it streams by.
    mkdirSync(join(root, 'Fichiers', 'Carnet', 'Une collection au nom bien plus long que les cent octets du format ustar'), { recursive: true });
    writeFileSync(join(root, 'Fichiers', 'Carnet', 'Une collection au nom bien plus long que les cent octets du format ustar', 'photo.jpg'), Buffer.alloc(10_000, 1));
    for (const [id, bytes] of fx.sealed) writeFileSync(join(root, 'Fichiers', 'Wallet', `${id}.bin`), bytes);
    const archive = join(dir, 'unlease-2026-11-18T03-00-00Z-complet.tar.gz');
    const tar = spawnSync('tar', ['-czf', archive, '-C', dir, 'unlease-2026-11-18T03-00-00Z-complet'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
    expect(tar.status).toBe(0);
    const out = join(dir, 'out');
    const result = run([archive, '--out', out, '--passphrase'], PASSPHRASE);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    checkOutput(out);
  });

  it('reads the sealed files from a copy of the drive’s Wallet folder', () => {
    writeFileSync(join(dir, 'unlease.json'), backupDocument(fx.records, fx.sealed));
    const drive = join(dir, 'Seafile');
    mkdirSync(join(drive, 'Wallet'), { recursive: true });
    for (const [id, bytes] of fx.sealed) writeFileSync(join(drive, 'Wallet', `${id}.bin`), bytes);
    const out = join(dir, 'out');
    const result = run([join(dir, 'unlease.json'), '--out', out, '--files', drive], fx.vault.recoveryCode);
    expect(result.status).toBe(0);
    checkOutput(out);
  });

  it('writes what it can when a file is missing, and says so', () => {
    writeFileSync(join(dir, 'unlease.json'), backupDocument(fx.records, fx.sealed));
    const out = join(dir, 'out');
    const result = run([join(dir, 'unlease.json'), '--out', out], fx.vault.recoveryCode);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--files');
    expect(readdirSync(join(out, 'Passport - Passeport - Élise - 2031'))).toEqual(['details.json']);
  });

  it('answers 2 to a wrong code or passphrase, and writes nothing', () => {
    const input = s3Copy();
    const out = join(dir, 'out');
    const other = '0000-0000-0000-0000-0000-0000-0000-0000';
    expect(run([input, '--out', out], other).status).toBe(2);
    expect(run([input, '--out', out], 'not a code').status).toBe(2);
    expect(run([input, '--out', out, '--passphrase'], 'le chat dort sur la valise').status).toBe(2);
    expect(existsSync(out)).toBe(false);
  });

  it('refuses to write into a folder that holds anything, and a vault that asks too much', () => {
    const input = s3Copy();
    const out = join(dir, 'out');
    mkdirSync(out);
    writeFileSync(join(out, 'keep.txt'), 'mine');
    const busy = run([input, '--out', out], fx.vault.recoveryCode);
    expect(busy.status).toBe(1);
    expect(readdirSync(out)).toEqual(['keep.txt']);

    const greedy = fx.records.map(r => (r.type === VAULT_TYPE ? { ...r, fields: { ...r.fields, recovery: JSON.stringify({ ...JSON.parse(r.fields.recovery as string), mem: 4 * 1024 * 1024 }) } } : r));
    writeFileSync(join(dir, 'greedy.json'), backupDocument(greedy, fx.sealed));
    const refused = run([join(dir, 'greedy.json'), '--out', join(dir, 'out2')], fx.vault.recoveryCode);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('asks more');
  });
});
