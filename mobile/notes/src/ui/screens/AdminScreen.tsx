/**
 * Administration: the server (and, once one is connected, Claude's reading of links, the backup to
 * S3, the files on Seafile and Seerr for the films and series). The web's Administration page, on the phone.
 */
import React, { useState } from 'react';
import { KeyboardAvoidingView, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

import { t } from '@unlease/core/i18n';
import { PAGES_ASK_INFO } from '@unlease/notes/services/pagesAsk';
import { formatMoment } from '@unlease/core/services/admin';
import { formatBytes } from '@unlease/core/services/format';
import type { BackupSnapshot, RestoreMode } from '@unlease/core/sync/admin';
import { useAdmin, useBackups } from '@app/hooks/useAdmin';
import { useMinute } from '@app/hooks/useMinute';
import { selectServer, useSettingsStore } from '@app/store/settingsStore';
import { showSnack } from '@app/store/uiStore';
import { requestDownload, restoreFile, restoreSnapshot } from '@app/sync/transport';
import { removePath } from '@platform/media';

import { Dialog, Ground, ListRow, Sheet, TopBar } from '../components';
import { BACKUP_INFO, BackupSection } from '../features/admin/BackupSection';
import { DRIVE_INFO, DriveSection } from '../features/admin/DriveSection';
import type { AdminOverlays, Confirmation, RestoreTarget } from '../features/admin/overlays';
import { RestoreDialog } from '../features/admin/RestoreDialog';
import { SEERR_INFO, SeerrSection } from '../features/admin/SeerrSection';
import { SERVER_INFO, ServerSection } from '../features/admin/ServerSection';
import { PagesAskSection } from '../features/admin/PagesAskSection';
import { ReadingSection } from '../features/settings/ReadingSection';
import { Section } from '../features/settings/Section';
import type { ScreenProps } from '../navigation/types';
import { useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';

export function AdminScreen({ navigation }: ScreenProps<'Admin'>) {
  const styles = useThemedStyles(makeStyles);
  const server = useSettingsStore(selectServer);
  const focused = useIsFocused();
  const now = useMinute();
  const admin = useAdmin(server, focused);
  const backups = useBackups(server, admin.settings?.backup.configured === true, admin.backupsVersion, focused);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  // Kept after the sheet closes, so it plays its exit with what it showed.
  const [snapshot, setSnapshot] = useState<BackupSnapshot | null>(null);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [restoring, setRestoring] = useState<RestoreTarget | null>(null);
  // A restore asked and not answered yet (a picked archive takes a while to send): the backup section says so.
  const [sending, setSending] = useState<RestoreTarget['kind'] | null>(null);
  const restoreBusy = sending !== null || admin.status?.restore.running === true;

  const overlays: AdminOverlays = {
    ask: setConfirmation,
    openSnapshot: chosen => {
      setSnapshot(chosen);
      setSnapshotOpen(true);
    },
    restore: setRestoring,
  };

  /** A picked archive lives in the cache only until it is sent or the restore is dropped. */
  const dropPicked = (target: RestoreTarget | null) => {
    if (target?.kind === 'file') removePath(target.path);
  };

  const restore = async (target: RestoreTarget, mode: RestoreMode) => {
    if (!server) return;
    setSending(target.kind);
    try {
      admin.setStatus(target.kind === 'snapshot' ? await restoreSnapshot(server, target.name, mode) : await restoreFile(server, target.path, target.name, mode));
    } catch (failure) {
      showSnack(failure instanceof Error ? failure.message : t('Restauration refusée'), undefined, { tone: 'error' });
    } finally {
      setSending(null);
      dropPicked(target);
    }
  };

  const download = async (name: string) => {
    if (!server) return;
    try {
      const ticket = await requestDownload(server, { snapshot: name });
      await Linking.openURL(ticket.url);
    } catch (failure) {
      showSnack(failure instanceof Error ? failure.message : t('Téléchargement refusé'), undefined, { tone: 'error' });
    }
  };

  const unavailable = <ListRow icon="info" title={t('Réglages du serveur indisponibles')} supporting={admin.unavailable ? t('Le serveur ne répond pas pour l’instant.') : t('Lecture des réglages du serveur…')} onPress={admin.reload} />;
  const empty = admin.status !== null && admin.status.server.notes === 0 && admin.status.server.pages === 0;

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Administration')} onBack={() => navigation.goBack()} />
      {/* The app is edge to edge: without this the lower fields (Seafile, Seerr) stay under the keyboard. */}
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Section title={t('Serveur')} info={SERVER_INFO}>
          <ServerSection status={admin.status} ask={overlays.ask} />
        </Section>

        {server ? (
          <>
            <Section title={t('Lecture des liens par Claude')}>
              <ReadingSection server={server} ask={overlays.ask} />
            </Section>
            <Section title={t('Questions sur les pages')} info={PAGES_ASK_INFO}>
              {admin.settings ? <PagesAskSection server={server} admin={admin} /> : unavailable}
            </Section>
            <Section title={t('Sauvegarde sur S3')} info={BACKUP_INFO}>
              {admin.settings ? <BackupSection server={server} admin={admin} backups={backups} overlays={overlays} now={now} sending={sending} /> : unavailable}
            </Section>
            <Section title={t('Fichiers sur Seafile')} info={DRIVE_INFO}>
              {admin.settings ? <DriveSection server={server} admin={admin} overlays={overlays} now={now} /> : unavailable}
            </Section>
            <Section title="Seerr" info={SEERR_INFO}>
              {admin.settings ? <SeerrSection server={server} admin={admin} overlays={overlays} /> : unavailable}
            </Section>
          </>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>

      <Sheet visible={snapshotOpen} onDismiss={() => setSnapshotOpen(false)} title={snapshot ? t('Sauvegarde du {moment}', { moment: formatMoment(snapshot.at, now) }) : undefined}>
        <ListRow
          icon="download"
          title={t('Télécharger')}
          supporting={snapshot ? formatBytes(snapshot.bytes) : undefined}
          onPress={() => {
            setSnapshotOpen(false);
            if (snapshot) download(snapshot.name);
          }}
        />
        <ListRow
          icon="restore"
          title={t('Restaurer')}
          supporting={restoreBusy ? t('Restauration en cours…') : undefined}
          onPress={
            restoreBusy
              ? undefined
              : () => {
                  setSnapshotOpen(false);
                  if (snapshot) setRestoring({ kind: 'snapshot', name: snapshot.name });
                }
          }
        />
      </Sheet>

      <RestoreDialog
        visible={restoring !== null}
        empty={empty}
        onCancel={() => {
          dropPicked(restoring);
          setRestoring(null);
        }}
        onConfirm={mode => {
          const target = restoring;
          setRestoring(null);
          if (target) restore(target, mode);
        }}
      />

      <Dialog
        visible={confirmation !== null}
        title={confirmation?.title ?? ''}
        message={confirmation?.message}
        confirmLabel={confirmation?.confirmLabel ?? ''}
        danger={confirmation?.danger}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          const run = confirmation?.run;
          setConfirmation(null);
          run?.();
        }}
      />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    fill: { flex: 1 },
    content: { padding: 12, paddingBottom: 48, gap: 20 },
  });
