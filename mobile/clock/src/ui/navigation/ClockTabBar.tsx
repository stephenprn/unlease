/**
 * Clock's four places at the screen's foot (the suite's `TabBar`, as Google's Clock and Apple's keep
 * them): « Alarmes », « Minuteurs », « Chronomètre », « Horloges ». A place where something runs (a
 * timer, the stopwatch) wears a small dot in link ink, a timer ringing a dot in the accent: what counts
 * is never out of sight.
 */
import React, { memo } from 'react';

import { t } from '@unlease/core/i18n';
import type { GlyphName } from '@unlease/design/glyphs';
import { TabBar, TAB_BAR_HEIGHT } from '@shared/ui/components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

export { TAB_BAR_HEIGHT };

export type ClockTab = 'alarms' | 'timers' | 'stopwatch' | 'world';

export const CLOCK_TABS: readonly ClockTab[] = ['alarms', 'timers', 'stopwatch', 'world'];

const GLYPHS: Readonly<Record<ClockTab, GlyphName>> = { alarms: 'alarm', timers: 'timer', stopwatch: 'stopwatch', world: 'globe' };

export const tabName = (tab: ClockTab): string => {
  switch (tab) {
    case 'alarms':
      return t('Alarms');
    case 'timers':
      return t('Timers');
    case 'stopwatch':
      return t('Stopwatch');
    case 'world':
      return t('World clocks');
  }
};

/** A place's state the bar shows: something under way there, or a timer ringing. */
export type TabMark = 'running' | 'ringing' | null;

interface Props {
  readonly tab: ClockTab;
  readonly marks: Readonly<Partial<Record<ClockTab, TabMark>>>;
  readonly onTab: (tab: ClockTab) => void;
}

function ClockTabBarComponent({ tab, marks, onTab }: Props) {
  const theme = useTheme();
  const places = CLOCK_TABS.map(each => {
    const mark = marks[each] ?? null;
    return {
      key: each,
      icon: GLYPHS[each],
      name: tabName(each),
      dot: mark === 'ringing' ? theme.color.action : mark === 'running' ? theme.color.link : null,
      state: mark === 'ringing' ? t('Ringing') : t('Under way'),
    };
  });
  return <TabBar places={places} chosen={tab} onChoose={onTab} />;
}

export const ClockTabBar = memo(ClockTabBarComponent);
