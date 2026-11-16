/**
 * « Votre semaine » and what hangs on it: the days worked chosen in the Administration and sent with
 * its « Enregistrer »; « Jours travaillés seulement » leaving the others out of the week and the month
 * (every day when none or all seven are worked); a day off, offered for an all-day event only and said
 * on its page; « Me réveiller pour cet événement », only for an event still to come at an hour, while
 * the server runs Clock, opening Clock's new alarm linked to it.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { blankDraft } from '@unlease/calendar/services/editing';
import { addDays, instantToDay, wallToInstant } from '@unlease/calendar/services/time';
import { parseServerSettings, type ServerSettings } from '@unlease/core/sync/settings';

import { freshLibrary } from '@test/library';
import { useServerSettingsStore } from '@shared/app/store/serverSettings';
import { setOnboarded, setServer, setServerApps } from '@shared/app/store/settings';
import { useUiStore } from '@shared/app/store/ui';
import { stopSync } from '@shared/app/sync/loop';
import { App } from '@shared/ui/App';
import { initHistory, otherApp } from '@shared/ui/router';
import { CALENDAR_ADMIN_SECTIONS } from '../../admin';
import { addEvent } from '../../app/store/actions';
import { useCalendarStore } from '../../app/store/library';
import { savePrefs } from '../../app/store/prefs';
import { EventScreen } from '../screens/EventScreen';

const SERVER = { url: 'https://unlease.test', token: 'jeton' };

function open(path: string): void {
  history.replaceState(null, '', path);
  initHistory();
}

/** The server's settings, its working days as given. */
const settingsWith = (workDays: readonly number[]): ServerSettings => parseServerSettings({ analysis: { enabled: false }, calendar: { holidays: { country: 'FR', region: null }, workDays } })!;

/** The week's columns, by their heads (« Voir le lun. 16 »). */
const heads = (): string[] => screen.getAllByRole('button', { name: /^Voir le \D/ }).map(head => head.getAttribute('aria-label')!);

beforeEach(async () => {
  await freshLibrary();
  setOnboarded();
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true });
});

afterEach(() => {
  stopSync();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the days worked in the views', () => {
  it('leaves the days not worked out of the week and the month, only while asked', async () => {
    useServerSettingsStore.setState({ settings: settingsWith([1, 3, 5]) });
    savePrefs({ hideWeekends: true });
    open('/agenda/week/2026-11-18');
    const { unmount } = render(<App />);
    await waitFor(() => expect(heads()).toEqual(['Voir le lun. 16', 'Voir le mer. 18', 'Voir le ven. 20']));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^16\s–\s20\snov\.\s2026$/);
    unmount();

    // The month: each week the same three columns.
    open('/agenda/month/2026-11-01');
    const month = render(<App />);
    expect(await screen.findByRole('button', { name: 'Voir le 2026-11-18' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Voir le 2026-11-17' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Voir le 2026-11-22' })).not.toBeInTheDocument();
    month.unmount();

    // Off: the whole week.
    savePrefs({ hideWeekends: false });
    open('/agenda/week/2026-11-18');
    render(<App />);
    await waitFor(() => expect(heads()).toHaveLength(7));
  });

  it('shows every day when no day, or every day, is worked', async () => {
    savePrefs({ hideWeekends: true });
    useServerSettingsStore.setState({ settings: settingsWith([]) });
    open('/agenda/week/2026-11-18');
    const { unmount } = render(<App />);
    await waitFor(() => expect(heads()).toHaveLength(7));
    unmount();
    useServerSettingsStore.setState({ settings: settingsWith([0, 1, 2, 3, 4, 5, 6]) });
    render(<App />);
    await waitFor(() => expect(heads()).toHaveLength(7));
  });

  it('names the days in its setting', async () => {
    useServerSettingsStore.setState({ settings: settingsWith([2, 3, 4, 5, 6]) });
    open('/agenda/settings');
    render(<App />);
    const setting = await screen.findByRole('switch', { name: /Jours travaillés seulement/ });
    expect(setting).toHaveTextContent('Du mardi au samedi, comme choisi dans l’Administration (« Votre semaine »).');
  });
});

describe('« Votre semaine » in the Administration', () => {
  it('sends the days worked with its « Enregistrer », the button waking at their change', async () => {
    const sent: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/settings') && init?.method === 'PUT') {
          const patch = JSON.parse(String(init.body)) as { calendar: { workDays: number[] } };
          sent.push(patch);
          return Response.json(settingsWith(patch.calendar.workDays));
        }
        if (url.includes('/api/calendar/holidays/countries')) return Response.json({ countries: [] });
        if (url.includes('/api/calendar/holidays/regions')) return Response.json({ regions: [] });
        return new Response('{}', { status: 404 });
      }),
    );
    const user = userEvent.setup();
    const section = CALENDAR_ADMIN_SECTIONS.find(each => each.id === 'calendar-holidays')!;
    expect(section.title()).toBe('Votre semaine');
    const settings = settingsWith([1, 2, 3, 4, 5]);
    useServerSettingsStore.setState({ settings });
    const { Body } = section;
    render(<Body server={SERVER} settings={settings} />);
    const save = screen.getByRole('button', { name: 'Enregistrer' });
    expect(save).toBeDisabled();
    const days = screen.getByRole('group', { name: 'Jours travaillés' });
    // From Monday: L M M J V S D.
    expect(within(days).getAllByRole('button').map(day => day.getAttribute('aria-label'))).toEqual(['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']);
    await user.click(within(days).getByRole('button', { name: 'samedi' }));
    expect(within(days).getByRole('button', { name: 'samedi' })).toHaveAttribute('aria-pressed', 'true');
    expect(save).toBeEnabled();
    await user.click(save);
    // The days alone: the country did not change.
    await waitFor(() => expect(sent).toEqual([{ calendar: { workDays: [1, 2, 3, 4, 5, 6] } }]));
    await waitFor(() => expect(useUiStore.getState().snack).toMatchObject({ message: 'Jours travaillés : Du lundi au samedi', tone: 'success' }));
  });
});

describe('a day off', () => {
  it('is offered for an all-day event only, saved, and said on its page', async () => {
    const user = userEvent.setup();
    const day = addDays(instantToDay(Date.now()), 3);
    open(`/agenda/new?start=${day}T10:00&end=${day}T11:00`);
    render(<App />);
    await user.type(screen.getByRole('textbox', { name: 'Titre' }), 'Congés');
    expect(screen.queryByRole('switch', { name: /^Jour de congé/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Toute la journée' }));
    const dayOff = screen.getByRole('switch', { name: /^Jour de congé/ });
    expect(dayOff).toHaveTextContent('Les alarmes de Clock qui le demandent ne sonnent pas ce jour-là.');
    await user.click(dayOff);
    expect(dayOff).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(location.pathname).toMatch(/^\/agenda\/event\//));
    const saved = Object.values(useCalendarStore.getState().events).find(event => event.title === 'Congés');
    expect(saved).toMatchObject({ dayOff: true, start: day });
    expect(await screen.findByText('Jour de congé')).toBeInTheDocument();
  });
});

describe('« Me réveiller pour cet événement »', () => {
  const later = addDays(instantToDay(Date.now()), 2);

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
  });

  it('opens Clock’s new alarm for an event still to come at an hour, while the server runs Clock', async () => {
    const user = userEvent.setup();
    const opened = vi.spyOn(otherApp, 'open').mockImplementation(() => undefined);
    const id = addEvent({ ...blankDraft(`${later}T07:30`, `${later}T08:30`, 'Europe/Paris'), title: 'Train & co' });
    open(`/agenda/event/${id}`);
    // No server: no Clock.
    const before = render(<EventScreen id={id} />);
    expect(screen.queryByRole('button', { name: 'Me réveiller pour cet événement' })).not.toBeInTheDocument();
    before.unmount();

    setServer(SERVER);
    setServerApps(['calendar']);
    const off = render(<EventScreen id={id} />);
    expect(screen.queryByRole('button', { name: 'Me réveiller pour cet événement' })).not.toBeInTheDocument();
    off.unmount();

    setServerApps(['calendar', 'clock']);
    render(<EventScreen id={id} />);
    await user.click(screen.getByRole('button', { name: 'Me réveiller pour cet événement' }));
    expect(opened).toHaveBeenCalledTimes(1);
    const href = opened.mock.calls[0]![0];
    expect(href.startsWith('/clock/new?')).toBe(true);
    const query = new URLSearchParams(href.slice(href.indexOf('?')));
    expect(Object.fromEntries(query)).toEqual({ event: id, occurrence: '', at: String(wallToInstant(`${later}T07:30`, 'Europe/Paris')), title: 'Train & co' });
  });

  it('is not offered for an all-day event, nor one gone by', () => {
    setServer(SERVER);
    setServerApps(['calendar', 'clock']);
    const allDay = addEvent({ ...blankDraft(later, addDays(later, 1), ''), title: 'Salon' });
    const past = addDays(instantToDay(Date.now()), -2);
    const gone = addEvent({ ...blankDraft(`${past}T09:00`, `${past}T10:00`, 'Europe/Paris'), title: 'Passé' });
    for (const id of [allDay, gone]) {
      const view = render(<EventScreen id={id} />);
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Me réveiller pour cet événement' })).not.toBeInTheDocument();
      view.unmount();
    }
  });
});
