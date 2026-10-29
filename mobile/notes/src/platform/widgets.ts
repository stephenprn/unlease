/**
 * The home-screen widgets via the Widgets TurboModule. A missing module (tests, or JavaScript
 * reloaded against an older native build) does nothing: no widget, nothing ticked.
 */
import NativeWidgets from '../../specs/NativeWidgets';

/** The widgets that show notes. */
export type WidgetKind = 'collection' | 'label' | 'note';

export interface PlacedWidget {
  readonly id: number;
  readonly kind: WidgetKind;
  /** The collection, label or note it shows; '' until chosen. */
  readonly target: string;
}

export interface WidgetTick {
  readonly id: string;
  readonly checked: boolean;
}

const KINDS: readonly string[] = ['collection', 'label', 'note'];

export function widgetsAvailable(): boolean {
  return NativeWidgets !== null;
}

export async function placedWidgets(): Promise<PlacedWidget[]> {
  if (!NativeWidgets) return [];
  try {
    const parsed: unknown = JSON.parse(await NativeWidgets.placed());
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is PlacedWidget =>
        typeof entry === 'object' && entry !== null && typeof entry.id === 'number' && KINDS.includes(entry.kind) && typeof entry.target === 'string',
    );
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

export async function takeWidgetTicks(): Promise<WidgetTick[]> {
  if (!NativeWidgets) return [];
  try {
    const parsed: unknown = JSON.parse(await NativeWidgets.takeTicks());
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is WidgetTick => typeof entry === 'object' && entry !== null && typeof entry.id === 'string' && typeof entry.checked === 'boolean');
  } catch {
    return [];
  }
}

export async function quickClipboard(): Promise<string> {
  if (!NativeWidgets) return '';
  try {
    return await NativeWidgets.quickClipboard();
  } catch {
    return '';
  }
}

export function clearQuickScrim(): void {
  NativeWidgets?.clearQuickScrim();
}

export function closeQuick(done: boolean): void {
  NativeWidgets?.closeQuick(done);
}
