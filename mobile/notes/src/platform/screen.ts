/**
 * The screen kept on while a recipe is followed (the cook mode), through the Intake TurboModule's
 * window flag. A native build without the call lets the screen sleep as usual.
 */
import NativeIntake from '../../specs/NativeIntake';

export function keepScreenOn(on: boolean): void {
  NativeIntake?.setKeepScreenOn?.(on);
}
