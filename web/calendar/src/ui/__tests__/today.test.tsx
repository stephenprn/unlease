/** « Aujourd'hui » in the browser: its address, the day in reading order with now and next, Carnet's missed reminders, tomorrow, an empty day. */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { blankDraft } from '@unlease/calendar/services/editing';
import { addDays, instantToDay, wallToInstant } from '@unlease/calendar/services/time';
import { noteFields } from '@unlease/notes/sync/entities';

import { freshLibrary } from '@test/library';
import { writeLocal } from '@shared/app/store/records';
import { setOnboarded } from '@shared/app/store/settings';
import { App } from '@shared/ui/App';
import { initHistory } from '@shared/ui/router';
import { addEvent } from '../../app/store/actions';
import { resetPrefs, usePrefsStore } from '../../app/store/prefs';
import { parseCalendarRoute, paths } from '../routes';

function open(path: string): void {
  history.replaceState(null, '', path);
  initHistory();
}

describe('« Aujourd’hui »', () => {
  // Today at 14:10 on this machine's clock: only the date is faked, timers run.
  let day = '';
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    day = instantToDay(Date.now());
    vi.setSystemTime(wallToInstant(`${day}T14:10`, ''));
    await freshLibrary();
    setOnboarded();
    resetPrefs();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('has its own address, today’s whatever the day', () => {
    expect(parseCalendarRoute('/agenda/today')).toEqual({ name: 'agenda', view: 'today', day: null });
    expect(paths.view('today', '2026-11-02')).toBe('/agenda/today');
  });

  it('reads the day in order, what runs and what comes next counting, then what was missed and tomorrow', async () => {
    addEvent({ ...blankDraft(`${day}T09:30`, `${day}T09:45`, ''), title: 'Point d’équipe' });
    addEvent({ ...blankDraft(`${day}T13:30`, `${day}T15:00`, ''), title: 'Atelier', place: 'Salle B' });
    addEvent({ ...blankDraft(`${day}T16:00`, `${day}T16:30`, ''), title: 'Dentiste' });
    addEvent({ ...blankDraft(`${addDays(day, 1)}T09:00`, `${addDays(day, 1)}T10:00`, ''), title: 'Standup' });
    const yesterday = wallToInstant(`${addDays(day, -1)}T18:00`, '');
    writeLocal([
      {
        type: 'note',
        id: 'n-mutuelle',
        patch: noteFields({ kind: 'text', title: 'Renvoyer le formulaire', body: '', color: null, pinned: false, archived: false, trashedAt: null, labelIds: [], position: 'a0', reminderAt: yesterday, code: '', hint: '', createdAt: 1, deletedAt: null }),
      },
    ]);
    open('/agenda/today');
    render(<App />);

    const list = await screen.findByRole('list', { name: 'Aujourd’hui' });
    const rows = within(list).getAllByRole('link');
    expect(rows.map(row => row.textContent)).toEqual([
      expect.stringContaining('Point d’équipe'),
      expect.stringContaining('Atelier'),
      expect.stringContaining('Dentiste'),
    ]);
    expect(rows[1]).toHaveTextContent('Encore 50 min');
    expect(rows[1]).toHaveTextContent('13:30 – 15:00 · Salle B');
    expect(rows[2]).toHaveTextContent('Dans 1 h 50');
    expect(rows[1]).toHaveAttribute('href', expect.stringMatching(/^\/agenda\/event\//));
    // The now line lies between what has started and what has not.
    expect(within(list).getByText('Maintenant, 14:10')).toBeInTheDocument();

    const missed = screen.getByRole('region', { name: 'En retard' });
    expect(within(missed).getByRole('link', { name: /Renvoyer le formulaire/ })).toHaveAttribute('href', '/notes/note/n-mutuelle');
    expect(within(missed).getByText('Hier · 18:00')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Demain' })).getByText('Standup')).toBeInTheDocument();

    // The navigation's « Aujourd'hui » is the place on screen; the bar's track chooses none of the calendar's views.
    expect(screen.getAllByRole('link', { name: 'Aujourd’hui' }).some(link => link.getAttribute('aria-current') === 'page')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Période précédente' })).toBeNull();
    await waitFor(() => expect(usePrefsStore.getState().view).toBe('today'));
  });

  it('says an empty day kindly and offers an event', async () => {
    const user = userEvent.setup();
    open('/agenda/today');
    render(<App />);
    const kind = await screen.findByText('Rien de prévu aujourd’hui : la journée est à vous.');
    expect(screen.queryByRole('region', { name: 'Demain' })).toBeNull();
    await user.click(within(kind.parentElement!).getByRole('button', { name: 'Créer un événement' }));
    await waitFor(() => expect(location.pathname).toBe('/agenda/new'));
  });
});
