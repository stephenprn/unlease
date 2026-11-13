/**
 * The first run's restore, on a server that held nothing: a snapshot from S3 (the newest chosen)
 * or an archive from the phone, brought back as a merge and followed until it ends. Without S3, a
 * way to add it first (`onSetBackup`).
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { t } from '@unlease/core/i18n';
import { formatMoment, restoreSummary, type StatusLine, thawingLine, snapshotMeta } from '@unlease/core/services/admin';
import { SETUP_RESTORE_WORDS, setupNoBackupsMeta, setupRestored } from '@unlease/core/services/setup';
import type { AdminStatus } from '@unlease/core/sync/admin';
import type { AdminState, BackupsState } from '@shared/app/hooks/useAdmin';
import type { ServerConfig } from '@shared/app/store/settingsStore';
import { restoreFile, restoreSnapshot } from '@shared/app/sync/transport';
import { pickBackupArchive, removePath } from '@shared/platform/media';

import { Button, Icon, ListRow, settleIn } from '../../components';
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
      setRefusal(failure instanceof Error ? t(failure.message) : SETUP_RESTORE_WORDS.refused);
    } finally {
      setSending(null);
    }
  };

  const restoreChosen = () => {
    if (picked) start('snapshot', () => restoreSnapshot(server, picked, 'merge'));
  };

  const restoreFromFile = async () => {
    const file = await pickBackupArchive();
    // Said where a refusal is, by the choices, rather than on a slip that leaves.
    if (file.status === 'error') setRefusal(file.message ? t(file.message) : t('Unreadable file'));
    if (file.status !== 'ok') return;
    // The picked copy lives in the cache only until it is sent.
    await start('file', () => restoreFile(server, file.path, file.name, 'merge')).finally(() => removePath(file.path));
  };

  const error = refusal ?? (followed && !running ? status?.restore.error : null) ?? null;
  const outcome: StatusLine | null = running
    ? { tone: 'waiting', title: SETUP_RESTORE_WORDS.running, meta: SETUP_RESTORE_WORDS.runningMeta }
    : error
      ? { tone: 'danger', title: SETUP_RESTORE_WORDS.failed, meta: t(error) }
      : followed && status?.restore.thawing
        ? { tone: 'waiting', ...thawingLine() }
        : followed && status?.restore.report
          ? { tone: 'ok', title: SETUP_RESTORE_WORDS.back, meta: restoreSummary(status.restore.report) }
          : null;
  // Once a restore runs or has come back, only its outcome; after a failure, the choices again.
  const choosing = !running && !(followed && setupRestored(status));

  const s3Line: StatusLine | null = !backup?.configured
    ? { tone: 'off', title: SETUP_RESTORE_WORDS.noStorage, meta: SETUP_RESTORE_WORDS.noStorageMeta }
    : backups.error
      ? { tone: 'danger', title: SETUP_RESTORE_WORDS.unreadable, meta: t(backups.error) }
      : !backups.list
        ? { tone: 'waiting', title: SETUP_RESTORE_WORDS.reading, meta: '' }
        : snapshots.length === 0
          ? { tone: 'off', title: SETUP_RESTORE_WORDS.none, meta: setupNoBackupsMeta(backup.bucket, backup.prefix) }
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
          <Section title={t('Backups on S3')}>
            {s3Line ? (
              <>
                {s3Line.title === SETUP_RESTORE_WORDS.none ? (
                  <Animated.View entering={settleIn}>
                    <StatusRow line={s3Line} />
                  </Animated.View>
                ) : (
                  <StatusRow line={s3Line} />
                )}
                {!backup?.configured ? (
                  <View style={styles.addS3}>
                    <Button kind="tonal" label={SETUP_RESTORE_WORDS.addStorage} icon="server" onPress={onSetBackup} />
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
                      supporting={snapshotMeta(snapshot)}
                      leading={<View style={styles.mark}>{snapshot.name === picked ? <Icon name="check" size={22} color={theme.color.focus} /> : null}</View>}
                      onPress={() => setChosen(snapshot.name)}
                    />
                  ))}
                </View>
                {!all && snapshots.length > FIRST_SNAPSHOTS ? (
                  <View style={styles.more}>
                    <Button kind="text" label={t('Show all ({count})', { count: snapshots.length })} onPress={() => setAll(true)} style={styles.moreButton} />
                  </View>
                ) : null}
                <View style={styles.action}>
                  <Button label={SETUP_RESTORE_WORDS.restore} icon="restore" busy={sending === 'snapshot'} disabled={!picked || sending !== null} onPress={restoreChosen} />
                </View>
              </>
            )}
          </Section>

          <Section title={t('From a file')}>
            <ListRow
              icon="restore"
              title={SETUP_RESTORE_WORDS.file}
              supporting={sending === 'file' ? t('Sending the archive…') : SETUP_RESTORE_WORDS.fileMeta}
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
  // Inset and padded as the rows above (6 and 10): its words on their glyphs' column.
  more: { paddingHorizontal: 6, alignItems: 'flex-start' },
  moreButton: { paddingHorizontal: 10 },
  action: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  // In line with the status's words, under them.
  addS3: { paddingLeft: 38, paddingRight: 16, paddingBottom: 12, alignItems: 'flex-start' },
});
