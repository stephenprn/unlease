/**
 * The home-screen widgets' side of the app (android/.../widget). Every placed widget is handed the
 * picture of what it shows (`widgetPayloads`), again a moment after the library, the preferences or
 * the language change, and at each start (a new day). Runs wherever JavaScript does: the app, the
 * reminders' hourly task, and the quick window a countdown is pointed from.
 */
import { today as todayOf } from '@unlease/calendar/services/time';
import type { WeatherDay } from '@unlease/calendar/sync/routes';
import { useSettingsStore } from '@shared/app/store/settingsStore';
import { closeQuick, placedWidgets, publishWidget, setWidgetTarget, shareWithWidgets, widgetsAvailable, type WidgetKind } from '@platform/widgets';

import { useCalendarUiStore } from './store/calendarUi';
import { useLibraryStore } from './store/libraryStore';
import { weatherOf } from './hooks/useWeather';
import { todayPayload, todayWeatherPlaces } from './todayWidget';
import { countdownPayload, monthPayload, nextPayload, schedulePayload } from './widgetPayloads';

/** Registered in index.js; QuickActivity asks for the same name. */
export const QUICK_WINDOW = 'quickWindow';

const PUBLISH_DELAY_MS = 400;

let started = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let chain: Promise<void> = Promise.resolve();
const sent = new Map<number, string>();
let sharedSent = '';

/** Once, after the library loads (bootstrap): the widgets are kept in step from then on. */
export function startWidgets(): void {
  if (started || !widgetsAvailable()) return;
  started = true;
  useLibraryStore.subscribe((state, previous) => {
    if (state.revision !== previous.revision) schedulePublish();
  });
  useCalendarUiStore.subscribe((state, previous) => {
    if (state.prefs !== previous.prefs) schedulePublish();
  });
  useSettingsStore.subscribe((state, previous) => {
    if (state.locale !== previous.locale) schedulePublish();
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

/** A widget's picture now; a countdown's, of the event it was pointed at (`target`); « Aujourd'hui »'s with today's weather, when known. */
export function payloadFor(kind: WidgetKind, target = '', now: number = Date.now(), weather: WeatherDay | null = null): string {
  const state = useLibraryStore.getState();
  const prefs = useCalendarUiStore.getState().prefs;
  switch (kind) {
    case 'schedule':
      return JSON.stringify(schedulePayload(state, prefs, now));
    case 'month':
      return JSON.stringify(monthPayload(state, prefs, now));
    case 'next':
      return JSON.stringify(nextPayload(state, prefs, now));
    case 'countdown':
      return JSON.stringify(countdownPayload(target, state, prefs, now));
    case 'today':
      return JSON.stringify(todayPayload(state, prefs, now, weather));
  }
}

/** Today's weather where « Aujourd'hui » asks it (its placed events in order, then home), kept a few hours; null when it cannot be had. */
async function todayWeather(now: number): Promise<WeatherDay | null> {
  const prefs = useCalendarUiStore.getState().prefs;
  if (!prefs.weather) return null;
  return (await weatherOf(todayWeatherPlaces(useLibraryStore.getState(), prefs, now), todayOf(now)))?.day ?? null;
}

/** Hands every placed widget its picture now, after any pass already under way. */
export function publishWidgets(): Promise<void> {
  chain = chain.then(publishOnce).catch(() => undefined);
  return chain;
}

async function publishOnce(): Promise<void> {
  const shared = JSON.stringify({ locale: useSettingsStore.getState().locale });
  if (shared !== sharedSent) {
    sharedSent = shared;
    shareWithWidgets(shared);
  }
  const placed = await placedWidgets();
  // « Aujourd'hui » shows the day's weather: asked once per pass, only while one is placed.
  const now = Date.now();
  const weather = placed.some(widget => widget.kind === 'today') ? await todayWeather(now) : null;
  // One picture per kind, but a countdown's is its event's.
  const pictures = new Map<string, string>();
  for (const widget of placed) {
    if (widget.kind === 'countdown' && !widget.target) continue;
    const key = widget.kind === 'countdown' ? `countdown|${widget.target}` : widget.kind;
    const json = pictures.get(key) ?? payloadFor(widget.kind, widget.target, now, weather);
    pictures.set(key, json);
    send(widget.id, json);
  }
}

function send(id: number, json: string): void {
  if (sent.get(id) === json) return;
  sent.set(id, json);
  publishWidget(id, json);
}

/** A countdown pointed at an event (`event:<id>`): drawn at once. */
export function pointWidget(id: number, target: string): void {
  setWidgetTarget(id, target);
  sent.delete(id);
  send(id, payloadFor('countdown', target));
}

/** Closes the quick window; `done` completes a widget being placed. */
export function leaveQuick(done: boolean): void {
  closeQuick(done);
}
