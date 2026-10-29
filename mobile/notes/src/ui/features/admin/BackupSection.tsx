/**
 * "Sauvegarde sur S3": where the server sends its backups, how often, how many it keeps, the
 * snapshots there (each to download or restore), a full archive to download, and restoring one
 * from a file on the phone. The keys are tried on the bucket by the server before it keeps them.
 * In the first run (`setup`), only the settings, starting from Scaleway in Paris.
 */
import React, { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { t, tx } from '@unlease/core/i18n';
import { BACKUP_RECURRENCE_SHORT, backupLine, formatMoment } from '@unlease/core/services/admin';
import { plural, formatBytes } from '@unlease/core/services/format';
import { regionOfEndpoint, SETUP_BACKUP_DRAFT } from '@unlease/core/services/setup';
import { BACKUP_KEEP_MAX, BACKUP_RECURRENCE_NAMES, BACKUP_RECURRENCES, type BackupPatch, type BackupRecurrence, type BackupSettings } from '@unlease/core/sync/settings';
import type { AdminState, BackupsState } from '@app/hooks/useAdmin';
import type { ServerConfig } from '@app/store/settingsStore';
import { showSnack } from '@app/store/uiStore';
import { requestDownload, saveServerSettings, startBackup } from '@app/sync/transport';
import { pickBackupArchive } from '@platform/media';

import { AppText, Button, ListRow, Segmented, TextField } from '../../components';
import type { AdminOverlays, RestoreTarget } from './overlays';
import { SecretField } from './SecretField';
import { StatusRow } from './StatusRow';

export const BACKUP_INFO = tx(
  'Le serveur envoie une copie de vos données vers un stockage S3 (Scaleway, OVH, AWS…) : à chaque sauvegarde une archive lisible (vos notes et vos pages en Markdown, et le fichier unlease.json qui sert à la restaurer), et chaque photo ou fichier une seule fois, sauf ceux que garde Seafile (l’archive dit où ils sont).',
);

/** The connection's fields, as typed over what is stored. */
type ConnectionField = 'endpoint' | 'region' | 'bucket' | 'prefix' | 'accessKeyId';
const CONNECTION: readonly ConnectionField[] = ['endpoint', 'region', 'bucket', 'prefix', 'accessKeyId'];
/** Shown before "Tout afficher". */
const FIRST_SNAPSHOTS = 5;

type Busy = 'connection' | 'recurrence' | 'keep' | 'run' | null;
type Draft = Partial<Record<ConnectionField, string>>;

/** What the connection's fields start from: in the first run, with no S3 yet, Scaleway in Paris. */
const startDraft = (setup: boolean, backup: BackupSettings): Draft => (setup && !backup.configured ? SETUP_BACKUP_DRAFT : {});

export function BackupSection({
  server,
  admin,
  backups,
  overlays,
  now,
  setup = false,
  sending = null,
}: {
  server: ServerConfig;
  admin: AdminState;
  backups: BackupsState;
  overlays: AdminOverlays;
  now: number;
  /** The first run: no snapshots, downloads or restore here (the setup has its own step). */
  setup?: boolean;
  /** A restore the screen asked for and the server has not answered yet, as on the web. */
  sending?: RestoreTarget['kind'] | null;
}) {
  const settings = admin.settings!;
  const backup: BackupSettings = settings.backup;
  const status = admin.status;
  const [draft, setDraft] = useState<Draft>(() => startDraft(setup, backup));
  // A region typed by hand, or one the address does not name, is kept when the address changes.
  const [ownRegion, setOwnRegion] = useState(() => {
    const start = { ...backup, ...startDraft(setup, backup) };
    return start.region !== '' && start.region !== regionOfEndpoint(start.endpoint);
  });
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [keep, setKeep] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [all, setAll] = useState(false);

  const value = (field: ConnectionField): string => draft[field] ?? backup[field];
  const edit = (field: ConnectionField) => (next: string) => {
    setDraft(current => ({ ...current, [field]: next }));
    setError(null);
  };
  const editEndpoint = (next: string) => {
    const region = ownRegion ? null : regionOfEndpoint(next);
    setDraft(current => ({ ...current, endpoint: next, ...(region ? { region } : {}) }));
    setError(null);
  };
  const editRegion = (next: string) => {
    edit('region')(next);
    setOwnRegion(next.trim() !== '');
  };
  const changed = CONNECTION.filter(field => value(field).trim() !== backup[field]);
  const complete = (['endpoint', 'region', 'bucket', 'accessKeyId'] as const).every(field => value(field).trim().length > 0) && (backup.configured || secret.trim().length > 0);
  const canSave = complete && (changed.length > 0 || secret.trim().length > 0);

  const save = async (patch: BackupPatch | null, what: Exclude<Busy, null>, done: string) => {
    setBusy(what);
    if (what === 'connection') setError(null);
    try {
      const next = await saveServerSettings(server, { backup: patch });
      admin.setSettings(next);
      if (what === 'connection') {
        setDraft(startDraft(setup, next.backup));
        setSecret('');
        if (!patch) setOwnRegion(false);
      }
      if (what === 'keep') setKeep(null);
      showSnack(done, undefined, { tone: 'success' });
      admin.reload();
    } catch (failure) {
      const message = failure instanceof Error ? t(failure.message) : t('Réglage refusé');
      if (what === 'connection') setError(message);
      else showSnack(message, undefined, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const saveConnection = () => {
    const patch: Record<string, string> = {};
    for (const field of changed) patch[field] = value(field).trim();
    if (secret.trim()) patch.secretAccessKey = secret.trim();
    save(patch as BackupPatch, 'connection', t('Stockage S3 enregistré'));
  };

  const runNow = async () => {
    setBusy('run');
    try {
      admin.setStatus(await startBackup(server));
    } catch (failure) {
      showSnack(failure instanceof Error ? t(failure.message) : t('Sauvegarde refusée'), undefined, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const downloadFull = async () => {
    try {
      const ticket = await requestDownload(server, { full: true });
      await Linking.openURL(ticket.url);
    } catch (failure) {
      showSnack(failure instanceof Error ? t(failure.message) : t('Téléchargement refusé'), undefined, { tone: 'error' });
    }
  };

  const pickFile = async () => {
    const picked = await pickBackupArchive();
    if (picked.status === 'ok') overlays.restore({ kind: 'file', path: picked.path, name: picked.name });
    else if (picked.status === 'error') showSnack(picked.message ? t(picked.message) : t('Fichier illisible'), undefined, { tone: 'error' });
  };

  const keepValue = keep ?? String(backup.keep);
  const keepNumber = Number(keepValue.trim());
  const keepValid = Number.isInteger(keepNumber) && keepNumber >= 1 && keepNumber <= BACKUP_KEEP_MAX;
  // Sent, then running: no second restore meanwhile.
  const restoring = sending !== null || status?.restore.running === true;
  const line =
    sending === 'file'
      ? { tone: 'waiting' as const, title: t('Envoi de l’archive…'), meta: '' }
      : restoring
        ? { tone: 'waiting' as const, title: t('Restauration en cours…'), meta: '' }
        : backupLine(backup, status?.backup ?? null, now);
  const running = status?.backup.running === true;
  const snapshots = backups.list?.snapshots ?? [];
  const shown = all ? snapshots : snapshots.slice(0, FIRST_SNAPSHOTS);

  return (
    <View>
      <StatusRow line={line} />

      <View style={styles.fields}>
        <TextField label={t('Adresse du service')} value={value('endpoint')} onChangeText={editEndpoint} placeholder="https://s3.fr-par.scw.cloud" keyboardType="url" autoCapitalize="none" autoCorrect={false} />
        <TextField label={t('Région')} value={value('region')} onChangeText={editRegion} placeholder="fr-par" autoCapitalize="none" autoCorrect={false} />
        <TextField label={t('Bucket')} value={value('bucket')} onChangeText={edit('bucket')} autoCapitalize="none" autoCorrect={false} />
        <TextField label={t('Dossier dans le bucket')} value={value('prefix')} onChangeText={edit('prefix')} placeholder="carnet/" help={t('Facultatif')} autoCapitalize="none" autoCorrect={false} />
        <TextField label={t('Clé d’accès')} value={value('accessKeyId')} onChangeText={edit('accessKeyId')} autoCapitalize="none" autoCorrect={false} />
        <SecretField
          label={backup.secretHint ? t('Remplacer la clé secrète') : t('Clé secrète')}
          value={secret}
          onChangeText={next => {
            setSecret(next);
            setError(null);
          }}
          what={t('la clé')}
          help={`${t('Vérifiée puis gardée sur votre serveur, jamais sur ce téléphone.')}${backup.secretHint ? ` ${t('Actuelle : {hint}', { hint: backup.secretHint })}` : ''}`}
          error={error}
        />
        <View style={styles.row}>
          <Button label={t('Tester et enregistrer')} icon="server" busy={busy === 'connection'} disabled={!canSave} onPress={saveConnection} />
          {backup.configured ? (
            <Button
              kind="dangerText"
              label={t('Retirer le stockage S3')}
              onPress={() =>
                overlays.ask({
                  title: t('Retirer le stockage S3 ?'),
                  message: t('Les réglages S3 sont effacés de votre serveur. Les sauvegardes déjà envoyées restent sur S3.'),
                  confirmLabel: t('Retirer'),
                  danger: true,
                  run: () => save(null, 'connection', t('Stockage S3 retiré')),
                })
              }
            />
          ) : null}
        </View>

        {/* In the setup, how often and how many once the bucket is set (the server then backs up every day). */}
        {setup && !backup.configured ? null : (
          <>
            <AppText variant="metaStrong">{t('Fréquence')}</AppText>
            <Segmented<BackupRecurrence>
              value={backup.recurrence}
              disabled={!backup.configured || busy !== null}
              onChange={recurrence => save({ recurrence }, 'recurrence', t('Sauvegarde automatique : {recurrence}', { recurrence: BACKUP_RECURRENCE_NAMES[recurrence].toLowerCase() }))}
              options={BACKUP_RECURRENCES.map(id => ({ value: id, label: BACKUP_RECURRENCE_SHORT[id] }))}
            />

            <View style={styles.keepRow}>
              <View style={styles.flex}>
                <TextField
                  label={t('Sauvegardes gardées')}
                  value={keepValue}
                  onChangeText={setKeep}
                  keyboardType="number-pad"
                  error={keepValid ? null : t('Un nombre de 1 à {max}.', { max: BACKUP_KEEP_MAX })}
                  help={t('Les plus anciennes faites par ce serveur sont effacées de S3.')}
                />
              </View>
              <Button
                kind="tonal"
                label={t('Appliquer')}
                busy={busy === 'keep'}
                disabled={!backup.configured || !keepValid || keepNumber === backup.keep}
                onPress={() => save({ keep: keepNumber }, 'keep', plural(keepNumber, 'sauvegarde gardée', 'sauvegardes gardées'))}
                style={styles.apply}
              />
            </View>
          </>
        )}
      </View>

      {backup.configured && !setup ? (
        <ListRow icon="upload" title={t('Sauvegarder maintenant')} supporting={running ? t('Sauvegarde en cours…') : undefined} onPress={running || busy === 'run' ? undefined : () => runNow()} />
      ) : null}

      {backup.configured && !setup ? (
        <>
          <View style={styles.heading}>
            <AppText variant="metaStrong">{t('Sauvegardes sur S3')}</AppText>
          </View>
          {backups.error ? (
            <AppText variant="meta" style={styles.note}>
              {t(backups.error)}
            </AppText>
          ) : !backups.list ? (
            <AppText variant="meta" style={styles.note}>
              {t('Lecture des sauvegardes…')}
            </AppText>
          ) : snapshots.length === 0 ? (
            <AppText variant="meta" style={styles.note}>
              {t('Aucune sauvegarde sur S3 pour l’instant.')}
            </AppText>
          ) : (
            shown.map(snapshot => <ListRow key={snapshot.name} icon="archive" title={formatMoment(snapshot.at, now)} supporting={formatBytes(snapshot.bytes)} onPress={() => overlays.openSnapshot(snapshot)} />)
          )}
          {!all && snapshots.length > FIRST_SNAPSHOTS ? (
            <View style={styles.more}>
              <Button kind="text" label={t('Tout afficher ({count})', { count: snapshots.length })} onPress={() => setAll(true)} />
            </View>
          ) : null}
        </>
      ) : null}

      {setup ? null : (
        <>
          <ListRow icon="download" title={t('Télécharger une sauvegarde complète')} supporting={t('Une archive avec vos photos et fichiers, à garder où vous voulez : elle se restaure ici.')} onPress={() => downloadFull()} />
          {/* Said here too: the section's head may be scrolled away from this row. */}
          <ListRow
            icon="restore"
            title={t('Restaurer depuis un fichier')}
            supporting={sending === 'file' ? t('Envoi de l’archive…') : restoring ? t('Restauration en cours…') : t('Une archive .tar.gz téléchargée depuis S3 ou depuis cette page.')}
            onPress={restoring ? undefined : () => pickFile()}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 14, paddingHorizontal: 16, paddingBottom: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  keepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  flex: { flex: 1 },
  apply: { marginTop: 26 },
  heading: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  note: { paddingHorizontal: 16, paddingVertical: 8 },
  more: { paddingHorizontal: 8, alignItems: 'flex-start' },
});
