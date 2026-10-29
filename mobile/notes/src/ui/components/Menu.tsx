/** Material's menu on a card, anchored top right; danger items use the danger ink and go last. */
import React, { memo, useEffect } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { Keyframe } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { GlyphName } from '@unlease/design/glyphs';
import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';

import { accelerate, decelerate } from '../theme/motion';
import { corners } from '../theme/shape';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { AppText } from './AppText';
import { Grain } from './Grain';
import { Icon } from './Icon';
import { AnimatedOrganic, Organic } from './Organic';
import { Tappable } from './Tappable';

export interface MenuItem {
  readonly label: string;
  readonly icon: GlyphName;
  readonly onPress: () => void;
  readonly danger?: boolean;
  /** Shown in the second ink and doing nothing: it keeps its place, so the menu reads the same every time. */
  readonly disabled?: boolean;
}

/** It grows out of the corner it was opened from (`transformOrigin`), and fades back into it, faster. */
/** A menu's own outline. */
const OUTLINE = 'menu';
const MENU_IN = new Keyframe({ 0: { opacity: 0, transform: [{ scale: 0.9 }] }, 100: { opacity: 1, transform: [{ scale: 1 }], easing: decelerate } }).duration(200);
const MENU_OUT = new Keyframe({ 0: { opacity: 1, transform: [{ scale: 1 }] }, 100: { opacity: 0, transform: [{ scale: 0.95 }], easing: accelerate } }).duration(120);

/** `top`: below the safe area (from a top bar); `bottom`: above it (from a bottom toolbar). */
function MenuComponent({ visible, items, onDismiss, top = 56, bottom }: { visible: boolean; items: readonly MenuItem[]; onDismiss: () => void; top?: number; bottom?: number }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onDismiss]);
  // The host stays, empty and untouchable, so the menu's own exit can play when it closes.
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" collapsable={false}>
      {visible ? <Tappable accessibilityLabel={t('Fermer le menu')} onPress={onDismiss} style={StyleSheet.absoluteFill} noTint /> : null}
      {visible ? (
        <AnimatedOrganic
          entering={MENU_IN}
          exiting={MENU_OUT}
          outline={OUTLINE}
          style={[styles.menu, bottom !== undefined ? [styles.fromBottom, { bottom: insets.bottom + bottom }] : [styles.fromTop, { top: insets.top + top }]]}
          accessibilityRole="menu"
        >
          <Organic outline={OUTLINE} style={styles.clip}>
            <Grain />
            {items.map(item => (
              <Tappable
                key={item.label}
                accessibilityRole="menuitem"
                accessibilityState={item.disabled ? { disabled: true } : undefined}
                disabled={item.disabled}
                ownDisabled
                onPress={() => {
                  onDismiss();
                  item.onPress();
                }}
                style={styles.item}
              >
                <Icon name={item.icon} size={22} color={item.disabled ? theme.color.inkMuted : item.danger ? theme.color.danger : theme.color.ink} />
                <AppText variant="body" color={item.disabled ? theme.color.inkMuted : item.danger ? theme.color.danger : undefined}>
                  {item.label}
                </AppText>
              </Tappable>
            ))}
          </Organic>
        </AnimatedOrganic>
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    menu: { position: 'absolute', right: 8, minWidth: 210, backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.outline, boxShadow: theme.lift.float },
    fromTop: { transformOrigin: 'top right' },
    fromBottom: { transformOrigin: 'bottom right' },
    clip: { overflow: 'hidden', padding: 6 },
    // Each row presses as its own pebble inside the menu, never out to its edge.
    item: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12, ...corners(SHAPES.tab) },
  });

export const Menu = memo(MenuComponent);
