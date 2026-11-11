/** The navigator, reachable from outside any screen (the shared cards, the widgets). */
import { createNavigationContainerRef, StackActions } from '@react-navigation/native';

import type { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigate<K extends keyof RootStackParamList>(...args: undefined extends RootStackParamList[K] ? [screen: K, params?: RootStackParamList[K]] : [screen: K, params: RootStackParamList[K]]): void {
  if (!navigationRef.isReady()) return;
  // The overload spread keeps the params typed per screen.
  (navigationRef.navigate as (...a: unknown[]) => void)(...args);
}

/** A screen opened anew on top, even over one of its kind (another app's new contact over a form being typed, which stays under it). */
export function push<K extends keyof RootStackParamList>(screen: K, params: RootStackParamList[K]): void {
  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(StackActions.push(screen, params));
}
