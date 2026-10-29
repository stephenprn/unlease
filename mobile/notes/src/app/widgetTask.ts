/**
 * An item ticked on a note widget, in the headless task the native side starts (WidgetTasks.kt), the
 * app open or not: the tick is written as the editor would, the widgets are drawn again, the change sent.
 */
import { bootstrap } from './bootstrap';
import { flushNow } from './sync/syncManager';
import { applyWidgetTicks, publishWidgets } from './widgets';

/** The task has 8 s: sending gets what is left, and anything not sent goes the next time the app runs. */
const SEND_MS = 5_000;

export async function runWidgetTask(): Promise<void> {
  if (!bootstrap().ok) return;
  await applyWidgetTicks();
  await publishWidgets();
  await Promise.race([flushNow().catch(() => undefined), new Promise<void>(resolve => setTimeout(resolve, SEND_MS))]);
}
