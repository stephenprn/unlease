/**
 * "Fichiers sur Seafile": the folder of a Seafile library where the server keeps the photos, videos
 * and documents (tried before it is kept), a pass on demand, and turning it off (the files come
 * back to the server first). The phone's DriveSection, on a desk.
 */
import { useState } from 'react';

import { t, tx } from '@unlease/core/i18n';
import { driveLine } from '@unlease/core/services/admin';
import { serviceAddressProblem, serviceRefusalField } from '@unlease/core/services/setup';
import { DRIVE_FOLDER_DEFAULT, type DrivePatch, type DriveSettings, type SettingsPatch } from '@unlease/core/sync/settings';

import { useMinute } from '../../../app/hooks/useMinute';
import { setServerSettings } from '../../../app/store/serverSettings';
import type { ServerConfig } from '../../../app/store/settings';
import { showError, showSnack } from '../../../app/store/ui';
import { saveServerSettings, startDriveSync } from '../../../app/sync/transport';
import { Button } from '../../components/Button';
import { Confirm } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { FormMessage } from '../../components/FormMessage';
import { TextField } from '../../components/TextField';
import { useForm } from '../../components/useForm';
import { StatusRow } from './Section';
import styles from './settings.module.css';
import type { Admin } from './useAdmin';

/** In French, translated where it is shown (`Section` reads its `info` through `t`). */
export const DRIVE_INFO =
  tx('Vos photos, vidéos et documents sont rangés dans un dossier de votre Seafile, classés par note et par page : vous les retrouvez dans votre drive. Le serveur n’en garde que de petits aperçus, et les sauvegardes S3 disent où ils sont sans les copier.');

type Busy = 'save' | 'remove' | 'sync' | null;

export function DriveSection({ server, drive, admin }: { server: ServerConfig; drive: DriveSettings; admin: Admin }) {
  const now = useMinute();
  const [url, setUrl] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const on = drive.provider !== null;

  const urlValue = url ?? drive.url;
  const folderValue = folder ?? drive.folder;
  const changed = urlValue.trim() !== drive.url || folderValue.trim() !== drive.folder || token.trim() !== '';
  const form = useForm({
    url: serviceAddressProblem(urlValue, t('Saisissez l’adresse de votre Seafile.'), t('https://drive.exemple.fr')),
    token: drive.tokenHint !== null || token.trim() ? null : t('Saisissez le jeton de la bibliothèque.'),
  });

  /** Saves; the server's refusal of the drive comes back on its form, anything else on a slip. */
  const save = async (patch: SettingsPatch, what: Exclude<Busy, null>, done: string): Promise<boolean> => {
    setBusy(what);
    try {
      setServerSettings(await saveServerSettings(server, patch));
      showSnack(done, undefined, { tone: 'success' });
      void admin.refresh();
      return true;
    } catch (failure) {
      const said = failure instanceof Error ? failure.message : tx('Réglage refusé');
      const message = t(said);
      // Under the field it concerns (the address, the token), else on the whole form.
      const field = serviceRefusalField(said);
      if (what === 'save') form.fail(field === 'address' ? 'url' : field === 'key' ? 'token' : null, message);
      else showError(message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveDrive = async (): Promise<boolean> => {
    if (on && !changed) return true;
    const patch: { -readonly [K in keyof DrivePatch]: DrivePatch[K] } = { provider: 'seafile' };
    if (!on || urlValue.trim() !== drive.url) patch.url = urlValue.trim();
    if (!on || folderValue.trim() !== drive.folder) patch.folder = folderValue.trim() || DRIVE_FOLDER_DEFAULT;
    if (token.trim()) patch.token = token.trim();
    if (!(await save({ drive: patch }, 'save', on ? t('Seafile enregistré') : t('Seafile relié : vos fichiers y partent.')))) return false;
    setUrl(null);
    setFolder(null);
    setToken('');
    form.reset();
    return true;
  };

  const syncNow = async (): Promise<void> => {
    setBusy('sync');
    try {
      admin.setStatus(await startDriveSync(server));
    } catch (failure) {
      showError(failure instanceof Error ? t(failure.message) : t('Synchronisation refusée'));
    } finally {
      setBusy(null);
    }
  };

  const line = driveLine(drive, admin.status?.drive ?? null, now);

  return (
    <>
      <StatusRow tone={line.tone} title={line.title} meta={line.meta}>
        {on && !drive.leaving ? (
          <Button kind="dangerText" small busy={busy === 'remove'} onClick={() => setConfirmRemove(true)}>
            {t('Désactiver Seafile')}
          </Button>
        ) : null}
      </StatusRow>

      {drive.leaving ? null : (
        <form className={styles.block} onSubmit={form.onSubmit(saveDrive)} noValidate>
          <div className={styles.fields}>
            <TextField label={t('Adresse de Seafile')} kind="url" value={urlValue} onChange={setUrl} field={form.field('url')} help={t('Par exemple {example}.', { example: t('https://drive.exemple.fr') })} />
            <TextField
              label={t('Dossier')}
              kind="code"
              optional
              value={folderValue}
              onChange={setFolder}
              placeholder={DRIVE_FOLDER_DEFAULT}
              help={t('Créé s’il n’existe pas. Le serveur le range lui-même : n’y déplacez pas les fichiers.')}
            />
          </div>
          <TextField
            label={drive.tokenHint ? t('Remplacer le jeton') : t('Jeton de la bibliothèque')}
            kind="secret"
            value={token}
            onChange={setToken}
            field={form.field('token')}
            help={drive.tokenHint ? t('Dans Seafile : la bibliothèque, puis ⋯, « Jeton d’API », en lecture et écriture. Gardé sur votre serveur. Actuel : {hint}', { hint: drive.tokenHint }) : t('Dans Seafile : la bibliothèque, puis ⋯, « Jeton d’API », en lecture et écriture. Gardé sur votre serveur.')}
            revealLabels={{ show: t('Afficher le jeton'), hide: t('Masquer le jeton') }}
          />
          <FormMessage form={form} />
          <div className={styles.buttons}>
            <Button type="submit" icon="server" busy={form.busy} disabled={on && !changed}>
              {t('Tester et enregistrer')}
            </Button>
          </div>
        </form>
      )}

      {on && !drive.leaving ? (
        <button type="button" className={styles.row} disabled={busy !== null || admin.status?.drive.running === true} onClick={() => void syncNow()}>
          <Icon name="refresh" size={24} />
          <span className={styles.rowText}>
            <span className="t-body">{t('Synchroniser maintenant')}</span>
            <span className="t-meta">{t('Envoie les nouveaux fichiers et suit les titres changés.')}</span>
          </span>
        </button>
      ) : null}

      <Confirm
        open={confirmRemove}
        title={t('Désactiver Seafile ?')}
        message={t('Vos fichiers reviennent d’abord sur le serveur, puis Seafile n’est plus utilisé. Ils restent aussi dans votre dossier Seafile.')}
        confirmLabel={t('Désactiver')}
        danger
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          void save({ drive: null }, 'remove', t('Les fichiers reviennent sur le serveur…'));
        }}
      />
    </>
  );
}
