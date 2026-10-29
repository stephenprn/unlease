/**
 * The first run's restore, on a server that held nothing: a snapshot from S3 (the newest chosen)
 * or an archive from the phone, brought back as a merge and followed until it ends. Without S3, a
 * way to add it first (`onSetBackup`).
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { formatMoment, restoreSummary, type StatusLine } from '@unlease/core/services/admin';
import { formatBytes } from '@unlease/core/services/format';
import { setupRestored } from '@unlease/core/services/setup';
import type { AdminStatus } from '@unlease/core/sync/admin';
import type { AdminState, BackupsState } from '@app/hooks/useAdmin';
import type { ServerConfig } from '@app/store/settingsStore';
import { showSnack } from '@app/store/uiStore';
import { restoreFile, restoreSnapshot } from '@app/sync/transport';
import { pickBackupArchive, removePath } from '@platform/media';

import { Button, Icon, ListRow } from '../../components';
import { useTheme } from '../../theme/ThemeProvider';
import { Section } from '../settings/Section';
import { StatusRow } from './StatusRow';

/** Shown before "Tout afficher". */
const FIRST_SNAPSHOTS = 5;

export function SetupRestore({ server, admin, backups, now, onSetBackup }: { server: ServerConfig; admin: AdminState; backups: BackupsState; now: number; onSetBackup: () => void }) {
  const theme = useTheme();
  const status = admin.status;
  const backup = admin.settings?.backup ?? null;
  const snapshots = backups.list?.snapshots ?? [];
  const [chosen, setChosen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [sending, setSending] = useState<'snapshot' | 'file' | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  // A restore seen running here: its outcome is said once it ends.
  const [followed, setFollowed] = useState(false);
  const running = status?.restore.running === true;
  useEffect(() => {
    if (running) setFollowed(true);
  }, [running]);

  // The list comes newest first.
  const picked = chosen ?? snapshots[0]?.name ?? null;
  const shown = all ? snapshots : snapshots.slice(0, FIRST_SNAPSHOTS);

  const start = async (what: 'snapshot' | 'file', send: () => Promise<AdminStatus | null>) => {
    setSending(what);
    setRefusal(null);
    try {
      admin.setStatus(await send());
      setFollowed(true);
    } catch (failure) {
      setRefusal(failure instanceof Error ? t(failure.message) : t('Restauration refusée'));
    } finally {
      setSending(null);
    }
  };

  const restoreChosen = () => {
    if (picked) start('snapshot', () => restoreSnapshot(server, picked, 'merge'));
  };

  const restoreFromFile = async () => {
    const file = await pickBackupArchive();
    if (file.status === 'error') showSnack(file.message ? t(file.message) : t('Fichier illisible'), undefined, { tone: 'error' });
    if (file.status !== 'ok') return;
    // The picked copy lives in the cache only until it is sent.
    await start('file', () => restoreFile(server, file.path, file.name, 'merge')).finally(() => removePath(file.path));
  };

  const error = refusal ?? (followed && !running ? status?.restore.error : null) ?? null;
  const outcome: StatusLine | null = running
    ? { tone: 'waiting', title: t('Restauration en cours…'), meta: t('Vos notes reviennent sur le serveur, puis sur ce téléphone.') }
    : error
      ? { tone: 'danger', title: t('Restauration impossible'), meta: t(error) }
      : followed && status?.restore.report
        ? { tone: 'ok', title: restoreSummary(status.restore.report), meta: t('Elles arrivent sur ce téléphone.') }
        : null;
  // Once a restore runs or has come back, only its outcome; after a failure, the choices again.
  const choosing = !running && !(followed && setupRestored(status));

  const s3Line: StatusLine | null = !backup?.configured
    ? { tone: 'off', title: t('Pas de stockage S3'), meta: t('Ajoutez-le pour retrouver ses sauvegardes. Sans S3, restaurez une archive gardée sur ce téléphone, ou commencez avec un carnet vide.') }
    : backups.error
      ? { tone: 'danger', title: t('Sauvegardes illisibles'), meta: t(backups.error) }
      : !backups.list
        ? { tone: 'waiting', title: t('Lecture des sauvegardes…'), meta: '' }
        : snapshots.length === 0
          ? { tone: 'off', title: t('Aucune sauvegarde sur S3'), meta: t('Le bucket {bucket} n’en contient pas encore.', { bucket: backup.bucket }) }
          : null;

  return (
    <>
      {outcome ? (
        <Section>
          <StatusRow line={outcome} />
        </Section>
      ) : null}

      {choosing ? (
        <>
          <Section title={t('Sauvegardes sur S3')}>
            {s3Line ? (
              <>
                <StatusRow line={s3Line} />
                {!backup?.configured ? (
                  <View style={styles.addS3}>
                    <Button kind="tonal" label={t('Ajouter le stockage S3')} icon="server" onPress={onSetBackup} />
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <View accessibilityRole="radiogroup">
                  {shown.map(snapshot => (
                    <ListRow
                      key={snapshot.name}
                      title={formatMoment(snapshot.at, now)}
                      supporting={formatBytes(snapshot.bytes)}
                      leading={<View style={styles.mark}>{snapshot.name === picked ? <Icon name="check" size={22} color={theme.color.focus} /> : null}</View>}
                      onPress={() => setChosen(snapshot.name)}
                    />
                  ))}
                </View>
                {!all && snapshots.length > FIRST_SNAPSHOTS ? (
                  <View style={styles.more}>
                    <Button kind="text" label={t('Tout afficher ({count})', { count: snapshots.length })} onPress={() => setAll(true)} />
                  </View>
                ) : null}
                <View style={styles.action}>
                  <Button label={t('Restaurer cette sauvegarde')} icon="restore" busy={sending === 'snapshot'} disabled={!picked || sending !== null} onPress={restoreChosen} />
                </View>
              </>
            )}
          </Section>

          <Section title={t('Depuis un fichier')}>
            <ListRow
              icon="restore"
              title={t('Restaurer depuis un fichier')}
              supporting={sending === 'file' ? t('Envoi de l’archive…') : t('Une archive .tar.gz, téléchargée depuis S3 ou depuis l’Administration.')}
              onPress={sending ? undefined : () => restoreFromFile()}
            />
          </Section>
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  mark: { width: 24, alignItems: 'center' },
  more: { paddingHorizontal: 8, alignItems: 'flex-start' },
  action: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  // In line with the status's words, under them.
  addS3: { paddingLeft: 38, paddingRight: 16, paddingBottom: 12, alignItems: 'flex-start' },
});
