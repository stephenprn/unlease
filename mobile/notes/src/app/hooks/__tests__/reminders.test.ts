/**
 * Armed reminders follow the notes: a reminder that rang keeps its notification in the shade until it
 * is answered; one taken off, moved or binned takes it away. One set elsewhere whose moment went by
 * before it reached this phone rings late, once; exact alarms newly allowed arm them all again.
 */
import type { Note } from '@unlease/notes/models/entities';

const mockArmed = new Map<string, number>();
const mockDisarm = jest.fn(async (_id: string) => undefined);
const mockArm = jest.fn(async (_reminder: { noteId: string; at: number }, _exact: boolean) => undefined);
const mockRing = jest.fn(async (_reminder: { noteId: string; at: number }) => undefined);
const mockAsk = jest.fn(async () => true);
const mockBook = { mode: 'exact' as string | undefined, exact: true, stopped: false };

jest.mock('@data/repositories/reminderRepository', () => ({
  loadScheduledReminders: () => new Map(mockArmed),
  saveScheduledReminder: (id: string, at: number) => mockArmed.set(id, at),
  removeScheduledReminder: (id: string) => mockArmed.delete(id),
}));
jest.mock('@platform/notifications', () => ({
  arm: (reminder: { noteId: string; at: number }, exact: boolean) => mockArm(reminder, exact),
  ringNow: (reminder: { noteId: string; at: number }) => mockRing(reminder),
  canScheduleExact: async () => mockBook.exact,
  disarm: (id: string) => mockDisarm(id),
  ensurePermission: () => mockAsk(),
  initialEvent: async () => null,
  onForegroundEvent: () => () => undefined,
}));

// The book's mode in memory: the planner itself is the shared one.
jest.mock('@shared/app/alarms', () => ({
  ...jest.requireActual('@shared/app/alarms'),
  mustArmAgain: async (_book: string, mode: string) => ({ armAll: mockBook.stopped || mockBook.mode !== mode, first: mockBook.mode === undefined }),
  rememberMode: (_book: string, mode: string) => {
    mockBook.mode = mode;
  },
}));

import { LATE_RING_MS, reconcileReminders } from '../useReminders';

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 3, 16, 0);

const note = (id: string, reminderAt: number | null, extra: Partial<Note> = {}): Note =>
  ({ id, title: 'Appeler le garage', body: '', kind: 'text', reminderAt, deletedAt: null, trashedAt: null, ...extra }) as unknown as Note;

beforeEach(() => {
  mockArmed.clear();
  mockDisarm.mockClear();
  mockArm.mockClear();
  mockRing.mockClear();
  Object.assign(mockBook, { mode: 'exact', exact: true, stopped: false });
});

describe('reconcileReminders', () => {
  it('arms a reminder to come once', async () => {
    await reconcileReminders({ a: note('a', NOW + HOUR) }, NOW);
    expect(mockArm).toHaveBeenCalledTimes(1);
    expect(mockArmed.get('a')).toBe(NOW + HOUR);
    await reconcileReminders({ a: note('a', NOW + HOUR) }, NOW);
    expect(mockArm).toHaveBeenCalledTimes(1);
  });

  it('leaves the notification of a reminder that rang, and forgets its schedule once it is a day old', async () => {
    mockArmed.set('a', NOW - 1000);
    await reconcileReminders({ a: note('a', NOW - 1000) }, NOW);
    expect(mockDisarm).not.toHaveBeenCalled();
    expect(mockRing).not.toHaveBeenCalled();
    expect(mockArmed.get('a')).toBe(NOW - 1000);
    await reconcileReminders({ a: note('a', NOW - 1000) }, NOW + LATE_RING_MS);
    expect(mockDisarm).not.toHaveBeenCalled();
    expect(mockArmed.has('a')).toBe(false);
  });

  it('rings at once a reminder whose moment went by before it reached this phone, within a day, once', async () => {
    await reconcileReminders({ late: note('late', NOW - 2 * HOUR), stale: note('stale', NOW - LATE_RING_MS - HOUR) }, NOW);
    expect(mockRing.mock.calls.map(([reminder]) => reminder.noteId)).toEqual(['late']);
    await reconcileReminders({ late: note('late', NOW - 2 * HOUR) }, NOW + 1000);
    expect(mockRing).toHaveBeenCalledTimes(1);
    expect(mockArm).not.toHaveBeenCalled();
  });

  it('rings nothing late the first time, not knowing what rang before', async () => {
    mockBook.mode = undefined;
    await reconcileReminders({ late: note('late', NOW - 2 * HOUR), next: note('next', NOW + HOUR) }, NOW);
    expect(mockRing).not.toHaveBeenCalled();
    expect(mockArm).toHaveBeenCalledTimes(1);
    await reconcileReminders({ late: note('late', NOW - 2 * HOUR), next: note('next', NOW + HOUR) }, NOW + 1000);
    expect(mockRing).not.toHaveBeenCalled();
  });

  it('arms every reminder again, exactly, once exact alarms are allowed, and tries again one that failed', async () => {
    mockBook.exact = false;
    await reconcileReminders({ a: note('a', NOW + HOUR) }, NOW);
    expect(mockArm).toHaveBeenLastCalledWith(expect.objectContaining({ noteId: 'a' }), false);
    mockBook.exact = true;
    await reconcileReminders({ a: note('a', NOW + HOUR) }, NOW);
    expect(mockArm).toHaveBeenLastCalledWith(expect.objectContaining({ noteId: 'a' }), true);
    expect(mockArm).toHaveBeenCalledTimes(2);
    mockArm.mockRejectedValueOnce(new Error('refused'));
    await reconcileReminders({ a: note('a', NOW + HOUR), b: note('b', NOW + 2 * HOUR) }, NOW);
    expect(mockArmed.has('b')).toBe(false);
    await reconcileReminders({ a: note('a', NOW + HOUR), b: note('b', NOW + 2 * HOUR) }, NOW);
    expect(mockArmed.get('b')).toBe(NOW + 2 * HOUR);
    expect(mockArm).toHaveBeenCalledTimes(4);
  });

  it('takes the notification away when the reminder is taken off, moved or binned', async () => {
    mockArmed.set('off', NOW - 1000);
    mockArmed.set('moved', NOW - 1000);
    mockArmed.set('binned', NOW - 1000);
    mockArmed.set('gone', NOW - 1000);
    // Moved to the day before: no longer due here.
    await reconcileReminders({ off: note('off', null), moved: note('moved', NOW - LATE_RING_MS - HOUR), binned: note('binned', NOW - 1000, { trashedAt: NOW }) }, NOW);
    expect(mockDisarm.mock.calls.map(([id]) => id).sort()).toEqual(['binned', 'gone', 'moved', 'off']);
  });

  it('keeps the notification of one that rang and was moved to another moment gone by today, without ringing it again', async () => {
    mockArmed.set('moved', NOW - 1000);
    await reconcileReminders({ moved: note('moved', NOW - 5000) }, NOW);
    expect(mockDisarm).not.toHaveBeenCalled();
    expect(mockRing).not.toHaveBeenCalled();
    expect(mockArmed.get('moved')).toBe(NOW - 5000);
  });

  it('asks to post notifications with the app in front only, once', async () => {
    let fresh!: typeof reconcileReminders;
    let appState!: { currentState: string };
    jest.isolateModules(() => {
      appState = require('react-native').AppState;
      fresh = require('../useReminders').reconcileReminders;
    });
    const set = (state: string) => Object.defineProperty(appState, 'currentState', { value: state, configurable: true, writable: true });
    mockAsk.mockClear();
    // Brought by the sync while the app is away: armed, and the question kept for its return.
    set('background');
    await fresh({ a: note('a', NOW + HOUR) }, NOW);
    expect(mockArm).toHaveBeenCalledTimes(1);
    expect(mockAsk).not.toHaveBeenCalled();
    set('active');
    await fresh({ a: note('a', NOW + HOUR) }, NOW);
    await fresh({ a: note('a', NOW + HOUR) }, NOW);
    expect(mockAsk).toHaveBeenCalledTimes(1);
  });
});
