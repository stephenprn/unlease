/** A settings-shaped row: icon, title, supporting text, trailing content. */
import React, { memo } from 'react';
import { StyleSheet, View, type AccessibilityRole, type AccessibilityState } from 'react-native';

import type { GlyphName } from '@unlease/design/glyphs';
import { SHAPES } from '@unlease/design/shapes';

import { corners } from '../theme/shape';
import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { Tappable } from './Tappable';

export interface ListRowProps {
  readonly title: string;
  readonly supporting?: string;
  readonly icon?: GlyphName;
  readonly leading?: React.ReactNode;
  readonly trailing?: React.ReactNode;
  readonly onPress?: () => void;
  readonly danger?: boolean;
  /** A pressable row that takes nothing for now (a setting being saved): it reads the same. */
  readonly disabled?: boolean;
  /** A pressable row that is a control (a switch, a radio among choices): what it is and its state (`checked`, `selected`). */
  readonly accessibilityRole?: AccessibilityRole;
  readonly accessibilityState?: AccessibilityState;
}

function ListRowComponent({ title, supporting, icon, leading, trailing, onPress, danger, disabled, accessibilityRole, accessibilityState }: ListRowProps) {
  const theme = useTheme();
  const body = (
    <>
      {leading ?? (icon ? <Icon name={icon} size={24} color={danger ? theme.color.danger : theme.color.ink} /> : null)}
      <View style={styles.text}>
        <AppText variant="body" color={danger ? theme.color.danger : undefined}>
          {title}
        </AppText>
        {supporting ? <AppText variant="meta">{supporting}</AppText> : null}
      </View>
      {trailing}
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    // Named by its title; TalkBack reads the supporting text right after it (Android appends a value's text).
    <Tappable onPress={onPress} disabled={disabled} ownDisabled accessibilityLabel={title} accessibilityValue={supporting ? { text: supporting } : undefined} accessibilityRole={accessibilityRole} accessibilityState={accessibilityState} style={styles.row}>
      {body}
    </Tappable>
  );
}

const styles = StyleSheet.create({
  // Inset by 6 so its press, an organic pebble, sits inside the card or sheet it lists in.
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 16, marginHorizontal: 6, paddingHorizontal: 10, paddingVertical: 8, ...corners(SHAPES.tab) },
  text: { flex: 1, gap: 2 },
});

export const ListRow = memo(ListRowComponent);
