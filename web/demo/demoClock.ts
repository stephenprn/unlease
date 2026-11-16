/**
 * The demo's alarms: weekdays at 7:30 for work (quiet on holidays and days off), a later one on Saturdays, a one-time early train
 * switched off since it rang, and an evening reminder to wind down. Times are of the day, whatever
 * today is; the train's day is counted from today.
 */
import { addDays, instantToDay } from '@unlease/calendar/services/time';
import { alarmFields } from '@unlease/clock/sync/entities';

import type { LocalChange } from '@shared/app/store/records';

const DAY = 86_400_000;

export function clockChanges(now: number): { readonly time: number; readonly changes: LocalChange[] }[] {
  const today = instantToDay(now);
  const alarm = (id: string, ago: number, fields: Partial<Parameters<typeof alarmFields>[0]> & Pick<Parameters<typeof alarmFields>[0], 'time' | 'days'>): LocalChange => ({
    type: 'alarm',
    id,
    patch: alarmFields({
      date: null,
      enabled: true,
      label: '',
      sound: 'melody',
      vibrate: true,
      weather: true,
      agenda: true,
      skipDay: null,
      offDays: false,
      eventId: null,
      eventStart: '',
      before: 0,
      createdAt: now - ago,
      deletedAt: null,
      ...fields,
    }),
  });
  return [
    {
      time: now - 30 * DAY,
      changes: [
        // Quiet on public holidays and days off (the demo's Agenda has both).
        alarm('demo-alarm-work', 30 * DAY, { time: '07:30', days: [1, 2, 3, 4, 5], label: 'Work', sound: 'sunrise', offDays: true }),
        alarm('demo-alarm-saturday', 29 * DAY, { time: '09:00', days: [6], sound: 'birdsong', agenda: false }),
        alarm('demo-alarm-wind-down', 12 * DAY, { time: '22:30', days: [0, 1, 2, 3, 4], label: 'Wind down', sound: 'bowl', vibrate: false, weather: false, agenda: false }),
      ],
    },
    // Rang three days ago, then switched off.
    { time: now - 4 * DAY, changes: [alarm('demo-alarm-train', 4 * DAY, { time: '06:15', days: [], date: addDays(today, -3), enabled: false, label: 'Train to Lyon', sound: 'bell' })] },
  ];
}
