/**
 * The platform's own haptic clicks (View.performHapticFeedback): no vibration permission, and
 * silent when the owner turned touch feedback off. `kind` is one of `Haptic` in `src/platform/haptics.ts`.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  perform(kind: string): void;
}

export default TurboModuleRegistry.get<Spec>('Haptics');
