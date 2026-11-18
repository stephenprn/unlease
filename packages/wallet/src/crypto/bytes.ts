/**
 * Bytes as the wallet's sealed values carry them: UTF-8 for words (written here, since Hermes, the
 * browser and Node do not all share a `TextDecoder`), base64url without padding for what travels in
 * a record, Crockford's base32 for what a person types back (the recovery code).
 */

export function utf8(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i++;
      }
    }
    // A lone surrogate is written as U+FFFD, as TextEncoder does.
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  return Uint8Array.from(out);
}

/** UTF-8 read back; bytes that are not UTF-8 read as U+FFFD (they never are: they came out of `utf8`). */
export function fromUtf8(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i]!;
    let code: number;
    let more: number;
    if (b < 0x80) [code, more] = [b, 0];
    else if (b >= 0xc2 && b < 0xe0) [code, more] = [b & 31, 1];
    else if (b >= 0xe0 && b < 0xf0) [code, more] = [b & 15, 2];
    else if (b >= 0xf0 && b < 0xf5) [code, more] = [b & 7, 3];
    else {
      out += '�';
      i++;
      continue;
    }
    let ok = true;
    for (let k = 1; k <= more; k++) {
      const next = bytes[i + k];
      if (next === undefined || (next & 0xc0) !== 0x80) {
        ok = false;
        break;
      }
      code = (code << 6) | (next & 63);
    }
    if (!ok || (more === 2 && code < 0x800) || (more === 3 && (code < 0x10000 || code > 0x10ffff)) || (code >= 0xd800 && code <= 0xdfff)) {
      out += '�';
      i++;
      continue;
    }
    i += more + 1;
    if (code >= 0x10000) {
      code -= 0x10000;
      out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 1023));
    } else out += String.fromCharCode(code);
  }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_INDEX = new Map([...B64].map((char, index) => [char, index]));

export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2]! + B64[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    if (b !== undefined) out += B64[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    if (c !== undefined) out += B64[c & 63]!;
  }
  return out;
}

/** null when it is not base64url (a character outside it, or a length no bytes give). */
export function fromBase64Url(text: string): Uint8Array | null {
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
  // Leftover bits must be zero, so one text reads one way only.
  if ((value & ((1 << bits) - 1)) !== 0) return null;
  return out;
}

export function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Crockford's base32: no I, L, O or U, so a code copied by hand reads one way. */
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function toBase32(bytes: Uint8Array): string {
  let out = '';
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32[(value >> bits) & 31]!;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]!;
  return out;
}

/** Typed back as a person copies it: lower case, spaces and dashes, O for 0, I and L for 1. null when it is not base32. */
export function fromBase32(typed: string, length: number): Uint8Array | null {
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
