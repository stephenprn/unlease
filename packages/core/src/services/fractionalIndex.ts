/**
 * Fractional indexing: order keys you can always insert between, compared as plain strings.
 * Base 62 in ASCII order, so JavaScript, SQLite's BINARY collation and the server sort alike.
 *
 * Port of the algorithm in rocicorp/fractional-indexing (CC0), itself from
 * David Greenspan's "Implementing Fractional Indexing".
 */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ZERO = DIGITS[0]!;
const SMALLEST_INTEGER = `A${ZERO.repeat(26)}`;

function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) throw new Error(`${a} >= ${b}`);
  if (a.slice(-1) === ZERO || (b !== null && b.slice(-1) === ZERO)) {
    throw new Error('trailing zero');
  }
  if (b !== null) {
    let n = 0;
    while ((a[n] ?? ZERO) === b[n]) n += 1;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const digitA = a ? DIGITS.indexOf(a[0]!) : 0;
  const digitB = b !== null ? DIGITS.indexOf(b[0]!) : DIGITS.length;
  if (digitB - digitA > 1) {
    return DIGITS[Math.round(0.5 * (digitA + digitB))]!;
  }
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[digitA]! + midpoint(a.slice(1), null);
}

function integerLength(head: string): number {
  if (head >= 'a' && head <= 'z') return head.charCodeAt(0) - 'a'.charCodeAt(0) + 2;
  if (head >= 'A' && head <= 'Z') return 'Z'.charCodeAt(0) - head.charCodeAt(0) + 2;
  throw new Error(`invalid order key head: ${head}`);
}

function integerPart(key: string): string {
  const length = integerLength(key[0] ?? '');
  if (length > key.length) throw new Error(`invalid order key: ${key}`);
  return key.slice(0, length);
}

function validate(key: string): void {
  if (key === SMALLEST_INTEGER) throw new Error(`invalid order key: ${key}`);
  const integer = integerPart(key);
  if (key.slice(integer.length).slice(-1) === ZERO) throw new Error(`invalid order key: ${key}`);
}

function incrementInteger(x: string): string | null {
  const [head, ...digits] = x.split('') as [string, ...string[]];
  let carry = true;
  for (let i = digits.length - 1; carry && i >= 0; i -= 1) {
    const d = DIGITS.indexOf(digits[i]!) + 1;
    if (d === DIGITS.length) {
      digits[i] = ZERO;
    } else {
      digits[i] = DIGITS[d]!;
      carry = false;
    }
  }
  if (!carry) return head + digits.join('');
  if (head === 'Z') return `a${ZERO}`;
  if (head === 'z') return null;
  const next = String.fromCharCode(head.charCodeAt(0) + 1);
  if (next > 'a') digits.push(ZERO);
  else digits.pop();
  return next + digits.join('');
}

function decrementInteger(x: string): string | null {
  const [head, ...digits] = x.split('') as [string, ...string[]];
  let borrow = true;
  for (let i = digits.length - 1; borrow && i >= 0; i -= 1) {
    const d = DIGITS.indexOf(digits[i]!) - 1;
    if (d === -1) {
      digits[i] = DIGITS.slice(-1);
    } else {
      digits[i] = DIGITS[d]!;
      borrow = false;
    }
  }
  if (!borrow) return head + digits.join('');
  if (head === 'a') return `Z${DIGITS.slice(-1)}`;
  if (head === 'A') return null;
  const previous = String.fromCharCode(head.charCodeAt(0) - 1);
  if (previous < 'Z') digits.push(DIGITS.slice(-1));
  else digits.pop();
  return previous + digits.join('');
}

/** A key strictly between `a` and `b`; null means "the start" / "the end". */
export function keyBetween(a: string | null, b: string | null): string {
  if (a !== null) validate(a);
  if (b !== null) validate(b);
  if (a !== null && b !== null && a >= b) throw new Error(`${a} >= ${b}`);
  if (a === null) {
    if (b === null) return `a${ZERO}`;
    const ib = integerPart(b);
    const fb = b.slice(ib.length);
    if (ib === SMALLEST_INTEGER) return ib + midpoint('', fb);
    if (ib < b) return ib;
    const decremented = decrementInteger(ib);
    if (decremented === null) throw new Error('cannot decrement any more');
    return decremented;
  }
  if (b === null) {
    const ia = integerPart(a);
    const fa = a.slice(ia.length);
    const incremented = incrementInteger(ia);
    return incremented === null ? ia + midpoint(fa, null) : incremented;
  }
  const ia = integerPart(a);
  const fa = a.slice(ia.length);
  const ib = integerPart(b);
  const fb = b.slice(ib.length);
  if (ia === ib) return ia + midpoint(fa, fb);
  const incremented = incrementInteger(ia);
  if (incremented === null) throw new Error('cannot increment any more');
  if (incremented < b) return incremented;
  return ia + midpoint(fa, null);
}

/** `n` ascending keys between `a` and `b`, spread evenly. */
export function keysBetween(a: string | null, b: string | null, n: number): string[] {
  if (n <= 0) return [];
  if (n === 1) return [keyBetween(a, b)];
  if (b === null) {
    let current = keyBetween(a, b);
    const result = [current];
    for (let i = 0; i < n - 1; i += 1) {
      current = keyBetween(current, b);
      result.push(current);
    }
    return result;
  }
  if (a === null) {
    let current = keyBetween(a, b);
    const result = [current];
    for (let i = 0; i < n - 1; i += 1) {
      current = keyBetween(a, current);
      result.push(current);
    }
    return result.reverse();
  }
  const mid = Math.floor(n / 2);
  const middle = keyBetween(a, b);
  return [...keysBetween(a, middle, mid), middle, ...keysBetween(middle, b, n - mid - 1)];
}

/** A key past `a` with the same integer part, before any key `keyBetween(a, null)` would give. */
function keyJustAfter(a: string): string {
  const integer = integerPart(a);
  return integer + midpoint(a.slice(integer.length), null);
}

/** The neighbours as `keyBetween` needs them: an invalid key counts as an open end, and tied neighbours (two devices minted one key) as `a` and a key just past it. */
function neighbours(a: string | null, b: string | null): [string | null, string | null] {
  const before = a !== null && isValidKey(a) ? a : null;
  let after = b !== null && isValidKey(b) ? b : null;
  if (before !== null && after !== null && before >= after) after = keyJustAfter(before);
  return [before, after];
}

/** `keyBetween` for neighbours read from synced records: never throws. Between tied neighbours it lands just after both. */
export function positionBetween(a: string | null, b: string | null): string {
  const [before, after] = neighbours(a, b);
  return keyBetween(before, after);
}

/** `keysBetween` for neighbours read from synced records: never throws. */
export function positionsBetween(a: string | null, b: string | null, n: number): string[] {
  const [before, after] = neighbours(a, b);
  return keysBetween(before, after, n);
}

/** A record's place in its list. */
export interface Placed {
  readonly id: string;
  readonly position: string;
}

/**
 * Keys for `count` items going at `index` among `siblings` (in `comparePositions` order, without
 * the items going). Nothing fits between two records two devices gave one key: the later ones,
 * tied with the record before the gap, take new keys after the items, in `moved`, to write in the
 * same batch.
 */
export function placeAt(siblings: readonly Placed[], index: number, count = 1): { positions: string[]; moved: Placed[] } {
  const before = index > 0 ? (siblings[index - 1]?.position ?? null) : null;
  let end = index;
  if (before !== null && isValidKey(before)) while (end < siblings.length && siblings[end]!.position <= before) end += 1;
  const keys = positionsBetween(before, siblings[end]?.position ?? null, count + end - index);
  return {
    positions: keys.slice(0, count),
    moved: siblings.slice(index, end).map((sibling, k) => ({ id: sibling.id, position: keys[count + k]! })),
  };
}

/** Where an item goes among `siblings` to sit after `beforeId` (or before `afterId`); null ends mean the start and the end. */
export function indexBetween(siblings: readonly Placed[], beforeId: string | null, afterId: string | null): number {
  const before = beforeId === null ? -1 : siblings.findIndex(sibling => sibling.id === beforeId);
  if (before >= 0) return before + 1;
  const after = afterId === null ? -1 : siblings.findIndex(sibling => sibling.id === afterId);
  if (after >= 0) return after;
  return beforeId === null ? 0 : siblings.length;
}

export function isValidKey(key: string): boolean {
  try {
    validate(key);
    return /^[0-9A-Za-z]+$/.test(key);
  } catch {
    return false;
  }
}

/** By key, then by id: two devices can mint the same key for different records. */
export function comparePositions(
  a: { readonly position: string; readonly id: string },
  b: { readonly position: string; readonly id: string },
): number {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}
