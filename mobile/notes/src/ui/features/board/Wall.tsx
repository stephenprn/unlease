/**
 * The tile wall, virtualised without measuring: boxes are computed up front (`layoutWall`).
 * The scroll offset is taken in steps, and only a change of step draws the list again: a row or two
 * of cards come or go at each, never a screenful at once. The first draw holds what the screen
 * shows; what lies past it follows once that is on screen, with the cards' motion (their slide to
 * a new place, their fade): nothing moves as a wall opens.
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent, type RefreshControlProps } from 'react-native';
import { LayoutAnimationConfig } from 'react-native-reanimated';

import type { WallMetrics } from '@unlease/notes/services/wall';
import type { BoardSections } from '@app/hooks/useBoard';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText, EdgeScrollView } from '../../components';
import { listIn, listMove, listOut } from '@shared/ui/theme/motion';
import { NoteCard } from './NoteCard';
import { SwipeToArchive } from './SwipeToArchive';
import { layoutWall, PAGE_PADDING, SECTION_HEIGHT } from './wallLayout';

/** A step of the scroll: about a row of cards. */
const STEP = 160;
/** How far past the screen the wall keeps its cards, in screens: above it, and below. */
const ABOVE = 1;
const BELOW = 1.5;
/** Below the screen as the wall opens: its first draw is the screen's own cards, the rest comes this long after. */
const BELOW_FIRST = 0.15;
const REST_AFTER_MS = 60;

/** When a card leaves (archived) or comes back (undone), the others slide to their new place (the suite's list motion). */
const REFLOW = listMove;
/** A card new to the wall (back from the archive, a view just opened) settles in once the others have made room. */
const CARD_IN = listIn;
/** A card taken off the wall without a swipe (archived or binned from the selection) fades where it was. Off-screen cards dropped by the window go the same way, unseen. */
const CARD_OUT = listOut;
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
  /** The pull to sync (`usePullToSync`). */
  readonly refreshControl?: React.ReactElement<RefreshControlProps>;
  /** A card swiped off the board; absent, cards do not swipe. */
  readonly onSwipe?: (id: string) => void;
  readonly canSwipe?: (id: string) => boolean;
}

interface WallCardProps {
  readonly id: string;
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
  readonly metrics: WallMetrics;
  readonly query: string;
  readonly selected: boolean;
  readonly arrived: boolean;
  /** The wall has all its cards: they slide to a new place and fade as they leave from here on. */
  readonly moving: boolean;
  readonly swipes: boolean;
  readonly onPress: (id: string) => void;
  readonly onLongPress: (id: string) => void;
  readonly onSwiped: (id: string) => void;
}

/** A card in its slot. Its props are plain values, so a step of the scroll draws the cards it brings and no other. */
const WallCard = memo(function WallCardView({ id, top, left, width, height, metrics, query, selected, arrived, moving, swipes, onPress, onLongPress, onSwiped }: WallCardProps) {
  return (
    <SwipeToArchive id={id} width={width} enabled={swipes} onSwiped={onSwiped} top={top} left={left} layout={moving ? REFLOW : undefined} entering={arrived ? CARD_IN : undefined} exiting={moving ? CARD_OUT : undefined}>
      <NoteCard id={id} width={width} height={height} metrics={metrics} query={query} selected={selected} onPress={onPress} onLongPress={onLongPress} />
    </SwipeToArchive>
  );
});

function WallComponent({ sections, metrics, columns, query, selection, onPress, onLongPress, header, footerSpace, refreshControl, onSwipe, canSwipe }: WallProps) {
  const { height: windowHeight } = useWindowDimensions();
  const [step, setStep] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  // The wall has all its cards (those past the screen too), and they move from here on: once its first draw is on screen.
  const [whole, setWhole] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWhole(true), REST_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  const below = whole ? BELOW : BELOW_FIRST;
  const moving = whole;
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
    const next = Math.floor(event.nativeEvent.contentOffset.y / STEP);
    setStep(current => (current === next ? current : next));
  }, []);

  // The screen shows from `step * STEP` (to within a step) for a window's height, in the scroller; the cards lie under the header.
  const top = step * STEP - headerHeight - windowHeight * ABOVE;
  const bottom = (step + 1) * STEP - headerHeight + windowHeight * (1 + below);
  const visible = layout.items.filter(item =>
    item.kind === 'section' ? item.top + SECTION_HEIGHT > top && item.top < bottom : item.top + item.height > top && item.top < bottom,
  );
  const onSwiped = onSwipe ?? noop;

  // Cards fade out only when they leave a wall that stays: a wall replaced whole (the view emptied) just goes,
  // or its fading cards would hold its old place in the screen while the new content and any closing dialog draw.
  return (
    <LayoutAnimationConfig skipExiting>
      <EdgeScrollView
        onScroll={onScroll}
        scrollEventThrottle={32}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
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
              <WallCard
                key={item.key}
                id={item.id}
                top={item.top}
                left={item.left}
                width={item.width}
                height={item.height}
                metrics={metrics}
                query={query}
                selected={selection.has(item.id)}
                arrived={arrived.has(item.id)}
                moving={moving}
                swipes={!!onSwipe && (canSwipe?.(item.id) ?? true)}
                onPress={onPress}
                onLongPress={onLongPress}
                onSwiped={onSwiped}
              />
            ),
          )}
        </View>
      </EdgeScrollView>
    </LayoutAnimationConfig>
  );
}

const noop = () => {};

const styles = StyleSheet.create({
  section: { position: 'absolute', left: PAGE_PADDING + 4, right: PAGE_PADDING, height: SECTION_HEIGHT, justifyContent: 'center' },
});

export const Wall = memo(WallComponent);
