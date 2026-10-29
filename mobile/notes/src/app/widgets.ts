/**
 * The home-screen widgets' side of the app (android/.../widget). Every placed widget is handed the
 * picture of what it shows (`widgetPayloads`), again a moment after the library changes; what was
 * ticked on the home screen is written as one change. Runs wherever JavaScript does: the app, the
 * quick window over the home screen, and the headless task a tick starts (`widgetTask.ts`).
 */
import {
  closeQuick,
  placedWidgets,
  publishWidget,
  setWidgetTarget,
  shareWithWidgets,
  takeWidgetTicks,
  widgetsAvailable,
  type WidgetKind,
} from '@platform/widgets';

import { setChecks } from './store/actions';
import { useLibraryStore } from './store/libraryStore';
import { selectCanRead, useSettingsStore } from './store/settingsStore';
import { widgetPayload } from './widgetPayloads';

/** Registered in index.js; the native side asks for the same names. */
export const QUICK_WINDOW = 'quickWindow';
export const WIDGET_TASK = 'widgetTask';

/** A burst of writes (typing, a sync page) is drawn once. */
const PUBLISH_DELAY_MS = 400;

let started = false;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Passes run one after another, so a caller awaiting one sees what it changed. */
let chain: Promise<void> = Promise.resolve();
/** What each widget was last handed: an unchanged picture is not sent again. */
const sent = new Map<number, string>();
let sharedSent = '';

/** Once, after the library loads: writes what was ticked while JavaScript slept, then keeps the widgets in step. */
export function startWidgets(): void {
  if (started || !widgetsAvailable()) return;
  started = true;
  useLibraryStore.subscribe((state, previous) => {
    if (state.revision !== previous.revision) schedulePublish();
  });
  useSettingsStore.subscribe((state, previous) => {
    if (state.server !== previous.server || state.reading !== previous.reading || state.locale !== previous.locale) schedulePublish();
  });
  applyWidgetTicks()
    .then(() => publishWidgets())
    .catch(() => undefined);
}

function schedulePublish(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    publishWidgets().catch(() => undefined);
  }, PUBLISH_DELAY_MS);
}

/** Hands every placed widget its picture now, after any pass already under way. */
export function publishWidgets(): Promise<void> {
  chain = chain.then(publishOnce).catch(() => undefined);
  return chain;
}

async function publishOnce(): Promise<void> {
  const placed = await placedWidgets();
  const state = useLibraryStore.getState();
  const now = Date.now();
  for (const widget of placed) {
    if (!widget.target) continue;
    send(widget.id, JSON.stringify(widgetPayload(widget.kind, widget.target, state, now)));
  }
  const settings = useSettingsStore.getState();
  const shared = JSON.stringify({ reading: selectCanRead(settings), server: settings.server ? { url: settings.server.url, token: settings.server.token } : null });
  if (shared !== sharedSent) {
    sharedSent = shared;
    shareWithWidgets(shared);
  }
}

function send(id: number, json: string): void {
  if (sent.get(id) === json) return;
  sent.set(id, json);
  publishWidget(id, json);
}

/** What was ticked on the home screen, written as one change. Returns how many ticks there were. */
export async function applyWidgetTicks(): Promise<number> {
  const ticks = await takeWidgetTicks();
  if (ticks.length > 0) setChecks(ticks);
  return ticks.length;
}

/** A widget pointed at a collection, a label or a note: drawn at once. */
export function pointWidget(id: number, kind: WidgetKind, target: string): void {
  setWidgetTarget(id, target);
  sent.delete(id);
  send(id, JSON.stringify(widgetPayload(kind, target, useLibraryStore.getState(), Date.now())));
}

/** Closes the quick window; `done` completes a widget being placed. */
export function leaveQuick(done: boolean): void {
  closeQuick(done);
}
