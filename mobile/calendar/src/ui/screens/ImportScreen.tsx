/**
 * « Importer »: a calendar file (Google Agenda's export from Takeout, an `.ics` shared or opened, an
 * invitation), read and shown before anything is written: how many events, how many already here;
 * « Importer » writes them as one batch, one's own from then on.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { planImport } from '@unlease/calendar/services/importing';
import { readCalendarFiles } from '@app/importing';
import { setPendingImport, useImportStore } from '@app/store/importStore';
import { writeImport } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { later } from '@app/later';
import { showSnack } from '@shared/app/store/uiStore';
import { pickDocument } from '@shared/platform/documents';

import { AppText, Button, Collage, Ground, Organic, TopBar } from '@shared/ui/components';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import type { ScreenProps } from '../navigation/types';

export function ImportScreen({ navigation }: ScreenProps<'Import'>) {
  const styles = useThemedStyles(makeStyles);
  const pending = useImportStore(s => s.pending);
  const events = useLibraryStore(s => s.events);
  const [reading, setReading] = useState(false);
  useEffect(() => () => setPendingImport(null), []);
  const plan = useMemo(() => (pending ? planImport(pending.calendar, Object.values(events), Date.now()) : null), [pending, events]);

  const pick = async (): Promise<void> => {
    const picked = await pickDocument(['text/calendar', 'application/octet-stream', '*/*']);
    if (picked.status !== 'ok' || !picked.path) {
      if (picked.status === 'error') showSnack(picked.message ? t(picked.message) : t('Fichier illisible'), undefined, { tone: 'error' });
      return;
    }
    setReading(true);
    const read = await readCalendarFiles([picked.path]);
    setReading(false);
    if (read.status === 'ok') setPendingImport({ calendar: read.calendar, name: picked.name });
    else showSnack(read.status === 'empty' ? t('Aucun événement dans ce fichier.') : read.message, undefined, { tone: read.status === 'empty' ? 'warning' : 'error' });
  };

  const write = (): void => {
    if (!plan) return;
    const count = writeImport(plan);
    setPendingImport(null);
    showSnack(t('{events} importés', { events: plural(count, 'événement') }), undefined, { tone: 'success' });
    navigation.goBack();
  };

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Importer')} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        {!pending || !plan ? (
          <View style={styles.empty}>
            <Collage scene="notes" width={220} />
            <AppText variant="body" style={styles.centered}>
              {t('Un fichier d’agenda (.ics) : l’export de Google Agenda (Google Takeout, ou Paramètres > Importer et exporter), une invitation, un billet.')}
            </AppText>
            <Button label={t('Choisir un fichier')} icon="download" busy={reading} onPress={() => later(pick())} />
          </View>
        ) : (
          <Organic outline="card" style={styles.panel}>
            <AppText variant="title">{pending.calendar.name || pending.name || t('Agenda importé')}</AppText>
            <AppText variant="body">{t('{events} à ajouter', { events: plural(plan.creates.length, 'événement') })}</AppText>
            {plan.skipped > 0 ? <AppText variant="meta">{t('{events} déjà dans l’agenda', { events: plural(plan.skipped, 'événement') })}</AppText> : null}
            {plan.dropped > 0 ? <AppText variant="meta">{t('{events} annulés ou incomplets, laissés de côté', { events: plural(plan.dropped, 'événement') })}</AppText> : null}
            {/* As every form's foot: « Annuler » as text, the primary at the end. */}
            <View style={styles.actions}>
              <Button label={t('Annuler')} kind="text" onPress={() => (setPendingImport(null), navigation.goBack())} />
              <Button label={t('Importer')} icon="check" disabled={plan.creates.length === 0} onPress={write} />
            </View>
          </Organic>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    content: { padding: 16, gap: 16 },
    empty: { alignItems: 'center', gap: 16, paddingTop: 24 },
    centered: { textAlign: 'center' },
    panel: { gap: 8, padding: 16, backgroundColor: theme.color.paper },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  });
