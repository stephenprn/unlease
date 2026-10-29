/**
 * The ground a screen lies on, as the appearance paints it (`theme.ground`: Carnet's two tones of
 * the wall by default, or a preset, a colour or a generated gradient, the same CSS layers the web
 * paints), under the web's own film grain while the ground is grainy. Behind everything, fixed while
 * the content scrolls. A bar pinned over it (the bottom bar, a status band, the drawer) paints the
 * slice of it that lies under the bar (`GroundSlice`), so no seam shows where they meet.
 */
import React, { memo } from 'react';
import { StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';

import type { GroundPaint } from '@unlease/design/appearance';

import { useTheme } from '../theme/ThemeProvider';
import { Grain } from './Grain';

/** A ground's paint as React Native style props: its layers over its flat colour. */
export function groundStyle(ground: GroundPaint): ViewStyle {
  return ground.layers.length > 0 ? { backgroundColor: ground.base, backgroundImage: ground.layers.join(', ') } : { backgroundColor: ground.base };
}

function GroundComponent() {
  const theme = useTheme();
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, groundStyle(theme.ground)]}>
      <Grain ground />
    </View>
  );
}

export const Ground = memo(GroundComponent);

/**
 * The part of the window's ground under a box whose content starts `top` from the window's top:
 * the whole ground laid at the window's size, moved up by `top`, clipped by the box. Its gradients
 * and its grain line up with the screen's own.
 */
function GroundSliceComponent({ top }: { top: number }) {
  const theme = useTheme();
  const window = useWindowDimensions();
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.clip}>
      <View style={[styles.whole, { top: -top, width: window.width, height: window.height }, groundStyle(theme.ground)]}>
        <Grain ground width={window.width} height={window.height} />
      </View>
    </View>
  );
}

export const GroundSlice = memo(GroundSliceComponent);

const styles = StyleSheet.create({
  clip: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  whole: { position: 'absolute', left: 0 },
});
