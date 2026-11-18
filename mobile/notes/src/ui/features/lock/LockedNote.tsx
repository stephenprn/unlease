/**
 * A protected note (or collection, or one of its links) opened by its id while the lock is shut: from
 * a notification, a link, a mention. The lock in place of its content, as the protected section's;
 * opened, the screen shows the note itself.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@unlease/core/i18n';
import { LockPanel } from '@shared/ui/features/lock';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

import { EdgeScrollView, Ground, TopBar } from '../../components';

export function LockedNote({ onBack }: { onBack: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar onBack={onBack} />
      <EdgeScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        <LockPanel ghosts="notes" what={t('This note is protected: it opens with the password.')} />
      </EdgeScrollView>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    body: { paddingTop: 8 },
  });
