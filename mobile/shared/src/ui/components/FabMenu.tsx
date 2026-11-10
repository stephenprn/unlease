/**
 * An app's capture button, floating at the screen's foot on the right over what scrolls (no bar under
 * it): the brand's pebble. With one thing to make (Pages' page, Contacts' contact) it makes it; with
 * more (Carnet's note, list, drawing, photo, link; Agenda's event, quick add, the day's note) a press
 * opens them as a short stack of sheets above it, the first nearest the thumb, while its plus turns
 * into a cross and the screen dims. A press outside, Back or the cross closes it (Material 3's FAB
 * menu).
 */
import React, { memo, useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import Animated, { Keyframe, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@unlease/core/i18n';
import type { GlyphName } from '@unlease/design/glyphs';
import { SHAPES } from '@unlease/design/shapes';

import { accelerate, decelerate, duration, spatial } from '../theme/motion';
import { corners } from '../theme/shape';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { Tappable } from './Tappable';

export interface FabAction {
  readonly icon: GlyphName;
  readonly label: string;
  readonly onPress: () => void;
}

/** The pebble's foot and side margin. */
const MARGIN = 16;
const PEBBLE_WIDTH = 66;
const PEBBLE_HEIGHT = 60;
/** What a list leaves free at its foot (over the gesture bar's inset) so its last row scrolls clear of the pebble. */
export const FAB_CLEARANCE = MARGIN + PEBBLE_HEIGHT + 16;

/** The pebble arrives from small, as Material's FAB does, and leaves faster. */
const FAB_IN = new Keyframe({ 0: { opacity: 0, transform: [{ scale: 0.6 }] }, 100: { opacity: 1, transform: [{ scale: 1 }], easing: decelerate } }).duration(duration.medium);
const FAB_OUT = new Keyframe({ 0: { opacity: 1, transform: [{ scale: 1 }] }, 100: { opacity: 0, transform: [{ scale: 0.6 }], easing: accelerate } }).duration(duration.short);
const DIM_IN = new Keyframe({ 0: { opacity: 0 }, 100: { opacity: 1, easing: decelerate } }).duration(duration.medium);
const DIM_OUT = new Keyframe({ 0: { opacity: 1 }, 100: { opacity: 0, easing: accelerate } }).duration(duration.exit);

/** Each sheet rises out of the pebble's side, one after the other outward (30 apart); they all go at once. */
const ITEM_IN = Array.from({ length: 6 }, (_, index) =>
  new Keyframe({
    0: { opacity: 0, transform: [{ translateY: 14 }, { scale: 0.9 }] },
    100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }], easing: decelerate },
  })
    .duration(duration.medium)
    .delay(index * 30),
);
const ITEM_OUT = new Keyframe({
  0: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
  100: { opacity: 0, transform: [{ translateY: 8 }, { scale: 0.96 }], easing: accelerate },
}).duration(120);

export interface FabMenuProps {
  /** What the pebble makes, or opens: the first is the main one (nearest the thumb). One alone, and a press makes it. */
  readonly actions: readonly FabAction[];
  /** The pebble's name for TalkBack while it opens a menu (« Créer »). */
  readonly label?: string;
  /** False while something else holds the screen's foot (notes being picked): the pebble steps aside. */
  readonly visible?: boolean;
  readonly icon?: GlyphName;
}

function FabMenuComponent({ actions, label, visible = true, icon = 'plus' }: FabMenuProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const menu = actions.length > 1;
  const shown = visible && actions.length > 0;
  // The plus turns an eighth into the cross.
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.value = withSpring(open ? 1 : 0, spatial);
  }, [open, turn]);
  useEffect(() => {
    if (!shown) setOpen(false);
  }, [shown]);
  useEffect(() => {
    if (!open) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [open]);
  const turning = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 45}deg` }] }));

  const main = actions[0];
  const press = (): void => {
    if (menu) setOpen(was => !was);
    else main?.onPress();
  };
  const pick = (action: FabAction): void => {
    setOpen(false);
    action.onPress();
  };

  // The host stays, so the pebble's and the sheets' exits can play.
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {open ? (
        <Animated.View entering={DIM_IN} exiting={DIM_OUT} style={StyleSheet.absoluteFill}>
          <Tappable accessibilityLabel={t('Fermer')} noTint onPress={() => setOpen(false)} style={[styles.fill, { backgroundColor: theme.color.scrim }]} />
        </Animated.View>
      ) : null}
      <View style={[styles.stack, { bottom: insets.bottom + MARGIN }]} pointerEvents="box-none">
        {open
          ? [...actions].reverse().map((action, at) => {
              const order = actions.length - 1 - at;
              return (
                <Animated.View key={action.label} entering={ITEM_IN[Math.min(order, ITEM_IN.length - 1)]} exiting={ITEM_OUT} style={styles.itemSlot}>
                  <Tappable accessibilityRole="button" accessibilityLabel={action.label} onPress={() => pick(action)} style={styles.item}>
                    <Icon name={action.icon} size={22} color={theme.color.action} />
                    <AppText variant="bodyStrong">{action.label}</AppText>
                  </Tappable>
                </Animated.View>
              );
            })
          : null}
        {shown ? (
          <Animated.View entering={FAB_IN} exiting={FAB_OUT}>
            <Tappable
              accessibilityLabel={menu ? (open ? t('Fermer') : (label ?? main?.label)) : main?.label}
              accessibilityState={menu ? { expanded: open } : undefined}
              onPress={press}
              onFill
              pebble={0}
              style={styles.pebble}
            >
              <Animated.View style={turning}>
                <Icon name={menu ? 'plus' : icon} size={28} color={theme.color.onLeaf} />
              </Animated.View>
            </Tappable>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    fill: { flex: 1 },
    stack: { position: 'absolute', right: MARGIN, alignItems: 'flex-end', gap: 10 },
    itemSlot: { transformOrigin: 'bottom right' },
    // A sheet of paper lifted off the dimmed screen: the glyph in the primary, the name in ink.
    item: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingLeft: 16,
      paddingRight: 20,
      backgroundColor: theme.color.paper,
      borderWidth: 1,
      borderColor: theme.color.outline,
      boxShadow: theme.lift.raised,
      ...corners(SHAPES.button),
    },
    pebble: { width: PEBBLE_WIDTH, height: PEBBLE_HEIGHT, marginTop: 6, backgroundColor: theme.color.leaf, alignItems: 'center', justifyContent: 'center' },
  });

export const FabMenu = memo(FabMenuComponent);
