/**
 * Pulling a home's list down asks for a sync, in every app and every view: the spinner turns in the
 * focus ink on paper for a moment (a sync answers in the background; its line says what came of it).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl } from 'react-native';

import { requestSync } from '@shared/app/sync/syncManager';

import { useTheme } from '../theme/ThemeProvider';

/** How long the spinner turns: long enough to be seen, never a wait on the sync itself. */
export const PULL_SPIN_MS = 900;

/** The `RefreshControl` element for a scroller's `refreshControl`, themed as every list's. */
export function usePullToSync(): React.ReactElement<React.ComponentProps<typeof RefreshControl>> {
  const theme = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    requestSync();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setRefreshing(false), PULL_SPIN_MS);
  }, []);
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.color.focus]} progressBackgroundColor={theme.color.paper} />;
}
