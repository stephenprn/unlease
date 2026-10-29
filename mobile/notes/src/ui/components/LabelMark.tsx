/** A label as worn by a note: a small hand-cut paper tag in its gouache, then its name. */
import React, { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { LABEL_CHECK, LABEL_TAG_BOX, LABEL_TAG_EDGE, LABEL_TAG_EYELET, LABEL_TAG_PATH } from '@unlease/design/emblems';
import type { LineColor } from '@unlease/design/colors';

import { duration, standard } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

const VIEWBOX = `0 0 ${LABEL_TAG_BOX.width} ${LABEL_TAG_BOX.height}`;

export function LabelTag({ color, size = 14 }: { color: LineColor; size?: number }) {
  const theme = useTheme();
  return (
    <Svg width={size} height={(size * LABEL_TAG_BOX.height) / LABEL_TAG_BOX.width} viewBox={VIEWBOX} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={LABEL_TAG_PATH} fill={theme.line[color].fill} fillRule="evenodd" />
    </Svg>
  );
}

/** The tag as a picker's checkbox: an outline in the label's gouache when off; filled, eyelet punched, when on. */
function LabelCheckComponent({ color, checked, size = 26 }: { color: LineColor; checked: boolean; size?: number }) {
  const ink = useTheme().line[color].fill;
  const height = (size * LABEL_CHECK.height) / LABEL_CHECK.width;
  const on = useSharedValue(checked ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(checked ? 1 : 0, { duration: duration.short, easing: standard });
  }, [checked, on]);
  const ring = useAnimatedStyle(() => ({ opacity: 1 - on.value }));
  const filled = useAnimatedStyle(() => ({ opacity: on.value }));
  // The edge never fades, so the tag holds its line through the swap; only the eyelet ring and the fill trade places.
  return (
    <View style={{ width: size, height }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[StyleSheet.absoluteFill, filled]}>
        <Svg width={size} height={height} viewBox={LABEL_CHECK.viewBox}>
          <Path d={LABEL_TAG_PATH} fill={ink} fillRule="evenodd" />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, ring]}>
        <Svg width={size} height={height} viewBox={LABEL_CHECK.viewBox}>
          <Path d={LABEL_TAG_EYELET} fill="none" stroke={ink} strokeWidth={LABEL_CHECK.stroke} />
        </Svg>
      </Animated.View>
      <Svg width={size} height={height} viewBox={LABEL_CHECK.viewBox} style={StyleSheet.absoluteFill}>
        <Path d={LABEL_TAG_EDGE} fill="none" stroke={ink} strokeWidth={LABEL_CHECK.stroke} strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

export const LabelCheck = memo(LabelCheckComponent);

function LabelMarkComponent({ name, color }: { name: string; color: LineColor }) {
  return (
    <View style={styles.row}>
      <LabelTag color={color} />
      {name ? (
        <AppText variant="meta" numberOfLines={1} style={styles.name}>
          {name}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '100%' },
  name: { flexShrink: 1 },
});

export const LabelMark = memo(LabelMarkComponent);
