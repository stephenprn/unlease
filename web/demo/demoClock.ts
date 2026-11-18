/**
 * The demo's alarms: weekdays at 7:30 for work (quiet on holidays and days off), a later one on Saturdays, a one-time early train
 * switched off since it rang, and an evening reminder to wind down. Times are of the day, whatever
 * today is; the train's day is counted from today. Then a few saved timers (pasta, green tea, a
 * nap) and the cities a family spread out follows (New York, Montreal, Tokyo), by their English names.
 */
import { addDays, instantToDay } from '@unlease/calendar/services/time';
import { allCities } from '@unlease/clock/data/cities';
import { alarmFields, timerFields, worldClockFields } from '@unlease/clock/sync/entities';

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
  const timer = (id: string, ago: number, label: string, seconds: number, sound: string): LocalChange => ({
    type: 'timer',
    id,
    patch: timerFields({ label, seconds, sound, vibrate: true, createdAt: now - ago, deletedAt: null }),
  });
  const city = (name: string, ago: number): LocalChange[] => {
    const found = allCities().find(each => each.name === name);
    if (!found) return [];
    return [
      {
        type: 'worldClock',
        id: `demo-city-${name.toLowerCase().replace(/\s+/g, '-')}`,
        patch: worldClockFields({ zone: found.zone, name: found.name, country: found.country, lat: found.lat, lon: found.lon, createdAt: now - ago, deletedAt: null }),
      },
    ];
  };
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
    {
      time: now - 20 * DAY,
      changes: [
        timer('demo-timer-tea', 20 * DAY, 'Green tea', 3 * 60, 'chimes'),
        timer('demo-timer-pasta', 20 * DAY, 'Pasta', 9 * 60, 'bell'),
        timer('demo-timer-nap', 18 * DAY, 'Nap', 20 * 60, 'birdsong'),
      ],
    },
    { time: now - 15 * DAY, changes: ['New York', 'Montreal', 'Tokyo'].flatMap(name => city(name, 15 * DAY)) },
  ];
}
