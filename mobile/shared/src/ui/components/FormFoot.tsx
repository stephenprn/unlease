/**
 * A form's actions where the thumb finds them: pinned under what scrolls, at a sheet's foot or a
 * screen's, riding on the keyboard while it is up (the sheet rises with it). « Annuler » as text, the
 * one primary filled at the end; above them, the form's own line (`FormMessage`) when it has one.
 * Never inside the scroll, where the keyboard and the fields above would bury it. Its buttons stand on
 * the sheet's column (`SHEET_INSET` in), its edge runs the sheet's whole width: place it straight in
 * the sheet, never in a box that insets it already.
 */
import React, { memo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { FormMessage } from './FormMessage';
import { SHEET_INSET } from './Sheet';

/**
 * A footer's top edge (a form's actions, a toolbar, a composer): one firm rule across its whole
 * width, where what scrolls above it stops. A scroller's foot never fades on the phone (`ScrollEdges`):
 * this line is where it ends, the same on every footer. Material's divider: 1, in the hairline's ink.
 */
export function footEdge(theme: Theme): ViewStyle {
  return { borderTopWidth: 1, borderTopColor: theme.color.hairline };
}

export interface FormFootProps {
  /** The buttons, the primary last. */
  readonly children: React.ReactNode;
  /** The form's own problem (`form.message`). */
  readonly message?: string | null;
  /** Its top edge (`footEdge`); off where the box above it already draws one. */
  readonly edge?: boolean;
}

function FormFootComponent({ children, message, edge = true }: FormFootProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.foot, edge ? styles.edge : null]}>
      <FormMessage message={message} />
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

export const FormFoot = memo(FormFootComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // The primary's end under the fields' end, on the sheet's column; its edge across the whole sheet.
    foot: { gap: 8, paddingTop: 12, paddingHorizontal: SHEET_INSET },
    edge: footEdge(theme),
    actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
  });
