import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_APPEARANCE, groundBackground, groundPaint, PALETTE_COLORS, primaryRoles } from '@unlease/design/appearance';
import { ROLES } from '@unlease/design/palette';

import { loadSettings, resetSettings, setAppearance, useSettingsStore } from '../../app/store/settings';
import { applyAppearance, appearanceVariables, APPEARANCE_PROPERTIES } from '../appearanceStyle';
import { ColorsSection, GroundSection } from '../features/appearance/AppearanceSections';

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
    localStorage.setItem('carnet.settings', JSON.stringify({ grain: false, locale: 'fr' }));
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

  it('refuses a code that is none, and keeps the colour it had', async () => {
    const user = userEvent.setup();
    render(<ColorsSection />);
    await user.click(screen.getByRole('button', { name: /^Couleur principale/ }));
    const field = await screen.findByRole('textbox', { name: 'Code hexadécimal' });
    await user.clear(field);
    await user.type(field, '#12{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Un code de six chiffres, comme #9CC15F.');
    expect(useSettingsStore.getState().appearance.primary).toBe(DEFAULT_APPEARANCE.primary);
  });
});
