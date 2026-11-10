/**
 * The bearer token check, and a brake on guessing it. The right token always passes: the brake
 * only counts wrong ones, per client address, and after ten in a minute answers that address's
 * wrong guesses with 429 until the oldest of them is a minute old, so a guesser sharing a proxy
 * with your devices never locks them out. What makes guessing hopeless is the token's length
 * (`openssl rand -hex 32`; the server warns at start below 32 characters).
 *
 * The addresses it remembers are capped (the least recently failed forgotten first), and so is
 * what it logs: a line when an address first fails in its window and one when it is braked, at most
 * a few dozen a minute in all; every other refusal is only counted, in one line a minute while
 * guessing goes on.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

/** What a refused request is told and logged with. */
export type Refusal = {
  readonly ip: string;
  readonly path: string;
};

export interface AuthGuardOptions {
  readonly now?: () => number;
  /** Wrong tokens from one address in `windowMs` before its guesses are answered 429. */
  readonly limit?: number;
  readonly windowMs?: number;
  /** Addresses remembered at once; past it, the one that failed longest ago is forgotten. */
  readonly maxAddresses?: number;
  /** Log lines about refused tokens per window, for every address together. */
  readonly maxLines?: number;
  readonly warn?: (message: string, fields: Record<string, unknown>) => void;
}

export class AuthGuard {
  private readonly expected: Buffer;
  private readonly now: () => number;
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxAddresses: number;
  private readonly maxLines: number;
  private readonly warn: (message: string, fields: Record<string, unknown>) => void;
  /** Each address's recent failures, oldest first; the map in order of each address's latest failure. */
  private readonly failures = new Map<string, number[]>();
  /** The log's current window: lines written in it, and refusals counted without a line. */
  private lines = { windowStart: 0, written: 0, quiet: 0 };

  constructor(token: string, options: AuthGuardOptions = {}) {
    this.expected = digest(token);
    this.now = options.now ?? Date.now;
    this.limit = options.limit ?? 10;
    this.windowMs = options.windowMs ?? 60_000;
    this.maxAddresses = options.maxAddresses ?? 10_000;
    this.maxLines = options.maxLines ?? 30;
    this.warn = options.warn ?? (() => {});
  }

  /** Constant time: both sides are hashed first, so even the token's length does not leak. */
  verify(authorization: string | undefined): boolean {
    const match = /^Bearer\s+(.+?)\s*$/i.exec(authorization ?? '');
    return match !== null && timingSafeEqual(digest(match[1]!), this.expected);
  }

  private recent(ip: string): number[] {
    const cutoff = this.now() - this.windowMs;
    const kept = (this.failures.get(ip) ?? []).filter(time => time > cutoff);
    if (kept.length === 0) this.failures.delete(ip);
    return kept;
  }

  /** Whether this address's wrong guesses are answered 429 for now. */
  isLimited(ip: string): boolean {
    return this.recent(ip).length >= this.limit;
  }

  /** Seconds until the address may guess again. */
  retryAfter(ip: string): number {
    const times = this.recent(ip);
    const oldest = times[times.length - this.limit];
    return oldest === undefined ? 0 : Math.max(1, Math.ceil((oldest + this.windowMs - this.now()) / 1000));
  }

  /** A wrong token (or an unknown download ticket) from `ip`. */
  recordFailure(refusal: Refusal): void {
    const { ip } = refusal;
    const times = this.recent(ip);
    times.push(this.now());
    // Moved to the end: the map stays ordered by each address's latest failure.
    this.failures.delete(ip);
    this.failures.set(ip, times.slice(-this.limit));
    this.bound();
    if (times.length === 1) this.say('rejected a request without a valid token', refusal);
    else if (times.length === this.limit) this.say('too many wrong tokens from one address: its guesses are answered 429 for a while', { ...refusal, failures: this.limit });
    else this.count();
  }

  /** A guess answered 429: counted, never a line of its own. */
  recordLimited(): void {
    this.count();
  }

  /** How many addresses it remembers (for tests). */
  get remembered(): number {
    return this.failures.size;
  }

  private bound(): void {
    if (this.failures.size <= this.maxAddresses) return;
    const cutoff = this.now() - this.windowMs;
    // Oldest latest-failure first: those past their window go, then the least recent while still too many.
    for (const [ip, times] of this.failures) {
      if (this.failures.size <= this.maxAddresses && (times[times.length - 1] ?? 0) > cutoff) break;
      this.failures.delete(ip);
    }
  }

  private roll(): void {
    const now = this.now();
    if (now - this.lines.windowStart < this.windowMs) return;
    if (this.lines.quiet > 0) this.warn('wrong tokens refused without a line of their own', { refused: this.lines.quiet, inSeconds: Math.round((now - this.lines.windowStart) / 1000) });
    this.lines = { windowStart: now, written: 0, quiet: 0 };
  }

  private count(): void {
    this.roll();
    this.lines.quiet += 1;
  }

  private say(message: string, fields: Record<string, unknown>): void {
    this.roll();
    if (this.lines.written >= this.maxLines) {
      this.lines.quiet += 1;
      return;
    }
    this.lines.written += 1;
    this.warn(message, fields);
  }
}
