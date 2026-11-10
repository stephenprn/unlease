/**
 * A form's actions where the thumb finds them: pinned under what scrolls, at a sheet's foot or a
 * screen's, riding on the keyboard while it is up (the sheet rises with it). « Annuler » as text, the
 * one primary filled at the end; above them, the form's own line (`FormMessage`) when it has one.
 * Never inside the scroll, where the keyboard and the fields above would bury it. It stands on the
 * sheet's column (`SHEET_INSET` in), its hairline as wide as the fields above it: place it straight in
 * the sheet, never in a box that insets it already.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { FormMessage } from './FormMessage';
import { SHEET_INSET } from './Sheet';

export interface FormFootProps {
  /** The buttons, the primary last. */
  readonly children: React.ReactNode;
  /** The form's own problem (`form.message`). */
  readonly message?: string | null;
  /** A hairline over it, when what scrolls above runs under it (a sheet's list, a screen's form). */
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
    // On the sheet's column: the primary's end under the fields' end, its hairline as wide as they are.
    foot: { gap: 8, paddingTop: 12, marginHorizontal: SHEET_INSET },
    edge: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.color.hairline },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
  });
