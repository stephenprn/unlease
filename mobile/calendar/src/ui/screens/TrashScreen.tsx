/**
 * The events in the bin, as every app's (`BinList`, Carnet's pattern, the web's too): a single event or
 * a whole series (its exceptions go and come back with it), a card each with its day and when it went
 * there, opening the event, « Restaurer » (with « Annuler ») and « Supprimer définitivement » (asked
 * first); the bar empties them all (asked first). The server empties the bin itself after its retention.
 */
import React, { memo, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { formatRelative } from '@unlease/core/services/format';
import { TRASH_RETENTION_DAYS } from '@unlease/calendar/models/events';
import { deletedForGoodWords, weekdayDay } from '@unlease/calendar/services/eventText';
import { deleteFromBin, emptyBin, restoreFromBin } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { useMinute } from '@shared/app/hooks/useMinute';
import { showSnack } from '@shared/app/store/uiStore';

import { BinList, BinRow, Dialog, Ground, Icon, IconButton, TopBar } from '@shared/ui/components';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import type { ScreenProps } from '../navigation/types';

const TrashedEventRow = memo(function TrashedEventRowView({ id, now, onOpen, onDelete }: { id: string; now: number; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  const theme = useTheme();
  const event = useLibraryStore(s => s.events[id]);
  if (!event) return null;
  const title = event.title.trim() || t('Untitled');
  return (
    <BinRow
      title={title}
      meta={`${weekdayDay(event.start.slice(0, 10))} · ${t('Moved to the bin {when}', { when: formatRelative(event.trashedAt ?? now, now) })}`}
      leading={<Icon name="calendar" size={24} color={theme.color.ink} />}
      onOpen={() => onOpen(id)}
      onRestore={() => showSnack(t('Event restored'), { label: t('Undo'), run: restoreFromBin(id) }, { tone: 'success' })}
      onDelete={() => onDelete(id)}
    />
  );
});

export function TrashScreen({ navigation }: ScreenProps<'Trash'>) {
  const styles = useThemedStyles(makeStyles);
  const now = useMinute();
  const events = useLibraryStore(s => s.events);
  // Series and single events of one's own, the last binned first (the web's `binnedEvents`).
  const ids = useMemo(
    () =>
      Object.values(events)
        .filter(event => event.deletedAt === null && event.trashedAt !== null && event.feedId === null && !event.recurringId)
        .sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0))
        .map(event => event.id),
    [events],
  );
  const open = (id: string) => navigation.navigate('Event', { id });
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [emptying, setEmptying] = useState(false);

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Bin')} onBack={() => navigation.goBack()} actions={ids.length > 0 ? <IconButton icon="broom" label={t('Empty the bin')} onPress={() => setEmptying(true)} /> : undefined} />
      <BinList
        ids={ids}
        retention={t('Events in the bin are deleted after {days} days.', { days: TRASH_RETENTION_DAYS })}
        emptyText={t('Deleted events stay there for {days} days, in case you change your mind.', { days: TRASH_RETENTION_DAYS })}
        renderRow={id => <TrashedEventRow id={id} now={now} onOpen={open} onDelete={setToDelete} />}
      />
      <Dialog
        visible={toDelete !== null}
        title={t('Delete forever?')}
        message={t('The event will leave all your devices.')}
        confirmLabel={t('Delete')}
        danger
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) deleteFromBin(toDelete);
          setToDelete(null);
          showSnack(t('Event deleted forever'), undefined, { tone: 'success' });
        }}
      />
      <Dialog
        visible={emptying}
        title={t('Empty the bin?')}
        message={t('Every event in the bin will be deleted for good, on all your devices.')}
        confirmLabel={t('Empty')}
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
  });
