/**
 * A collection's page head: its emblem cut large and pinned at a slant, its name, the sentence
 * Claude files by, and what it holds. The same emblem, washed and huge, sits behind: it leaves by
 * the screen's top and right edges and fades out toward its foot, so the head's own bottom edge
 * never cuts it.
 */
import React, { memo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { emblemShape, type CollectionEmblem } from '@unlease/design/emblems';
import { t } from '@unlease/core/i18n';
import type { LineColor } from '@unlease/design/colors';

import { AppText, EmblemStone, IconButton } from '../../components';
import { useTheme } from '../../theme/ThemeProvider';

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
        <View style={[styles.ghost, { top: -ghost * BLEED.top, right: -ghost * BLEED.right }]} pointerEvents="none">
          <Ghost emblem={emblem} fill={theme.line[color ?? 'grey'].fill} size={ghost} />
        </View>
      ) : null}
      <View style={[styles.bar, { marginTop: insets.top }]}>
        <IconButton icon="back" label={t('Retour')} onPress={onBack} />
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
  ghost: { position: 'absolute', transform: [{ rotate: '-12deg' }] },
  bar: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  flex: { flex: 1 },
  sign: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, paddingHorizontal: 20, paddingTop: 4 },
  mark: { marginTop: 0 },
  text: { flex: 1, gap: 4 },
  meta: { marginTop: 6 },
});

export const CollectionHeader = memo(CollectionHeaderComponent);
