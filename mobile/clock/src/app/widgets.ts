/**
 * The home-screen widget's side of the app (android/.../widget). « Prochaine alarme » is handed what
 * only the app knows of each morning (`widgetPayloads`), again a moment after the alarms, Agenda's
 * records, the settings or the language change, and at each start and each background pass (a new
 * day). Which alarm rings next it counts itself, from the engine's plan.
 */
import { useSettingsStore } from '@shared/app/store/settingsStore';
import { placedWidgets, shareWithWidgets, widgetsAvailable } from '@platform/widgets';

import { ringingAlarmsNow } from './hooks/useRingingAlarms';
import { useClockUiStore } from './store/clockUi';
import { useLibraryStore } from './store/libraryStore';
import { alarmWidgetPayload } from './widgetPayloads';

const PUBLISH_DELAY_MS = 400;

let started = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let chain: Promise<void> = Promise.resolve();

/** The widget's picture now, as JSON. */
export function widgetPayload(now: number = Date.now()): string {
  const state = useLibraryStore.getState();
  const agenda = { events: Object.values(state.events), feeds: Object.values(state.feeds) };
  return JSON.stringify(alarmWidgetPayload(ringingAlarmsNow(now), agenda, useClockUiStore.getState().prefs, useSettingsStore.getState().locale, now));
}

/** Once, after the library loads (bootstrap): the widget is kept in step from then on. */
export function startWidgets(): void {
  if (started || !widgetsAvailable()) return;
  started = true;
  useLibraryStore.subscribe((state, previous) => {
    if (state.alarms !== previous.alarms || state.events !== previous.events || state.feeds !== previous.feeds) schedulePublish();
  });
  useClockUiStore.subscribe((state, previous) => {
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

/** Hands the widget its picture now, while one is placed, after any pass already under way. */
export function publishWidgets(): Promise<void> {
  chain = chain
    .then(async () => {
      if ((await placedWidgets()) > 0) shareWithWidgets(widgetPayload());
    })
    .catch(() => undefined);
  return chain;
}
