/** Small scissors working along a dashed cut line: a link's "being read" state. */
import React, { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Icon } from '../../components';
import { standard } from '../../theme/motion';
import { useTheme } from '../../theme/ThemeProvider';

const SCISSORS = 14;

function ReadingTrackComponent({ width }: { width: number }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    progress.value = withRepeat(withTiming(1, { duration: 1300, easing: standard }), -1, true);
    return () => cancelAnimation(progress);
  }, [progress, reduced]);
  const scissors = useAnimatedStyle(() => ({ transform: [{ translateX: progress.value * (width - SCISSORS) }, { rotate: `${Math.sin(progress.value * 18) * 12}deg` }] }));
  const dashes = Math.max(3, Math.floor(width / 9));
  return (
    <View style={[styles.box, { width }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.dashes}>
        {Array.from({ length: dashes }, (_, index) => (
          <View key={index} style={[styles.dash, { backgroundColor: theme.color.outline }]} />
        ))}
      </View>
      <Animated.View style={[styles.scissors, scissors]}>
        <Icon name="scissors" size={SCISSORS} color={theme.color.link} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: SCISSORS, justifyContent: 'center' },
  dashes: { flexDirection: 'row', justifyContent: 'space-between' },
  dash: { width: 5, height: 2, borderRadius: 1 },
  scissors: { position: 'absolute', left: 0, width: SCISSORS, height: SCISSORS },
});

export const ReadingTrack = memo(ReadingTrackComponent);
