/** How strong a passphrase is, as it is typed: a short track filling in Safran, then the ok ink, and its word. */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { t, tx } from '@unlease/core/i18n';
import { passphraseStrength } from '@unlease/wallet/services/passphrase';
import { AppText } from '@shared/ui/components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

const WORDS = { weak: tx('Too easy to guess'), fair: tx('Could be stronger'), good: tx('Strong') } as const;

export function StrengthMeter({ passphrase }: { passphrase: string }) {
  const theme = useTheme();
  if (!passphrase) return null;
  const reading = passphraseStrength(passphrase);
  return (
    <View style={styles.row} accessibilityLiveRegion="polite">
      <View style={[styles.track, { backgroundColor: theme.color.track }]}>
        <View style={[styles.fill, { width: `${Math.round(Math.max(0.06, reading.score) * 100)}%`, backgroundColor: reading.level === 'good' ? theme.color.ok : theme.color.waiting }]} />
      </View>
      <AppText variant="meta" style={styles.word}>{reading.tooShort ? t('At least 12 characters') : t(WORDS[reading.level])}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  word: { flexShrink: 0 },
});
