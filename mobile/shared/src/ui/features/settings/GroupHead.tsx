/**
 * A group's name inside a long panel (S3's connection, its schedule, its backups): a hairline across
 * the panel, then the name in the section titles' ink and size, on the fields' column. Android
 * clusters a panel's settings this way: a heading always comes with its divider. `inFields`: drawn
 * inside a column of fields, whose own 16 its hairline runs past to the panel's edges.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../../components';
import { useTheme } from '../../theme/ThemeProvider';

export function GroupHead({ title, inFields = false }: { title: string; inFields?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.head, { borderTopColor: theme.color.hairline }, inFields ? styles.inFields : null]} accessibilityRole="header">
      <AppText variant="section" color={theme.color.inkMuted}>
        {title}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { marginTop: 10, paddingTop: 18, paddingBottom: 4, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth },
  inFields: { marginHorizontal: -16 },
});
