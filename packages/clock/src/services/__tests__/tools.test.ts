import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setLocale } from '@unlease/core/i18n';
import { addMinute, endRun, overtime, pauseRun, progress, remaining, resetRun, resumeRun, startRun } from '../../models/timer';
import { currentLap, elapsed, lapRows, lapWatch, pauseWatch, readStopwatch, startWatch, STOPWATCH_RESET } from '../../models/stopwatch';
import { countdownClock, digitsOf, eraseDigit, keypadFields, keypadSeconds, lengthWords, overtimeClock, quickLengths, rememberLength, stopwatchClock, stopwatchParts, typeDigits } from '../timers';
import { cityMeta, daylight, offsetFromHere, offsetWords, searchCities, snapShift, sunAltitude } from '../worldClocks';
import { addClockFrench } from '../../i18n';

const T0 = Date.UTC(2026, 10, 18, 12, 0, 0);

describe('a timer that runs', () => {
  const run = startRun({ id: 'r', timerId: null, label: '', seconds: 300, sound: 'bell', vibrate: true }, T0);

  it('counts down, pauses, resumes and takes a minute more', () => {
    expect(remaining(run, T0 + 61_000)).toBe(239_000);
    const paused = pauseRun(run, T0 + 61_000);
    expect(remaining(paused, T0 + 999_000)).toBe(239_000);
    const resumed = resumeRun(paused, T0 + 100_000);
    expect(resumed.endsAt).toBe(T0 + 339_000);
    const more = addMinute(resumed, T0 + 100_000);
    expect(remaining(more, T0 + 100_000)).toBe(299_000);
    expect(more.total).toBe(360_000);
    expect(progress(more, T0 + 100_000)).toBeCloseTo(61 / 360);
  });

  it('rings once its moment has come, then starts again for a minute', () => {
    const ringing = endRun(run);
    expect(ringing.state).toBe('ringing');
    expect(overtime(ringing, T0 + 312_000)).toBe(12_000);
    const again = addMinute(ringing, T0 + 312_000);
    expect(again.state).toBe('running');
    expect(remaining(again, T0 + 312_000)).toBe(60_000);
  });

  it('goes back to the length it was started with', () => {
    const reset = resetRun(addMinute(run, T0));
    expect(reset.state).toBe('paused');
    expect(reset.left).toBe(300_000);
    expect(reset.total).toBe(300_000);
  });
});

describe('the keypad', () => {
  it('types from the right, as a microwave does', () => {
    let digits = '';
    for (const key of ['0', '5', '0', '0']) digits = typeDigits(digits, key);
    expect(digits).toBe('500');
    expect(keypadFields(digits)).toEqual(['00', '05', '00']);
    expect(keypadSeconds(digits)).toBe(300);
    expect(keypadSeconds('90')).toBe(90);
    expect(keypadSeconds('190')).toBe(150);
    expect(eraseDigit(digits)).toBe('50');
    expect(typeDigits('123456', '7')).toBe('123456');
    expect(digitsOf(3725)).toBe('10205');
  });
});

describe('words', () => {
  beforeEach(() => setLocale('en'));
  afterEach(() => setLocale('en'));

  it('writes countdowns and lengths', () => {
    expect(countdownClock(299_100)).toBe('5:00');
    expect(countdownClock(3_725_000)).toBe('1:02:05');
    expect(overtimeClock(12_400)).toBe('−0:12');
    expect(lengthWords(300)).toBe('5 min');
    expect(lengthWords(45)).toBe('45 s');
    expect(lengthWords(5400)).toBe('1 h 30');
    expect(lengthWords(150)).toBe('2 min 30 s');
  });

  it('writes the stopwatch in French with a comma', () => {
    addClockFrench();
    setLocale('fr');
    expect(stopwatchParts(83_456)).toEqual(['01:23', '45']);
    expect(stopwatchClock(3_683_450)).toBe('1:01:23,45');
    expect(lengthWords(300)).toMatch(/^5[ \u00A0]min$/);
  });

  it('offers the lengths started lately, then the usual ones', () => {
    const recent = rememberLength(rememberLength([], 540), 120);
    expect(recent).toEqual([120, 540]);
    expect(quickLengths(recent)).toEqual([60, 120, 180, 300, 540, 600]);
  });
});

describe('the stopwatch', () => {
  it('counts, laps and marks the fastest and slowest lap', () => {
    let watch = startWatch(STOPWATCH_RESET, 0);
    watch = lapWatch(watch, 10_000);
    watch = lapWatch(watch, 18_000);
    watch = lapWatch(watch, 30_000);
    watch = pauseWatch(watch, 35_000);
    expect(elapsed(watch, 99_000)).toBe(35_000);
    expect(currentLap(watch, 99_000)).toBe(5_000);
    const rows = lapRows(watch);
    expect(rows.map(row => [row.number, row.lap, row.fastest, row.slowest])).toEqual([
      [3, 12_000, false, true],
      [2, 8_000, true, false],
      [1, 10_000, false, false],
    ]);
    expect(readStopwatch(JSON.parse(JSON.stringify(watch)))).toEqual(watch);
    expect(readStopwatch('nonsense')).toEqual(STOPWATCH_RESET);
  });
});

describe('world clocks', () => {
  beforeEach(() => setLocale('en'));

  it('says how far a zone stands from here', () => {
    expect(offsetWords(480)).toBe('+8 h');
    expect(offsetWords(-330)).toBe('−5 h 30');
    expect(offsetWords(45)).toBe('+45 min');
    expect(offsetWords(0)).toBe('Same time');
    expect(offsetFromHere('UTC', T0) + offsetFromHere('Asia/Tokyo', T0) - offsetFromHere('UTC', T0)).toBe(offsetFromHere('Asia/Tokyo', T0));
  });

  it('knows when the sun is up', () => {
    // Noon UTC in mid-November: day in Paris, night in Tokyo.
    expect(sunAltitude(48.86, 2.35, T0)).toBeGreaterThan(15);
    expect(daylight({ zone: 'Europe/Paris', lat: 48.86, lon: 2.35 }, T0)).toBe('day');
    expect(daylight({ zone: 'Asia/Tokyo', lat: 35.68, lon: 139.69 }, T0)).toBe('night');
    // No place: the hour there says it (21:00 in Tokyo).
    expect(daylight({ zone: 'Asia/Tokyo', lat: null, lon: null }, T0)).toBe('night');
  });

  it('finds a city in either language, accents aside', () => {
    expect(searchCities('lond')[0]!.name).toBe('London');
    expect(searchCities('londres')[0]!.name).toBe('London');
    expect(searchCities('sao')[0]!.name).toBe('São Paulo');
    expect(searchCities('japan').map(city => city.name)).toEqual(['Osaka', 'Tokyo']);
    expect(searchCities('york').map(city => city.name)).toContain('New York');
  });

  it('says the day there and the gap', () => {
    expect(cityMeta('UTC', T0)).toMatch(/^((Tomorrow|Yesterday) · )?([+\u2212]|Same time)/);
    expect(snapShift(52)).toBe(45);
    expect(snapShift(5000)).toBe(1440);
  });
});

describe('a length set in figures and units', () => {
  it('splits hours, minutes and seconds', async () => {
    const { lengthParts } = await import('../timers');
    setLocale('en');
    expect(lengthParts(300)).toEqual([['5', 'min']]);
    expect(lengthParts(5400)).toEqual([['1', 'h'], ['30', 'min']]);
    expect(lengthParts(45)).toEqual([['45', 's']]);
    expect(lengthParts(125)).toEqual([['2', 'min'], ['05', 's']]);
  });
});
