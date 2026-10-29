/** Done is a stamp, not a disappearance: a tilted gouache stamp saying what was done and when. */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import type { LinkKind } from '@unlease/notes/models/entities';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

export function stampWord(kind: LinkKind): string {
  switch (kind) {
    case 'product':
      return t('Acheté');
    case 'film':
    case 'series':
    case 'video':
      return t('Vu');
    case 'book':
    case 'article':
      return t('Lu');
    case 'music':
      return t('Écouté');
    case 'game':
      return t('Joué');
    case 'restaurant':
    case 'place':
    case 'event':
      return t('Visité');
    case 'recipe':
      return t('Cuisiné');
    default:
      return t('Fait');
  }
}

function StampComponent({ kind, date }: { kind: LinkKind; date: string }) {
  const theme = useTheme();
  const dark = theme.mode === 'dark';
  const ink = dark ? theme.line.red.fill : theme.color.danger;
  return (
    <View style={[styles.stamp, { borderColor: ink, opacity: dark ? 1 : 0.88 }]} accessibilityLabel={t('{stamp} le {date}', { stamp: stampWord(kind), date })}>
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
