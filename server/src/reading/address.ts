/**
 * Which IP addresses a link may make the server connect to: public unicast
 * only. Anything that could reach the homelab itself (loopback, private and
 * link-local ranges, CGNAT, cloud metadata) is refused, including when it
 * hides inside an IPv6 form (IPv4-mapped, NAT64, 6to4).
 */
import { isIP } from 'node:net';

const V4_BLOCKED: readonly (readonly [string, number])[] = [
  ['0.0.0.0', 8], // "this network", unspecified
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast
];

function v4ToNumber(address: string): number | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

const V4_RANGES = V4_BLOCKED.map(([base, bits]) => ({ start: v4ToNumber(base)!, size: 2 ** (32 - bits) }));

function isBlockedV4(value: number): boolean {
  return V4_RANGES.some(range => value >= range.start && value < range.start + range.size);
}

/** Eight 16-bit groups, or null. Accepts `::`, a zone suffix and a dotted IPv4 tail. */
function parseV6(address: string): number[] | null {
  let text = address.split('%')[0]!.toLowerCase();
  const lastColon = text.lastIndexOf(':');
  const tail = text.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = v4ToNumber(tail);
    if (v4 === null) return null;
    text = `${text.slice(0, lastColon + 1)}${Math.floor(v4 / 65_536).toString(16)}:${(v4 % 65_536).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : null;
  if (rest && head.length + rest.length > 7) return null;
  const groups = rest ? [...head, ...Array<string>(8 - head.length - rest.length).fill('0'), ...rest] : head;
  if (groups.length !== 8 || !groups.every(group => /^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map(group => parseInt(group, 16));
}

function isBlockedV6(g: readonly number[]): boolean {
  const zeroUpTo = (end: number) => g.slice(0, end).every(group => group === 0);
  const embedded = (high: number, low: number) => isBlockedV4(high * 65_536 + low);
  if (zeroUpTo(8)) return true; // unspecified
  if (zeroUpTo(7) && g[7] === 1) return true; // loopback
  if (zeroUpTo(5) && g[5] === 0xffff) return embedded(g[6]!, g[7]!); // IPv4-mapped
  if (zeroUpTo(4) && g[4] === 0xffff && g[5] === 0) return embedded(g[6]!, g[7]!); // IPv4-translated
  if (zeroUpTo(6)) return embedded(g[6]!, g[7]!); // IPv4-compatible (deprecated)
  if (g[0] === 0x64 && g[1] === 0xff9b) {
    if (g.slice(2, 6).every(group => group === 0)) return embedded(g[6]!, g[7]!); // NAT64
    return true; // local-use NAT64 and the rest of 64:ff9b::/32
  }
  if (g[0] === 0x2002) return embedded(g[1]!, g[2]!); // 6to4
  // Everything below is outside global unicast (2000::/3): ULA, link-local, site-local, multicast, reserved.
  if ((g[0]! & 0xe000) !== 0x2000) return true;
  if (g[0] === 0x2001) {
    if (g[1] === 0) return true; // Teredo
    if (g[1] === 0x0db8) return true; // documentation
    if ((g[1]! & 0xfff0) === 0x0010 || (g[1]! & 0xfff0) === 0x0020) return true; // ORCHID
  }
  return false;
}

/** True only for an IP literal the server may connect to. */
export function isPublicAddress(address: string): boolean {
  const host = address.replace(/^\[|\]$/g, '');
  switch (isIP(host)) {
    case 4: {
      const value = v4ToNumber(host);
      return value !== null && !isBlockedV4(value);
    }
    case 6: {
      const groups = parseV6(host);
      return groups !== null && !isBlockedV6(groups);
    }
    default:
      return false;
  }
}
