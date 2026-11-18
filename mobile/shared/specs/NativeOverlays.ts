/**
 * Overlays that hold TalkBack. A sheet, the drawer, a dialog or a menu is drawn in place, over the
 * screen it opens from, and Android has no modal view inside a window (`accessibilityViewIsModal` is
 * iOS only): while one is open, every view beside it and beside each of its parents, up to the
 * screen's root, is hidden from accessibility, and comes back as it was once it closes
 * (`src/platform/overlays.ts`). The slip stays reachable (`KEEP_REACHABLE`).
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /** The layer of this view tag is open, under `key`: the last one opened holds TalkBack. */
  hideOthers(tag: number, key: string): void;
  /** The layer under `key` closed: what it hid comes back, or what the layer under it hides instead. */
  release(key: string): void;
}

export default TurboModuleRegistry.get<Spec>('Overlays');
