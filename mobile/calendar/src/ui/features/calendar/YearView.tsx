/** The year: its twelve months as small grids, the days holding something dotted; a day opens it, a month's name the month. */
import React, { memo, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addDays, dayKey } from '@unlease/calendar/services/time';
import { itemDay } from '@app/agenda';
import { useAgenda } from '@app/hooks/useAgenda';

import { FAB_CLEARANCE } from '@shared/ui/components';
import { MiniMonth } from './MiniMonth';

export interface YearViewProps {
  readonly year: number;
  readonly today: string;
  readonly weekStart: number;
  readonly labelId: string | null;
  readonly onDay: (day: string) => void;
  readonly onMonth: (month: string) => void;
}

function YearViewComponent({ year, today, weekStart, labelId, onDay, onMonth }: YearViewProps) {
  const insets = useSafeAreaInsets();
  const first = dayKey(year, 1, 1);
  const agenda = useAgenda(first, dayKey(year + 1, 1, 1), labelId);
  const marked = useMemo(() => {
    const out = new Set<string>();
    for (const item of agenda.occurrences) for (let day = item.firstDay; day <= item.lastDay && out.size < 4000; day = addDays(day, 1)) out.add(day);
    for (const item of agenda.extras) out.add(itemDay({ ...item }));
    return out;
  }, [agenda]);
  return (
    <ScrollView contentContainerStyle={[styles.grid, { paddingBottom: FAB_CLEARANCE + insets.bottom }]}>
      {Array.from({ length: 12 }, (_, index) => {
        const month = dayKey(year, index + 1, 1);
        return (
          <View key={month} style={styles.month}>
            <MiniMonth month={month} weekStart={weekStart} today={today} marked={marked} onDay={onDay} titled onTitle={() => onMonth(month)} cell={22} />
          </View>
        );
      })}
    </ScrollView>
  );
}

export const YearView = memo(YearViewComponent);

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', paddingHorizontal: 4, paddingTop: 8, gap: 12 },
  month: { width: 170 },
});
