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
  { mode: 'merge', title: tx('Compléter'), supporting: tx('Seul ce qui manque revient ; les modifications faites depuis sont gardées.') },
  { mode: 'rollback', title: tx('Revenir à la sauvegarde'), supporting: tx('Tout reprend l’état de la sauvegarde, sur tous vos appareils ; ce qui a été créé depuis est gardé.') },
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
      title={t('Restaurer cette sauvegarde ?')}
      message={empty ? t('Ses notes, listes, liens et pages reviennent sur le serveur, puis sur vos appareils.') : undefined}
      confirmLabel={t('Restaurer')}
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
