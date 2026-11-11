/**
 * The app's sharing shortcuts (Carnet's, `Shortcuts`): the places a share can go straight into, shown
 * in Android's share sheet's first row (Direct Share) and, as any dynamic shortcut, by a launcher that
 * has room. The static shortcuts are the manifest's (`res/xml/shortcuts.xml`), not this module's.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /**
   * Replaces the sharing shortcuts with these, the first first, as JSON `[{ id, label, uri, path,
   * evenOdd, stone, ink }]`: `uri` what opening one from the launcher opens, `path` its picture (SVG
   * path data on a 100 grid, `evenOdd` its fill rule) in `ink` on a `stone` (`#RRGGBB`). Kept to what
   * the share sheet shows and the launcher allows; each on the launcher entry that is on, so a switch
   * of entries (`LauncherIcon.choose`) publishes them again. Resolves how many were published, or -1
   * when Android declined (too many changes from the background).
   */
  setSharingShortcuts(shortcuts: string): Promise<number>;
  /** One of them used: a link filed into its collection by the person, which the share sheet ranks by. */
  reportShortcutUsed(id: string): void;
}

export default TurboModuleRegistry.get<Spec>('Shortcuts');
