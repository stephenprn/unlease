/**
 * The home-screen widgets' side of the app (android/.../widget). Every placed « Appels rapides » is
 * handed the picture of what it shows (`widgetPayloads`), again a moment after the library, the
 * list's order or the language changes; « Nouveau contact » needs nothing (a link). Runs wherever
 * JavaScript does: the app, and the quick window a widget is pointed from.
 */
import { loadLocalFiles } from '@shared/data/repositories/fileRepository';
import { useSettingsStore } from '@shared/app/store/settingsStore';
import { closeQuick, placedWidgets, publishWidget, setWidgetTarget, shareWithWidgets, widgetsAvailable } from '@platform/widgets';

import { useContactsUiStore } from './store/contactsUi';
import { useLibraryStore } from './store/libraryStore';
import { callsPayload } from './widgetPayloads';

/** Registered in index.js; QuickActivity asks for the same name. */
export const QUICK_WINDOW = 'quickWindow';

/** A burst of writes (typing, a sync page) is drawn once. */
const PUBLISH_DELAY_MS = 400;

let started = false;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Passes run one after another, so a caller awaiting one sees what it changed. */
let chain: Promise<void> = Promise.resolve();
/** What each widget was last handed: an unchanged picture is not sent again. */
const sent = new Map<number, string>();
let sharedSent = '';

/** Once, after the library loads (bootstrap): the widgets are kept in step from then on. */
export function startWidgets(): void {
  if (started || !widgetsAvailable()) return;
  started = true;
  useLibraryStore.subscribe((state, previous) => {
    if (state.revision !== previous.revision) schedulePublish();
  });
  useContactsUiStore.subscribe((state, previous) => {
    if (state.sortOrder !== previous.sortOrder) schedulePublish();
  });
  useSettingsStore.subscribe((state, previous) => {
    if (state.server !== previous.server || state.locale !== previous.locale) schedulePublish();
  });
  publishWidgets().catch(() => undefined);
}

function schedulePublish(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    publishWidgets().catch(() => undefined);
  }, PUBLISH_DELAY_MS);
}

/** This phone's copies of the photos, by blob: a face shows before the server has it. */
function localPaths(): Map<string, string> {
  try {
    return new Map(loadLocalFiles().map(file => [file.id, file.path.replace(/^file:\/\//, '')]));
  } catch {
    return new Map();
  }
}

function payloadFor(target: string, paths: ReadonlyMap<string, string>): string {
  return JSON.stringify(callsPayload(target, useLibraryStore.getState(), useContactsUiStore.getState().sortOrder, paths));
}

/** Hands every placed widget its picture now, after any pass already under way. */
export function publishWidgets(): Promise<void> {
  chain = chain.then(publishOnce).catch(() => undefined);
  return chain;
}

async function publishOnce(): Promise<void> {
  const placed = await placedWidgets();
  const settings = useSettingsStore.getState();
  // What every widget shares: the server their photos come from, and the language their words are in.
  const shared = JSON.stringify({ server: settings.server ? { url: settings.server.url, token: settings.server.token } : null, locale: settings.locale });
  if (shared !== sharedSent) {
    sharedSent = shared;
    shareWithWidgets(shared);
  }
  if (placed.length === 0) return;
  const paths = localPaths();
  for (const widget of placed) if (widget.target) send(widget.id, payloadFor(widget.target, paths));
}

function send(id: number, json: string): void {
  if (sent.get(id) === json) return;
  sent.set(id, json);
  publishWidget(id, json);
}

/** A widget pointed at the favourites or a label (`favorites`, `label:<id>`): drawn at once. */
export function pointWidget(id: number, target: string): void {
  setWidgetTarget(id, target);
  sent.delete(id);
  send(id, payloadFor(target, localPaths()));
}

/** Closes the quick window; `done` completes a widget being placed. */
export function leaveQuick(done: boolean): void {
  closeQuick(done);
}
