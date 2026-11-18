/**
 * A timer's length as a figure: the numbers large in Signika SemiBold, tabular, each unit after it
 * small in the second ink (`5 min`, `1 h 30 min`), as a watch face sets them. One sentence for TalkBack.
 */
import React, { memo } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

import { lengthParts, lengthSentence } from '@unlease/clock/services/timers';
import { AppText } from '@shared/ui/components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';
import { fontFamily } from '@shared/ui/theme/typography';

interface Props {
  readonly seconds: number;
  /** The figures' size; the units take half of it (12 at least). */
  readonly size: number;
  readonly color?: string;
  readonly style?: StyleProp<TextStyle>;
}

function LengthFigureComponent({ seconds, size, color, style }: Props) {
  const theme = useTheme();
  const ink = color ?? theme.color.ink;
  const figure: TextStyle = { fontFamily: fontFamily(theme, 'SemiBold'), fontSize: size, letterSpacing: -size / 60, color: ink, fontVariant: ['tabular-nums'] };
  const unit: TextStyle = { fontFamily: fontFamily(theme, 'Medium'), fontSize: Math.max(12, Math.round(size * 0.5)), letterSpacing: 0, color: theme.color.inkMuted };
  return (
    // Nested runs of two sizes on one baseline: the figures, then each unit.
    <AppText accessibilityLabel={lengthSentence(seconds)} numberOfLines={1} style={[{ lineHeight: Math.round(size * 1.18) }, style]}>
      {lengthParts(seconds).map(([value, name], index) => (
        <AppText key={index}>
          <AppText style={figure}>{index > 0 ? ` ${value}` : value}</AppText>
          <AppText style={unit}>{` ${name}`}</AppText>
        </AppText>
      ))}
    </AppText>
  );
}

export const LengthFigure = memo(LengthFigureComponent);
