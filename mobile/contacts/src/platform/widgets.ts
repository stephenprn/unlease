/**
 * The home-screen widgets via the Widgets TurboModule (the suite's spec, `NativeWidgets`; Contacts'
 * Kotlin in `android/.../widget`). A missing module (tests, or JavaScript reloaded against an older
 * native build) does nothing: no widget.
 */
import NativeWidgets from '../../../shared/specs/NativeWidgets';

/** The widgets that show contacts: « Appels rapides ». */
export type WidgetKind = 'calls';

export interface PlacedWidget {
  readonly id: number;
  readonly kind: WidgetKind;
  /** What it shows: `favorites` or `label:<id>`; '' until chosen. */
  readonly target: string;
}

export function widgetsAvailable(): boolean {
  return NativeWidgets !== null;
}

export async function placedWidgets(): Promise<PlacedWidget[]> {
  if (!NativeWidgets) return [];
  try {
    const parsed: unknown = JSON.parse(await NativeWidgets.placed());
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is PlacedWidget => typeof entry === 'object' && entry !== null && typeof entry.id === 'number' && entry.kind === 'calls' && typeof entry.target === 'string');
  } catch {
    return [];
  }
}

export function publishWidget(id: number, payload: string): void {
  NativeWidgets?.publish(id, payload);
}

export function shareWithWidgets(shared: string): void {
  NativeWidgets?.share(shared);
}

export function setWidgetTarget(id: number, target: string): void {
  NativeWidgets?.setTarget(id, target);
}

export function closeQuick(done: boolean): void {
  NativeWidgets?.closeQuick(done);
}
