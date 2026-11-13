/** Done is a stamp, not a disappearance: a tilted gouache stamp saying what was done and when. */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { t, tc } from '@unlease/core/i18n';
import type { LinkKind } from '@unlease/notes/models/entities';

import { useTheme } from '@shared/ui/theme/ThemeProvider';
import { AppText } from '@shared/ui/components/AppText';

export function stampWord(kind: LinkKind): string {
  switch (kind) {
    case 'product':
      return t('Bought');
    case 'film':
    case 'series':
    case 'video':
      return t('Watched');
    case 'book':
    case 'article':
      return t('Read');
    case 'music':
      return t('Heard');
    case 'game':
      return t('Played');
    case 'restaurant':
    case 'place':
    case 'event':
      return t('Visited');
    case 'recipe':
      return t('Cooked');
    default:
      return tc('ticked', 'Done');
  }
}

function StampComponent({ kind, date }: { kind: LinkKind; date: string }) {
  const theme = useTheme();
  const dark = theme.mode === 'dark';
  const ink = dark ? theme.line.red.fill : theme.color.danger;
  return (
    <View style={[styles.stamp, { borderColor: ink, opacity: dark ? 1 : 0.88 }]} accessibilityLabel={t('{stamp} on {date}', { stamp: stampWord(kind), date })}>
      <AppText variant="labelSmall" color={ink} style={styles.word}>
        {stampWord(kind).toUpperCase()}
      </AppText>
      <AppText variant="labelSmall" color={ink} style={styles.date}>
        {date}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  stamp: {
    borderWidth: 2,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 7,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignItems: 'center',
    transform: [{ rotate: '-8deg' }],
  },
  word: { letterSpacing: 1.2 },
  date: { fontSize: 10, lineHeight: 12 },
});

export const Stamp = memo(StampComponent);
