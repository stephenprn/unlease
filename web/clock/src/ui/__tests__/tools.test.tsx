import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freshLibrary } from '@test/library';
import { getRecord } from '@shared/app/store/records';
import { setOnboarded } from '@shared/app/store/settings';
import { useUiStore } from '@shared/app/store/ui';
import { App } from '@shared/ui/App';
import { getLocation, initHistory } from '@shared/ui/router';
import { createTimer } from '../../app/store/actions';
import { useClockStore } from '../../app/store/library';
import { loadTools, useToolsStore } from '../../app/store/tools';

const state = () => useClockStore.getState();

function open(path: string): void {
  history.replaceState(null, '', path);
  initHistory();
}

describe('Clock’s timers, stopwatch and world clocks on the web', () => {
  beforeEach(async () => {
    await freshLibrary();
    localStorage.clear();
    loadTools();
    setOnboarded();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('lists its four places, the one on screen marked', () => {
    open('/clock/stopwatch');
    render(<App />);
    const nav = screen.getAllByRole('navigation')[0]!;
    for (const name of ['Alarmes', 'Minuteurs', 'Chronomètre', 'Horloges']) expect(within(nav).getByRole('link', { name })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Chronomètre' })).toHaveAttribute('aria-current', 'page');
  });

  it('starts a timer from a quick length, says it rings only here, and pauses it', async () => {
    const user = userEvent.setup();
    open('/clock/timers');
    render(<App />);
    expect(screen.getByText(/ne sonne que tant que cette page reste ouverte/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Lancer un minuteur de 5 minutes' }));
    expect(useToolsStore.getState().runs).toEqual([expect.objectContaining({ state: 'running', length: 300_000, timerId: null })]);
    const card = await screen.findByRole('group', { name: '5 min' });
    await user.click(within(card).getByRole('button', { name: 'Pause' }));
    expect(useToolsStore.getState().runs[0]!.state).toBe('paused');
    expect(within(card).getByText('En pause')).toBeInTheDocument();
  });

  it('types a length from the keyboard and keeps the timer for later, in one batch', async () => {
    const user = userEvent.setup();
    open('/clock/timers/new');
    render(<App />);
    await screen.findByRole('dialog', { name: 'Nouveau minuteur' });
    // 9, 0, 0: nine minutes, as on a microwave.
    fireEvent.keyDown(window, { key: '9' });
    fireEvent.keyDown(window, { key: '0' });
    fireEvent.keyDown(window, { key: '0' });
    expect(screen.getByText('9 minutes')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Libellé/), 'Pâtes');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const timers = Object.values(state().timers);
    expect(timers).toEqual([expect.objectContaining({ label: 'Pâtes', seconds: 540, sound: 'bell' })]);
    expect(new Set(Object.values(getRecord('timer', timers[0]!.id)!.clocks)).size).toBe(1);
    expect(useToolsStore.getState().runs).toEqual([]);
    await waitFor(() => expect(getLocation().path).toBe('/clock/timers'));
  });

  it('starts a saved timer from its pebble, and deletes it from its form with « Annuler »', async () => {
    const user = userEvent.setup();
    const id = createTimer({ label: 'Thé vert', seconds: 180, sound: 'chimes', vibrate: true });
    open('/clock/timers');
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Lancer Thé vert' }));
    expect(useToolsStore.getState().runs).toEqual([expect.objectContaining({ timerId: id, label: 'Thé vert', sound: 'chimes' })]);
    // The card opens its form.
    await user.click(screen.getByRole('button', { name: /^Thé vert, 3 minutes/ }));
    await user.click(await screen.findByRole('button', { name: 'Supprimer' }));
    expect(state().timers[id]!.deletedAt).not.toBeNull();
    const snack = useUiStore.getState().snack!;
    expect(snack.message).toBe('Minuteur supprimé');
    act(() => snack.action!.run());
    expect(state().timers[id]!.deletedAt).toBeNull();
  });

  it('starts the stopwatch with Space and takes a lap with L', async () => {
    open('/clock/stopwatch');
    render(<App />);
    // At zero, « Démarrer » alone: no reset of nothing.
    expect(screen.queryByRole('button', { name: 'Réinitialiser' })).toBeNull();
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(useToolsStore.getState().stopwatch.startedAt).not.toBeNull();
    fireEvent.keyDown(document.body, { key: 'l' });
    expect(useToolsStore.getState().stopwatch.laps).toHaveLength(1);
    expect(await screen.findByRole('list', { name: 'Tours' })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(useToolsStore.getState().stopwatch.startedAt).toBeNull();
  });

  it('adds a city from the search, ticks it there, and removes it with « Annuler »', async () => {
    const user = userEvent.setup();
    open('/clock/world/new');
    render(<App />);
    await user.type(await screen.findByRole('textbox', { name: 'Rechercher une ville' }), 'tokyo');
    await user.click(screen.getByRole('button', { name: /^Tokyo/ }));
    const [clock] = Object.values(state().worldClocks);
    expect(clock).toMatchObject({ zone: 'Asia/Tokyo', name: 'Tokyo', deletedAt: null });
    await waitFor(() => expect(getLocation().path).toBe('/clock/world'));
    await user.click(await screen.findByRole('button', { name: /^Tokyo, / }));
    await user.click(await screen.findByRole('button', { name: 'Retirer' }));
    expect(state().worldClocks[clock!.id]!.deletedAt).not.toBeNull();
    act(() => useUiStore.getState().snack!.action!.run());
    expect(state().worldClocks[clock!.id]!.deletedAt).toBeNull();
  });
});
