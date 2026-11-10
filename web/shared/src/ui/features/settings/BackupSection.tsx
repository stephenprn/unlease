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
  tx('Le serveur envoie une copie de vos données vers un stockage S3 (Scaleway, OVH, AWS…) : à chaque sauvegarde une archive lisible (vos notes et vos pages en Markdown, et le fichier unlease.json qui sert à la restaurer), et chaque photo ou fichier une seule fois, sauf ceux que garde Seafile (l’archive dit où ils sont).');

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
    endpoint: serviceAddressProblem(value('endpoint'), t('Saisissez l’adresse du service S3.'), 'https://s3.fr-par.scw.cloud'),
    region: value('region').trim() ? null : t('Saisissez la région du service, comme fr-par.'),
    bucket: value('bucket').trim() ? null : t('Saisissez le nom du bucket.'),
    accessKeyId: value('accessKeyId').trim() ? null : t('Saisissez la clé d’accès.'),
    secret: backup.configured || secret.trim() ? null : t('Saisissez la clé secrète donnée avec la clé d’accès.'),
  });
  const keepValue = keep ?? String(backup.keep);
  const keepNumber = Number(keepValue.trim());
  const keepValid = Number.isInteger(keepNumber) && keepNumber >= 1 && keepNumber <= BACKUP_KEEP_MAX;
  const keeping = useForm({ keep: keepValid ? null : t('Un nombre de jours de 1 à {max}.', { max: BACKUP_KEEP_MAX }) });

  /** Saves; the server's refusal of the connection or of the days comes back on its form, anything else on a slip. */
  const save = async (patch: SettingsPatch, what: Exclude<Busy, null>, done: string): Promise<boolean> => {
    setBusy(what);
    try {
      setServerSettings(await saveServerSettings(server, patch));
      showSnack(done, undefined, { tone: 'success' });
      return true;
    } catch (failure) {
      const said = failure instanceof Error ? failure.message : tx('Réglage refusé');
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
    if (!(await save({ backup: patch }, 'connection', t('Stockage S3 enregistré')))) return false;
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
      showError(failure instanceof Error ? t(failure.message) : t('Sauvegarde refusée'));
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
      showError(failure instanceof Error ? t(failure.message) : t('Téléchargement refusé'));
    } finally {
      setBusy(null);
    }
  };

  const restore = async (chosen: RestoreTarget, mode: RestoreMode): Promise<void> => {
    setBusy('restore');
    try {
      admin.setStatus(chosen.kind === 'snapshot' ? await restoreSnapshot(server, chosen.name, mode) : await restoreFile(server, chosen.file, mode));
    } catch (failure) {
      showError(failure instanceof Error ? t(failure.message) : t('Restauration refusée'));
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
      ? { tone: 'waiting' as const, title: t('Envoi de l’archive…'), meta: '' }
      : status?.restore.running
        ? { tone: 'waiting' as const, title: t('Restauration en cours…'), meta: '' }
        : backupLine(backup, status?.backup ?? null, now);
  const classes = storageClassesFor(value('endpoint'), chosenClass);
  const snapshots = backups.snapshots ?? [];
  const listed = showAll ? snapshots : snapshots.slice(0, SHOWN);
  const empty = status !== null && status.server.notes === 0 && status.server.pages === 0;
  // The dialog keeps its words while it leaves.
  const shownTarget = target ?? lastTarget;
  const source = !shownTarget ? '' : shownTarget.kind === 'snapshot' ? t('Sauvegarde du {moment}', { moment: formatMoment(shownTarget.at, now) }) : shownTarget.file.name;

  return (
    <>
      <StatusRow tone={line.tone} title={line.title} meta={line.meta}>
        {backup.configured ? (
          <Button kind="dangerText" small busy={busy === 'remove'} onClick={() => setConfirmRemove(true)}>
            {t('Retirer le stockage S3')}
          </Button>
        ) : null}
      </StatusRow>

      <form className={styles.block} onSubmit={connection.onSubmit(saveConnection)} noValidate>
        <div className={styles.fields}>
          <TextField label={t('Adresse du service')} kind="url" value={value('endpoint')} onChange={setEndpoint} field={connection.field('endpoint')} help={t('L’adresse S3 de votre fournisseur, comme {example} pour Scaleway à Paris.', { example: 'https://s3.fr-par.scw.cloud' })} />
          <TextField label={t('Région')} kind="code" value={value('region')} onChange={next => setDraft(d => ({ ...d, region: next }))} field={connection.field('region')} help={t('Celle de l’adresse du service, comme {example}.', { example: 'fr-par' })} />
          <TextField label="Bucket" kind="code" value={value('bucket')} onChange={next => setDraft(d => ({ ...d, bucket: next }))} field={connection.field('bucket')} />
          <TextField label={t('Dossier dans le bucket')} kind="code" optional value={value('prefix')} onChange={next => setDraft(d => ({ ...d, prefix: next }))} help={t('Pour ranger les sauvegardes à part dans le bucket, comme {example}.', { example: 'unlease/' })} />
          <TextField label={t('Clé d’accès')} kind="code" value={value('accessKeyId')} onChange={next => setDraft(d => ({ ...d, accessKeyId: next }))} field={connection.field('accessKeyId')} help={t('Dans la console de votre fournisseur : clés d’accès (ou IAM), avec le droit de lire et d’écrire dans ce bucket.')} />
          <TextField
            label={backup.secretHint ? t('Remplacer la clé secrète') : t('Clé secrète')}
            kind="secret"
            value={secret}
            onChange={setSecret}
            field={connection.field('secret')}
            help={backup.secretHint ? t('Vérifiée puis gardée sur votre serveur, jamais dans ce navigateur. Actuelle : {hint}', { hint: backup.secretHint }) : t('Donnée avec la clé d’accès, une seule fois, par la console du fournisseur. Vérifiée puis gardée sur votre serveur, jamais dans ce navigateur.')}
            revealLabels={{ show: t('Afficher la clé secrète'), hide: t('Masquer la clé secrète') }}
          />
        </div>
        <div className={styles.classes}>
          <p className={`${controls.fieldLabel} t-meta-strong`} id={classId}>
            {t('Classe de stockage')}
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
            {t('Tester et enregistrer')}
          </Button>
        </div>
      </form>

      {/* In the setup, how often and how many once the bucket is set (the server then backs up every day). */}
      {setup && !backup.configured ? null : (
        <>
          <div className={styles.block}>
            <p className={`${controls.fieldLabel} t-meta-strong`}>{t('Fréquence')}</p>
            <Segmented<BackupRecurrence>
              label={t('Fréquence des sauvegardes')}
              options={recurrenceOptions()}
              value={backup.recurrence}
              disabled={!backup.configured || busy !== null}
              onChange={recurrence => void save({ backup: { recurrence } }, 'recurrence', t('Fréquence : {recurrence}', { recurrence: BACKUP_RECURRENCE_SHORT[recurrence] })).then(ok => ok && void admin.refresh())}
            />
          </div>

          <form
            className={styles.block}
            onSubmit={keeping.onSubmit(async () => {
              if (keepNumber === backup.keep) return true;
              const ok = await save({ backup: { keep: keepNumber } }, 'keep', t('Sauvegardes gardées {days}', { days: plural(keepNumber, 'jour') }));
              if (ok) setKeep(null);
              return ok;
            })}
            noValidate
          >
            <div className={styles.budgetRow}>
              <TextField label={t('Garder les sauvegardes, en jours')} kind="number" name={keepId} value={keepValue} onChange={setKeep} field={keeping.field('keep')} className={styles.budgetField} />
              <Button type="submit" kind="tonal" busy={keeping.busy} disabled={!backup.configured || (keepValid && keepNumber === backup.keep)} className={styles.apply}>
                {t('Appliquer')}
              </Button>
            </div>
            <p className={`${controls.fieldNoteAlone} t-meta`}>{t('Celles faites par ce serveur sont effacées de S3 passé ce délai ; la plus récente reste toujours.')}</p>
          </form>
        </>
      )}

      {setup ? null : (
        <>
          {backup.configured ? (
            <button type="button" className={styles.row} disabled={busy !== null || status?.backup.running === true} onClick={() => void runNow()}>
              <Icon name="upload" size={24} />
              <span className={styles.rowText}>
                <span className="t-body">{t('Sauvegarder maintenant')}</span>
                <span className="t-meta">{t('Vers {place}', { place: `${backup.bucket}${backup.prefix ? `/${backup.prefix}` : ''}` })}</span>
              </span>
            </button>
          ) : null}

          {backup.configured ? (
            <div className={styles.block}>
              <p className="t-meta-strong">{t('Sauvegardes sur S3')}</p>
              {backups.error ? (
                <p className={`${styles.error} t-body`}>{t(backups.error)}</p>
              ) : backups.snapshots === null ? (
                <p className="t-meta">{backups.loading ? t('Lecture des sauvegardes…') : ''}</p>
              ) : snapshots.length === 0 ? (
                <p className="t-meta">{t('Aucune sauvegarde sur S3 pour l’instant.')}</p>
              ) : (
                <ul className={styles.snapshots} aria-label={t('Sauvegardes sur S3')}>
                  {listed.map(snapshot => (
                    <li key={snapshot.name} className={styles.snapshot}>
                      <span className={styles.rowText}>
                        <span className="t-body tabular">{formatMoment(snapshot.at, now)}</span>
                        <span className="t-meta tabular">{snapshotMeta(snapshot)}</span>
                      </span>
                      <span className={styles.snapshotActions}>
                        <Button kind="text" small disabled={busy !== null} onClick={() => void fetchDownload({ snapshot: snapshot.name })}>
                          {t('Télécharger')}
                        </Button>
                        <Button kind="text" small disabled={busy !== null || status?.restore.running === true} onClick={() => openRestore({ kind: 'snapshot', name: snapshot.name, at: snapshot.at })}>
                          {t('Restaurer')}
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {snapshots.length > SHOWN ? (
                <div className={styles.buttons}>
                  <Button kind="text" small onClick={() => setShowAll(all => !all)}>
                    {showAll ? t('Afficher moins') : t('Tout afficher ({count})', { count: snapshots.length })}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          <button type="button" className={styles.row} disabled={busy !== null} onClick={() => void fetchDownload({ full: true })}>
            <Icon name="download" size={24} />
            <span className={styles.rowText}>
              <span className="t-body">{t('Télécharger une sauvegarde complète')}</span>
              <span className="t-meta">{t('Une archive avec vos photos et fichiers, à garder où vous voulez : elle se restaure ici.')}</span>
            </span>
          </button>
          <button type="button" className={styles.row} disabled={busy !== null || status?.restore.running === true} onClick={() => picker.current?.click()}>
            <Icon name="restore" size={24} />
            <span className={styles.rowText}>
              <span className="t-body">{t('Restaurer depuis un fichier')}</span>
              <span className="t-meta">{t('Une archive .tar.gz téléchargée depuis S3 ou depuis cette page.')}</span>
            </span>
          </button>
          <input
            ref={picker}
            type="file"
            accept=".gz,.tgz,application/gzip"
            hidden
            aria-label={t('Archive à restaurer')}
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
        title={t('Retirer le stockage S3 ?')}
        message={t('Les réglages S3 sont effacés de votre serveur. Les sauvegardes déjà envoyées restent sur S3.')}
        confirmLabel={t('Retirer')}
        danger
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          void save({ backup: null }, 'remove', t('Stockage S3 retiré')).then(ok => {
            if (!ok) return;
            setDraft({});
            void admin.refresh();
          });
        }}
      />
    </>
  );
}
