/**
 * A value stepped one notch at a time between two small buttons: servings, a season, an episode.
 * In the module bar it is as tall as the bar's small buttons, on their tonal wash; elsewhere it is
 * a sunken track with an icon button at each end. A side that would not change the value is off.
 * The web's `Stepper`.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { GlyphName } from '@unlease/design/glyphs';
import { SHAPES } from '@unlease/design/shapes';

import { AppText, Icon, IconButton, Organic, Tappable } from '../../components';
import { corners } from '../../theme/shape';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';

export interface StepperProps {
  /** Names the group: « Pour N personnes », « Saison ». */
  readonly label: string;
  readonly value: string;
  readonly lessLabel: string;
  readonly moreLabel: string;
  /** Absent: that side is off. */
  readonly onLess?: () => void;
  readonly onMore?: () => void;
  /** Before the value. */
  readonly icon?: GlyphName;
  /** In the module bar: as tall as its small buttons, on the tonal fill. */
  readonly inBar?: boolean;
}

/** The bar's small buttons: 32 high, their touch reaching 48. */
const BAR_HEIGHT = 32;
const BAR_INSET = 2;
const BAR_STONE = BAR_HEIGHT - BAR_INSET * 2;
const BAR_SLOP = { top: 10, bottom: 10, left: 4, right: 4 };

function StepperComponent({ label, value, lessLabel, moreLabel, onLess, onMore, icon, inBar }: StepperProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const ink = inBar ? theme.color.onActionContainer : theme.color.ink;
  const end = (glyph: GlyphName, name: string, run: (() => void) | undefined, turn: number) =>
    inBar ? (
      <Tappable accessibilityLabel={name} accessibilityState={{ disabled: !run }} disabled={!run} onPress={run} hitSlop={BAR_SLOP} pebble={turn} style={styles.barEnd}>
        <Icon name={glyph} size={18} color={ink} />
      </Tappable>
    ) : (
      <IconButton icon={glyph} label={name} disabled={!run} onPress={run} shape={turn} />
    );
  return (
    <Organic role="group" accessibilityLabel={label} style={inBar ? styles.bar : styles.track}>
      {end('minus', lessLabel, onLess, 0)}
      <View style={inBar ? styles.barValue : styles.value}>
        {icon ? <Icon name={icon} size={18} color={ink} /> : null}
        <AppText variant={inBar ? 'label' : 'bodyStrong'} color={ink} numberOfLines={1} accessibilityLiveRegion="polite">
          {value}
        </AppText>
      </View>
      {end('plus', moreLabel, onMore, 2)}
    </Organic>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    bar: { minHeight: BAR_HEIGHT, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: BAR_INSET, backgroundColor: theme.color.actionContainer, ...corners(SHAPES.button) },
    // An icon button's press: the pebble, here as small as the bar allows.
    barEnd: { width: BAR_STONE, height: BAR_STONE, alignItems: 'center', justifyContent: 'center' },
    barValue: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6 },
    track: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', backgroundColor: theme.color.track, ...corners(SHAPES.track) },
    value: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 4 },
  });

export const Stepper = memo(StepperComponent);
