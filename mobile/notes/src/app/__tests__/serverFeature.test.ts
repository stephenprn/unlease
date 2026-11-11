/** `useServerFeature` as a screen reads it: nothing before the server says, then what it says, at once. */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { parseServerSettings } from '@unlease/core/sync/settings';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { useServerFeature, useServerFeatureState } from '@shared/app/hooks/useServerFeature';
import { loadSettings, rememberServerSettings, setReading, setServer } from '@shared/app/store/settingsStore';

beforeEach(() => {
  closeDatabase();
  openDatabase({ name: 'feature.sqlite' });
  loadSettings();
});

it('shows an entry only once the server said its service is on', () => {
  const seen: string[] = [];
  function Probe(): null {
    seen.push(`${useServerFeature('claude') ? 'on' : 'off'} ${useServerFeatureState('backup')}`);
    return null;
  }
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(createElement(Probe));
  });
  expect(seen.at(-1)).toBe('off off');
  act(() => setServer({ url: 'https://unlease.example.org', token: 'jeton' }));
  expect(seen.at(-1)).toBe('off unknown');
  act(() => rememberServerSettings(parseServerSettings({ analysis: { enabled: true }, backup: { configured: false } })!));
  expect(seen.at(-1)).toBe('on off');
  act(() => setReading(false));
  expect(seen.at(-1)).toBe('off off');
  act(() => tree?.unmount());
});
