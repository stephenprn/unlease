/**
 * Clock's home-screen widget « Prochaine alarme » via the Widgets TurboModule (the suite's spec,
 * `NativeWidgets`; Clock's Kotlin in `android/.../widget`). A missing module (tests, or JavaScript
 * reloaded against an older native build) does nothing: no widget.
 */
import NativeWidgets from '../../../shared/specs/NativeWidgets';

export function widgetsAvailable(): boolean {
  return NativeWidgets !== null;
}

/** How many « Prochaine alarme » are placed (0 when none, or no module). */
export async function placedWidgets(): Promise<number> {
  if (!NativeWidgets) return 0;
  try {
    const parsed: unknown = JSON.parse(await NativeWidgets.placed());
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

/** What every placed widget draws from, as JSON: drawn again at once when it changed. */
export function shareWithWidgets(payload: string): void {
  NativeWidgets?.share(payload);
}
