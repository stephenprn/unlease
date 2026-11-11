/**
 * The launcher's shortcuts (res/xml/shortcuts.xml) open `unlease-agenda://` links: a new event, quick
 * add, today, the search.
 */
import type { NavigationState, PartialState } from '@react-navigation/native';

import { linking } from '@ui/navigation/RootNavigator';

function leaf(state: PartialState<NavigationState> | NavigationState | undefined): { name: string; params?: object } | undefined {
  const route = state?.routes[state.index ?? state.routes.length - 1];
  return route?.state ? leaf(route.state) : (route as { name: string; params?: object } | undefined);
}

const opened = (path: string) => leaf(linking.getStateFromPath!(path, linking.config));

describe('the launcher’s shortcuts', () => {
  it('open a new event, quick add, today and the search', () => {
    expect(opened('new')).toMatchObject({ name: 'Edit' });
    expect(opened('quick')).toMatchObject({ name: 'Calendar', params: { capture: 'quick' } });
    expect(opened('today')).toMatchObject({ name: 'Calendar', params: { view: 'today' } });
    expect(opened('search')).toMatchObject({ name: 'Search' });
  });
});
