/** The navigator, reachable from outside any screen (a reminder pressed, a shared file). */
import { createNavigationContainerRef, StackActions } from '@react-navigation/native';

import type { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigate<K extends keyof RootStackParamList>(...args: undefined extends RootStackParamList[K] ? [screen: K, params?: RootStackParamList[K]] : [screen: K, params: RootStackParamList[K]]): void {
  if (!navigationRef.isReady()) return;
  // The overload spread keeps the params typed per screen.
  (navigationRef.navigate as (...a: unknown[]) => void)(...args);
}

/** A screen opened anew on top, even over one of its kind (another app's new event over a form being typed, which stays under it). */
export function push<K extends keyof RootStackParamList>(screen: K, params: RootStackParamList[K]): void {
  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(StackActions.push(screen, params));
}

/** Back down to the calendar, the screens over it closed (each asking first when it holds changes), with these params (`merge`: added to its own, a label's events kept). */
export function backToCalendar(params: RootStackParamList['Calendar'], { merge = false }: { readonly merge?: boolean } = {}): void {
  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(StackActions.popTo('Calendar', params, { merge }));
}
