/**
 * Restoring a backup: on a server that holds nothing it simply comes back; otherwise the person
 * chooses between going back to it (its values win everywhere) and completing with it (only what
 * is missing returns).
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t, tx } from '@unlease/core/i18n';
import type { RestoreMode } from '@unlease/core/sync/admin';

import { Dialog, Icon, ListRow } from '../../components';
import { useTheme } from '../../theme/ThemeProvider';

const CHOICES: readonly { readonly mode: RestoreMode; readonly title: string; readonly supporting: string }[] = [
  { mode: 'merge', title: tx('Complete'), supporting: tx('Only what is missing comes back; changes made since are kept.') },
  { mode: 'rollback', title: tx('Go back to the backup'), supporting: tx('Everything returns to the backup’s state, on all your devices; what was created since is kept.') },
];

export function RestoreDialog({ visible, empty, onCancel, onConfirm }: { visible: boolean; empty: boolean; onCancel: () => void; onConfirm: (mode: RestoreMode) => void }) {
  const theme = useTheme();
  const [mode, setMode] = useState<RestoreMode>('merge');
  useEffect(() => {
    if (visible) setMode('merge');
  }, [visible]);
  return (
    <Dialog
      visible={visible}
      title={t('Restore this backup?')}
      message={empty ? t('The data of every app comes back to the server, then to your devices.') : undefined}
      confirmLabel={t('Restore')}
      onCancel={onCancel}
      onConfirm={() => onConfirm(empty ? 'merge' : mode)}
    >
      {empty ? null : (
        <View style={styles.choices} accessibilityRole="radiogroup">
          {CHOICES.map(choice => (
            <ListRow
              key={choice.mode}
              title={t(choice.title)}
              supporting={t(choice.supporting)}
              leading={<View style={styles.mark}>{choice.mode === mode ? <Icon name="check" size={22} color={theme.color.focus} /> : null}</View>}
              onPress={() => setMode(choice.mode)}
              accessibilityRole="radio"
              accessibilityState={{ checked: choice.mode === mode }}
            />
          ))}
        </View>
      )}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  // The rows' own inset brings their text in line with the dialog's title.
  choices: { marginHorizontal: -16 },
  mark: { width: 24, alignItems: 'center' },
});
