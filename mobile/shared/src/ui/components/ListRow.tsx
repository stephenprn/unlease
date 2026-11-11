/** A settings-shaped row: icon, title, supporting text, trailing content. */
import React, { memo } from 'react';
import { StyleSheet, View, type AccessibilityRole, type AccessibilityState } from 'react-native';

import type { GlyphName } from '@unlease/design/glyphs';
import { GEOMETRY } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';

import { listPressDelay } from '../theme/motion';
import { corners } from '../theme/shape';
import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { placedRow, usePanelRowCorners, type RowPlace } from './panelRows';
import { Tappable } from './Tappable';

export interface ListRowProps {
  readonly title: string;
  readonly supporting?: string;
  readonly icon?: GlyphName;
  readonly leading?: React.ReactNode;
  readonly trailing?: React.ReactNode;
  readonly onPress?: () => void;
  readonly danger?: boolean;
  /** A search's matches in the title, marked as everywhere (`matchRanges`). */
  readonly highlight?: readonly (readonly [number, number])[];
  /** A pressable row that takes nothing for now (a setting being saved): it reads the same. */
  readonly disabled?: boolean;
  /** A pressable row that is a control (a switch, a radio among choices): what it is and its state (`checked`, `selected`). */
  readonly accessibilityRole?: AccessibilityRole;
  readonly accessibilityState?: AccessibilityState;
  /** Its place among its panel's rows: the first's and the last's press follows the panel's corners (a `Section` gives it to its first and last rows). */
  readonly place?: RowPlace | null;
}

function ListRowComponent({ title, supporting, icon, leading, trailing, onPress, danger, highlight, disabled, accessibilityRole, accessibilityState, place }: ListRowProps) {
  const theme = useTheme();
  const shape = usePanelRowCorners(place);
  const body = (
    <>
      {leading ?? (icon ? <Icon name={icon} size={24} color={danger ? theme.color.danger : theme.color.ink} /> : null)}
      <View style={styles.text}>
        <AppText variant="body" color={danger ? theme.color.danger : undefined} highlight={highlight}>
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
    <Tappable unstable_pressDelay={listPressDelay} onPress={onPress} disabled={disabled} ownDisabled accessibilityLabel={title} accessibilityValue={supporting ? { text: supporting } : undefined} accessibilityRole={accessibilityRole} accessibilityState={accessibilityState} style={[styles.row, shape]}>
      {body}
    </Tappable>
  );
}

const styles = StyleSheet.create({
  // Inset by 6 so its press stays inside the card or sheet it lists in; half the rows' gap above and below, so two rows' presses never touch and the card's 4 makes it 6 from its edge too.
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 16, marginHorizontal: 6, marginVertical: GEOMETRY.rowGap / 2, paddingHorizontal: 10, paddingVertical: 8, ...corners(SHAPES.tab) },
  text: { flex: 1, gap: 2 },
});

export const ListRow = placedRow(memo(ListRowComponent));

/** How far apart one-line rows lie, their gap counted: for a list laid out by number (`getItemLayout`). */
export const LIST_ROW_PITCH = 56 + GEOMETRY.rowGap;
