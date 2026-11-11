/** The device's settings: its appearance (what a new phone starts from, the old grain switch carried over, a choice kept), and what the server set up. */
import { DEFAULT_APPEARANCE, PALETTE_COLORS, type Appearance } from '@unlease/design/appearance';
import { parseServerSettings } from '@unlease/core/sync/settings';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { readPreferences, writePreference } from '@shared/data/repositories/stateRepository';

import { hasServerFeature } from '../../hooks/useServerFeature';
import { loadSettings, rememberServerSettings, selectCanRead, selectServerFeature, selectServerFeatureState, setAppearance, setGrain, setReading, setServer, useSettingsStore } from '../settingsStore';

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

  it('remembers when either grain was chosen, for the suite’s other apps (a colour leaves it be)', () => {
    loadSettings();
    expect(state().grainAt).toBe(0);
    setGrain(false);
    const paper = state().grainAt;
    expect(paper).toBeGreaterThan(0);
    setAppearance({ ...state().appearance, ...PALETTE_COLORS.mimosa });
    expect(state().grainAt).toBe(paper);
    setAppearance({ ...state().appearance, grain: false });
    expect(state().grainAt).toBeGreaterThanOrEqual(paper);
    const ground = state().grainAt;
    useSettingsStore.setState({ grainAt: 0 });
    loadSettings();
    expect(state().grainAt).toBe(ground);
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

describe('the server’s optional services (useServerFeature)', () => {
  const settings = (claude: boolean, seerr: string) =>
    parseServerSettings({ analysis: { enabled: claude, keySource: claude ? 'app' : null, keyHint: null, model: 'claude-opus-5-5', budgetUsd: 15 }, backup: { configured: true }, seerr: { url: seerr } })!;
  const server = { url: 'https://unlease.example.org', token: 'jeton' };

  it('counts none as set up without a server, and none as known before the server says', () => {
    loadSettings();
    expect(selectServerFeatureState('claude')(state())).toBe('off');
    setServer(server);
    for (const feature of ['claude', 'backup', 'drive', 'seerr'] as const) {
      expect(selectServerFeatureState(feature)(state())).toBe('unknown');
      expect(selectServerFeature(feature)(state())).toBe(false);
    }
    // A link saved meanwhile still waits for the server to read it.
    expect(selectCanRead(state())).toBe(true);
  });

  it('follows what the server says, remembers it for the next start, and forgets it for another server', () => {
    loadSettings();
    setServer(server);
    rememberServerSettings(settings(true, 'https://seerr.example.org'));
    expect(['claude', 'backup', 'drive', 'seerr'].map(feature => selectServerFeatureState(feature as 'claude')(state()))).toEqual(['on', 'on', 'off', 'on']);
    loadSettings();
    expect(selectServerFeature('claude')(state())).toBe(true);
    expect(selectServerFeature('backup')(state())).toBe(true);
    expect(selectServerFeature('drive')(state())).toBe(false);

    rememberServerSettings(settings(false, ''));
    expect(selectServerFeatureState('claude')(state())).toBe('off');
    expect(selectServerFeatureState('seerr')(state())).toBe('off');

    setServer({ url: 'https://other.example.org', token: 'jeton' });
    expect(selectServerFeatureState('claude')(state())).toBe('unknown');
    expect(selectServerFeatureState('backup')(state())).toBe('unknown');
    setServer(null);
    expect(selectServerFeatureState('backup')(state())).toBe('off');
  });

  it('is asked outside a component too', () => {
    loadSettings();
    setServer(server);
    expect(hasServerFeature('claude')).toBe(false);
    rememberServerSettings(settings(true, ''));
    expect(hasServerFeature('claude')).toBe(true);
    setReading(false);
    expect(hasServerFeature('claude')).toBe(false);
  });
});
