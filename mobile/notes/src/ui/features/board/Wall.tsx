/**
 * The tile wall, virtualised without measuring: boxes are computed up front (`layoutWall`).
 * The scroll offset is bucketed, and only a change of bucket re-renders the list.
 */
import React, { memo, useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Keyframe, LayoutAnimationConfig, LinearTransition } from 'react-native-reanimated';

import type { WallMetrics } from '@unlease/notes/services/wall';
import type { BoardSections } from '@app/hooks/useBoard';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText } from '../../components';
import { accelerate, decelerate, duration, standard } from '../../theme/motion';
import { useTheme } from '../../theme/ThemeProvider';
import { NoteCard } from './NoteCard';
import { SwipeToArchive } from './SwipeToArchive';
import { layoutWall, PAGE_PADDING, SECTION_HEIGHT } from './wallLayout';

const BUCKET = 480;

/** When a card leaves (archived) or comes back (undone), the others slide to their new place. */
const REFLOW = LinearTransition.duration(duration.medium).easing(standard);
/** A card new to the wall (back from the archive, a view just opened) settles in once the others have made room. */
const CARD_IN = new Keyframe({ 0: { opacity: 0, transform: [{ scale: 0.94 }] }, 100: { opacity: 1, transform: [{ scale: 1 }], easing: decelerate } }).duration(200).delay(120);
/** A card taken off the wall without a swipe (archived or binned from the selection) fades where it was. Off-screen cards dropped by the window go the same way, unseen. */
const CARD_OUT = new Keyframe({ 0: { opacity: 1, transform: [{ scale: 1 }] }, 100: { opacity: 0, transform: [{ scale: 0.96 }], easing: accelerate } }).duration(duration.short);
const NO_ARRIVALS: ReadonlySet<string> = new Set();

export interface WallProps {
  readonly sections: BoardSections['sections'];
  readonly metrics: WallMetrics;
  readonly columns: number;
  readonly query: string;
  readonly selection: ReadonlySet<string>;
  readonly onPress: (id: string) => void;
  readonly onLongPress: (id: string) => void;
  readonly header?: React.ReactNode;
  readonly footerSpace: number;
  readonly refreshing: boolean;
  readonly onRefresh?: () => void;
  /** A card swiped off the board; absent, cards do not swipe. */
  readonly onSwipe?: (id: string) => void;
  readonly canSwipe?: (id: string) => boolean;
}

function WallComponent({ sections, metrics, columns, query, selection, onPress, onLongPress, header, footerSpace, refreshing, onRefresh, onSwipe, canSwipe }: WallProps) {
  const theme = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const [bucket, setBucket] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  // The layout reads the whole library, so it follows its revision.
  const revision = useLibraryStore(s => s.revision);
  const layout = useMemo(
    () => layoutWall(sections, useLibraryStore.getState(), metrics, columns),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections, metrics, columns, revision],
  );

  // Cards that were not on the last layout arrive; the first layout and cards scrolled into the window do not.
  const ids = useMemo(() => new Set(layout.items.flatMap(item => (item.kind === 'card' ? [item.id] : []))), [layout]);
  const [seen, setSeen] = useState({ ids, arrived: NO_ARRIVALS });
  if (seen.ids !== ids) setSeen({ ids, arrived: new Set([...ids].filter(id => !seen.ids.has(id))) });
  const arrived = seen.ids === ids ? seen.arrived : NO_ARRIVALS;

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.floor(event.nativeEvent.contentOffset.y / BUCKET);
    setBucket(current => (current === next ? current : next));
  }, []);

  const top = bucket * BUCKET - headerHeight - windowHeight;
  const bottom = bucket * BUCKET - headerHeight + windowHeight * 2.5;
  const visible = layout.items.filter(item =>
    item.kind === 'section' ? item.top + SECTION_HEIGHT > top && item.top < bottom : item.top + item.height > top && item.top < bottom,
  );

  // Cards fade out only when they leave a wall that stays: a wall replaced whole (the view emptied) just goes,
  // or its fading cards would hold its old place in the screen while the new content and any closing dialog draw.
  return (
    <LayoutAnimationConfig skipExiting>
      <ScrollView
        onScroll={onScroll}
        scrollEventThrottle={32}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.color.focus]} progressBackgroundColor={theme.color.paper} />
          ) : undefined
        }
      >
        <View onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)}>{header}</View>
        <View style={{ height: layout.height + footerSpace }}>
          {visible.map(item =>
            item.kind === 'section' ? (
              <View key={item.key} style={[styles.section, { top: item.top }]}>
                <AppText variant="section" accessibilityRole="header">
                  {item.title}
                </AppText>
              </View>
            ) : (
              <SwipeToArchive
                key={item.key}
                id={item.id}
                width={item.width}
                enabled={!!onSwipe && (canSwipe?.(item.id) ?? true)}
                onSwiped={onSwipe ?? noop}
                style={[styles.slot, { top: item.top, left: item.left }]}
                layout={REFLOW}
                entering={arrived.has(item.id) ? CARD_IN : undefined}
                exiting={CARD_OUT}
              >
                <NoteCard
                  id={item.id}
                  width={item.width}
                  height={item.height}
                  metrics={metrics}
                  query={query}
                  selected={selection.has(item.id)}
                  onPress={onPress}
                  onLongPress={onLongPress}
                />
              </SwipeToArchive>
            ),
          )}
        </View>
      </ScrollView>
    </LayoutAnimationConfig>
  );
}

const noop = () => {};

const styles = StyleSheet.create({
  section: { position: 'absolute', left: PAGE_PADDING + 4, right: PAGE_PADDING, height: SECTION_HEIGHT, justifyContent: 'center' },
  slot: { position: 'absolute' },
});

export const Wall = memo(WallComponent);
