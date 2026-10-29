/**
 * habits-garden's button: filled terracotta for the one primary action on a surface, matcha wash
 * for a secondary one, deep terracotta text for a tertiary one; danger takes the mirrored shape,
 * filled or as text in the danger ink (a tertiary action that destroys).
 * Disabled, it sinks to a well with its label in the second ink, never a faded pigment; busy keeps
 * its colours and spins.
 */
import React, { memo } from 'react';
import { ActivityIndicator, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import type { GlyphName } from '@unlease/design/glyphs';
import { SHAPES } from '@unlease/design/shapes';

import { corners } from '../theme/shape';
import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { Tappable } from './Tappable';

export interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly kind?: 'filled' | 'tonal' | 'text' | 'danger' | 'dangerText';
  readonly icon?: GlyphName;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  /** 32 high, as the web's small button, beside a line of text; its touch target stays 48. */
  readonly small?: boolean;
  /** What a screen reader says when the label alone is short of it (« Suivante »: « Étape suivante »). */
  readonly accessibilityLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
}

// Fitted to the button's 48, so its rounded ends never meet into a capsule.
const SHAPE = corners(SHAPES.button);

function ButtonComponent({ label, onPress, kind = 'filled', icon, disabled, busy, small, accessibilityLabel, style }: ButtonProps) {
  const theme = useTheme();
  const c = theme.color;
  const off = !!disabled && !busy;
  const text = kind === 'text' || kind === 'dangerText';
  const fill = text ? 'transparent' : off ? c.paperHigh : kind === 'filled' ? c.action : kind === 'tonal' ? c.actionContainer : c.danger;
  const ink = off ? c.inkMuted : kind === 'filled' ? c.onAction : kind === 'tonal' ? c.onActionContainer : kind === 'danger' ? c.onDanger : kind === 'dangerText' ? c.danger : c.link;
  const inactive = disabled || busy;
  const filled = kind === 'filled' || kind === 'danger';
  return (
    <Tappable
      onPress={onPress}
      disabled={inactive}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      onFill={filled}
      ownDisabled
      hitSlop={small ? 8 : undefined}
      style={[styles.button, SHAPE, { backgroundColor: fill }, text ? styles.text : null, small ? styles.small : null, style]}
    >
      {/* A filled button's glyph stands on its own colour: no paper behind it. */}
      {busy ? <ActivityIndicator size="small" color={ink} /> : icon ? <Icon name={icon} size={18} color={ink} /> : null}
      <AppText variant="label" color={ink}>
        {label}
      </AppText>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 48, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'flex-start' },
  text: { paddingHorizontal: 14 },
  small: { minHeight: 32, paddingHorizontal: 14 },
});

export const Button = memo(ButtonComponent);
