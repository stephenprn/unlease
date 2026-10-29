/**
 * Tar, read and written as streams: a backup can hold gigabytes of photos and never sits in memory.
 * Names longer than ustar's 100 bytes, or not ASCII (French titles), go in a pax header, which
 * every tar since 2001 reads (macOS Archive Utility, GNU tar, 7-Zip).
 */
import type { Writable } from 'node:stream';

const BLOCK = 512;
const ZEROS = Buffer.alloc(BLOCK * 2);

export class TarError extends Error {}

function octal(value: number, width: number): string {
  return `${value.toString(8).padStart(width - 1, '0')}\0`;
}

function header(name: string, size: number, mtime: number, type: '0' | 'x'): Buffer {
  const block = Buffer.alloc(BLOCK);
  block.write(name, 0, 100, 'utf8');
  block.write(octal(0o644, 8), 100, 'ascii');
  block.write(octal(0, 8), 108, 'ascii');
  block.write(octal(0, 8), 116, 'ascii');
  block.write(octal(size, 12), 124, 'ascii');
  block.write(octal(Math.floor(mtime / 1000), 12), 136, 'ascii');
  block.write('        ', 148, 'ascii');
  block.write(type, 156, 'ascii');
  block.write('ustar\0', 257, 'ascii');
  block.write('00', 263, 'ascii');
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'ascii');
  return block;
}

/** One pax record: its length counts its own digits. */
function paxRecord(key: string, value: string): Buffer {
  const body = ` ${key}=${value}\n`;
  let length = Buffer.byteLength(body) + 1;
  while (String(length).length + Buffer.byteLength(body) !== length) length = String(length).length + Buffer.byteLength(body);
  return Buffer.from(`${length}${body}`, 'utf8');
}

const padding = (size: number): number => (BLOCK - (size % BLOCK)) % BLOCK;

/** Writes entries to `out`, waiting whenever it is full. */
export class TarWriter {
  constructor(private readonly out: Writable) {}

  /** Waits while `out` is full; a closed `out` (a download cancelled) throws instead of waiting forever. */
  private async write(chunk: Buffer | Uint8Array): Promise<void> {
    if (this.out.destroyed) throw new TarError('output closed');
    if (this.out.write(chunk)) return;
    await new Promise<void>((resolve, reject) => {
      const settle = (error?: Error): void => {
        this.out.off('drain', drained);
        this.out.off('close', closed);
        this.out.off('error', closed);
        if (error) reject(error);
        else resolve();
      };
      const drained = (): void => settle();
      const closed = (): void => settle(new TarError('output closed'));
      this.out.once('drain', drained);
      this.out.once('close', closed);
      this.out.once('error', closed);
    });
  }

  private async head(name: string, size: number, mtime: number): Promise<void> {
    if (Buffer.byteLength(name) > 100 || !/^[\x20-\x7e]*$/.test(name)) {
      const pax = paxRecord('path', name);
      await this.write(header(`PaxHeader/${name.replace(/[^\x20-\x7e]/g, '_').slice(-80)}`, pax.length, mtime, 'x'));
      await this.write(pax);
      await this.write(Buffer.alloc(padding(pax.length)));
      name = name.replace(/[^\x20-\x7e]/g, '_').slice(0, 100);
    }
    await this.write(header(name, size, mtime, '0'));
  }

  async file(name: string, data: Buffer | string, mtime = Date.now()): Promise<void> {
    const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    await this.head(name, bytes.length, mtime);
    await this.write(bytes);
    await this.write(Buffer.alloc(padding(bytes.length)));
  }

  /** An entry of `size` bytes from a stream; a stream that ends short or runs long is an error, and a failure cancels the stream. */
  async stream(name: string, size: number, source: AsyncIterable<Uint8Array>, mtime = Date.now()): Promise<void> {
    const chunks = source[Symbol.asyncIterator]();
    try {
      await this.head(name, size, mtime);
      let written = 0;
      for (let next = await chunks.next(); !next.done; next = await chunks.next()) {
        written += next.value.length;
        if (written > size) throw new TarError(`${name}: more than ${size} bytes`);
        await this.write(next.value);
      }
      if (written !== size) throw new TarError(`${name}: ${written} bytes instead of ${size}`);
    } catch (error) {
      await chunks.return?.();
      throw error;
    }
    await this.write(Buffer.alloc(padding(size)));
  }

  async end(): Promise<void> {
    await this.write(ZEROS);
  }
}

/** Bytes pulled from a stream on demand. */
class Bytes {
  private chunks: Buffer[] = [];
  private length = 0;
  private done = false;

  constructor(private readonly source: AsyncIterator<Uint8Array>) {}

  /** Stops reading the stream (and closes what it reads from). */
  async close(): Promise<void> {
    await this.source.return?.();
  }

  private async fill(count: number): Promise<boolean> {
    while (this.length < count && !this.done) {
      const next = await this.source.next();
      if (next.done) this.done = true;
      else if (next.value.length > 0) {
        this.chunks.push(Buffer.from(next.value));
        this.length += next.value.length;
      }
    }
    return this.length >= count;
  }

  /** The next `count` bytes, or null at the end. */
  async take(count: number): Promise<Buffer | null> {
    if (!(await this.fill(count))) return null;
    const all = this.chunks.length === 1 ? this.chunks[0]! : Buffer.concat(this.chunks);
    this.chunks = all.length > count ? [all.subarray(count)] : [];
    this.length -= count;
    return all.subarray(0, count);
  }

  /** The next `count` bytes, in pieces as they come. */
  async *pieces(count: number): AsyncGenerator<Buffer> {
    let left = count;
    while (left > 0) {
      if (!(await this.fill(1))) throw new TarError('archive cut short');
      const chunk = this.chunks.shift()!;
      const piece = chunk.length > left ? chunk.subarray(0, left) : chunk;
      if (chunk.length > left) this.chunks.unshift(chunk.subarray(left));
      this.length -= piece.length;
      left -= piece.length;
      yield piece;
    }
  }
}

export interface TarEntry {
  readonly name: string;
  readonly size: number;
  /** The entry's bytes; what is not read is skipped before the next entry. */
  readonly body: AsyncIterable<Buffer>;
}

const field = (block: Buffer, start: number, length: number): string => {
  const raw = block.subarray(start, start + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end < 0 ? length : end).toString('utf8');
};

function parsePax(data: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let at = 0;
  while (at < data.length) {
    const space = data.indexOf(0x20, at);
    if (space < 0) break;
    const length = Number(data.subarray(at, space).toString('ascii'));
    if (!Number.isInteger(length) || length <= 0) break;
    const record = data.subarray(space + 1, at + length - 1).toString('utf8');
    const equals = record.indexOf('=');
    if (equals > 0) out[record.slice(0, equals)] = record.slice(equals + 1);
    at += length;
  }
  return out;
}

/** The regular files of a tar stream, in order. Directories, links and the rest are skipped; stopping early closes the stream. */
export async function* readTar(source: AsyncIterable<Uint8Array>): AsyncGenerator<TarEntry> {
  const bytes = new Bytes(source[Symbol.asyncIterator]());
  try {
    yield* entries(bytes);
  } finally {
    await bytes.close();
  }
}

async function* entries(bytes: Bytes): AsyncGenerator<TarEntry> {
  let longName: string | null = null;
  for (;;) {
    const block = await bytes.take(BLOCK);
    if (!block || block.every(byte => byte === 0)) return;
    let sum = 0;
    for (let i = 0; i < BLOCK; i += 1) sum += i >= 148 && i < 156 ? 0x20 : block[i]!;
    if (Number.parseInt(field(block, 148, 8).trim(), 8) !== sum) throw new TarError('not a tar archive');
    const sizeField = block.subarray(124, 136);
    if ((sizeField[0]! & 0x80) !== 0) throw new TarError('entry too large');
    const size = Number.parseInt(field(block, 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(block[156]!);
    const prefix = field(block, 345, 155);
    const name = longName ?? (prefix ? `${prefix}/${field(block, 0, 100)}` : field(block, 0, 100));
    longName = null;
    if (type === 'x' || type === 'L') {
      // A pax header, or GNU tar's long name: either names the entry that follows.
      const data = (await bytes.take(size + padding(size)))?.subarray(0, size) ?? Buffer.alloc(0);
      longName = type === 'x' ? (parsePax(data).path ?? null) : data.toString('utf8').replace(/\0[\s\S]*$/, '');
      continue;
    }
    if (type !== '0' && type !== '\0') {
      for await (const _ of bytes.pieces(size + padding(size))) {
        // Skipped: not a regular file.
      }
      continue;
    }
    let consumed = 0;
    const body = (async function* () {
      for await (const piece of bytes.pieces(size)) {
        consumed += piece.length;
        yield piece;
      }
    })();
    yield { name, size, body };
    for await (const _ of bytes.pieces(size - consumed)) {
      // What the caller left of the entry.
    }
    for await (const _ of bytes.pieces(padding(size))) {
      // Padding to the next block.
    }
  }
}
