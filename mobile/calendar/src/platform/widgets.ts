/**
 * The home-screen widgets via the Widgets TurboModule (the suite's spec, `NativeWidgets`; Agenda's
 * Kotlin in `android/.../widget`). A missing module (tests, or JavaScript reloaded against an older
 * native build) does nothing: no widget.
 */
import NativeWidgets from '../../../shared/specs/NativeWidgets';

/** Agenda's widgets: « Planning », « Mois », « Prochain événement », « Compte à rebours », « Aujourd'hui ». */
export type WidgetKind = 'schedule' | 'month' | 'next' | 'countdown' | 'today';

const KINDS: readonly WidgetKind[] = ['schedule', 'month', 'next', 'countdown', 'today'];

export interface PlacedWidget {
  readonly id: number;
  readonly kind: WidgetKind;
  /** What it shows: the countdown's event (`event:<id>`, '' until chosen); the others, their kind. */
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
    return parsed
      .filter((entry): entry is PlacedWidget => typeof entry === 'object' && entry !== null && typeof entry.id === 'number' && KINDS.includes(entry.kind))
      .map(entry => ({ id: entry.id, kind: entry.kind, target: typeof entry.target === 'string' ? entry.target : '' }));
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

/** Points a countdown at its event (`event:<id>`). */
export function setWidgetTarget(id: number, target: string): void {
  NativeWidgets?.setTarget(id, target);
}

/** Closes the quick window; `done` completes a widget being placed. */
export function closeQuick(done: boolean): void {
  NativeWidgets?.closeQuick(done);
}
