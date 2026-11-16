/**
 * The days of the week the week and the month show: with « Jours travaillés seulement » (the pref
 * `hideWeekends`) the days the person works, as the server last said (Agenda's Administration,
 * « Votre semaine »); null for all seven (`shownWeekdays`: none worked, or all seven, shows every day).
 */
import { useMemo } from 'react';

import { shownWeekdays } from '@unlease/calendar/services/eventText';
import { selectWorkDays, useSettingsStore } from '@shared/app/store/settingsStore';

import { selectPrefs, useCalendarUiStore } from '../store/calendarUi';

export function useShownWeekdays(): readonly number[] | null {
  const workingDaysOnly = useCalendarUiStore(s => selectPrefs(s).hideWeekends);
  const workDays = useSettingsStore(selectWorkDays);
  return useMemo(() => shownWeekdays(workingDaysOnly, workDays), [workingDaysOnly, workDays]);
}
