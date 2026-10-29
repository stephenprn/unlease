/**
 * Shares, the clipboard and the window's keep-screen-on flag. A share that arrives before React
 * waits for `takePendingShare`; a live one fires `onShare`. Shared images are copied into app
 * storage (the grant lapses).
 */
import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface SharedPayload {
  /** Unique per delivery, so a share is handled once. Empty when there is none. */
  id: string;
  text: string;
  subject: string;
  /** Absolute paths of images copied into app storage. */
  files: string[];
  mimeType: string;
}

export interface Spec extends TurboModule {
  /** The share waiting since the app was opened with one; consumed by the call. */
  takePendingShare(): Promise<SharedPayload>;
  /** The text on the clipboard, or ''. Android only lets a focused app read it. */
  readClipboardText(): Promise<string>;
  /** Puts text on the clipboard; false when Android refused it. */
  writeClipboardText(text: string): Promise<boolean>;
  /** Keeps the screen from sleeping while the app's window shows (the cook mode), or lets it sleep again. */
  setKeepScreenOn(on: boolean): void;
  readonly onShare: CodegenTypes.EventEmitter<SharedPayload>;
}

export default TurboModuleRegistry.get<Spec>('Intake');
