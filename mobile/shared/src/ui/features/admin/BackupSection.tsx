/**
 * "Sauvegarde sur S3": where the server sends its backups, the class S3 keeps them in (Glacier,
 * where the provider has it), how often, how many days it keeps them, the snapshots there (each to
 * download or restore), a full archive to download, and restoring one from a file on the phone.
 * The keys and the class are tried on the bucket by the server before it keeps them. In the first
 * run (`setup`), only the settings, starting from Scaleway in Paris.
 */
import React, { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { t, tx } from '@unlease/core/i18n';
import { BACKUP_RECURRENCE_SHORT, backupLine, formatMoment, snapshotMeta } from '@unlease/core/services/admin';
import { plural } from '@unlease/core/services/format';
import { regionOfEndpoint, serviceAddressProblem, serviceRefusalField, SETUP_BACKUP_DRAFT } from '@unlease/core/services/setup';
import { STORAGE_CLASS_WORDS, storageClassesFor, storageClassHelp } from '@unlease/core/services/storageClass';
import { BACKUP_KEEP_MAX, BACKUP_RECURRENCE_NAMES, BACKUP_RECURRENCES, type BackupPatch, type BackupRecurrence, type BackupSettings, type StorageClass } from '@unlease/core/sync/settings';
import type { AdminState, BackupsState } from '@shared/app/hooks/useAdmin';
import type { ServerConfig } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';
import { requestDownload, saveServerSettings, startBackup } from '@shared/app/sync/transport';
import { pickBackupArchive } from '@shared/platform/media';

import { AppText, Button, EmptyLine, FormMessage, Icon, ListRow, Segmented, TextField, useForm } from '../../components';
import { useTheme } from '../../theme/ThemeProvider';
import type { AdminOverlays, RestoreTarget } from './overlays';
import { StatusRow } from './StatusRow';

export const BACKUP_INFO = tx(
  'The server sends a copy of your data to S3 storage (Scaleway, OVH, AWS…): at each backup a readable archive (your notes and pages in Markdown, and the unlease.json file that restores it), and each photo or file only once, except those Seafile keeps (the archive says where they are).',
);

/** The connection's fields, as typed over what is stored. */
type ConnectionField = 'endpoint' | 'region' | 'bucket' | 'prefix' | 'accessKeyId';
const CONNECTION: readonly ConnectionField[] = ['endpoint', 'region', 'bucket', 'prefix', 'accessKeyId'];
/** Shown before "Tout afficher". */
const FIRST_SNAPSHOTS = 5;

type Busy = 'connection' | 'recurrence' | 'keep' | 'remove' | 'run' | null;
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
  const theme = useTheme();
  const [secret, setSecret] = useState('');
  const [storageClass, setStorageClass] = useState<StorageClass | null>(null);
  const [keep, setKeep] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [all, setAll] = useState(false);

  const value = (field: ConnectionField): string => draft[field] ?? backup[field];
  const edit = (field: ConnectionField) => (next: string) => setDraft(current => ({ ...current, [field]: next }));
  const editEndpoint = (next: string) => {
    const region = ownRegion ? null : regionOfEndpoint(next);
    setDraft(current => ({ ...current, endpoint: next, ...(region ? { region } : {}) }));
  };
  const editRegion = (next: string) => {
    edit('region')(next);
    setOwnRegion(next.trim() !== '');
  };
  const changed = CONNECTION.filter(field => value(field).trim() !== backup[field]);
  const chosenClass = storageClass ?? backup.storageClass;
  const classChanged = chosenClass !== backup.storageClass;
  // Nothing to try: the bucket is set and nothing in the form changed.
  const unchanged = backup.configured && changed.length === 0 && secret.trim() === '' && !classChanged;
  const connection = useForm(
    {
      endpoint: serviceAddressProblem(value('endpoint'), t('Enter the S3 service’s address.'), 'https://s3.fr-par.scw.cloud'),
      region: value('region').trim() ? null : t('Enter the service’s region, like fr-par.'),
      bucket: value('bucket').trim() ? null : t('Enter the bucket’s name.'),
      accessKeyId: value('accessKeyId').trim() ? null : t('Enter the access key.'),
      secret: backup.configured || secret.trim() ? null : t('Enter the secret key given with the access key.'),
    },
    { order: ['endpoint', 'region', 'bucket', 'prefix', 'accessKeyId', 'secret'] },
  );
  const keepValue = keep ?? String(backup.keep);
  const keepNumber = Number(keepValue.trim());
  const keepValid = Number.isInteger(keepNumber) && keepNumber >= 1 && keepNumber <= BACKUP_KEEP_MAX;
  const applyKeep = () => (keepNumber === backup.keep ? true : save({ keep: keepNumber }, 'keep', t('Backups kept {days}', { days: plural(keepNumber, 'day') })));
  const keeping = useForm({ keep: keepValid ? null : t('A number of days from 1 to {max}.', { max: BACKUP_KEEP_MAX }) }, { order: ['keep'], sendOnDone: applyKeep });

  /** Saves; the server's refusal of the connection or of the days comes back on its form, anything else on a slip. */
  async function save(patch: BackupPatch | null, what: Exclude<Busy, null>, done: string): Promise<boolean> {
    setBusy(what);
    try {
      const next = await saveServerSettings(server, { backup: patch });
      admin.setSettings(next);
      if (what === 'connection' || what === 'remove') {
        setDraft(startDraft(setup, next.backup));
        setSecret('');
        setStorageClass(null);
        connection.reset();
        if (!patch) setOwnRegion(false);
      }
      if (what === 'keep') setKeep(null);
      showSnack(done, undefined, { tone: 'success' });
      admin.reload();
      return true;
    } catch (failure) {
      const message = failure instanceof Error ? t(failure.message) : t('Setting refused');
      // Under the field it concerns (the address, the bucket, the region), else on the whole form (both keys, rights).
      const field = failure instanceof Error ? serviceRefusalField(failure.message) : null;
      if (what === 'connection') connection.fail(field === 'address' ? 'endpoint' : field === 'bucket' || field === 'region' ? field : null, message);
      else if (what === 'keep') keeping.fail('keep', message);
      else showSnack(message, undefined, { tone: 'error' });
      return false;
    } finally {
      setBusy(null);
    }
  }

  const saveConnection = () => {
    if (unchanged) return true;
    const patch: Record<string, string> = {};
    for (const field of changed) patch[field] = value(field).trim();
    if (secret.trim()) patch.secretAccessKey = secret.trim();
    if (classChanged) patch.storageClass = chosenClass;
    return save(patch as BackupPatch, 'connection', t('S3 storage saved'));
  };

  const runNow = async () => {
    setBusy('run');
    try {
      admin.setStatus(await startBackup(server));
    } catch (failure) {
      showSnack(failure instanceof Error ? t(failure.message) : t('Backup refused'), undefined, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const downloadFull = async () => {
    try {
      const ticket = await requestDownload(server, { full: true });
      await Linking.openURL(ticket.url);
    } catch (failure) {
      showSnack(failure instanceof Error ? t(failure.message) : t('Download refused'), undefined, { tone: 'error' });
    }
  };

  const pickFile = async () => {
    const picked = await pickBackupArchive();
    if (picked.status === 'ok') overlays.restore({ kind: 'file', path: picked.path, name: picked.name });
    else if (picked.status === 'error') showSnack(picked.message ? t(picked.message) : t('Unreadable file'), undefined, { tone: 'error' });
  };

  // Sent, then running: no second restore meanwhile.
  const restoring = sending !== null || status?.restore.running === true;
  const line =
    sending === 'file'
      ? { tone: 'waiting' as const, title: t('Sending the archive…'), meta: '' }
      : restoring
        ? { tone: 'waiting' as const, title: t('Restoring…'), meta: '' }
        : backupLine(backup, status?.backup ?? null, now);
  const running = status?.backup.running === true;
  const snapshots = backups.list?.snapshots ?? [];
  const shown = all ? snapshots : snapshots.slice(0, FIRST_SNAPSHOTS);

  return (
    <View>
      {/* Its removal in the status row, as on the web. */}
      <StatusRow line={line}>
        {backup.configured ? (
          <Button
            kind="dangerText"
            small
            label={t('Remove S3 storage')}
            busy={busy === 'remove'}
            onPress={() =>
              overlays.ask({
                title: t('Remove S3 storage?'),
                message: t('The S3 settings are deleted from your server. Backups already sent stay on S3.'),
                confirmLabel: t('Remove'),
                danger: true,
                run: () => void save(null, 'remove', t('S3 storage removed')),
              })
            }
          />
        ) : null}
      </StatusRow>

      <View style={styles.fields}>
        <TextField label={t('Service address')} kind="url" value={value('endpoint')} onChangeText={editEndpoint} field={connection.field('endpoint')} help={t('Your provider’s S3 address, like {example} for Scaleway in Paris.', { example: 'https://s3.fr-par.scw.cloud' })} />
        <TextField label={t('Region')} kind="code" value={value('region')} onChangeText={editRegion} field={connection.field('region')} help={t('The one in the service’s address, like {example}.', { example: 'fr-par' })} />
        <TextField label={t('Bucket')} kind="code" value={value('bucket')} onChangeText={edit('bucket')} field={connection.field('bucket')} />
        <TextField label={t('Folder in the bucket')} kind="code" optional value={value('prefix')} onChangeText={edit('prefix')} field={connection.field('prefix')} help={t('To keep the backups apart in the bucket, like {example}.', { example: 'unlease/' })} />
        <TextField
          label={t('Access key')}
          kind="code"
          value={value('accessKeyId')}
          onChangeText={edit('accessKeyId')}
          field={connection.field('accessKeyId')}
          help={t('In your provider’s console: access keys (or IAM), allowed to read and write in this bucket.')}
        />
        <TextField
          label={backup.secretHint ? t('Replace the secret key') : t('Secret key')}
          kind="secret"
          value={secret}
          onChangeText={setSecret}
          field={connection.field('secret')}
          help={`${t('Checked, then kept on your server, never on this phone.')}${backup.secretHint ? ` ${t('Current: {hint}', { hint: backup.secretHint })}` : ''}`}
          revealLabels={{ show: t('Show the secret key'), hide: t('Hide the secret key') }}
        />
        <View>
          <AppText variant="metaStrong">{t('Storage class')}</AppText>
          <View style={styles.classes} accessibilityRole="radiogroup" accessibilityLabel={t('Storage class')}>
            {storageClassesFor(value('endpoint'), chosenClass).map(each => (
              <ListRow
                key={each}
                title={STORAGE_CLASS_WORDS[each].name}
                supporting={STORAGE_CLASS_WORDS[each].meta}
                leading={<View style={styles.mark}>{chosenClass === each ? <Icon name="check" size={22} color={theme.color.focus} /> : null}</View>}
                onPress={busy === 'connection' ? undefined : () => setStorageClass(each)}
                accessibilityRole="radio"
                accessibilityState={{ checked: chosenClass === each }}
              />
            ))}
          </View>
          {storageClassHelp(value('endpoint')).map(line => (
            <AppText key={line} variant="meta" color={theme.color.inkMuted}>
              {line}
            </AppText>
          ))}
        </View>
        <FormMessage message={connection.message} />
        <View style={styles.row}>
          <Button label={t('Test and save')} icon="server" busy={connection.busy} disabled={unchanged} onPress={() => void connection.submit(saveConnection)} />
        </View>

        {/* In the setup, how often and how many once the bucket is set (the server then backs up every day). */}
        {setup && !backup.configured ? null : (
          <>
            <AppText variant="metaStrong">{t('Frequency')}</AppText>
            <Segmented<BackupRecurrence>
              label={t('Backup frequency')}
              value={backup.recurrence}
              disabled={!backup.configured || busy !== null}
              onChange={recurrence => void save({ recurrence }, 'recurrence', t('Automatic backup: {recurrence}', { recurrence: BACKUP_RECURRENCE_NAMES[recurrence].toLowerCase() }))}
              options={BACKUP_RECURRENCES.map(id => ({ value: id, label: BACKUP_RECURRENCE_SHORT[id] }))}
            />

            <View style={styles.keepRow}>
              <View style={styles.flex}>
                <TextField
                  label={t('Keep backups, in days')}
                  kind="number"
                  value={keepValue}
                  onChangeText={setKeep}
                  field={keeping.field('keep')}
                  editable={backup.configured}
                  help={t('Those made by this server are deleted from S3 after this; the newest always stays.')}
                />
              </View>
              <Button
                kind="tonal"
                label={t('Apply')}
                busy={keeping.busy}
                disabled={!backup.configured || (keepValid && keepNumber === backup.keep)}
                onPress={() => void keeping.submit(applyKeep)}
                style={styles.apply}
              />
            </View>
          </>
        )}
      </View>

      {backup.configured && !setup ? (
        <ListRow icon="upload" title={t('Back up now')} supporting={running ? t('Backing up…') : undefined} onPress={running || busy === 'run' ? undefined : () => runNow()} />
      ) : null}

      {backup.configured && !setup ? (
        <>
          <View style={styles.heading}>
            <AppText variant="metaStrong">{t('Backups on S3')}</AppText>
          </View>
          {backups.error ? (
            <AppText variant="meta" style={styles.note}>
              {t(backups.error)}
            </AppText>
          ) : !backups.list ? (
            <AppText variant="meta" style={styles.note}>
              {t('Reading the backups…')}
            </AppText>
          ) : snapshots.length === 0 ? (
            <EmptyLine text={t('No backups on S3 yet.')} glyph="archive" style={styles.note} />
          ) : (
            shown.map(snapshot => <ListRow key={snapshot.name} icon="archive" title={formatMoment(snapshot.at, now)} supporting={snapshotMeta(snapshot)} onPress={() => overlays.openSnapshot(snapshot)} />)
          )}
          {!all && snapshots.length > FIRST_SNAPSHOTS ? (
            <View style={styles.more}>
              <Button kind="text" label={t('Show all ({count})', { count: snapshots.length })} onPress={() => setAll(true)} style={styles.moreButton} />
            </View>
          ) : null}
        </>
      ) : null}

      {setup ? null : (
        <>
          <ListRow icon="download" title={t('Download a full backup')} supporting={t('An archive with your photos and files, to keep wherever you like: it restores here.')} onPress={() => downloadFull()} />
          {/* Said here too: the section's head may be scrolled away from this row. */}
          <ListRow
            icon="restore"
            title={t('Restore from a file')}
            supporting={sending === 'file' ? t('Sending the archive…') : restoring ? t('Restoring…') : t('A .tar.gz archive downloaded from S3 or from this page.')}
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
  // The rows' own inset brings their text in line with the fields.
  classes: { marginHorizontal: -16, marginTop: 4 },
  mark: { width: 24, alignItems: 'center' },
  heading: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  note: { paddingHorizontal: 16, paddingVertical: 8 },
  // Inset and padded as the rows above (6 and 10): its words on their glyphs' column.
  more: { paddingHorizontal: 6, alignItems: 'flex-start' },
  moreButton: { paddingHorizontal: 10 },
});
