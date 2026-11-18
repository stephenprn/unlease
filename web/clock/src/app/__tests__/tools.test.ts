import { beforeEach, describe, expect, it } from 'vitest';

import { elapsed } from '@unlease/clock/models/stopwatch';

import { freshLibrary } from '@test/library';
import { getStorageName } from '@shared/app/env';
import { actOnTimer, lapStopwatch, loadTools, pauseStopwatch, resetStopwatch, ringDueTimers, startStopwatch, startTimer, useToolsStore } from '../store/tools';

const runs = () => useToolsStore.getState().runs;

describe('The timers and the stopwatch this browser keeps', () => {
  beforeEach(async () => {
    await freshLibrary();
    localStorage.clear();
    loadTools();
  });

  it('runs an instant timer, remembers its length, and keeps it across a reload', () => {
    const now = Date.now();
    const id = startTimer({ seconds: 300, label: 'Eggs' }, now);
    expect(runs()).toEqual([expect.objectContaining({ id, state: 'running', endsAt: now + 300_000, label: 'Eggs', sound: 'bell', timerId: null })]);
    expect(useToolsStore.getState().recent).toEqual([300]);
    useToolsStore.setState({ runs: [], recent: [] });
    loadTools();
    expect(runs().map(run => run.id)).toEqual([id]);
    expect(useToolsStore.getState().recent).toEqual([300]);
    expect(localStorage.getItem(`${getStorageName()}.clock.timers`)).toContain(id);
  });

  it('pauses, adds a minute, rings at its end, and is gone once stopped', () => {
    const now = Date.now();
    const id = startTimer({ seconds: 60 }, now);
    actOnTimer(id, 'pause', now + 10_000);
    expect(runs()[0]).toMatchObject({ state: 'paused', left: 50_000 });
    actOnTimer(id, 'add', now + 20_000);
    expect(runs()[0]).toMatchObject({ left: 110_000, total: 120_000 });
    actOnTimer(id, 'resume', now + 30_000);
    expect(ringDueTimers(now + 100_000)).toBe(false);
    expect(ringDueTimers(now + 140_000)).toBe(true);
    expect(runs()[0]!.state).toBe('ringing');
    actOnTimer(id, 'stop');
    expect(runs()).toEqual([]);
  });

  it('follows the stopwatch: laps, a pause, a reset', () => {
    const now = Date.now();
    startStopwatch(now);
    lapStopwatch(now + 1_000);
    lapStopwatch(now + 3_000);
    pauseStopwatch(now + 4_000);
    const watch = useToolsStore.getState().stopwatch;
    expect(watch.laps).toEqual([1_000, 3_000]);
    expect(elapsed(watch, now + 60_000)).toBe(4_000);
    resetStopwatch();
    expect(useToolsStore.getState().stopwatch).toEqual({ startedAt: null, banked: 0, laps: [] });
  });
});
