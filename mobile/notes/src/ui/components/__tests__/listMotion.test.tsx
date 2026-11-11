/**
 * The lists' shared pieces: what arrives while a list is shown (`useArrivals`) and the pull that asks
 * for a sync (`usePullToSync`), the same in every app.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { requestSync } from '@shared/app/sync/syncManager';

import { useArrivals } from '@shared/ui/components/useArrivals';
import { PULL_SPIN_MS, usePullToSync } from '@shared/ui/components/usePullToSync';

jest.mock('@shared/app/sync/syncManager', () => ({ requestSync: jest.fn() }));

let seen: ReadonlySet<string> = new Set();
function Arrivals({ keys, scope }: { keys: readonly string[]; scope?: string }) {
  seen = useArrivals(keys, scope);
  return null;
}

let pull: ReturnType<typeof usePullToSync> | null = null;
function Pull() {
  pull = usePullToSync();
  return null;
}

describe('useArrivals', () => {
  let renderer: ReactTestRenderer;
  afterEach(() => act(() => renderer.unmount()));

  it('shows a list as it opens without arrivals, then names what comes in while it is shown', () => {
    act(() => {
      renderer = create(<Arrivals keys={['a', 'b']} scope="all" />);
    });
    expect([...seen]).toEqual([]);
    act(() => renderer.update(<Arrivals keys={['a', 'c', 'b']} scope="all" />));
    expect([...seen]).toEqual(['c']);
    // The same list shown again keeps what it said; one gone arrives nowhere.
    act(() => renderer.update(<Arrivals keys={['a', 'c']} scope="all" />));
    expect([...seen]).toEqual([]);
  });

  it('shows another list whole: a new scope has no arrivals', () => {
    act(() => {
      renderer = create(<Arrivals keys={['a']} scope="all" />);
    });
    act(() => renderer.update(<Arrivals keys={['a', 'z']} scope="label:x" />));
    expect([...seen]).toEqual([]);
  });
});

describe('usePullToSync', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('asks for a sync and turns its spinner for a moment', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<Pull />);
    });
    expect(pull?.props.refreshing).toBe(false);
    act(() => {
      void pull?.props.onRefresh?.();
    });
    expect(requestSync).toHaveBeenCalledTimes(1);
    expect(pull?.props.refreshing).toBe(true);
    act(() => jest.advanceTimersByTime(PULL_SPIN_MS));
    expect(pull?.props.refreshing).toBe(false);
    act(() => renderer.unmount());
  });
});
