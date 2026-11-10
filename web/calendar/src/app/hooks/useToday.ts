/** Today on this device, and the minute it is, re-rendering every minute (the now line, « Aujourd'hui »). */
import { instantToDay } from '@unlease/calendar/services/time';

import { useMinute } from '@shared/app/hooks/useMinute';

export function useNow(): { readonly now: number; readonly today: string } {
  const now = useMinute();
  return { now, today: instantToDay(now) };
}
