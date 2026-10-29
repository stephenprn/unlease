/**
 * Haptic clicks through the Haptics TurboModule: a gesture crossing its threshold, a long press
 * that picks something up. Never a buzz for its own sake; a missing module is silent.
 */
import NativeHaptics from '../../specs/NativeHaptics';

/** `threshold`: a swipe will act if let go; `release`: it will not any more; `pick`: a long press took hold; `confirm`: done. */
export type Haptic = 'threshold' | 'release' | 'pick' | 'confirm';

export function haptic(kind: Haptic): void {
  NativeHaptics?.perform(kind);
}
