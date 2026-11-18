/**
 * Wallet's three places at the screen's foot (Material's navigation bar, as Clock's): « Cartes »,
 * « Identité », « Documents ». Pinned over the ground, it paints the ground's slice under it and keeps
 * its top line drawn. The chosen place's glyph turns solid on the primary's pebble (settling in from
 * 0.9, 250 decelerate; Reduce Motion: no scale), its name in label strong. A locked place wears a
 * small dot in the second ink: its papers wait under the frost. TalkBack hears a tab list.
 */
import React, { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@unlease/core/i18n';
import type { GlyphName } from '@unlease/design/glyphs';
import { AppText, GroundSlice, Icon, Organic, Tappable } from '@shared/ui/components';
import { footEdge } from '@shared/ui/components/FormFoot';
import { decelerate, duration } from '@shared/ui/theme/motion';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

import type { WalletPlace } from './types';

export const WALLET_PLACES: readonly WalletPlace[] = ['cards', 'papers', 'documents'];

/** The bar's own height, over the gesture bar's room. */
export const TAB_BAR_HEIGHT = 72;

const GLYPHS: Readonly<Record<WalletPlace, GlyphName>> = { cards: 'card', papers: 'idCard', documents: 'page' };

export const tabName = (tab: WalletPlace): string => {
  switch (tab) {
    case 'cards':
      return t('Cards');
    case 'papers':
      return t('Identity');
    case 'documents':
      return t('Documents');
  }
};

/** A place's state the bar shows: something under way there, or a timer ringing. */
export type TabMark = 'locked' | null;

interface Props {
  readonly tab: WalletPlace;
  readonly marks: Readonly<Partial<Record<WalletPlace, TabMark>>>;
  readonly onTab: (tab: WalletPlace) => void;
}

function Item({ tab, chosen, mark, onPress }: { readonly tab: WalletPlace; readonly chosen: boolean; readonly mark: TabMark; readonly onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const still = useReducedMotion();
  const shown = useSharedValue(chosen ? 1 : 0);
  useEffect(() => {
    shown.value = chosen ? withTiming(1, { duration: still ? 0 : duration.medium, easing: decelerate }) : withTiming(0, { duration: still ? 0 : duration.short });
  }, [chosen, shown, still]);
  const pebble = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ scale: still ? 1 : 0.9 + 0.1 * shown.value }] }));
  // Pressed: the tint inside the pebble's own shape, never a square across the item.
  const pressed = useSharedValue(0);
  const tint = useAnimatedStyle(() => ({ opacity: pressed.value }));
  const name = tabName(tab);
  const state = mark === 'locked' ? t('Locked') : '';
  return (
    <Tappable
      onPress={onPress}
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: 90 });
      }}
      onPressOut={() => {
        pressed.value = withTiming(0, { duration: duration.short });
      }}
      noTint
      style={styles.item} accessibilityRole="tab" accessibilityState={{ selected: chosen }} accessibilityLabel={[name, state].filter(Boolean).join(', ')}>
      <View style={styles.mark}>
        <Animated.View style={[StyleSheet.absoluteFill, pebble]}>
          <Organic pebble={WALLET_PLACES.indexOf(tab)} style={[StyleSheet.absoluteFill, { backgroundColor: theme.color.actionContainer }]} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, tint]}>
          <Organic pebble={WALLET_PLACES.indexOf(tab)} style={[StyleSheet.absoluteFill, { backgroundColor: chosen ? theme.press.onFill : theme.press.tint }]} />
        </Animated.View>
        <Icon name={GLYPHS[tab]} solid={chosen} size={24} color={chosen ? theme.color.onActionContainer : theme.color.inkMuted} />
        {mark ? <View style={[styles.dot, { backgroundColor: theme.color.inkMuted }]} /> : null}
      </View>
      <AppText variant={chosen ? 'labelStrong' : 'label'} color={chosen ? theme.color.ink : theme.color.inkMuted} numberOfLines={1} style={styles.name}>
        {name}
      </AppText>
    </Tappable>
  );
}

function WalletTabBarComponent({ tab, marks, onTab }: Props) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { height: TAB_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }]} accessibilityRole="tablist">
      <GroundSlice top={0} />
      {WALLET_PLACES.map(each => (
        <Item key={each} tab={each} chosen={each === tab} mark={marks[each] ?? null} onPress={() => onTab(each)} />
      ))}
    </View>
  );
}

export const WalletTabBar = memo(WalletTabBarComponent);

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    bar: { flexDirection: 'row', alignItems: 'stretch', overflow: 'hidden', ...footEdge(theme) },
    item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 6 },
    // The chosen place's pebble: 56 by 32, as Material's indicator, the glyph at its heart.
    mark: { width: 56, height: 32, alignItems: 'center', justifyContent: 'center' },
    dot: { position: 'absolute', top: 3, right: 13, width: 7, height: 7, borderRadius: 3.5, borderWidth: 1.5, borderColor: theme.color.wall },
    name: { paddingHorizontal: 2 },
  });
}
