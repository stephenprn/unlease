/**
 * An open overlay holds TalkBack (`specs/NativeOverlays.ts`): what lies beside it is out of reach
 * until it closes. A missing module changes nothing.
 */
import { findNodeHandle, type View } from 'react-native';

import NativeOverlays from '../../specs/NativeOverlays';

/** The `nativeID` of what stays reachable over an open overlay: the slip, which may carry « Annuler ». */
export const KEEP_REACHABLE = 'unlease-keep-reachable';

/** This view is an open layer, under `key`: TalkBack reaches nothing else (but the slip) until it is let go. */
export function holdAccessibility(view: React.ComponentRef<typeof View> | null, key: string): void {
  if (!view || !NativeOverlays) return;
  const tag = findNodeHandle(view);
  if (typeof tag === 'number') NativeOverlays.hideOthers(tag, key);
}

/** The layer under `key` closed. */
export function releaseAccessibility(key: string): void {
  NativeOverlays?.release(key);
}
