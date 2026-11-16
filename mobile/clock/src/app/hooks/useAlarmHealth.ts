import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { health, type AlarmHealth } from '@platform/alarmEngine';

/** What may keep this phone's alarms from ringing as they should, read again each time the app comes back to the front (it changes in Android's settings). */
export function useAlarmHealth(): AlarmHealth | null {
  const [state, setState] = useState<AlarmHealth | null>(null);
  const refresh = useCallback(() => {
    health().then(setState, () => setState(null));
  }, []);
  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener('change', next => next === 'active' && refresh());
    return () => subscription.remove();
  }, [refresh]);
  return state;
}
