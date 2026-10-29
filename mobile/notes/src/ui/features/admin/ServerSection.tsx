/** "Serveur": where the phone syncs, with which token, how it is going, and what the server holds. */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';
import { t, tx } from '@unlease/core/i18n';
import { serverFacts } from '@unlease/core/services/admin';
import { formatRelative, plural } from '@unlease/core/services/format';
import type { AdminStatus } from '@unlease/core/sync/admin';
import { selectServer, setReading, setServer, useSettingsStore } from '@app/store/settingsStore';
import { selectLastSync, selectPendingCount, selectSyncMessage, selectSyncPhase, useSyncStore } from '@app/store/syncStore';
import { showSnack } from '@app/store/uiStore';
import { checkServer } from '@app/sync/transport';
import { requestSync, startSync, stopSync } from '@app/sync/syncManager';

import { AppText, Button, ListRow, TextField } from '../../components';
import { corners } from '../../theme/shape';
import { useTheme } from '../../theme/ThemeProvider';
import type { AdminOverlays } from './overlays';
import { SecretField } from './SecretField';

export const SERVER_INFO = tx(
  'Le serveur synchronise vos notes entre vos appareils. Avec une clé Claude, il lit chaque lien enregistré (titre, prix, résumé, images) et le range dans la bonne collection.',
);

export function ServerSection({ status, ask }: { status: AdminStatus | null; ask: AdminOverlays['ask'] }) {
  const theme = useTheme();
  const server = useSettingsStore(selectServer);
  const phase = useSyncStore(selectSyncPhase);
  const pending = useSyncStore(selectPendingCount);
  const lastSync = useSyncStore(selectLastSync);
  const message = useSyncStore(selectSyncMessage);
  const clock = useSyncStore(s => s.clock);
  const [url, setUrl] = useState(server?.url ?? '');
  const [token, setToken] = useState(server?.token ?? '');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    setChecking(true);
    setError(null);
    try {
      const config = { url: url.trim().replace(/\/+$/, ''), token: token.trim() };
      const normalized = /^https?:\/\//.test(config.url) ? config : { ...config, url: `https://${config.url}` };
      const health = await checkServer(normalized);
      setServer(normalized);
      setReading(health.analysis);
      startSync();
      showSnack(health.analysis ? t('Connecté. Les liens seront lus par Claude.') : t('Connecté, mais le serveur n’a pas de clé Claude.'), undefined, { tone: health.analysis ? 'success' : 'warning' });
    } catch (failure) {
      setError(failure instanceof Error ? t(failure.message) : t('Serveur injoignable'));
    } finally {
      setChecking(false);
    }
  };

  const words =
    phase === 'local'
      ? t('Non connecté : les notes restent sur ce téléphone.')
      : phase === 'unauthorized'
        ? t('Le serveur refuse ce jeton.')
        : phase === 'offline'
          ? `${t('Hors ligne')}${pending > 0 ? ` · ${t('{changes} en attente', { changes: plural(pending, 'modification') })}` : ''}${message ? ` · ${t(message)}` : ''}`
          : phase === 'syncing'
            ? t('Synchronisation…')
            : `${lastSync ? t('Synchronisé {when}', { when: formatRelative(lastSync, Date.now()) }) : t('Connecté')}${clock ? ` · ${clock}` : ''}`;
  const dot = phase === 'synced' ? theme.color.ok : phase === 'unauthorized' ? theme.color.danger : phase === 'local' ? theme.color.inkFaint : theme.color.waiting;

  return (
    <>
      <View style={styles.status}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <View style={styles.flex}>
          <AppText variant="body">{words}</AppText>
          {server && status ? <AppText variant="meta">{serverFacts(status.server)}</AppText> : null}
        </View>
      </View>
      <View style={styles.fields}>
        <TextField label={t('Adresse')} value={url} onChangeText={setUrl} placeholder="https://carnet.exemple.fr" keyboardType="url" autoCapitalize="none" autoCorrect={false} />
        <SecretField label={t('Jeton')} value={token} onChangeText={setToken} what={t('le jeton')} error={error} />
        <View style={styles.row}>
          <Button label={server ? t('Tester et enregistrer') : t('Se connecter')} icon="server" busy={checking} disabled={!url.trim() || !token.trim()} onPress={connect} />
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
      {server ? (
        <ListRow
          icon="cloudOff"
          title={t('Se déconnecter du serveur')}
          supporting={t('Les notes restent sur ce téléphone.')}
          onPress={() =>
            ask({
              title: t('Se déconnecter ?'),
              message: t('Ce téléphone arrêtera de se synchroniser. Ses notes restent ici, et les liens ne seront plus lus.'),
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
  status: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  dot: { width: 10, height: 10, ...corners(SHAPES.dot) },
  flex: { flex: 1 },
  fields: { gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
