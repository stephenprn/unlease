/**
 * « Planning »: the days ahead from the day shown, those holding something (and today), each under
 * its heading, which stays at the top while its day scrolls. Reaching the end reads two more months.
 */
import React, { memo, useMemo, useRef, useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@unlease/core/i18n';
import { dayDistance, longDay } from '@unlease/calendar/services/eventText';
import { addDays } from '@unlease/calendar/services/time';
import { itemsOn, type AgendaItem } from '@app/agenda';
import { useAgenda } from '@app/hooks/useAgenda';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText, EmptyState, FAB_CLEARANCE, GroundSlice } from '@shared/ui/components';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { AgendaRow } from './AgendaRow';
import { ITEM_IN, useArrivals } from './arrivals';

const STEP_DAYS = 60;

/** A row counts as shown once a little of it is (the day at the top is the first shown). */
const VIEWABILITY = { itemVisiblePercentThreshold: 1 } as const;

export interface ScheduleViewProps {
  readonly from: string;
  readonly today: string;
  readonly labelId: string | null;
  readonly twelveHours: boolean;
  readonly onOpen: (item: AgendaItem, day: string) => void;
}

function ScheduleViewComponent({ from, today, labelId, twelveHours, onOpen }: ScheduleViewProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [span, setSpan] = useState(STEP_DAYS);
  const to = addDays(from, span);
  const agenda = useAgenda(from, to, labelId);
  const sections = useMemo(() => {
    const state = useLibraryStore.getState();
    const out: { day: string; data: AgendaItem[] }[] = [];
    for (let day = from; day < to; day = addDays(day, 1)) {
      const items = itemsOn(state, agenda, day);
      if (items.length > 0 || day === today) out.push({ day, data: items });
    }
    return out;
  }, [agenda, from, to, today]);

  // What is made, brought back or moved into the days read settles in; the list opened, filtered or read further just shows.
  const arrived = useArrivals(
    sections.flatMap(section => section.data.map(item => `${item.key}@${section.day}`)),
    `${from}:${span}:${labelId ?? ''}`,
  );

  // The day pinned at the top lies on the ground's slice there; the others on the ground itself.
  const [top, setTop] = useState<string | null>(null);
  const [listTop, setListTop] = useState(0);
  const box = useRef<React.ComponentRef<typeof View>>(null);
  const onViewable = useRef(({ viewableItems }: { viewableItems: readonly { readonly section?: { readonly day: string } }[] }) => {
    const first = viewableItems[0];
    setTop(first?.section?.day ?? null);
  }).current;

  return (
    <View ref={box} style={styles.fill} onLayout={() => box.current?.measureInWindow((_x, y) => setListTop(y))}>
    <SectionList
      sections={sections}
      viewabilityConfig={VIEWABILITY}
      onViewableItemsChanged={onViewable}
      keyExtractor={(item, index) => `${item.key}#${index}`}
      stickySectionHeadersEnabled
      // Android's default clipping, with sticky days coming and going (a label chosen, two more months read), makes Fabric insert a view out of range (« addViewAt » crash).
      removeClippedSubviews={false}
      initialNumToRender={20}
      contentContainerStyle={{ paddingBottom: FAB_CLEARANCE + insets.bottom }}
      onEndReachedThreshold={0.5}
      onEndReached={() => setSpan(value => Math.min(value + STEP_DAYS, 730))}
      renderSectionHeader={({ section }) => (
        <View style={styles.heading}>
          {section.day === top ? <GroundSlice top={listTop} /> : null}
          <AppText variant="labelStrong" color={section.day === today ? theme.color.link : theme.color.ink}>
            {longDay(section.day)}
          </AppText>
          <AppText variant="meta">{dayDistance(section.day, today)}</AppText>
        </View>
      )}
      renderItem={({ item, section }) => (
        <Animated.View entering={arrived.has(`${item.key}@${section.day}`) ? ITEM_IN : undefined}>
          <AgendaRow item={item} day={section.day} twelveHours={twelveHours} onOpen={each => onOpen(each, section.day)} />
        </Animated.View>
      )}
      renderSectionFooter={({ section }) =>
        section.data.length === 0 ? (
          <AppText variant="meta" style={styles.none}>
            {t('Rien de prévu')}
          </AppText>
        ) : null
      }
      ItemSeparatorComponent={Gap}
      ListEmptyComponent={<EmptyState scene="reminders" title={t('Rien de prévu')} text={t('Aucun événement sur ces jours. Le bouton +, en bas, en ajoute un.')} />}
    />
    </View>
  );
}

function Gap() {
  return <View style={gap.gap} />;
}

const gap = StyleSheet.create({ gap: { height: 6 } });

export const ScheduleView = memo(ScheduleViewComponent);

const makeStyles = (_theme: Theme) =>
  StyleSheet.create({
    fill: { flex: 1 },
    // The day's name on its rows' stripe (a row's 8 in, its 10), its distance on their text's end.
    heading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8 },
    none: { paddingHorizontal: 18, paddingVertical: 8 },
  });
