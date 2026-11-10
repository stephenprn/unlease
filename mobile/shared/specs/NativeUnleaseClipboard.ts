/**
 * The clipboard, for every app of the suite (`UnleaseClipboard`, `mobile/shared/android`): read only
 * while the app is focused (Android's rule since 10), written whenever.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /** The text on the clipboard, or ''. */
  readText(): Promise<string>;
  /** Puts text on the clipboard; false when Android refused it. */
  writeText(text: string): Promise<boolean>;
}

// eslint-disable-next-line no-restricted-syntax -- the module's native name, a machine string (Kotlin's `ClipboardModule`).
export default TurboModuleRegistry.get<Spec>('UnleaseClipboard');
