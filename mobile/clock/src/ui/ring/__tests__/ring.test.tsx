/**
 * The ringing window: the alarm's label, the day's events from Agenda and the weather kept, « Répéter »
 * snoozing and the pebble's track stopping (for TalkBack, its action); « Répétée jusqu’à » once snoozed.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { eventFields } from '@unlease/calendar/sync/entities';
import type { CalendarEvent } from '@unlease/calendar/models/events';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { writePreference } from '@shared/data/repositories/stateRepository';
import { bootstrap, resetBootstrap } from '@app/bootstrap';
import { createAlarm } from '@app/store/actions';
import { resetLibrary, writeLocal } from '@app/store/libraryStore';
import RingRoot from '@ui/ring/RingRoot';

import { __reset, __ring, state as engine } from '../../../../../shared/__mocks__/NativeAlarmEngine';
import { textOf } from '../../screens/__tests__/harness';

jest.useFakeTimers();

const DRAFT = { time: '07:30', days: [1, 2, 3, 4, 5], label: 'Travail', sound: 'melody', vibrate: true, weather: true, agenda: true, offDays: false, link: null };

describe('the ringing window', () => {
  let tree: ReactTestRenderer;

  beforeEach(async () => {
    __reset();
    closeDatabase();
    resetLibrary();
    resetBootstrap();
    openDatabase({ name: 'ring.sqlite' });
    // Tuesday 17 November 2026, 07:30: the alarm rings.
    jest.setSystemTime(new Date(2026, 10, 17, 7, 30, 5));
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 404, headers: { get: () => null }, json: async () => ({}) })) as unknown as typeof fetch;
    bootstrap();
    const id = createAlarm(DRAFT, new Date(2026, 10, 16, 21, 0).getTime());
    const event = { title: 'Dentiste', description: '', place: '', start: '2026-11-17T09:30', end: '2026-11-17T10:00', timeZone: '', rrule: '', exdates: [], recurringId: null, originalStart: '', reminders: [], labelIds: [], contactIds: [], files: [], feedId: null, uid: '', url: '', color: null, dayOff: false, trashedAt: null, createdAt: 1, deletedAt: null } as Omit<CalendarEvent, 'id' | 'editedAt'>;
    writeLocal([{ type: 'calendarEvent', id: 'dentist', patch: eventFields(event) }]);
    // The forecast kept the evening before.
    writePreference('clock.weather', { lat: 45.76, lon: 4.84, answer: { at: new Date(2026, 10, 16, 21, 0).getTime(), hours: [{ at: new Date(2026, 10, 17, 7, 0).getTime(), temp: 6.4, code: 61, rain: 60 }], days: [{ day: '2026-11-17', code: 61, max: 12.5, min: 4.2, rain: 70 }] } });
    __ring({ state: 'ringing', id, at: new Date(2026, 10, 17, 7, 30).getTime(), since: Date.now(), title: 'Travail', label: 'Travail' });
    await act(async () => {
      tree = create(<RingRoot />);
    });
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
  });

  afterEach(async () => {
    await act(async () => tree.unmount());
  });

  it('shows the alarm, the weather kept and the day’s events', () => {
    const text = textOf(tree);
    expect(text).toContain('07:30');
    expect(text).toContain('Travail');
    expect(text).toContain('6° · Pluie');
    expect(text).toContain('09:30');
    expect(text).toContain('Dentiste');
    expect(text).toContain('Voir la journée');
  });

  it('snoozes with one tap and stops from the track', async () => {
    const snooze = tree.root.find(node => typeof node.props.onPress === 'function' && node.findAll(child => child.children.includes('Répéter · 10 minutes')).length > 0);
    await act(async () => snooze.props.onPress());
    expect(engine.calls).toContain('snooze');
    const track = tree.root.find(node => node.props.accessibilityLabel === 'Arrêter l’alarme' && typeof node.props.onAccessibilityAction === 'function');
    await act(async () => track.props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }));
    expect(engine.calls).toContain('stop');
  });

  it('says until when once snoozed', async () => {
    await act(async () => __ring({ state: 'snoozed', id: 'x', until: new Date(2026, 10, 17, 7, 40).getTime(), title: 'Travail', label: 'Travail' }));
    expect(textOf(tree)).toContain('Répétée jusqu’à 07:40');
  });
});
