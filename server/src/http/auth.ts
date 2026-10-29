/**
 * The bearer token check, and a brake on guessing it: after ten failures in a
 * minute from one address, that address gets 429s (even with the right token)
 * until the oldest of those failures is a minute old.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

export class AuthGuard {
  private readonly expected: Buffer;
  private readonly failures = new Map<string, number[]>();

  constructor(
    token: string,
    private readonly now: () => number = Date.now,
    private readonly limit = 10,
    private readonly windowMs = 60_000,
  ) {
    this.expected = digest(token);
  }

  /** Constant time: both sides are hashed first, so even the token's length does not leak. */
  verify(authorization: string | undefined): boolean {
    const match = /^Bearer\s+(.+?)\s*$/i.exec(authorization ?? '');
    return match !== null && timingSafeEqual(digest(match[1]!), this.expected);
  }

  private recent(ip: string): number[] {
    const cutoff = this.now() - this.windowMs;
    const kept = (this.failures.get(ip) ?? []).filter(time => time > cutoff);
    if (kept.length > 0) this.failures.set(ip, kept);
    else this.failures.delete(ip);
    return kept;
  }

  isLimited(ip: string): boolean {
    return this.recent(ip).length >= this.limit;
  }

  /** Seconds until the address may try again. */
  retryAfter(ip: string): number {
    const times = this.recent(ip);
    const oldest = times[times.length - this.limit];
    return oldest === undefined ? 0 : Math.max(1, Math.ceil((oldest + this.windowMs - this.now()) / 1000));
  }

  recordFailure(ip: string): void {
    const times = this.recent(ip);
    times.push(this.now());
    this.failures.set(ip, times.slice(-this.limit * 2));
    if (this.failures.size > 10_000) this.prune();
  }

  private prune(): void {
    for (const ip of [...this.failures.keys()]) this.recent(ip);
  }
}
