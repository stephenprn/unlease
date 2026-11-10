/**
 * « Afficher uniquement celui-ci » on the navigation's calendars (its row's menu, a right-click,
 * Alt-click on its stone), « Tout afficher » bringing back what showed, and a subscribed event's
 * copy in sight in its popover.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { blankDraft } from '@unlease/calendar/services/editing';
import { instantToDay } from '@unlease/calendar/services/time';
import { feedFields } from '@unlease/calendar/sync/entities';

import { freshLibrary } from '@test/library';
import { writeLocal } from '@shared/app/store/records';
import { setOnboarded } from '@shared/app/store/settings';
import { App } from '@shared/ui/App';
import { getLocation, initHistory } from '@shared/ui/router';
import { addEvent, createLabel } from '../../app/store/actions';
import { useCalendarStore } from '../../app/store/library';
import { usePrefsStore } from '../../app/store/prefs';

const today = (): string => instantToDay(Date.now());

function open(path: string): void {
  history.replaceState(null, '', path);
  initHistory();
}

const feed = (name: string, position: string) => feedFields({ kind: 'ics', name, url: `https://example.org/${position}.ics`, color: 'violet', hidden: false, position, refreshedAt: null, error: '', createdAt: 1, deletedAt: null });

/** Each calendar of the navigation, ticked or not. */
const ticks = (): string =>
  screen
    .getAllByRole('checkbox')
    .map(box => `${box.getAttribute('aria-label')}=${box.getAttribute('aria-checked')}`)
    .join(' | ');

describe('Agenda’s calendars, one alone', () => {
  beforeEach(async () => {
    await freshLibrary();
    setOnboarded();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true });
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows one alone from its row’s menu, takes it back, and from a right-click or its stone shows all again as before', async () => {
    const user = userEvent.setup();
    writeLocal([
      { type: 'calendarFeed', id: 'holidays', patch: feed('Jours fériés', 'a0') },
      { type: 'calendarFeed', id: 'cinema', patch: feed('Cinéma du quartier', 'a1') },
    ]);
    createLabel('Travail');
    open(`/agenda/week/${today()}`);
    render(<App />);
    await screen.findByRole('checkbox', { name: 'Cinéma du quartier' });
    const before = ticks();
    expect(before).toContain('Dates des pages (Pages)=false');

    await user.click(screen.getByRole('button', { name: 'Plus d’actions pour Cinéma du quartier' }));
    const menu = await screen.findByRole('menu', { name: 'Actions pour Cinéma du quartier' });
    expect(within(menu).queryByRole('menuitem', { name: /Tout afficher/ })).toBeNull();
    await user.click(within(menu).getByRole('menuitem', { name: /Afficher uniquement celui-ci/ }));
    expect(ticks()).toBe('Mes événements=false | Travail=false | Jours fériés=false | Cinéma du quartier=true | Anniversaires (Contacts)=false | Rappels de Carnet=false | Dates des pages (Pages)=false | Météo=false');
    // A subscription's is its record's, synced; one's own, the labels and the layers this browser's.
    expect(useCalendarStore.getState().feeds.holidays!.hidden).toBe(true);
    expect(usePrefsStore.getState().hideOwn).toBe(true);
    expect(await screen.findByText('Les autres agendas sont masqués')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(ticks()).toBe(before);

    // Alt-click on a stone: that one alone; a right-click on its row then offers « Tout afficher ».
    await user.keyboard('{Alt>}');
    await user.click(screen.getByRole('checkbox', { name: 'Météo' }));
    await user.keyboard('{/Alt}');
    expect(ticks()).toContain('Météo=true');
    expect(ticks()).toContain('Mes événements=false');
    fireEvent.contextMenu(screen.getByRole('checkbox', { name: 'Météo' }).parentElement!);
    const again = await screen.findByRole('menu', { name: 'Actions pour Météo' });
    await user.click(within(again).getByRole('menuitem', { name: /Tout afficher/ }));
    expect(ticks()).toBe(before);
    expect(await screen.findByText('Les agendas sont de nouveau affichés')).toBeInTheDocument();
    expect(usePrefsStore.getState().shownBefore).toBeNull();
  });

  it('copies a subscribed event from its popover’s read-only line, and opens the copy', async () => {
    const user = userEvent.setup();
    const day = today();
    writeLocal([{ type: 'calendarFeed', id: 'cinema', patch: feed('Cinéma du quartier', 'a1') }]);
    const id = addEvent({ ...blankDraft(`${day}T10:00`, `${day}T12:00`, 'Europe/Paris'), title: 'Avant-première' });
    writeLocal([{ type: 'calendarEvent', id, patch: { feedId: 'cinema' } }]);
    open(`/agenda/week/${day}`);
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /^Avant-première,/ }));
    const peek = await screen.findByRole('dialog', { name: 'Avant-première' });
    expect(within(peek).getByText('Agenda abonné : en lecture seule')).toBeInTheDocument();
    await act(async () => user.click(within(peek).getByRole('button', { name: 'Copier dans mon agenda' })));
    const copy = Object.values(useCalendarStore.getState().events).find(event => event.title === 'Avant-première' && event.feedId === null);
    expect(copy).toBeDefined();
    await waitFor(() => expect(getLocation().path).toBe(`/agenda/event/${copy!.id}/edit`));
  });
});
