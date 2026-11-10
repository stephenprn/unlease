/**
 * « Publication »: one's own events at a secret address (iCalendar, `/ical/<secret>.ics`), for another
 * calendar to subscribe to (Google Agenda's « À partir de l'URL », Apple's, Thunderbird's). As on the
 * web: a switch « Publier mon agenda », then the address shown whole (made to be pasted), copied or
 * shared, and renewed on demand, once asked (the old address then stops, for every calendar that reads it).
 */
import React, { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import type { CalendarPatch } from '@unlease/core/sync/settings';
import type { AdminState } from '@shared/app/hooks/useAdmin';
import type { ServerConfig } from '@shared/app/store/settingsStore';
import type { AdminOverlays } from '@shared/ui/features/admin/overlays';
import { showSnack } from '@shared/app/store/uiStore';
import { saveServerSettings } from '@shared/app/sync/transport';
import { copyText } from '@shared/platform/clipboard';
import { later } from '@app/later';

import { AppText, Button, ListRow, SwitchMark } from '@shared/ui/components';

export { PUBLISH_INFO, publishLine } from '@unlease/calendar/services/admin';

export function PublishSection({ server, admin, overlays }: { server: ServerConfig; admin: AdminState; overlays: AdminOverlays }) {
  const path = admin.settings!.calendar.publishPath;
  const [busy, setBusy] = useState(false);
  const address = path ? `${server.url}${path}` : null;

  const save = async (patch: CalendarPatch, done: string): Promise<void> => {
    setBusy(true);
    try {
      admin.setSettings(await saveServerSettings(server, { calendar: patch }));
      showSnack(done, undefined, { tone: 'success' });
    } catch (failure) {
      showSnack(failure instanceof Error ? t(failure.message) : t('Réglage refusé'), undefined, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ListRow
        icon="share"
        title={t('Publier mon agenda')}
        supporting={path ? t('Vos événements, à l’adresse ci-dessous.') : t('Désactivé : rien n’est servi hors de l’application.')}
        disabled={busy}
        onPress={() => later(save({ publish: !path }, path ? t('Agenda dépublié') : t('Agenda publié')))}
        trailing={<SwitchMark checked={!!path} />}
        accessibilityRole="switch"
        accessibilityState={{ checked: !!path, disabled: busy }}
      />
      {address ? (
        <View style={styles.body}>
          <AppText variant="body" selectable>
            {address}
          </AppText>
          <View style={styles.row}>
            <Button label={t('Copier l’adresse')} icon="copy" kind="tonal" small onPress={() => later(copyText(address).then(done => done && showSnack(t('Adresse copiée'), undefined, { tone: 'success' })))} />
            <Button label={t('Partager')} icon="share" kind="text" small onPress={() => later(Share.share({ message: address }))} />
            <Button
              label={t('Nouvelle adresse')}
              icon="refresh"
              kind="text"
              small
              disabled={busy}
              onPress={() =>
                overlays.ask({
                  title: t('Nouvelle adresse ?'),
                  message: t('L’adresse actuelle cesse de marcher : les agendas abonnés devront prendre la nouvelle.'),
                  confirmLabel: t('Nouvelle adresse'),
                  run: () => later(save({ publish: 'renew' }, t('Nouvelle adresse créée'))),
                })
              }
            />
          </View>
          <AppText variant="meta">{t('Dans Google Agenda : Autres agendas, +, « À partir de l’URL », puis collez l’adresse. Google la relit de lui-même, toutes les quelques heures.')}</AppText>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
