/**
 * The collection as it will hang, at the head of its new and edit sheets (the web's `Preview`): a
 * piece of the wall in a card's outline, edged in the outline ink and grained as paper, the emblem
 * pinned at -8° (a new one settles in from 0.9 as it is picked), the name over the sentence Claude reads.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Keyframe } from 'react-native-reanimated';

import type { CollectionEmblem } from '@unlease/design/emblems';
import type { LineColor } from '@unlease/design/colors';

import { AppText, Emblem, Grain, Organic } from '../../components';
import { decelerate, duration } from '@shared/ui/theme/motion';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

const MARK_IN = new Keyframe({ 0: { opacity: 0, transform: [{ scale: 0.9 }] }, 100: { opacity: 1, transform: [{ scale: 1 }], easing: decelerate } }).duration(duration.medium);

export function CollectionPreview({ emblem, color, title, hint }: { emblem: CollectionEmblem; color: LineColor | null; title: string; hint: string }) {
  const theme = useTheme();
  return (
    <Organic outline="card" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[styles.preview, { backgroundColor: theme.color.wall, borderColor: theme.color.outline }]}>
      <Grain />
      <View style={styles.mark}>
        <Animated.View key={emblem} entering={MARK_IN}>
          <Emblem emblem={emblem} color={color} size={56} />
        </Animated.View>
      </View>
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        <AppText variant="meta" numberOfLines={2}>
          {hint}
        </AppText>
      </View>
    </Organic>
  );
}

const styles = StyleSheet.create({
  preview: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 92, paddingVertical: 14, paddingHorizontal: 18, borderWidth: 1, overflow: 'hidden' },
  mark: { transform: [{ rotate: '-8deg' }] },
  text: { flex: 1, gap: 2 },
});
