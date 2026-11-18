/**
 * An app's places at the screen's foot (Material's navigation bar: Clock's four, Wallet's three).
 * Pinned over the ground, it paints the ground's slice under it and keeps its top line drawn, as a
 * phone's footer does. The chosen place lies on the primary's wash at the row radius, as the
 * drawer's chosen row and Agenda's chosen day do: one wash under the glyph and the name together,
 * sliding to the place chosen (250, standard), so the choice is seen moving and nothing round floats
 * around a lone glyph. On it the glyph turns solid and the name takes label strong, both in the
 * wash's ink; the others stay in the second ink. A press tints the place inside the
 * sheet's own corners. A place may wear a small dot (something under way there): what counts is
 * never out of sight. TalkBack hears a tab list.
 */
import React, { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { GlyphName } from '@unlease/design/glyphs';
import { SHAPES } from '@unlease/design/shapes';

import { duration, standard } from '../theme/motion';
import { corners } from '../theme/shape';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { AppText } from './AppText';
import { footEdge } from './FormFoot';
import { GroundSlice } from './Ground';
import { Icon } from './Icon';
import { AnimatedOrganic } from './Organic';
import { Tappable } from './Tappable';

/** The bar's own height, over the gesture bar's room. */
export const TAB_BAR_HEIGHT = 72;

/** The sheet's room around a place: 6 from its neighbours' and from the bar's top line, 4 over the gesture bar's room. */
const SIDE = 6;
const TOP = 6;
const BOTTOM = 4;
/** A place wider than this (three places on a wide phone) keeps its sheet this wide, centred: a sheet, never a band. */
const MAX_SHEET = 104;

export interface TabPlace<T extends string> {
  readonly key: T;
  readonly icon: GlyphName;
  readonly name: string;
  /** A dot on the glyph's shoulder, in this colour; null for none. */
  readonly dot?: string | null;
  /** What the dot says to TalkBack (« Sonne », « En cours »). */
  readonly state?: string;
}

interface Props<T extends string> {
  readonly places: readonly TabPlace<T>[];
  readonly chosen: T;
  readonly onChoose: (key: T) => void;
}

function TabBarComponent<T extends string>({ places, chosen, onChoose }: Props<T>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const still = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, places.findIndex(place => place.key === chosen));
  const slot = places.length > 0 ? width / places.length : 0;
  const sheet = Math.min(MAX_SHEET, Math.max(0, slot - SIDE * 2));
  const at = useSharedValue(index);
  useEffect(() => {
    at.value = still ? index : withTiming(index, { duration: duration.medium, easing: standard });
  }, [index, at, still]);
  // The inks change hands as the sheet passes the middle of its way, not before it has left.
  const [drawn, setDrawn] = useState(index);
  useEffect(() => {
    if (drawn === index) return;
    if (still) {
      setDrawn(index);
      return;
    }
    const timer = setTimeout(() => setDrawn(index), duration.medium / 2);
    return () => clearTimeout(timer);
  }, [index, drawn, still]);
  const moving = useAnimatedStyle(() => ({ width: sheet, transform: [{ translateX: at.value * slot + (slot - sheet) / 2 }] }));

  return (
    <View style={[styles.bar, { height: TAB_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }]} accessibilityRole="tablist" onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      <GroundSlice top={0} />
      {sheet > 0 ? <AnimatedOrganic pointerEvents="none" style={[styles.sheet, moving]} /> : null}
      {places.map((place, at) => {
        const lit = at === drawn;
        const ink = lit ? theme.color.onActionContainer : theme.color.inkMuted;
        return (
          <View key={place.key} style={styles.slot}>
            <Tappable
              onPress={() => onChoose(place.key)}
              style={[styles.place, sheet > 0 ? { width: sheet } : null]}
              accessibilityRole="tab"
              accessibilityState={{ selected: at === index }}
              accessibilityLabel={[place.name, place.dot ? place.state : ''].filter(Boolean).join(', ')}
            >
              <View style={styles.mark}>
                <Icon name={place.icon} solid={lit} size={24} color={ink} />
                {place.dot ? <View style={[styles.dot, { backgroundColor: place.dot }]} /> : null}
              </View>
              <AppText variant={lit ? 'labelStrong' : 'label'} color={ink} numberOfLines={1} style={styles.name}>
                {place.name}
              </AppText>
            </Tappable>
          </View>
        );
      })}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    bar: { flexDirection: 'row', alignItems: 'stretch', overflow: 'hidden', ...footEdge(theme) },
    slot: { flex: 1, alignItems: 'center', paddingTop: TOP, paddingBottom: BOTTOM },
    place: { flex: 1, minWidth: 64, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 4, ...corners(SHAPES.tab) },
    sheet: {
      position: 'absolute',
      left: 0,
      top: TOP,
      // Its height, not a bottom: a bottom would be counted from under the gesture bar's room.
      height: TAB_BAR_HEIGHT - TOP - BOTTOM - 1,
      backgroundColor: theme.color.actionContainer,
      ...corners(SHAPES.tab),
    },
    mark: { width: 32, height: 28, alignItems: 'center', justifyContent: 'center' },
    dot: { position: 'absolute', top: 1, right: -1, width: 7, height: 7, borderRadius: 3.5, borderWidth: 1.5, borderColor: theme.color.wall },
    name: { paddingHorizontal: 2 },
  });
}

export const TabBar = memo(TabBarComponent) as typeof TabBarComponent;
