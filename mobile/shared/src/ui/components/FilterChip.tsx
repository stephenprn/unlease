/**
 * A filter among a few (a radio group: the import's fates, Carnet's board), a chip: its name and how
 * many it keeps, on paper at the chip radius with a hairline; the one chosen on the primary's wash.
 */
import React from 'react';
import { StyleSheet } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';

import { corners } from '../theme/shape';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { AppText } from './AppText';
import { Tappable } from './Tappable';

export interface FilterChipProps {
  readonly checked: boolean;
  readonly label: string;
  readonly count: number;
  readonly onPress: () => void;
}

export function FilterChip({ checked, label, count, onPress }: FilterChipProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <Tappable
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      accessibilityLabel={`${label}, ${count}`}
      onPress={onPress}
      style={[styles.chip, checked ? { backgroundColor: theme.color.actionContainer, borderColor: theme.color.actionContainer } : null]}
    >
      <AppText variant="label" color={checked ? theme.color.onActionContainer : theme.color.ink}>
        {label}
      </AppText>
      <AppText variant="label" color={checked ? theme.color.onActionContainer : theme.color.inkMuted}>
        {String(count)}
      </AppText>
    </Tappable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    chip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 14, borderWidth: 1, borderColor: theme.color.hairline, backgroundColor: theme.color.paper, ...corners(SHAPES.chip) },
  });
