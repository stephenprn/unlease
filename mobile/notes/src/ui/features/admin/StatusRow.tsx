/** A section's state at its head: a dot in the state's colour, a line, a quieter line under it. */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';
import type { StatusLine, StatusTone } from '@unlease/core/services/admin';

import { AppText } from '../../components';
import { corners } from '../../theme/shape';
import { useTheme } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';

export function toneColor(theme: Theme, tone: StatusTone): string {
  return tone === 'ok' ? theme.color.ok : tone === 'waiting' ? theme.color.waiting : tone === 'danger' ? theme.color.danger : theme.color.inkFaint;
}

export const StatusRow = memo(function StatusRowView({ line, children }: { line: StatusLine; children?: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.status}>
      <View style={[styles.dot, { backgroundColor: toneColor(theme, line.tone) }]} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{line.title}</AppText>
        {line.meta ? <AppText variant="meta">{line.meta}</AppText> : null}
      </View>
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  // Centred on the title's 23 dp line.
  dot: { width: 10, height: 10, ...corners(SHAPES.dot), marginTop: 6.5 },
  flex: { flex: 1 },
});
