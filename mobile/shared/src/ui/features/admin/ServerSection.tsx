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
  'The server keeps your apps’ data and syncs it between your devices. It does the rest too: Claude, the backup to S3, your files on Seafile, once they are linked.',
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
      address: url.trim() ? null : t('Enter your server’s address.'),
      token: token.trim() ? null : t('Enter your server’s token.'),
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
      showSnack(health.analysis ? t('Connected, with Claude.') : t('Connected, but the server has no Claude key.'), undefined, { tone: health.analysis ? 'success' : 'warning' });
      return true;
    } catch (failure) {
      const refusal = failure instanceof Error ? t(failure.message) : t('Server unreachable');
      if (failure instanceof SyncError) form.fail(connectFailureField(failure.kind, failure.status), connectFailureMessage(failure.kind, refusal));
      else form.fail('address', refusal);
      return false;
    }
  }

  const words =
    phase === 'local'
      ? t('Not connected: everything stays on this phone.')
      : phase === 'unauthorized'
        ? t('The server refuses this token.')
        : phase === 'offline'
          ? [t('Offline'), pending > 0 ? t('{changes} waiting', { changes: plural(pending, 'change') }) : '', message ? t(message) : '', lastSync ? t('Synced {when}', { when: formatRelative(lastSync, Date.now()) }) : ''].filter(Boolean).join(' · ')
          : phase === 'syncing'
            ? t('Syncing…')
            : `${lastSync ? t('Synced {when}', { when: formatRelative(lastSync, Date.now()) }) : t('Connected')}${clock ? ` · ${clock}` : ''}`;
  const tone: StatusTone = phase === 'synced' ? 'ok' : phase === 'unauthorized' ? 'danger' : phase === 'local' ? 'off' : 'waiting';

  return (
    <>
      {/* The same head as every section's: the dot on the state's first line. */}
      <StatusRow line={{ tone, title: words, meta: server && status ? serverFacts(status.server) : '' }} />
      <View style={styles.fields}>
        <TextField label={t('Address')} kind="serverAddress" value={url} onChangeText={setUrl} field={form.field('address')} help={setupFieldHelp('address')} />
        <TextField label={t('Token')} kind="serverToken" value={token} onChangeText={setToken} field={form.field('token')} revealLabels={{ show: t('Show the token'), hide: t('Hide the token') }} />
        <FormMessage message={form.message} />
        <View style={styles.row}>
          <Button label={server ? t('Test and save') : t('Connect')} icon="server" busy={form.busy} onPress={() => void form.submit(connect)} />
          {server ? (
            <Button
              kind="tonal"
              label={t('Sync')}
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
          title={t('Disconnect from the server')}
          supporting={t('Everything stays on this phone.')}
          onPress={() =>
            ask({
              title: t('Disconnect?'),
              message: t('This phone will stop syncing. What it holds stays here.'),
              confirmLabel: t('Disconnect'),
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
