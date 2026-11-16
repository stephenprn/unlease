/**
 * The views on a phone-sized window and the colour key: the month's chips keep their titles and
 * drop their times under 720px, its « +N » always inside its day (the lanes a row holds from its
 * height); the planning's title over its time and place, what is over lying back; « Mes événements »
 * marked in the colour its uncoloured events wear.
 */
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { blankDraft } from '@unlease/calendar/services/editing';
import type { Occurrence } from '@unlease/calendar/services/occurrences';
import { addDays, deviceZone, instantToDay } from '@unlease/calendar/services/time';

import { freshLibrary } from '@test/library';
import { setOnboarded } from '@shared/app/store/settings';
import { App } from '@shared/ui/App';
import { initHistory } from '@shared/ui/router';
import { NARROW } from '@shared/ui/useMedia';
import { addEvent } from '../../app/store/actions';
import { savePrefs } from '../../app/store/prefs';
import { fitBars, lanesFor } from '../views/MonthView';

const today = (): string => instantToDay(Date.now());

function open(path: string): void {
  history.replaceState(null, '', path);
  initHistory();
}

/** A phone-sized window: jsdom has no `matchMedia`, so the app reads as wide unless one is given. */
function phoneSized(): void {
  window.matchMedia = ((query: string) => ({
    matches: query === NARROW,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/** An occurrence for the lanes' layout alone: a day (or days) and an hour. */
function occurrence(key: string, firstDay: string, lastDay = firstDay, hour = 9): Occurrence {
  const allDay = firstDay !== lastDay;
  return { key, firstDay, lastDay, allDay, startAt: Date.parse(`${firstDay}T${String(hour).padStart(2, '0')}:00:00Z`) } as unknown as Occurrence;
}

beforeEach(async () => {
  await freshLibrary();
  setOnboarded();
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true });
});

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
  vi.restoreAllMocks();
});

describe('the month’s lanes', () => {
  const week = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];

  it('holds as many lanes as its row’s height has room for, the last one inside its line', () => {
    expect(lanesFor(96)).toBe(2);
    expect(lanesFor(104)).toBe(3);
    expect(lanesFor(140)).toBe(4);
    expect(lanesFor(40)).toBe(1);
  });

  it('shows every bar while they fit, and gives a crowded day’s last lane to « +N »', () => {
    const three = [occurrence('a', week[0]!), occurrence('b', week[0]!, week[0], 10), occurrence('c', week[0]!, week[0], 11)];
    const fits = fitBars(three, week, 3);
    expect(fits.bars).toHaveLength(3);
    expect(fits.hidden[0]).toBe(0);

    const four = [...three, occurrence('d', week[0]!, week[0], 12)];
    const crowded = fitBars(four, week, 3);
    expect(crowded.bars.map(bar => bar.lane)).toEqual([0, 1]);
    expect(crowded.hidden[0]).toBe(2);
  });

  it('takes a bar across several days out of the last lane on all of them, each counting it', () => {
    // Two bars from Monday to Tuesday, then one from Tuesday to Thursday in the last lane; Tuesday holds one more.
    const items = [occurrence('m1', week[0]!, week[1]!), occurrence('m2', week[0]!, week[1]!), occurrence('long', week[1]!, week[3]!), occurrence('t', week[1]!, week[1], 9)];
    const row = fitBars(items, week, 3);
    expect(row.bars.map(bar => bar.occurrence.key)).toEqual(['m1', 'm2']);
    expect(row.hidden.slice(0, 5)).toEqual([0, 2, 1, 1, 0]);
  });
});

describe('the views on a phone-sized window', () => {
  it('shows the month’s titles, not their times, under 720px (the time still read out)', async () => {
    const day = today();
    addEvent({ ...blankDraft(`${day}T09:30`, `${day}T10:00`, deviceZone()), title: 'Kiné' });
    open(`/agenda/month/${day}`);
    const wide = render(<App />);
    expect((await screen.findByRole('button', { name: /^Kiné, / })).textContent).toBe('09:30Kiné');
    wide.unmount();

    phoneSized();
    open(`/agenda/month/${day}`);
    render(<App />);
    const chip = await screen.findByRole('button', { name: /^Kiné, / });
    expect(chip.textContent).toBe('Kiné');
    expect(chip.getAttribute('aria-label')).toContain('09:30');
  });

  it('puts the planning’s time and place under each title, and lays back what is over', async () => {
    phoneSized();
    const day = today();
    const yesterday = addDays(day, -1);
    addEvent({ ...blankDraft(`${yesterday}T09:00`, `${yesterday}T10:00`, deviceZone()), title: 'Bilan', place: 'Salle B' });
    addEvent({ ...blankDraft(`${addDays(day, 1)}T14:00`, `${addDays(day, 1)}T15:00`, deviceZone()), title: 'Atelier' });
    open(`/agenda/schedule/${yesterday}`);
    render(<App />);
    const over = (await screen.findByText('Bilan')).closest('button')!;
    expect(within(over).getByText('09:00 – 10:00 · Salle B')).toBeInTheDocument();
    expect(over).toHaveAttribute('data-over');
    const coming = screen.getByText('Atelier').closest('button')!;
    expect(within(coming).getByText('14:00 – 15:00')).toBeInTheDocument();
    expect(coming).not.toHaveAttribute('data-over');
    // Its day read as one reads it: « lun. 16 nov. ».
    expect(screen.getAllByRole('region')[0]!.getAttribute('aria-label')).toMatch(/^[A-Z]\p{L}+ \d+\s\p{L}+ \d{4}$/u);
  });
});

describe('the colour key', () => {
  it('marks « Mes événements » in the colour its uncoloured events wear: Réglages’ pigment, never the accent', async () => {
    const day = today();
    addEvent({ ...blankDraft(`${day}T09:30`, `${day}T10:00`, deviceZone()), title: 'Sans couleur' });
    open(`/agenda/week/${day}`);
    render(<App />);
    const chip = await screen.findByRole('button', { name: /^Sans couleur, / });
    const stone = screen.getByRole('checkbox', { name: 'Mes événements' }).firstElementChild!;
    // Both wear « Couleur de vos événements », blue until Réglages say otherwise.
    expect(chip).toHaveAttribute('data-line', 'blue');
    expect(stone).toHaveAttribute('data-line', 'blue');
    expect(stone).toHaveAttribute('data-checked');
    act(() => savePrefs({ ownColor: 'green' }));
    expect(screen.getByRole('button', { name: /^Sans couleur, / })).toHaveAttribute('data-line', 'green');
    expect(screen.getByRole('checkbox', { name: 'Mes événements' }).firstElementChild).toHaveAttribute('data-line', 'green');
    // The device's choice is kept: given back for the tests after this one.
    act(() => savePrefs({ ownColor: 'blue' }));
  });
});
