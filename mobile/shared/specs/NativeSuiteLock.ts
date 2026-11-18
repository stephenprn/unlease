/**
 * The suite's lock on Android (`mobile/shared/android/src/lock`, in the apps that lock something:
 * Carnet and Pages): the password's check derived at native speed (PBKDF2-HMAC-SHA256, the same bytes
 * as the browser's, `core/services/lock`), the fingerprint that stands for the password on a phone
 * where it was typed once (a stamp kept by a Keystore key the fingerprint or the screen lock unlocks;
 * a new fingerprint enrolled invalidates it), and no screenshot nor recents thumbnail while what it
 * guards shows. Bytes cross as base64url without padding.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /** Bytes from Android's SecureRandom. */
  randomBytes(length: number): string;
  /** PBKDF2-HMAC-SHA256 over `secret` (ASCII) and `salt`, 32 bytes, off the main thread. */
  pbkdf2(secret: string, salt: string, iterations: number): Promise<string>;
  /** Whether the fingerprint or the screen lock can guard the stamp here: `ready`, `none` (nothing enrolled), `unavailable`. */
  biometrics(): string;
  /** Whether this phone keeps a stamp behind the fingerprint. */
  hasStamp(): boolean;
  /** Keeps `stamp` behind the fingerprint (or the screen lock), asked once now with `title` and `subtitle`; false when the person cancels. */
  keepStamp(stamp: string, title: string, subtitle: string): Promise<boolean>;
  /** The stamp, read back after the fingerprint: '' when cancelled or not kept; `invalidated` when a new fingerprint was enrolled since. */
  readStamp(title: string, subtitle: string): Promise<string>;
  forgetStamp(): void;
  /** No screenshot, screen recording or recents thumbnail while on. */
  setSecure(on: boolean): void;
}

export default TurboModuleRegistry.get<Spec>('SuiteLock');
