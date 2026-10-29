/** The device's appearance in its settings: what a new phone starts from, the old grain switch carried over, a choice kept. */
import { DEFAULT_APPEARANCE, PALETTE_COLORS, type Appearance } from '@unlease/design/appearance';
import { closeDatabase, openDatabase } from '@data/db/database';
import { readPreferences, writePreference } from '@data/repositories/stateRepository';

import { loadSettings, setAppearance, setGrain, useSettingsStore } from '../settingsStore';

const state = () => useSettingsStore.getState();

beforeEach(() => {
  closeDatabase();
  openDatabase({ name: 'settings.sqlite' });
});

describe('the appearance', () => {
  it('starts as Carnet’s own, grainy, on a new phone', () => {
    loadSettings();
    expect(state().appearance).toEqual(DEFAULT_APPEARANCE);
    expect(state().grain).toBe(true);
  });

  it('carries the old single grain switch over to the ground until the ground has its own', () => {
    writePreference('grain', false);
    loadSettings();
    expect(state().grain).toBe(false);
    expect(state().appearance.grain).toBe(false);
    // Each switch on its own from then on.
    setGrain(true);
    loadSettings();
    expect(state().grain).toBe(true);
    expect(state().appearance.grain).toBe(true);
  });

  it('keeps a choice for the next start, and reads a broken one as Carnet’s own', () => {
    loadSettings();
    const chosen: Appearance = { ...DEFAULT_APPEARANCE, ...PALETTE_COLORS.mimosa, ground: { kind: 'preset', key: 'ciel' }, grain: false };
    setAppearance(chosen);
    expect(readPreferences().appearance).toEqual(chosen);
    useSettingsStore.setState({ appearance: DEFAULT_APPEARANCE });
    loadSettings();
    expect(state().appearance).toEqual(chosen);

    writePreference('appearance', { primary: 'vert', ground: { kind: 'gradient', colors: [] } });
    loadSettings();
    expect(state().appearance).toEqual(DEFAULT_APPEARANCE);
  });
});
