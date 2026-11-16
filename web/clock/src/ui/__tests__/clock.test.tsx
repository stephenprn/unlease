import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLOCK_PREFS_DEFAULTS } from '@unlease/clock/models/prefs';
import { blankDraft } from '@unlease/clock/services/editing';
import { onceDate, skippedDay } from '@unlease/clock/services/schedule';
import { addDays, instantToDay } from '@unlease/calendar/services/time';

import { freshLibrary } from '@test/library';
import { getRecord, writeLocal } from '@shared/app/store/records';
import { setQuery } from '@shared/app/store/search';
import { setOnboarded } from '@shared/app/store/settings';
import { useUiStore } from '@shared/app/store/ui';
import { App } from '@shared/ui/App';
import { getLocation, initHistory } from '@shared/ui/router';
import { createAlarm } from '../../app/store/actions';
import { useClockStore } from '../../app/store/library';
import { usePrefsStore } from '../../app/store/prefs';

const state = () => useClockStore.getState();
const draft = (extra: Partial<ReturnType<typeof blankDraft>> = {}) => ({ ...blankDraft(CLOCK_PREFS_DEFAULTS), ...extra });
const live = () => Object.values(state().alarms).filter(alarm => alarm.deletedAt === null);

function open(path: string): void {
  history.replaceState(null, '', path);
  initHistory();
}

describe('Clock’s web app', () => {
  beforeEach(async () => {
    await freshLibrary();
    setOnboarded();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true });
  });

  afterEach(() => {
    setQuery('');
    vi.restoreAllMocks();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('says what goes here while there are no alarms, and that they ring on the phones', () => {
    open('/clock');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Aucune alarme' })).toBeInTheDocument();
    expect(screen.getByText(/jamais dans ce navigateur/)).toBeInTheDocument();
  });

  it('lists the alarms by time, their labels over their days, and the search narrows them', async () => {
    createAlarm(draft({ time: '09:00', days: [6] }));
    createAlarm(draft({ time: '07:30', days: [1, 2, 3, 4, 5], label: 'Travail' }));
    open('/clock');
    render(<App />);
    const rows = within(screen.getByRole('list', { name: 'Alarmes' })).getAllByRole('listitem');
    expect(rows.map(row => row.textContent)).toEqual(['07:30TravailEn semaine', '09:00sam.']);
    act(() => setQuery('9h'));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Alarmes' })).getAllByRole('listitem')).toHaveLength(1));
  });

  it('creates a one-time alarm from its form, on the next day its time comes, in one batch', async () => {
    const user = userEvent.setup();
    open('/clock/new');
    render(<App />);
    const time = await screen.findByLabelText('Heure');
    // A new alarm's time takes the caret.
    await waitFor(() => expect(time).toHaveFocus());
    await user.clear(time);
    await user.type(time, '615');
    expect(screen.getByText(/^Sonnera dans/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Libellé'), 'Train pour Lyon');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(live()).toHaveLength(1));
    const [alarm] = live();
    expect(alarm).toMatchObject({ time: '06:15', days: [], date: onceDate('06:15', Date.now()), enabled: true, label: 'Train pour Lyon' });
    expect(new Set(Object.values(getRecord('alarm', alarm!.id)!.clocks)).size).toBe(1);
    expect(useUiStore.getState().snack?.message).toMatch(/^Alarme réglée/);
    await waitFor(() => expect(getLocation().path).toBe('/clock'));
  });

  it('says what is wrong with a time it cannot read, and saves nothing', async () => {
    const user = userEvent.setup();
    open('/clock/new');
    render(<App />);
    const time = await screen.findByLabelText('Heure');
    await user.clear(time);
    await user.type(time, '25h');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Saisissez une heure comme 7h30, 730 ou 19:30.')).toBeInTheDocument();
    expect(live()).toHaveLength(0);
  });

  it('picks its days in the week’s order, or at once from the quick choices', async () => {
    const user = userEvent.setup();
    open('/clock/new');
    render(<App />);
    const days = await screen.findByRole('group', { name: 'Jours de la semaine' });
    expect(within(days).getAllByRole('button').map(day => day.getAttribute('aria-label'))).toEqual(['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']);
    await user.click(screen.getByRole('button', { name: 'En semaine' }));
    expect(within(days).getByRole('button', { name: 'lundi' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(days).getByRole('button', { name: 'samedi' })).toHaveAttribute('aria-pressed', 'false');
    await user.click(within(days).getByRole('button', { name: 'samedi' }));
    // Six days are none of the quick choices.
    expect(screen.getByRole('button', { name: 'En semaine' })).toHaveAttribute('aria-pressed', 'false');
    // ⌘/Ctrl+Entrée saves from anywhere in the form.
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(live()).toHaveLength(1));
    expect(live()[0]!.days).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('edits an alarm, skips its next ring, and asks before dropping what changed', async () => {
    const user = userEvent.setup();
    const id = createAlarm(draft({ time: '07:30', days: [0, 1, 2, 3, 4, 5, 6] }));
    open(`/clock/alarm/${id}`);
    render(<App />);
    const label = await screen.findByLabelText('Libellé');
    await user.type(label, 'Debout');
    // Escape with changes asks first.
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('alertdialog', { name: 'Abandonner les modifications ?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continuer à modifier' }));
    await user.click(screen.getByRole('switch', { name: /Ignorer la prochaine/ }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(state().alarms[id]!.label).toBe('Debout'));
    expect(skippedDay(state().alarms[id]!, Date.now())).not.toBeNull();
    const record = getRecord('alarm', id)!;
    expect(record.clocks.label).toBe(record.clocks.skipDay);
  });

  it('deletes an alarm from its form, with « Annuler » on the slip', async () => {
    const user = userEvent.setup();
    const id = createAlarm(draft({ time: '07:30', days: [1] }));
    open(`/clock/alarm/${id}`);
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Supprimer' }));
    expect(state().alarms[id]!.deletedAt).not.toBeNull();
    const snack = useUiStore.getState().snack!;
    expect(snack.message).toBe('Alarme supprimée');
    act(() => snack.action!.run());
    expect(state().alarms[id]!.deletedAt).toBeNull();
  });

  it('switches an alarm gone by on from the list, for the next day its time comes', async () => {
    const user = userEvent.setup();
    const now = Date.now();
    const id = createAlarm(draft({ time: '06:15' }), now);
    writeLocal([{ type: 'alarm', id, patch: { date: addDays(instantToDay(now), -3), enabled: false } }]);
    open('/clock');
    render(<App />);
    const toggle = screen.getByRole('switch', { name: 'Alarme à 06:15' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    expect(state().alarms[id]).toMatchObject({ enabled: true, date: onceDate('06:15', Date.now()) });
    expect(useUiStore.getState().snack?.message).toMatch(/^Alarme réglée/);
  });

  it('sets a new alarm’s sound, the clock’s format and the week’s first day in Réglages', async () => {
    const user = userEvent.setup();
    open('/clock/settings');
    render(<App />);
    await user.click(await screen.findByRole('switch', { name: /Heures sur 12/ }));
    expect(usePrefsStore.getState().twelveHours).toBe(true);
    await user.click(screen.getByRole('radio', { name: 'Dimanche' }));
    expect(usePrefsStore.getState().weekStart).toBe(0);
    await user.click(screen.getByRole('button', { name: /Son d’une nouvelle alarme/ }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Chant d’oiseaux' }));
    expect(usePrefsStore.getState().defaultSound).toBe('birdsong');
    await user.click(screen.getByRole('switch', { name: /Météo/ }));
    expect(usePrefsStore.getState().weatherDefault).toBe(false);
    // Only what a browser can set: nothing of how a phone rings.
    expect(screen.queryByText('Durée de répétition')).not.toBeInTheDocument();
  });
});
