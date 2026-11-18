/**
 * Wallet's vault on Android (Wallet's app, `com.stephenprn.wallet.vault`): the cryptography the web
 * does in JavaScript, where a phone needs native speed (Argon2id over 64 MiB; a scan's bytes sealed
 * file to file, never through the bridge), the Android Keystore that keeps the tier keys on this
 * phone (the cards' without asking, the papers' behind the fingerprint or the screen lock, through
 * BiometricPrompt), and the window's guards (no screenshot nor recents thumbnail while papers show,
 * the screen at full brightness at a till). Bytes cross as base64url without padding.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /** Bytes from Android's SecureRandom. */
  randomBytes(length: number): string;
  /** Argon2id v1.3, one lane, 32 bytes, off the main thread. */
  argon2id(password: string, salt: string, ops: number, memKiB: number): Promise<string>;
  /** A file sealed under `key` for blob `blobId` (`UWB1`, nonce, XChaCha20-Poly1305), written to `output`; its size. */
  sealFile(key: string, blobId: string, input: string, output: string): Promise<number>;
  /** A sealed file opened to `output`; false when it does not open (another key, bytes altered). */
  openFile(key: string, blobId: string, input: string, output: string): Promise<boolean>;
  /** Whether the fingerprint or the screen lock can guard a key here: `ready`, `none` (nothing enrolled), `unavailable`. */
  biometrics(): string;
  /** Whether this phone keeps a tier's key (`cards`, `papers`). */
  hasTierKey(tier: string): boolean;
  /**
   * Keeps a tier's key in the Keystore. `cards`: at once. `papers`: behind the fingerprint (or the
   * screen lock), asked once now with `title` and `subtitle`; false when the person cancels.
   */
  storeTierKey(tier: string, key: string, title: string, subtitle: string): Promise<boolean>;
  /**
   * A tier's key, read back: `papers` asks the fingerprint first. '' when cancelled or not kept;
   * `invalidated` when a new fingerprint was enrolled since (the passphrase is asked again).
   */
  loadTierKey(tier: string, title: string, subtitle: string): Promise<string>;
  forgetTierKey(tier: string): void;
  /** Where sealed files are kept (this app's private files), and where opened ones go for a moment (its cache). */
  sealedDir(): string;
  openedDir(): string;
  /** Every file opened for viewing deleted: the papers locked. */
  wipeOpened(): void;
  /**
   * A file opened for viewing (in `openedDir`) shown by the phone's viewer (a PDF), through this app's
   * FileProvider with a read grant for that viewer alone; false when no app can show it.
   */
  viewFile(path: string, mime: string): boolean;
  /** A sealed file fetched from the server (`GET url` with the token) to `output`; false when it is not there. */
  download(url: string, token: string, output: string): Promise<boolean>;
  /** A number copied, marked sensitive (no preview on the clipboard's pop-up), wiped after a minute unless replaced. */
  copySecret(text: string): boolean;
  /** No screenshot, screen recording or recents thumbnail while on. */
  setSecure(on: boolean): void;
  /** The screen at full brightness and kept on (a card at a till), or back to the phone's own. */
  setTill(on: boolean): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('WalletVault');
