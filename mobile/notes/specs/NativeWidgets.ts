/**
 * The home-screen widgets. JavaScript owns the notes: it hands each placed widget the picture it
 * draws (JSON), and writes what was ticked on the home screen; the widgets only draw and ask.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /** Every placed widget that shows notes, as JSON `[{ id, kind, target }]`: kind `collection`, `label` or `note`, target '' until chosen. */
  placed(): Promise<string>;
  /** What a widget draws, as JSON; it is drawn again at once. */
  publish(widgetId: number, payload: string): void;
  /** What every widget shares, as JSON: whether Claude reads links, and the server link pictures come from. */
  share(shared: string): void;
  /** Points a widget at a collection, a label or a note. */
  setTarget(widgetId: number, target: string): void;
  /** The items ticked on the home screen since JavaScript last asked, as JSON `[{ id, checked }]`; taken by the call. */
  takeTicks(): Promise<string>;
  /** The clipboard, as the quick window found it once it had focus ('' when empty or not a link window). */
  quickClipboard(): Promise<string>;
  /** The quick window's scrim fades, leaving the home screen under what is left (the slip). */
  clearQuickScrim(): void;
  /** Closes the quick window; `done` completes a widget being placed (otherwise it is not added). */
  closeQuick(done: boolean): void;
}

export default TurboModuleRegistry.get<Spec>('Widgets');
