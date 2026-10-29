/**
 * A 24dp glyph on the brand's pebble (44dp, inside Material's 48dp target), neighbours on different
 * turns of it. The press tint and the selected fill both fill the pebble, never past it: matcha, or
 * a veil of ink (`tone="ink"`) on a note's own colour, where matcha would clash with the wash; the
 * pebble gives under the finger. Selected, the glyph turns solid where it has a filled form.
 */
import React, { memo } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import type { GlyphName } from '@unlease/design/glyphs';

import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import { Tappable } from './Tappable';

export interface IconButtonProps {
  readonly icon: GlyphName;
  readonly label: string;
  readonly onPress?: () => void;
  readonly onLongPress?: () => void;
  readonly color?: string;
  readonly onDark?: boolean;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly size?: number;
  /** Which turn of the pebble: neighbours differ. */
  readonly shape?: number;
  /** How a selected pebble shows: matcha, or a neutral veil of ink. */
  readonly tone?: 'accent' | 'ink';
  readonly style?: StyleProp<ViewStyle>;
}

function IconButtonComponent({ icon, label, onPress, onLongPress, color, onDark, disabled, selected, size = 24, shape = 0, tone = 'accent', style }: IconButtonProps) {
  const theme = useTheme();
  const accent = !!selected && tone === 'accent';
  // On a dark ground whatever the theme (the photo viewer, the slip): a light line.
  const ink = color ?? (accent ? theme.color.onActionContainer : onDark ? theme.color.onSlip : theme.color.ink);
  const fill = selected ? { backgroundColor: accent ? theme.color.actionContainer : theme.color.veil } : null;
  return (
    <Tappable
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, ...(selected !== undefined ? { selected } : {}) }}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      onDark={onDark}
      hitSlop={2}
      pebble={shape}
      style={[styles.pebble, fill, style]}
    >
      <Icon name={icon} size={size} color={ink} solid={!!selected} />
    </Tappable>
  );
}

const styles = StyleSheet.create({
  // 44 inside a 48 slot: the margin keeps rows laid out on Material's target, the slop reaches it.
  pebble: { width: 44, height: 44, margin: 2, alignItems: 'center', justifyContent: 'center' },
});

export const IconButton = memo(IconButtonComponent);
