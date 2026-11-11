/**
 * What other apps hand Agenda, each sent where it opens: « open the calendar at » to the day the
 * instant falls on on this device, a calendar's link to the subscriptions as a web address, words to
 * quick add; what does not read opens nothing.
 */
import { instantToDay } from '@unlease/calendar/services/time';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { writePreference } from '@shared/data/repositories/stateRepository';
import { HANDED } from '@platform/intake';

import { __emitShare, __queueShare, __reset as resetIntake } from '../../../../shared/__mocks__/NativeIntake';
import { listenForShares, type Arrivals } from '../intake';
import { loadLibrary, resetLibrary } from '../store/libraryStore';

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

const arrivals = (): { [K in keyof Arrivals]: jest.Mock } => ({ import: jest.fn(), event: jest.fn(), subscribe: jest.fn(), words: jest.fn(), day: jest.fn() });

beforeEach(() => {
  closeDatabase();
  resetLibrary();
  openDatabase({ name: 'intake.sqlite' });
  writePreference('onboarded', true);
  loadLibrary();
  resetIntake();
});

describe('what other apps hand Agenda', () => {
  it('opens an instant’s day on this device, the one that opened the app first', async () => {
    const at = Date.UTC(2026, 11, 24, 12);
    __queueShare({ id: 'time-1', mimeType: HANDED.time, text: String(at) });
    const to = arrivals();
    const stop = listenForShares(to);
    await flush();
    expect(to.day).toHaveBeenCalledWith(instantToDay(at));
    expect(instantToDay(at)).toBe('2026-12-24');
    stop();
  });

  it('reads a calendar’s link as a web address, and words as they were selected', async () => {
    const to = arrivals();
    const stop = listenForShares(to);
    await flush();
    __emitShare({ id: 'feed-1', mimeType: HANDED.subscribe, text: 'webcals://example.org/club.ics' });
    __emitShare({ id: 'feed-2', mimeType: HANDED.subscribe, text: 'webcal:not a calendar' });
    __emitShare({ id: 'words-1', mimeType: HANDED.words, text: '  Sport lundi 18h  ' });
    __emitShare({ id: 'time-2', mimeType: HANDED.time, text: 'soon' });
    await flush();
    expect(to.subscribe.mock.calls).toEqual([['https://example.org/club.ics']]);
    expect(to.words).toHaveBeenCalledWith('Sport lundi 18h');
    expect(to.day).not.toHaveBeenCalled();
    expect(to.import).not.toHaveBeenCalled();
    stop();
  });

  it('opens the form for another app’s event, each share once', async () => {
    const to = arrivals();
    const stop = listenForShares(to);
    await flush();
    const share = { id: 'insert-1', mimeType: HANDED.event, text: JSON.stringify({ title: 'Concert', beginTime: Date.UTC(2026, 10, 27, 18, 30), eventTimezone: 'Europe/Paris' }) };
    __emitShare(share);
    __emitShare(share);
    await flush();
    expect(to.event.mock.calls).toEqual([[{ title: 'Concert', start: '2026-11-27T19:30', tz: 'Europe/Paris' }]]);
    stop();
  });
});
