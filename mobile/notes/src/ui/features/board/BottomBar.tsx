/** The capture actions, one tap from the board: checklist, drawing, photo, link, and the leaf for a note; on the pages' home, the leaf alone makes a page. */
import React, { memo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Keyframe } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@unlease/core/i18n';

import { Fab, GroundSlice, IconButton } from '../../components';
import { accelerate, decelerate, duration } from '../../theme/motion';
import { useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';

export const BOTTOM_BAR_HEIGHT = 80;

/** The hairline along the bar's top: what it holds starts under it. */
const BAR_EDGE = 1;

/** It travels its own height (and the gesture bar's), not the screen's, so the whole motion is seen. */
const BAR_IN = new Keyframe({ 0: { transform: [{ translateY: 128 }] }, 100: { transform: [{ translateY: 0 }], easing: decelerate } }).duration(duration.medium);
const BAR_OUT = new Keyframe({ 0: { transform: [{ translateY: 0 }] }, 100: { transform: [{ translateY: 128 }], easing: accelerate } }).duration(duration.short);

export type BottomBarProps = { readonly onChecklist: () => void; readonly onDrawing: () => void; readonly onPhoto: () => void; readonly onLink: () => void; readonly onNote: () => void } | { readonly onPage: () => void };

function BottomBarComponent(props: BottomBarProps) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const height = BOTTOM_BAR_HEIGHT + insets.bottom;
  return (
    // It steps aside while notes are picked, and back after: a slide, never a jump.
    <Animated.View
      entering={BAR_IN}
      exiting={BAR_OUT}
      style={[styles.bar, { paddingBottom: insets.bottom, height }]}
    >
      {/* The ground is fixed to the window: the bar paints the part of it that lies under the bar, below its hairline. */}
      <GroundSlice top={window.height - height + BAR_EDGE} />
      {'onPage' in props ? (
        <>
          <View style={styles.actions} />
          <Fab icon="plus" label={t('Nouvelle page')} onPress={props.onPage} />
        </>
      ) : (
        <>
          <View style={styles.actions}>
            <IconButton icon="checklist" label={t('Nouvelle liste')} onPress={props.onChecklist} size={26} shape={0} />
            <IconButton icon="draw" label={t('Nouveau dessin')} onPress={props.onDrawing} size={26} shape={3} />
            <IconButton icon="image" label={t('Nouvelle note avec photo')} onPress={props.onPhoto} size={26} shape={1} />
            <IconButton icon="link" label={t('Classer un lien')} onPress={props.onLink} size={26} shape={2} />
          </View>
          <Fab icon="plus" label={t('Nouvelle note')} onPress={props.onNote} />
        </>
      )}
    </Animated.View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // habits-garden's tab bar: the ground itself under a hairline, the matcha pebble at its end.
    bar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.ground.bottom,
      borderTopWidth: BAR_EDGE,
      borderTopColor: theme.color.hairline,
      paddingLeft: 8,
      paddingRight: 16,
    },
    actions: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  });

export const BottomBar = memo(BottomBarComponent);
