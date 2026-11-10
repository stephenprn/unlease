/**
 * A 24dp glyph on the brand's pebble (40dp, inside Material's 48dp target), neighbours on different
 * turns of it. The press tint and the selected fill both fill the pebble, never past it: matcha, or
 * a veil of ink (`tone="ink"`) on a note's own colour, where matcha would clash with the wash; the
 * pebble gives under the finger. Selected, the glyph turns solid where it has a filled form.
 */
import React, { memo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

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
      hitSlop={ICON_SLOP}
      pebble={shape}
      style={[ICON_PEBBLE, fill, style]}
    >
      <Icon name={icon} size={size} color={ink} solid={!!selected} />
    </Tappable>
  );
}

/**
 * The pebble 40 inside its 48 slot (Material's state layer in its target): the margin keeps rows laid
 * out on the target, the slop reaches it, and two side by side keep 8 of clear ground between their
 * tints. A control drawn as an icon button without being one (a size, a label's tag) takes the same.
 */
export const ICON_PEBBLE = { width: 40, height: 40, margin: 4, alignItems: 'center', justifyContent: 'center' } as const satisfies ViewStyle;
export const ICON_SLOP = 4;

export const IconButton = memo(IconButtonComponent);
