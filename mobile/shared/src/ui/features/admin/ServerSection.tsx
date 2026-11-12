/** "Serveur": where the phone syncs, with which token, how it is going, and what the server holds. */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t, tx } from '@unlease/core/i18n';
import { serverFacts, type StatusTone } from '@unlease/core/services/admin';
import { formatRelative, plural } from '@unlease/core/services/format';
import type { AdminStatus } from '@unlease/core/sync/admin';
import { selectServer, setReading, setServer, useSettingsStore } from '@shared/app/store/settingsStore';
import { selectLastSync, selectPendingCount, selectSyncMessage, selectSyncPhase, useSyncStore } from '@shared/app/store/syncStore';
import { showSnack } from '@shared/app/store/uiStore';
import { connectFailureField, connectFailureMessage, setupFieldHelp } from '@unlease/core/services/setup';
import { checkServer, SyncError } from '@shared/app/sync/transport';
import { requestSync, startSync, stopSync } from '@shared/app/sync/syncManager';

import { Button, FormMessage, ListRow, TextField, useForm } from '../../components';
import type { AdminOverlays } from './overlays';
import { StatusRow } from './StatusRow';
import { BackgroundSyncRows } from '../settings/BackgroundSyncRows';

export const SERVER_INFO = tx(
  'Le serveur garde les données de vos applications et les synchronise entre vos appareils. Il fait le reste aussi : Claude, la sauvegarde sur S3, vos fichiers sur Seafile, une fois reliés.',
);

export function ServerSection({ status, ask }: { status: AdminStatus | null; ask: AdminOverlays['ask'] }) {
  const server = useSettingsStore(selectServer);
  const phase = useSyncStore(selectSyncPhase);
  const pending = useSyncStore(selectPendingCount);
  const lastSync = useSyncStore(selectLastSync);
  const message = useSyncStore(selectSyncMessage);
  const clock = useSyncStore(s => s.clock);
  const [url, setUrl] = useState(server?.url ?? '');
  const [token, setToken] = useState(server?.token ?? '');

  // What the server refuses comes back under the field it concerns: the token, or the address.
  const form = useForm(
    {
      address: url.trim() ? null : t('Saisissez l’adresse de votre serveur.'),
      token: token.trim() ? null : t('Saisissez le jeton de votre serveur.'),
    },
    { order: ['address', 'token'], sendOnDone: () => connect() },
  );

  async function connect(): Promise<boolean> {
    try {
      const config = { url: url.trim().replace(/\/+$/, ''), token: token.trim() };
      const normalized = /^https?:\/\//.test(config.url) ? config : { ...config, url: `https://${config.url}` };
      const health = await checkServer(normalized);
      setServer(normalized);
      setReading(health.analysis);
      startSync();
      showSnack(health.analysis ? t('Connecté, avec Claude.') : t('Connecté, mais le serveur n’a pas de clé Claude.'), undefined, { tone: health.analysis ? 'success' : 'warning' });
      return true;
    } catch (failure) {
      const refusal = failure instanceof Error ? t(failure.message) : t('Serveur injoignable');
      if (failure instanceof SyncError) form.fail(connectFailureField(failure.kind, failure.status), connectFailureMessage(failure.kind, refusal));
      else form.fail('address', refusal);
      return false;
    }
  }

  const words =
    phase === 'local'
      ? t('Non connecté : tout reste sur ce téléphone.')
      : phase === 'unauthorized'
        ? t('Le serveur refuse ce jeton.')
        : phase === 'offline'
          ? [t('Hors ligne'), pending > 0 ? t('{changes} en attente', { changes: plural(pending, 'modification') }) : '', message ? t(message) : '', lastSync ? t('Synchronisé {when}', { when: formatRelative(lastSync, Date.now()) }) : ''].filter(Boolean).join(' · ')
          : phase === 'syncing'
            ? t('Synchronisation…')
            : `${lastSync ? t('Synchronisé {when}', { when: formatRelative(lastSync, Date.now()) }) : t('Connecté')}${clock ? ` · ${clock}` : ''}`;
  const tone: StatusTone = phase === 'synced' ? 'ok' : phase === 'unauthorized' ? 'danger' : phase === 'local' ? 'off' : 'waiting';

  return (
    <>
      {/* The same head as every section's: the dot on the state's first line. */}
      <StatusRow line={{ tone, title: words, meta: server && status ? serverFacts(status.server) : '' }} />
      <View style={styles.fields}>
        <TextField label={t('Adresse')} kind="serverAddress" value={url} onChangeText={setUrl} field={form.field('address')} help={setupFieldHelp('address')} />
        <TextField label={t('Jeton')} kind="serverToken" value={token} onChangeText={setToken} field={form.field('token')} revealLabels={{ show: t('Afficher le jeton'), hide: t('Masquer le jeton') }} />
        <FormMessage message={form.message} />
        <View style={styles.row}>
          <Button label={server ? t('Tester et enregistrer') : t('Se connecter')} icon="server" busy={form.busy} onPress={() => void form.submit(connect)} />
          {server ? (
            <Button
              kind="tonal"
              label={t('Synchroniser')}
              icon="refresh"
              onPress={() => {
                startSync();
                requestSync();
              }}
            />
          ) : null}
        </View>
      </View>
      {/* What Android holds back of the sync with the app closed, with what fixes it. */}
      {server ? <BackgroundSyncRows /> : null}
      {server ? (
        <ListRow
          icon="cloudOff"
          title={t('Se déconnecter du serveur')}
          supporting={t('Tout reste sur ce téléphone.')}
          onPress={() =>
            ask({
              title: t('Se déconnecter ?'),
              message: t('Ce téléphone arrêtera de se synchroniser. Ce qu’il garde reste ici.'),
              confirmLabel: t('Se déconnecter'),
              run: () => {
                stopSync();
                setServer(null);
                startSync();
              },
            })
          }
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  // Under the status row, as every section's fields.
  fields: { gap: 14, paddingHorizontal: 16, paddingBottom: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
