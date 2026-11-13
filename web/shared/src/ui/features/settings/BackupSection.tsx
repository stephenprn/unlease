/**
 * "Sauvegarde sur S3": where the backups go (tried on the bucket before anything is kept), how often,
 * the class S3 keeps them in (Glacier, where the provider has it), how many days they are kept, the
 * snapshots there (to download or restore), a full archive with the files, and restoring an archive
 * kept elsewhere. The phone's BackupSection, on a desk. In the first run's setup (`setup`), only
 * where they go, in which class, how often and how long: it starts from Scaleway in Paris.
 */
import { useId, useRef, useState } from 'react';

import { t, tx } from '@unlease/core/i18n';
import { BACKUP_RECURRENCE_SHORT, backupLine, formatMoment, snapshotMeta } from '@unlease/core/services/admin';
import { plural } from '@unlease/core/services/format';
import { STORAGE_CLASS_WORDS, storageClassesFor, storageClassHelp } from '@unlease/core/services/storageClass';
import { regionOfEndpoint, serviceAddressProblem, serviceRefusalField, SETUP_BACKUP_DRAFT } from '@unlease/core/services/setup';
import type { RestoreMode } from '@unlease/core/sync/admin';
import { BACKUP_KEEP_MAX, BACKUP_RECURRENCES, type BackupPatch, type BackupRecurrence, type BackupSettings, type SettingsPatch, type StorageClass } from '@unlease/core/sync/settings';

import { useMinute } from '../../../app/hooks/useMinute';
import { setServerSettings } from '../../../app/store/serverSettings';
import type { ServerConfig } from '../../../app/store/settings';
import { showError, showSnack } from '../../../app/store/ui';
import { requestDownload, restoreFile, restoreSnapshot, saveServerSettings, startBackup } from '../../../app/sync/transport';
import { Button } from '../../components/Button';
import { Confirm } from '../../components/Dialog';
import { EmptyLine } from '../../components/EmptyLine';
import { Icon } from '../../components/Icon';
import { FormMessage } from '../../components/FormMessage';
import { Segmented } from '../../components/Segmented';
import { TextField } from '../../components/TextField';
import { useForm } from '../../components/useForm';
import { RestoreDialog } from './RestoreDialog';
import { StatusRow } from './Section';
import controls from '../../components/controls.module.css';
import styles from './settings.module.css';
import { useBackups, type Admin } from './useAdmin';

/** In French, translated where it is shown (`Section` reads its `info` through `t`). */
export const BACKUP_INFO =
  tx('The server sends a copy of your data to S3 storage (Scaleway, OVH, AWS…): at each backup a readable archive (your notes and pages in Markdown, and the unlease.json file that restores it), and each photo or file only once, except those Seafile keeps (the archive says where they are).');

/** The connection's fields, as the form edits them. */
const CONNECTION = ['endpoint', 'region', 'bucket', 'prefix', 'accessKeyId'] as const;
type ConnectionField = (typeof CONNECTION)[number];

/** Snapshots listed before "Tout afficher". */
const SHOWN = 5;

/** Read at each render: the names follow the interface's language. */
const recurrenceOptions = () => BACKUP_RECURRENCES.map(value => ({ value, label: BACKUP_RECURRENCE_SHORT[value] }));

type Busy = 'connection' | 'recurrence' | 'keep' | 'remove' | 'run' | 'restore' | 'download' | null;

type RestoreTarget = { readonly kind: 'snapshot'; readonly name: string; readonly at: number } | { readonly kind: 'file'; readonly file: File };

/** Opens the browser's own download of a short-lived address. */
function download(url: string, name: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function BackupSection({ server, backup, admin, setup = false }: { server: ServerConfig; backup: BackupSettings; admin: Admin; setup?: boolean }) {
  const now = useMinute();
  const [draft, setDraft] = useState<Partial<Record<ConnectionField, string>>>(() => (setup && !backup.configured ? { ...SETUP_BACKUP_DRAFT } : {}));
  const [secret, setSecret] = useState('');
  const [storageClass, setStorageClass] = useState<StorageClass | null>(null);
  const [keep, setKeep] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [listBump, setListBump] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [target, setTarget] = useState<RestoreTarget | null>(null);
  const [lastTarget, setLastTarget] = useState<RestoreTarget | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const keepId = useId();
  const classId = useId();
  const backups = useBackups(server, backup.configured, admin.backupsVersion + listBump);
  const status = admin.status;

  const value = (field: ConnectionField): string => draft[field] ?? backup[field];
  // The region follows the address while nobody typed one of their own.
  const setEndpoint = (next: string): void =>
    setDraft(d => {
      const region = (d.region ?? backup.region).trim();
      const derived = regionOfEndpoint(next);
      const follows = region === '' || region === regionOfEndpoint(d.endpoint ?? backup.endpoint);
      return { ...d, endpoint: next, ...(follows && derived ? { region: derived } : {}) };
    });
  const changed = CONNECTION.filter(field => draft[field] !== undefined && draft[field]!.trim() !== backup[field]);
  const chosenClass = storageClass ?? backup.storageClass;
  const classChanged = chosenClass !== backup.storageClass;
  // Nothing to try: the bucket is set and nothing in the form changed.
  const unchanged = backup.configured && changed.length === 0 && secret.trim() === '' && !classChanged;
  const connection = useForm({
    endpoint: serviceAddressProblem(value('endpoint'), t('Enter the S3 service’s address.'), 'https://s3.fr-par.scw.cloud'),
    region: value('region').trim() ? null : t('Enter the service’s region, like fr-par.'),
    bucket: value('bucket').trim() ? null : t('Enter the bucket’s name.'),
    accessKeyId: value('accessKeyId').trim() ? null : t('Enter the access key.'),
    secret: backup.configured || secret.trim() ? null : t('Enter the secret key given with the access key.'),
  });
  const keepValue = keep ?? String(backup.keep);
  const keepNumber = Number(keepValue.trim());
  const keepValid = Number.isInteger(keepNumber) && keepNumber >= 1 && keepNumber <= BACKUP_KEEP_MAX;
  const keeping = useForm({ keep: keepValid ? null : t('A number of days from 1 to {max}.', { max: BACKUP_KEEP_MAX }) });

  /** Saves; the server's refusal of the connection or of the days comes back on its form, anything else on a slip. */
  const save = async (patch: SettingsPatch, what: Exclude<Busy, null>, done: string): Promise<boolean> => {
    setBusy(what);
    try {
      setServerSettings(await saveServerSettings(server, patch));
      showSnack(done, undefined, { tone: 'success' });
      return true;
    } catch (failure) {
      const said = failure instanceof Error ? failure.message : tx('Setting refused');
      const message = t(said);
      // Under the field it concerns (the address, the bucket, the region), else on the whole form (both keys, rights).
      const field = serviceRefusalField(said);
      if (what === 'connection') connection.fail(field === 'address' ? 'endpoint' : field === 'bucket' || field === 'region' ? field : null, message);
      else if (what === 'keep') keeping.fail('keep', message);
      else showError(message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveConnection = async (): Promise<boolean> => {
    if (unchanged) return true;
    const patch: { -readonly [K in keyof BackupPatch]: BackupPatch[K] } = {};
    for (const field of changed) patch[field] = draft[field]!.trim();
    if (secret.trim()) patch.secretAccessKey = secret.trim();
    if (classChanged) patch.storageClass = chosenClass;
    if (!(await save({ backup: patch }, 'connection', t('S3 storage saved')))) return false;
    setDraft({});
    setSecret('');
    setStorageClass(null);
    connection.reset();
    setListBump(bump => bump + 1);
    void admin.refresh();
    return true;
  };

  const runNow = async (): Promise<void> => {
    setBusy('run');
    try {
      admin.setStatus(await startBackup(server));
    } catch (failure) {
      showError(failure instanceof Error ? t(failure.message) : t('Backup refused'));
    } finally {
      setBusy(null);
    }
  };

  const fetchDownload = async (what: { readonly snapshot: string } | { readonly full: true }): Promise<void> => {
    setBusy('download');
    try {
      const ticket = await requestDownload(server, what);
      download(ticket.url, ticket.name);
    } catch (failure) {
      showError(failure instanceof Error ? t(failure.message) : t('Download refused'));
    } finally {
      setBusy(null);
    }
  };

  const restore = async (chosen: RestoreTarget, mode: RestoreMode): Promise<void> => {
    setBusy('restore');
    try {
      admin.setStatus(chosen.kind === 'snapshot' ? await restoreSnapshot(server, chosen.name, mode) : await restoreFile(server, chosen.file, mode));
    } catch (failure) {
      showError(failure instanceof Error ? t(failure.message) : t('Restore refused'));
    } finally {
      setBusy(null);
    }
  };

  const openRestore = (next: RestoreTarget): void => {
    setTarget(next);
    setLastTarget(next);
  };

  const line =
    busy === 'restore'
      ? { tone: 'waiting' as const, title: t('Sending the archive…'), meta: '' }
      : status?.restore.running
        ? { tone: 'waiting' as const, title: t('Restoring…'), meta: '' }
        : backupLine(backup, status?.backup ?? null, now);
  const classes = storageClassesFor(value('endpoint'), chosenClass);
  const snapshots = backups.snapshots ?? [];
  const listed = showAll ? snapshots : snapshots.slice(0, SHOWN);
  const empty = status !== null && status.server.notes === 0 && status.server.pages === 0;
  // The dialog keeps its words while it leaves.
  const shownTarget = target ?? lastTarget;
  const source = !shownTarget ? '' : shownTarget.kind === 'snapshot' ? t('Backup of {moment}', { moment: formatMoment(shownTarget.at, now) }) : shownTarget.file.name;

  return (
    <>
      <StatusRow tone={line.tone} title={line.title} meta={line.meta}>
        {backup.configured ? (
          <Button kind="dangerText" small busy={busy === 'remove'} onClick={() => setConfirmRemove(true)}>
            {t('Remove S3 storage')}
          </Button>
        ) : null}
      </StatusRow>

      <form className={styles.block} onSubmit={connection.onSubmit(saveConnection)} noValidate>
        <div className={styles.fields}>
          <TextField label={t('Service address')} kind="url" value={value('endpoint')} onChange={setEndpoint} field={connection.field('endpoint')} help={t('Your provider’s S3 address, like {example} for Scaleway in Paris.', { example: 'https://s3.fr-par.scw.cloud' })} />
          <TextField label={t('Region')} kind="code" value={value('region')} onChange={next => setDraft(d => ({ ...d, region: next }))} field={connection.field('region')} help={t('The one in the service’s address, like {example}.', { example: 'fr-par' })} />
          <TextField label="Bucket" kind="code" value={value('bucket')} onChange={next => setDraft(d => ({ ...d, bucket: next }))} field={connection.field('bucket')} />
          <TextField label={t('Folder in the bucket')} kind="code" optional value={value('prefix')} onChange={next => setDraft(d => ({ ...d, prefix: next }))} help={t('To keep the backups apart in the bucket, like {example}.', { example: 'unlease/' })} />
          <TextField label={t('Access key')} kind="code" value={value('accessKeyId')} onChange={next => setDraft(d => ({ ...d, accessKeyId: next }))} field={connection.field('accessKeyId')} help={t('In your provider’s console: access keys (or IAM), allowed to read and write in this bucket.')} />
          <TextField
            label={backup.secretHint ? t('Replace the secret key') : t('Secret key')}
            kind="secret"
            value={secret}
            onChange={setSecret}
            field={connection.field('secret')}
            help={backup.secretHint ? t('Checked, then kept on your server, never in this browser. Current: {hint}', { hint: backup.secretHint }) : t('Given with the access key, once only, by the provider’s console. Checked, then kept on your server, never in this browser.')}
            revealLabels={{ show: t('Show the secret key'), hide: t('Hide the secret key') }}
          />
        </div>
        <div className={styles.classes}>
          <p className={`${controls.fieldLabel} t-meta-strong`} id={classId}>
            {t('Storage class')}
          </p>
          <div role="radiogroup" aria-labelledby={classId} className={styles.choices}>
            {classes.map(each => (
              <button key={each} type="button" role="radio" aria-checked={chosenClass === each} className={styles.choice} disabled={busy === 'connection'} onClick={() => setStorageClass(each)}>
                <span className={styles.choiceMark} aria-hidden="true">
                  {chosenClass === each ? <Icon name="check" size={20} /> : null}
                </span>
                <span className={styles.rowText}>
                  <span className="t-body">{STORAGE_CLASS_WORDS[each].name}</span>
                  <span className="t-meta">{STORAGE_CLASS_WORDS[each].meta}</span>
                </span>
              </button>
            ))}
          </div>
          {storageClassHelp(value('endpoint')).map(line => (
            <p key={line} className={`${controls.fieldNoteAlone} t-meta`}>
              {line}
            </p>
          ))}
        </div>
        <FormMessage form={connection} />
        <div className={styles.buttons}>
          <Button type="submit" icon="server" busy={connection.busy} disabled={unchanged}>
            {t('Test and save')}
          </Button>
        </div>
      </form>

      {/* In the setup, how often and how many once the bucket is set (the server then backs up every day). */}
      {setup && !backup.configured ? null : (
        <>
          <div className={styles.block}>
            <p className={`${controls.fieldLabel} t-meta-strong`}>{t('Frequency')}</p>
            <Segmented<BackupRecurrence>
              label={t('Backup frequency')}
              options={recurrenceOptions()}
              value={backup.recurrence}
              disabled={!backup.configured || busy !== null}
              onChange={recurrence => void save({ backup: { recurrence } }, 'recurrence', t('Frequency: {recurrence}', { recurrence: BACKUP_RECURRENCE_SHORT[recurrence] })).then(ok => ok && void admin.refresh())}
            />
          </div>

          <form
            className={styles.block}
            onSubmit={keeping.onSubmit(async () => {
              if (keepNumber === backup.keep) return true;
              const ok = await save({ backup: { keep: keepNumber } }, 'keep', t('Backups kept {days}', { days: plural(keepNumber, 'day') }));
              if (ok) setKeep(null);
              return ok;
            })}
            noValidate
          >
            <div className={styles.budgetRow}>
              <TextField label={t('Keep backups, in days')} kind="number" name={keepId} value={keepValue} onChange={setKeep} field={keeping.field('keep')} className={styles.budgetField} />
              <Button type="submit" kind="tonal" busy={keeping.busy} disabled={!backup.configured || (keepValid && keepNumber === backup.keep)} className={styles.apply}>
                {t('Apply')}
              </Button>
            </div>
            <p className={`${controls.fieldNoteAlone} t-meta`}>{t('Those made by this server are deleted from S3 after this; the newest always stays.')}</p>
          </form>
        </>
      )}

      {setup ? null : (
        <>
          {backup.configured ? (
            <button type="button" className={styles.row} disabled={busy !== null || status?.backup.running === true} onClick={() => void runNow()}>
              <Icon name="upload" size={24} />
              <span className={styles.rowText}>
                <span className="t-body">{t('Back up now')}</span>
                <span className="t-meta">{t('To {place}', { place: `${backup.bucket}${backup.prefix ? `/${backup.prefix}` : ''}` })}</span>
              </span>
            </button>
          ) : null}

          {backup.configured ? (
            <div className={styles.block}>
              <p className="t-meta-strong">{t('Backups on S3')}</p>
              {backups.error ? (
                <p className={`${styles.error} t-body`}>{t(backups.error)}</p>
              ) : backups.snapshots === null ? (
                <p className="t-meta">{backups.loading ? t('Reading the backups…') : ''}</p>
              ) : snapshots.length === 0 ? (
                <EmptyLine text={t('No backups on S3 yet.')} glyph="archive" />
              ) : (
                <ul className={styles.snapshots} aria-label={t('Backups on S3')}>
                  {listed.map(snapshot => (
                    <li key={snapshot.name} className={styles.snapshot}>
                      <span className={styles.rowText}>
                        <span className="t-body tabular">{formatMoment(snapshot.at, now)}</span>
                        <span className="t-meta tabular">{snapshotMeta(snapshot)}</span>
                      </span>
                      <span className={styles.snapshotActions}>
                        <Button kind="text" small disabled={busy !== null} onClick={() => void fetchDownload({ snapshot: snapshot.name })}>
                          {t('Download')}
                        </Button>
                        <Button kind="text" small disabled={busy !== null || status?.restore.running === true} onClick={() => openRestore({ kind: 'snapshot', name: snapshot.name, at: snapshot.at })}>
                          {t('Restore')}
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {snapshots.length > SHOWN ? (
                <div className={styles.buttons}>
                  <Button kind="text" small onClick={() => setShowAll(all => !all)}>
                    {showAll ? t('Show less') : t('Show all ({count})', { count: snapshots.length })}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          <button type="button" className={styles.row} disabled={busy !== null} onClick={() => void fetchDownload({ full: true })}>
            <Icon name="download" size={24} />
            <span className={styles.rowText}>
              <span className="t-body">{t('Download a full backup')}</span>
              <span className="t-meta">{t('An archive with your photos and files, to keep wherever you like: it restores here.')}</span>
            </span>
          </button>
          <button type="button" className={styles.row} disabled={busy !== null || status?.restore.running === true} onClick={() => picker.current?.click()}>
            <Icon name="restore" size={24} />
            <span className={styles.rowText}>
              <span className="t-body">{t('Restore from a file')}</span>
              <span className="t-meta">{t('A .tar.gz archive downloaded from S3 or from this page.')}</span>
            </span>
          </button>
          <input
            ref={picker}
            type="file"
            accept=".gz,.tgz,application/gzip"
            hidden
            aria-label={t('Archive to restore')}
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) openRestore({ kind: 'file', file });
            }}
          />

        </>
      )}

      <RestoreDialog
        open={target !== null}
        source={source}
        empty={empty}
        onCancel={() => setTarget(null)}
        onConfirm={mode => {
          const chosen = target;
          setTarget(null);
          if (chosen) void restore(chosen, mode);
        }}
      />
      <Confirm
        open={confirmRemove}
        title={t('Remove S3 storage?')}
        message={t('The S3 settings are deleted from your server. Backups already sent stay on S3.')}
        confirmLabel={t('Remove')}
        danger
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          void save({ backup: null }, 'remove', t('S3 storage removed')).then(ok => {
            if (!ok) return;
            setDraft({});
            void admin.refresh();
          });
        }}
      />
    </>
  );
}
