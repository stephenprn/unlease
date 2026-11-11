/**
 * Carnet's sharing shortcuts through the Shortcuts TurboModule (android/.../shortcuts): its
 * collections in Android's share sheet. A build without the module (a test, an older native build)
 * publishes nothing, never a crash.
 */
import NativeShortcuts from '../../../shared/specs/NativeShortcuts';

export function sharingShortcutsAvailable(): boolean {
  return NativeShortcuts != null;
}

/** Publishes these (JSON, as the spec reads them); how many were, or -1 when Android declined or the call failed. */
export async function setSharingShortcuts(shortcuts: string): Promise<number> {
  if (!NativeShortcuts) return 0;
  try {
    return await NativeShortcuts.setSharingShortcuts(shortcuts);
  } catch {
    return -1;
  }
}

/** A collection's sharing shortcut's id: the share it carries names it (`EXTRA_SHORTCUT_ID`). */
export const COLLECTION_SHORTCUT = 'collection:';

/** A link filed into this collection by the person: the share sheet ranks its targets by use. */
export function reportCollectionUsed(lineId: string): void {
  try {
    NativeShortcuts?.reportShortcutUsed(`${COLLECTION_SHORTCUT}${lineId}`);
  } catch {
    // An older native build without the call: nothing to rank.
  }
}
