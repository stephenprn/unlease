/**
 * The pages in the bin, as every app's (`BinList`): a card each with when it went there, opening the
 * page, « Restaurer » and « Supprimer définitivement »; the bar empties them all (asked first). They
 * go for good after the bin's retention, as Carnet's notes do.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { TRASH_RETENTION_DAYS } from '@unlease/notes/models/entities';
import { useTrashedPages } from '@app/hooks/usePages';
import { emptyPagesBin } from '@app/store/pages';
import { useMinute } from '@shared/app/hooks/useMinute';
import { showSnack } from '@shared/app/store/uiStore';

import { BinList, Dialog, Ground, IconButton, TopBar } from '@shared/ui/components';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { DeletePageDialog, TrashedPageRow } from '../features/pages/PagesBin';
import type { ScreenProps } from '../navigation/types';

export function TrashScreen({ navigation }: ScreenProps<'Trash'>) {
  const styles = useThemedStyles(makeStyles);
  const ids = useTrashedPages();
  const binned = ids.length;
  const now = useMinute();
  const [pageToDelete, setPageToDelete] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const open = (id: string) => navigation.navigate('Page', { id });

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar
        title={t('Bin')}
        onBack={() => navigation.goBack()}
        actions={binned > 0 ? <IconButton icon="broom" label={t('Empty the bin')} onPress={() => setConfirmEmpty(true)} /> : undefined}
      />
      <BinList
        ids={ids}
        retention={t('Pages in the bin are deleted after {days} days.', { days: TRASH_RETENTION_DAYS })}
        emptyText={t('Deleted pages stay there for {days} days, in case you change your mind.', { days: TRASH_RETENTION_DAYS })}
        renderRow={id => <TrashedPageRow id={id} now={now} onOpen={open} onDelete={setPageToDelete} />}
      />
      <DeletePageDialog id={pageToDelete} onClose={() => setPageToDelete(null)} />
      <Dialog
        visible={confirmEmpty}
        title={t('Empty the bin?')}
        message={t('Every page in the bin will be deleted for good, on all your devices.')}
        confirmLabel={t('Empty')}
        danger
        onCancel={() => setConfirmEmpty(false)}
        onConfirm={() => {
          setConfirmEmpty(false);
          const pages = emptyPagesBin();
          showSnack(t('{deleted} forever', { deleted: plural(pages, 'page deleted', 'pages deleted') }), undefined, { tone: 'success' });
        }}
      />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
  });
