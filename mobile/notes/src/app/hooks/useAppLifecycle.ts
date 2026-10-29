/** Sync only in the foreground: a long-poll held in the background keeps the radio awake. Leaving still sends what was just written. */
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { selectServer, useSettingsStore } from '../store/settingsStore';
import { pauseSync, startSync, stopSync } from '../sync/syncManager';

export function useAppLifecycle(onForeground?: () => void): void {
  const server = useSettingsStore(selectServer);

  useEffect(() => {
    if (AppState.currentState === 'active') startSync();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        startSync();
        onForeground?.();
      } else if (state === 'background') {
        pauseSync().catch(() => undefined);
      }
    });
    return () => {
      subscription.remove();
      stopSync();
    };
    // Restart when the server settings change.
  }, [server, onForeground]);
}
