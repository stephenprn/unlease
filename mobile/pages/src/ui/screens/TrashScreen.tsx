/**
 * The pages in the bin: each with when it went there, « Restaurer » and « Supprimer
 * définitivement »; the bar empties them all (asked first). They go for good after the bin's
 * retention, as Carnet's notes do.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { TRASH_RETENTION_DAYS } from '@unlease/notes/models/entities';
import { useTrashedPages } from '@app/hooks/usePages';
import { emptyPagesBin } from '@app/store/pages';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, Dialog, EmptyState, Ground, IconButton, TopBar } from '@shared/ui/components';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { DeletePageDialog, PagesBinSection } from '../features/pages/PagesBin';
import type { ScreenProps } from '../navigation/types';

export function TrashScreen({ navigation }: ScreenProps<'Trash'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const binned = useTrashedPages().length;
  const [pageToDelete, setPageToDelete] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar
        title={t('Corbeille')}
        onBack={() => navigation.goBack()}
        actions={binned > 0 ? <IconButton icon="broom" label={t('Vider la corbeille')} onPress={() => setConfirmEmpty(true)} /> : undefined}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {/* How long pages stay, said once under the title while the bin holds some: empty, its empty state says it. */}
        {binned > 0 ? (
          <AppText variant="meta" color={theme.color.inkMuted} style={styles.notice}>
            {t('Les pages de la corbeille sont supprimées au bout de {days} jours.', { days: TRASH_RETENTION_DAYS })}
          </AppText>
        ) : null}
        {binned === 0 ? (
          <EmptyState scene="trash" title={t('La corbeille est vide')} text={t('Les pages supprimées y restent {days} jours, le temps de changer d’avis.', { days: TRASH_RETENTION_DAYS })} />
        ) : (
          <PagesBinSection notesFollow={false} onDelete={setPageToDelete} />
        )}
      </ScrollView>
      <DeletePageDialog id={pageToDelete} onClose={() => setPageToDelete(null)} />
      <Dialog
        visible={confirmEmpty}
        title={t('Vider la corbeille ?')}
        message={t('Toutes les pages de la corbeille seront supprimées définitivement, sur tous vos appareils.')}
        confirmLabel={t('Vider')}
        danger
        onCancel={() => setConfirmEmpty(false)}
        onConfirm={() => {
          setConfirmEmpty(false);
          const pages = emptyPagesBin();
          showSnack(t('{deleted} définitivement', { deleted: plural(pages, 'page supprimée', 'pages supprimées') }), undefined, { tone: 'success' });
        }}
      />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    content: { paddingBottom: 48 },
    // In line with what the pages' panels hold (16 in from their edge), as the settings' section titles.
    notice: { paddingHorizontal: 28, paddingTop: 12 },
  });
