/**
 * A section's "how it works": an info pebble beside its title opens a short card under it, a calm
 * matcha sheet whose pointer stands on its top edge under the pebble (its corner there kept tight,
 * so the edge runs straight to it), as on the web.
 */
import React, { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { AppText, IconButton, Organic } from '../../components';
import { decelerate, duration } from '../../theme/motion';
import { useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';

export function useInfoBubble(): { readonly open: boolean; readonly toggle: () => void } {
  const [open, setOpen] = useState(false);
  return { open, toggle: () => setOpen(value => !value) };
}

export const InfoButton = memo(function InfoButtonView({ open, label, onPress }: { open: boolean; label: string; onPress: () => void }) {
  return <IconButton icon="info" label={label} selected={open} size={20} onPress={onPress} />;
});

/** Its pointer stands under the info pebble, this far in from its right. */
const TAIL_FROM_RIGHT = 24;

export const InfoBubble = memo(function InfoBubbleView({ text }: { text: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Animated.View entering={FadeIn.duration(duration.medium).easing(decelerate)} exiting={FadeOut.duration(duration.short)} style={styles.wrap} accessibilityLiveRegion="polite">
      {/* The pointer, up at the info pebble, on the card's straight top edge. */}
      <View style={styles.tail} />
      <Organic outline="bubble" style={styles.bubble}>
        <AppText variant="meta" color={styles.text.color}>
          {text}
        </AppText>
      </Organic>
    </Animated.View>
  );
});

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: { paddingTop: 6 },
    tail: { position: 'absolute', top: 1, right: TAIL_FROM_RIGHT - 6, width: 12, height: 12, borderRadius: 2, backgroundColor: t.color.actionContainer, transform: [{ rotate: '45deg' }] },
    // A few lines of text: a calm sheet, never a pebble.
    bubble: { backgroundColor: t.color.actionContainer, paddingHorizontal: 16, paddingVertical: 12 },
    text: { color: t.color.onActionContainer },
  });
