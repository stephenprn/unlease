/** What the server set up of the Administration's optional services, as each web app asks it (`useServerFeature`): known only once it says, remembered, forgotten for another server. */
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { parseServerSettings } from '@unlease/core/sync/settings';

import { freshLibrary } from '../../../../test/library';
import { hasServerFeature, setServerHealth, setServerSettings, useServerFeature, useServerFeatureState } from '../serverSettings';
import { loadSettings, setServer, useSettingsStore } from '../settings';

const SERVER = { url: 'https://unlease.example.org', token: 'jeton' };

const settings = (claude: boolean) =>
  parseServerSettings({ analysis: { enabled: claude, keySource: claude ? 'app' : null, keyHint: null, model: 'claude-opus-5-5', budgetUsd: 15 }, backup: { configured: true }, seerr: { url: '' } })!;

function Probe() {
  const claude = useServerFeature('claude');
  const backup = useServerFeatureState('backup');
  return <p>{`claude ${claude ? 'on' : 'off'}, backup ${backup}`}</p>;
}

beforeEach(async () => {
  await freshLibrary();
});

describe('useServerFeature', () => {
  it('shows nothing without a server, nor before the server has said', () => {
    const view = render(<Probe />);
    expect(view.container.textContent).toBe('claude off, backup off');
    act(() => setServer(SERVER));
    expect(view.container.textContent).toBe('claude off, backup unknown');
    expect(hasServerFeature('claude')).toBe(false);
  });

  it('follows the settings, then the health for Claude, and remembers them for the next visit', () => {
    setServer(SERVER);
    const view = render(<Probe />);
    act(() => setServerSettings(settings(true)));
    expect(view.container.textContent).toBe('claude on, backup on');
    act(() => setServerHealth({ ok: true, analysis: false, version: 'test', apps: ['notes'], setup: true }));
    expect(view.container.textContent).toBe('claude off, backup on');
    act(() => setServerSettings(settings(true)));

    // The next visit, offline: what the server last said.
    useSettingsStore.setState({ serverFeatures: {} });
    act(() => loadSettings());
    expect(view.container.textContent).toBe('claude on, backup on');
  });

  it('forgets what one server said when another is connected', () => {
    setServer(SERVER);
    setServerSettings(settings(true));
    const view = render(<Probe />);
    act(() => setServer({ url: 'https://other.example.org', token: 'jeton' }));
    expect(view.container.textContent).toBe('claude off, backup unknown');
    act(() => setServer(null));
    expect(view.container.textContent).toBe('claude off, backup off');
  });
});
