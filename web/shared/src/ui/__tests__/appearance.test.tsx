import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_APPEARANCE, groundBackground, groundPaint, PALETTE_COLORS, primaryRoles } from '@unlease/design/appearance';
import { ROLES } from '@unlease/design/palette';

import { getDeviceName } from '../../app/env';
import { applyLookTo, followSettingsElsewhere, loadSettings, lookKey, resetSettings, setAppearance, setOnboarded, setTheme, useSettingsStore } from '../../app/store/settings';
import { setLookShareOpen, useUiStore } from '../../app/store/ui';
import { applyAppearance, appearanceVariables, APPEARANCE_PROPERTIES } from '../appearanceStyle';
import { ColorsSection, GroundSection } from '../features/appearance/AppearanceSections';
import { LookShareDialog } from '../features/appearance/LookShareDialog';

const root = (): HTMLElement => document.documentElement;

describe('the appearance on the page', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSettings();
    for (const name of APPEARANCE_PROPERTIES) root().style.removeProperty(name);
    delete root().dataset.groundGrain;
  });

  it('gives Carnet’s own values for the default, as the stylesheet does', () => {
    const light = appearanceVariables(DEFAULT_APPEARANCE, 'light');
    expect(light['--focus']).toBe(ROLES.light.focus);
    expect(light['--action']).toBe(ROLES.light.action);
    expect(light['--ground-layers']).toBe('linear-gradient(180deg, #F4F0E2 0%, #E8D9B5 100%) fixed #EDE8D0');
    expect(appearanceVariables(DEFAULT_APPEARANCE, 'dark')['--leaf']).toBe(ROLES.dark.leaf);
  });

  it('lays another look through the CSSOM for the theme on screen, and takes it back for Carnet’s own', () => {
    const teal = { ...DEFAULT_APPEARANCE, ...PALETTE_COLORS.sarcelle, ground: { kind: 'preset', key: 'lagon' } as const, grain: false };
    applyAppearance(teal, 'dark');
    expect(root().style.getPropertyValue('--leaf')).toBe(primaryRoles(PALETTE_COLORS.sarcelle.primary, 'dark', groundPaint(teal.ground, 'dark').colors).leaf);
    expect(root().style.getPropertyValue('--ground-layers')).toBe(groundBackground(groundPaint(teal.ground, 'dark')));
    expect(root().dataset.groundGrain).toBe('off');
    applyAppearance(DEFAULT_APPEARANCE, 'light');
    expect(root().style.getPropertyValue('--leaf')).toBe('');
    expect(root().dataset.groundGrain).toBeUndefined();
  });

  it('reads the old single grain switch as the ground’s too, and keeps a look across a reload', () => {
    localStorage.setItem('unlease.settings', JSON.stringify({ grain: false, locale: 'fr' }));
    loadSettings();
    expect(useSettingsStore.getState()).toMatchObject({ grain: false, appearance: { ...DEFAULT_APPEARANCE, grain: false } });
    setAppearance({ ...DEFAULT_APPEARANCE, ...PALETTE_COLORS.pivoine });
    resetSettings();
    loadSettings();
    expect(useSettingsStore.getState().appearance).toMatchObject(PALETTE_COLORS.pivoine);
  });
});

describe('the colours and the ground in Réglages', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSettings();
  });

  it('chooses a pair and a ground at once, each a radio among its own', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ColorsSection />
        <GroundSection />
      </>,
    );
    const pairs = screen.getByRole('radiogroup', { name: 'Palettes' });
    expect(within(pairs).getByRole('radio', { name: 'Carnet' })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(pairs).getByRole('radio', { name: 'Myrtille' }));
    expect(useSettingsStore.getState().appearance).toMatchObject(PALETTE_COLORS.myrtille);
    await user.click(screen.getByRole('radio', { name: 'Ciel' }));
    expect(useSettingsStore.getState().appearance.ground).toEqual({ kind: 'preset', key: 'ciel' });
    await user.click(screen.getByRole('switch', { name: /Grain sur le fond/ }));
    expect(useSettingsStore.getState().appearance.grain).toBe(false);
  });

  it('picks a colour of one’s own by its code, fitted for the night, and keeps it among one’s own', async () => {
    const user = userEvent.setup();
    render(<GroundSection />);
    await user.click(screen.getByRole('button', { name: 'Couleur…' }));
    const field = await screen.findByRole('textbox', { name: 'Code hexadécimal' });
    await user.clear(field);
    await user.type(field, '#f2e6ff');
    // Pale lavender reads by day as it is; at night it deepens.
    expect(screen.getByText('Ajustée la nuit pour rester lisible.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Choisir' }));
    expect(useSettingsStore.getState().appearance).toMatchObject({ ground: { kind: 'color', color: '#F2E6FF' }, ownColor: '#F2E6FF' });
    expect(await screen.findByRole('radio', { name: 'Votre couleur' })).toHaveAttribute('aria-checked', 'true');
  });

  it('asks before a colour moved is dropped by Escape, and keeps it to go on', async () => {
    const user = userEvent.setup();
    render(<ColorsSection />);
    await user.click(screen.getByRole('button', { name: /^Couleur principale/ }));
    const field = await screen.findByRole('textbox', { name: 'Code hexadécimal' });
    await user.clear(field);
    await user.type(field, '#3366aa');
    await user.keyboard('{Escape}');
    const ask = await screen.findByRole('alertdialog', { name: 'Abandonner les modifications ?' });
    await user.click(within(ask).getByRole('button', { name: 'Continuer à modifier' }));
    expect(screen.getByRole('textbox', { name: 'Code hexadécimal' })).toHaveValue('#3366AA');
    await user.keyboard('{Escape}');
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Abandonner les modifications ?' })).getByRole('button', { name: 'Abandonner' }));
    expect(useSettingsStore.getState().appearance.primary).toBe(DEFAULT_APPEARANCE.primary);
  });

  it('refuses a code that is none, and keeps the colour it had', async () => {
    const user = userEvent.setup();
    render(<ColorsSection />);
    await user.click(screen.getByRole('button', { name: /^Couleur principale/ }));
    const field = await screen.findByRole('textbox', { name: 'Code hexadécimal' });
    await user.clear(field);
    await user.type(field, '#12{Enter}');
    // Said under the field, which the reader is pointed to (`aria-describedby`), never a lone colour.
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('Un code de six chiffres, comme #9CC15F.');
    expect(useSettingsStore.getState().appearance.primary).toBe(DEFAULT_APPEARANCE.primary);
  });
});

describe('each app’s look', () => {
  const shared = (): Record<string, unknown> => JSON.parse(localStorage.getItem(`${getDeviceName()}.settings`) ?? '{}') as Record<string, unknown>;
  const own = (app: 'notes' | 'pages' | 'calendar' | 'contacts'): Record<string, unknown> | null => JSON.parse(localStorage.getItem(lookKey(app)) ?? 'null') as Record<string, unknown> | null;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(`${getDeviceName()}.settings`, JSON.stringify({ locale: 'fr' }));
    resetSettings();
    loadSettings();
  });

  it('is the suite’s on the first run, then this app’s own once set up, its grain the suite’s', () => {
    setAppearance({ ...DEFAULT_APPEARANCE, ...PALETTE_COLORS.pivoine });
    expect(shared()).toMatchObject({ appearance: PALETTE_COLORS.pivoine });
    expect(own('notes')).toBeNull();
    setOnboarded();
    setTheme('dark');
    setAppearance({ ...useSettingsStore.getState().appearance, ...PALETTE_COLORS.sarcelle, grain: false });
    expect(own('notes')).toMatchObject({ theme: 'dark', appearance: PALETTE_COLORS.sarcelle });
    // The suite's stays the first run's, but for the ground's grain, which is every app's.
    expect(shared()).toMatchObject({ theme: 'system', appearance: { ...PALETTE_COLORS.pivoine, grain: false } });
    resetSettings();
    loadSettings();
    expect(useSettingsStore.getState()).toMatchObject({ theme: 'dark', appearance: { ...PALETTE_COLORS.sarcelle, grain: false } });
  });

  it('goes into the other apps’ own on « Appliquer », and an open tab of this one follows a look sent to it', () => {
    setOnboarded();
    setTheme('dark');
    applyLookTo(['pages', 'contacts']);
    expect(own('pages')).toMatchObject({ theme: 'dark' });
    expect(own('contacts')).toMatchObject({ theme: 'dark' });
    expect(own('calendar')).toBeNull();
    const stop = followSettingsElsewhere();
    try {
      localStorage.setItem(lookKey('notes'), JSON.stringify({ theme: 'light', appearance: { ...DEFAULT_APPEARANCE, ...PALETTE_COLORS.myrtille } }));
      act(() => void window.dispatchEvent(new StorageEvent('storage', { key: lookKey('notes') })));
      expect(useSettingsStore.getState()).toMatchObject({ theme: 'light', appearance: PALETTE_COLORS.myrtille });
    } finally {
      stop();
    }
  });

  it('asks which apps take it, all ticked, and writes it into those kept', async () => {
    const user = userEvent.setup();
    setOnboarded();
    setTheme('dark');
    render(<LookShareDialog />);
    act(() => setLookShareOpen(true));
    const dialog = await screen.findByRole('dialog', { name: 'Appliquer cette apparence' });
    const boxes = within(dialog).getAllByRole('checkbox');
    expect(boxes.map(box => [box.textContent, box.getAttribute('aria-checked')])).toEqual([
      ['Pages', 'true'],
      ['Agenda', 'true'],
      ['Contacts', 'true'],
    ]);
    await user.click(within(dialog).getByRole('checkbox', { name: 'Agenda' }));
    await user.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    expect(own('pages')).toMatchObject({ theme: 'dark' });
    expect(own('contacts')).toMatchObject({ theme: 'dark' });
    expect(own('calendar')).toBeNull();
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Pages et Contacts prendront cette apparence à leur prochaine ouverture.', tone: 'success' });
  });
});
