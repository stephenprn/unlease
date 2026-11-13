/**
 * « Copier dans l'agenda du téléphone » (Réglages): the calendar copied, one way, into the phone's
 * own under the app's account (`@shared/app/phoneMirror`, `PhoneMirrorModule.kt`), so the Clock, Maps,
 * the assistant and a watch see the events kept here. Each run reads what the account holds, writes
 * the calendars new or changed first (one's own, painted in the primary, then each followed
 * calendar: `mirroredCalendars`), then the events (`mirroredEvents`), two hundred at a time, and
 * takes away what is gone (a calendar takes its events with it).
 */
import { APP_NAME } from '@unlease/calendar/brand';
import { mirroredCalendars, mirroredEvents } from '@unlease/calendar/services/phoneMirror';
import { deviceZone } from '@unlease/calendar/services/time';
import { SUITE_NAME } from '@unlease/core/apps';
import { mirrorChanges, type WrittenRow } from '@unlease/core/services/mirror';
import { createPhoneMirror } from '@shared/app/phoneMirror';
import { DEV_BUILD } from '@shared/app/variant';
import { selectAppearance, useSettingsStore } from '@shared/app/store/settingsStore';
import type { PhoneMirrorNative } from '@shared/platform/phoneMirror';

import { nameOf } from './mentionNames';
import { useLibraryStore } from './store/libraryStore';

const CHUNK = 200;

async function run(native: PhoneMirrorNative): Promise<void> {
  const state = useLibraryStore.getState();
  const written = JSON.parse(await native.written()) as { calendars: WrittenRow[]; events: WrittenRow[] };
  const calendars = mirrorChanges(mirroredCalendars(Object.values(state.feeds), { name: APP_NAME, color: selectAppearance(useSettingsStore.getState()).primary }), written.calendars);
  if (calendars.upserts.length > 0 || calendars.deletes.length > 0) await native.apply(JSON.stringify({ calendars, events: { upserts: [], deletes: [] } }));
  const events = mirrorChanges(
    mirroredEvents(Object.values(state.events), state.calendarLabels, state.feeds, { deviceZone: deviceZone(), nameOf: target => nameOf(useLibraryStore.getState(), target) }),
    written.events,
  );
  const none = { upserts: [], deletes: [] };
  if (events.deletes.length > 0) await native.apply(JSON.stringify({ calendars: none, events: { upserts: [], deletes: events.deletes } }));
  for (let at = 0; at < events.upserts.length; at += CHUNK) await native.apply(JSON.stringify({ calendars: none, events: { upserts: events.upserts.slice(at, at + CHUNK), deletes: [] } }));
}

export const calendarMirror = createPhoneMirror({
  key: 'calendar.phoneMirror',
  permissions: 'calendar',
  accountName: DEV_BUILD ? `${SUITE_NAME} Dev` : SUITE_NAME,
  run,
  subscribe: listener => {
    const stopRecords = useLibraryStore.subscribe((now, before) => {
      if (now.events !== before.events || now.feeds !== before.feeds || now.calendarLabels !== before.calendarLabels) listener();
    });
    // One's own calendar wears the primary: a change of colours paints it again.
    const stopLook = useSettingsStore.subscribe((now, before) => {
      if (selectAppearance(now).primary !== selectAppearance(before).primary) listener();
    });
    return () => {
      stopRecords();
      stopLook();
    };
  },
});
