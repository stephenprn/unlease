/** The navigator, reachable from outside any screen (transfer panel, shares, notifications). */
import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigate<K extends keyof RootStackParamList>(...args: undefined extends RootStackParamList[K] ? [screen: K, params?: RootStackParamList[K]] : [screen: K, params: RootStackParamList[K]]): void {
  if (!navigationRef.isReady()) return;
  // The overload spread keeps the params typed per screen.
  (navigationRef.navigate as (...a: unknown[]) => void)(...args);
}
