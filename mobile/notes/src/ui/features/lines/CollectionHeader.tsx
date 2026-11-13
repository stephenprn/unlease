/**
 * A collection's page head: its emblem cut large and pinned at a slant, its name, the sentence
 * Claude files by, and what it holds. The same emblem, washed and huge, sits behind: it leaves by
 * the screen's top and right edges and fades out toward its foot, so the head's own bottom edge
 * never cuts it. Each time a collection opens, its ghost is laid down as an empty state's cut-out
 * is (`GHOST_ENTRANCE`): it drifts in from beyond its corner and turns into its slant as it fades
 * up to its wash. Reduce Motion shows it still.
 */
import React, { memo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Keyframe } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { COLLAGE_LAY, GHOST_ENTRANCE } from '@unlease/design/collage';
import { emblemShape, type CollectionEmblem } from '@unlease/design/emblems';
import { t } from '@unlease/core/i18n';
import type { LineColor } from '@unlease/design/colors';

import { AppText, EmblemStone, IconButton } from '../../components';
import { decelerate } from '@shared/ui/theme/motion';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

export interface CollectionHeaderProps {
  readonly title: string;
  readonly emblem: CollectionEmblem;
  /** The collection's id: its stone is the same wherever it shows. */
  readonly id: string;
  readonly color: LineColor | null;
  readonly hint?: string;
  /** "5 liens · total 407,90 €". */
  readonly meta?: string;
  readonly onBack: () => void;
  readonly actions?: React.ReactNode;
}

/** The washed emblem: present enough to own the page, quiet enough to read over. */
const GHOST_OPACITY = 0.14;
/** How far up and right the ghost leaves the screen, as a share of its size. */
const BLEED = { top: 0.2, right: 0.26 };

/** The ghost laid down, from just beyond its corner, upright, into its slant (the slant itself is `styles.slant`, under it). */
const GHOST_LAY = new Keyframe({
  0: {
    opacity: 0,
    transform: [{ translateX: GHOST_ENTRANCE.dx }, { translateY: GHOST_ENTRANCE.dy }, { rotate: `${GHOST_ENTRANCE.turn}deg` }, { scale: GHOST_ENTRANCE.scale }],
  },
  100: { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: '0deg' }, { scale: 1 }], easing: decelerate },
}).duration(COLLAGE_LAY);

/** The ghost: its gouache at full wash at the top right, gone toward its foot and toward the heading at its left, so the words never sit on it. */
function Ghost({ emblem, fill, size }: { emblem: CollectionEmblem; fill: string; size: number }) {
  const { d, rule } = emblemShape(emblem);
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="ghost-fade" x1="1" y1="0" x2="0.3" y2="0.85">
          <Stop offset="0" stopColor={fill} stopOpacity={GHOST_OPACITY} />
          <Stop offset="0.4" stopColor={fill} stopOpacity={GHOST_OPACITY * 0.8} />
          <Stop offset="0.85" stopColor={fill} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={d} fill="url(#ghost-fade)" fillRule={rule} />
    </Svg>
  );
}

function CollectionHeaderComponent({ title, emblem, color, id, hint, meta, onBack, actions }: CollectionHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [height, setHeight] = useState(0);
  // Sized to the head, so its foot fades out above the head's bottom edge rather than being cut there.
  const ghost = Math.round(Math.min(width * 0.66, (height + width * 0.02) / (1 - BLEED.top)));
  return (
    <View style={styles.head} onLayout={event => setHeight(Math.round(event.nativeEvent.layout.height))}>
      {height > 0 ? (
        // Keyed by the collection: another one opened lays its own down; its size settling as the head fills never replays it.
        <Animated.View key={id} entering={GHOST_LAY} style={[styles.ghost, { top: -ghost * BLEED.top, right: -ghost * BLEED.right }]} pointerEvents="none">
          <View style={styles.slant}>
            <Ghost emblem={emblem} fill={theme.line[color ?? 'grey'].fill} size={ghost} />
          </View>
        </Animated.View>
      ) : null}
      <View style={[styles.bar, { marginTop: insets.top }]}>
        <IconButton icon="back" label={t('Back')} onPress={onBack} />
        <View style={styles.flex} />
        {actions}
      </View>
      <View style={styles.sign}>
        <View style={styles.mark}>
          <EmblemStone id={id} emblem={emblem} color={color} size={44} width={68} height={62} tilt={-8} />
        </View>
        <View style={styles.text}>
          <AppText variant="display" numberOfLines={2} accessibilityRole="header">
            {title}
          </AppText>
          {hint ? (
            <AppText variant="body" color={theme.color.inkMuted} numberOfLines={3}>
              {hint}
            </AppText>
          ) : null}
          {meta ? (
            <AppText variant="meta" color={theme.color.inkMuted} style={styles.meta}>
              {meta}
            </AppText>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { overflow: 'hidden', paddingBottom: 8 },
  ghost: { position: 'absolute' },
  slant: { transform: [{ rotate: '-12deg' }] },
  // The top bar's own 64 (`TopBar`), so Back stays put from the Collections to here and on to a link.
  bar: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  flex: { flex: 1 },
  // The stone centred over the rows' frames (16 to 92), the words from 106, where the rows' text starts.
  sign: { flexDirection: 'row', alignItems: 'flex-start', gap: 18, paddingHorizontal: 20 },
  mark: { marginTop: 0 },
  text: { flex: 1, gap: 4 },
  meta: { marginTop: 6 },
});

export const CollectionHeader = memo(CollectionHeaderComponent);
