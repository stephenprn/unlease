/**
 * The capture button: the brand's pebble in leaf matcha, flat on the ground, one per screen. Under
 * the finger its tint fills the pebble and the pebble gives toward round, then springs back; it
 * never grows past itself.
 */
import React, { memo } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import type { GlyphName } from '@unlease/design/glyphs';
import { SHAPES } from '@unlease/design/shapes';

import { corners } from '../theme/shape';
import { useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { Tappable } from './Tappable';

function FabComponent({ icon, label, onPress, extended = false, style }: { icon: GlyphName; label: string; onPress: () => void; extended?: boolean; style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Tappable accessibilityLabel={label} onPress={onPress} onFill pebble={extended ? null : 0} style={[styles.fab, extended ? styles.extended : null, style]}>
      <Icon name={icon} size={28} color={styles.ink.color} />
      {extended ? (
        <AppText variant="label" color={styles.ink.color}>
          {label}
        </AppText>
      ) : null}
    </Tappable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    fab: {
      width: 66,
      height: 60,
      backgroundColor: t.color.leaf,
      alignItems: 'center',
      justifyContent: 'center',
    },
    extended: { width: undefined, paddingHorizontal: 20, flexDirection: 'row', gap: 10, ...corners(SHAPES.button) },
    ink: { color: t.color.onLeaf },
  });

export const Fab = memo(FabComponent);
