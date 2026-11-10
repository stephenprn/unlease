/**
 * The events in the bin, as every app's (Carnet's pattern, the web's too): a single event or a whole
 * series (its exceptions go and come back with it), each with when it went there, « Restaurer » (with
 * « Annuler ») and « Supprimer définitivement » (asked first); the bar empties them all (asked
 * first). The server empties the bin itself after its retention.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { t, tc } from '@unlease/core/i18n';
import { formatRelative } from '@unlease/core/services/format';
import { GEOMETRY } from '@unlease/design/palette';
import { TRASH_RETENTION_DAYS } from '@unlease/calendar/models/events';
import { deletedForGoodWords, weekdayDay } from '@unlease/calendar/services/eventText';
import { deleteFromBin, emptyBin, restoreFromBin } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { useMinute } from '@shared/app/hooks/useMinute';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, Button, Dialog, EmptyState, Ground, Grain, IconButton, Organic, TopBar } from '@shared/ui/components';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import type { ScreenProps } from '../navigation/types';

export function TrashScreen({ navigation }: ScreenProps<'Trash'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const now = useMinute();
  const events = useLibraryStore(s => s.events);
  // Series and single events of one's own, the last binned first (the web's `binnedEvents`).
  const binned = useMemo(
    () => Object.values(events).filter(event => event.deletedAt === null && event.trashedAt !== null && event.feedId === null && !event.recurringId).sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0)),
    [events],
  );
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [emptying, setEmptying] = useState(false);

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Corbeille')} onBack={() => navigation.goBack()} actions={binned.length > 0 ? <IconButton icon="broom" label={t('Vider la corbeille')} onPress={() => setEmptying(true)} /> : undefined} />
      <ScrollView contentContainerStyle={styles.content}>
        {binned.length === 0 ? (
          <EmptyState scene="trash" title={t('La corbeille est vide')} text={t('Les événements supprimés y restent {days} jours, le temps de changer d’avis.', { days: TRASH_RETENTION_DAYS })} />
        ) : (
          <>
            <AppText variant="meta" color={theme.color.inkMuted} style={styles.notice}>
              {t('Les événements de la corbeille sont supprimés au bout de {days} jours.', { days: TRASH_RETENTION_DAYS })}
            </AppText>
            <Organic outline="card" style={styles.panel}>
              <Grain />
              {binned.map(item => {
                const title = item.title.trim() || t('Sans titre');
                return (
                  <View key={item.id} style={styles.row}>
                    <View style={styles.text}>
                      <AppText variant="bodyStrong" numberOfLines={1}>
                        {title}
                      </AppText>
                      <AppText variant="meta" numberOfLines={1}>
                        {weekdayDay(item.start.slice(0, 10))} · {t('Mis à la corbeille {when}', { when: formatRelative(item.trashedAt ?? now, now) })}
                      </AppText>
                    </View>
                    <Button
                      kind="tonal"
                      label={t('Restaurer')}
                      accessibilityLabel={t('Restaurer {name}', { name: title })}
                      onPress={() => showSnack(t('Événement restauré'), { label: tc('undo', 'Annuler'), run: restoreFromBin(item.id) }, { tone: 'success' })}
                    />
                    <IconButton icon="trash" label={t('Supprimer définitivement {name}', { name: title })} shape={2} onPress={() => setToDelete(item.id)} />
                  </View>
                );
              })}
            </Organic>
          </>
        )}
      </ScrollView>
      <Dialog
        visible={toDelete !== null}
        title={t('Supprimer définitivement ?')}
        message={t('L’événement disparaîtra de tous vos appareils.')}
        confirmLabel={t('Supprimer')}
        danger
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) deleteFromBin(toDelete);
          setToDelete(null);
          showSnack(t('Événement supprimé définitivement'), undefined, { tone: 'success' });
        }}
      />
      <Dialog
        visible={emptying}
        title={t('Vider la corbeille ?')}
        message={t('Tous les événements de la corbeille seront supprimés définitivement, sur tous vos appareils.')}
        confirmLabel={t('Vider')}
        danger
        onCancel={() => setEmptying(false)}
        onConfirm={() => {
          setEmptying(false);
          showSnack(deletedForGoodWords(emptyBin()), undefined, { tone: 'success' });
        }}
      />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    content: { paddingBottom: 48 },
    // On the rows' words (the panel's 12, their 16), as a settings section's title is on what its panel holds.
    notice: { paddingHorizontal: 28, paddingTop: 12, paddingBottom: 8 },
    panel: { marginHorizontal: 12, paddingVertical: 6, backgroundColor: theme.color.paper, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 64, paddingLeft: 16, paddingRight: 4, paddingVertical: 6, marginVertical: GEOMETRY.rowGap / 2 },
    text: { flex: 1, gap: 2 },
  });
