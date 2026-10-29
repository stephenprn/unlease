/**
 * Record ids minted offline on any device: UUIDv7 (RFC 9562). Unique across every app of the suite,
 * so a reference into another app needs no lookup, and the same identifier other formats expect
 * (an iCalendar UID, a vCard UID). They sort by creation: the 48-bit millisecond time comes first,
 * then 12 bits that count up within one millisecond (the RFC's method 1), so ids made in a burst
 * keep their order, then 62 random bits. `crypto.getRandomValues` where the platform has it (the
 * web, the server), else `Math.random` (Hermes): ids only have to differ, not to be unguessable.
 */
let lastTime = -1;
let counter = 0;
/** Milliseconds borrowed past `lastTime` once its counter ran out (4096 ids in one millisecond). */
let carry = 0;

type RandomSource = { readonly getRandomValues?: (bytes: Uint8Array) => Uint8Array };

function randomBytes(count: number, random: (() => number) | undefined): Uint8Array {
  const bytes = new Uint8Array(count);
  const source = random ? undefined : (globalThis as unknown as { crypto?: RandomSource }).crypto;
  if (source?.getRandomValues) return source.getRandomValues(bytes);
  for (let i = 0; i < count; i += 1) bytes[i] = Math.floor((random ?? Math.random)() * 256);
  return bytes;
}

const hex = (bytes: Uint8Array, from: number, to: number): string => {
  let out = '';
  for (let i = from; i < to; i += 1) out += bytes[i]!.toString(16).padStart(2, '0');
  return out;
};

/** A UUIDv7 for `now` (a record's creation: an import passes the original date). */
export function createId(now: number = Date.now(), random?: () => number): string {
  const given = Math.max(0, Math.floor(now));
  const bytes = randomBytes(16, random);
  if (given === lastTime) {
    counter += 1;
    if (counter > 0xfff) {
      carry += 1;
      counter = 0;
    }
  } else {
    lastTime = given;
    carry = 0;
    // A random start in the lower half, with room to count up.
    counter = ((bytes[6]! << 8) | bytes[7]!) & 0x7ff;
  }
  let time = given + carry;
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = time % 256;
    time = Math.floor(time / 256);
  }
  bytes[6] = 0x70 | (counter >> 8);
  bytes[7] = counter & 0xff;
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);
  return `${hex(bytes, 0, 4)}-${hex(bytes, 4, 6)}-${hex(bytes, 6, 8)}-${hex(bytes, 8, 10)}-${hex(bytes, 10, 16)}`;
}
