import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { freshLibrary } from '@test/library';
import { shortcutGroups, shortcutTitles } from '@test/shortcuts';
import { setOnboarded } from '@shared/app/store/settings';
import { App } from '@shared/ui/App';
import { blankDraft } from '@unlease/calendar/services/editing';
import { instantToDay } from '@unlease/calendar/services/time';
import { initHistory } from '@shared/ui/router';
import { addEvent } from '../../app/store/actions';

describe('Agenda’s keys', () => {
  beforeEach(async () => {
    await freshLibrary();
    setOnboarded();
  });

  it('lists its views’ keys in the shortcuts dialog, under its commands’', async () => {
    const user = userEvent.setup();
    history.replaceState(null, '', '/agenda');
    initHistory();
    render(<App />);
    await user.keyboard('?');
    expect(screen.getByRole('dialog', { name: 'Raccourcis clavier' })).toBeInTheDocument();
    expect(shortcutTitles()).toEqual(['Partout', 'Dans l’agenda']);
    expect(shortcutGroups().get('Partout')).toEqual(expect.arrayContaining(['C Créer un événement', 'T Aujourd’hui', '/ Rechercher dans votre agenda']));
    expect(shortcutGroups().get('Dans l’agenda')).toEqual([
      'J Période suivante',
      'K Période précédente',
      'D Jour',
      'X 3 jours',
      'W Semaine',
      'M Mois',
      'Y Année',
      'A Planning',
      'O Aujourd’hui : la journée d’un coup d’œil',
    ]);
  });

  // Its peek's « Modifier » says E: the key does what it says, and nothing under a menu over it.
  it('opens a peeked event’s form on E', async () => {
    const user = userEvent.setup();
    const day = instantToDay(Date.now());
    const id = addEvent({ ...blankDraft(`${day}T10:00`, `${day}T11:30`, 'Europe/Paris'), title: 'Dentiste' });
    history.replaceState(null, '', `/agenda/week/${day}`);
    initHistory();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /^Dentiste,/ }));
    await screen.findByRole('dialog', { name: 'Dentiste' });
    await user.keyboard('e');
    await waitFor(() => expect(location.pathname).toBe(`/agenda/event/${id}/edit`));
  });
});
