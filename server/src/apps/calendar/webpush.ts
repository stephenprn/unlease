/**
 * Web Push with node:crypto alone: the message encrypted for one browser (RFC 8291, `aes128gcm`
 * from RFC 8188, one record) and the server's signature on it (VAPID, RFC 8292: an ES256 JWT and
 * the server's public key). The key pair is made once and kept; browsers subscribe with its public
 * half (`applicationServerKey`).
 */
import { createECDH, createHmac, createPrivateKey, createCipheriv, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

/** The server's VAPID key pair as kept: the private scalar and the public point's coordinates (base64url). */
export interface VapidKeys {
  readonly d: string;
  readonly x: string;
  readonly y: string;
}

export function makeVapidKeys(): VapidKeys {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  return { d: jwk.d!, x: jwk.x!, y: jwk.y! };
}

/** The public key as browsers take it: the uncompressed point, base64url. */
export function vapidPublicKey(keys: VapidKeys): string {
  return Buffer.concat([Buffer.from([4]), Buffer.from(keys.x, 'base64url'), Buffer.from(keys.y, 'base64url')]).toString('base64url');
}

function privateKeyOf(keys: VapidKeys): KeyObject {
  return createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: keys.d, x: keys.x, y: keys.y }, format: 'jwk' });
}

/** The `Authorization` header's value for a push service: `vapid t=<jwt>, k=<public key>`. */
export function vapidAuthorization(keys: VapidKeys, endpoint: string, subject: string, now: number): string {
  const audience = new URL(endpoint).origin;
  const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })).toString('base64url');
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key: privateKeyOf(keys), dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `vapid t=${header}.${claims}.${signature}, k=${vapidPublicKey(keys)}`;
}

const hmac = (key: Buffer, data: Buffer): Buffer => createHmac('sha256', key).update(data).digest();

/** HKDF (RFC 5869) for one block at most. */
function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  const prk = hmac(salt, ikm);
  return hmac(prk, Buffer.concat([info, Buffer.from([1])])).subarray(0, length);
}

/** The keys a browser's subscription gives: its public key and its auth secret (base64url). */
export interface PushKeys {
  readonly p256dh: string;
  readonly auth: string;
}

/**
 * The body sent to a push service for one browser: `salt (16) | record size (4) | key id length (1)
 * | the server's one-time public key (65) | the encrypted payload with its padding delimiter`.
 */
export function encryptPayload(payload: Buffer, keys: PushKeys, salt: Buffer = randomBytes(16)): Buffer {
  const receiver = Buffer.from(keys.p256dh, 'base64url');
  const authSecret = Buffer.from(keys.auth, 'base64url');
  const local = createECDH('prime256v1');
  const senderPublic = local.generateKeys();
  const shared = local.computeSecret(receiver);
  const ikm = hkdf(authSecret, shared, Buffer.concat([Buffer.from('WebPush: info\0'), receiver, senderPublic]), 32);
  const key = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = createCipheriv('aes-128-gcm', key, nonce);
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(4096);
  return Buffer.concat([salt, size, Buffer.from([senderPublic.length]), senderPublic, encrypted]);
}
