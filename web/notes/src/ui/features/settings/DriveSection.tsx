/**
 * "Fichiers sur Seafile": the folder of a Seafile library where the server keeps the photos, videos
 * and documents (tried before it is kept), a pass on demand, and turning it off (the files come
 * back to the server first). The phone's DriveSection, on a desk.
 */
import { useState } from 'react';

import { t, tx } from '@unlease/core/i18n';
import { driveLine } from '@unlease/core/services/admin';
import { DRIVE_FOLDER_DEFAULT, type DrivePatch, type DriveSettings, type SettingsPatch } from '@unlease/core/sync/settings';

import { useMinute } from '../../../app/hooks/useMinute';
import { setServerSettings } from '../../../app/store/serverSettings';
import type { ServerConfig } from '../../../app/store/settings';
import { showError, showSnack } from '../../../app/store/ui';
import { saveServerSettings, startDriveSync } from '../../../app/sync/transport';
import { Button } from '../../components/Button';
import { Confirm } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { TextField } from '../../components/TextField';
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
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const on = drive.provider !== null;

  const urlValue = url ?? drive.url;
  const folderValue = folder ?? drive.folder;
  const changed = urlValue.trim() !== drive.url || folderValue.trim() !== drive.folder || token.trim() !== '';
  const canSave = urlValue.trim() !== '' && (drive.tokenHint !== null || token.trim() !== '') && (changed || !on);

  const save = async (patch: SettingsPatch, what: Exclude<Busy, null>, done: string): Promise<boolean> => {
    setBusy(what);
    if (what === 'save') setError(null);
    try {
      setServerSettings(await saveServerSettings(server, patch));
      showSnack(done, undefined, { tone: 'success' });
      void admin.refresh();
      return true;
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : tx('Réglage refusé');
      if (what === 'save') setError(message);
      else showError(t(message));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveDrive = async (): Promise<void> => {
    const patch: { -readonly [K in keyof DrivePatch]: DrivePatch[K] } = { provider: 'seafile' };
    if (!on || urlValue.trim() !== drive.url) patch.url = urlValue.trim();
    if (!on || folderValue.trim() !== drive.folder) patch.folder = folderValue.trim() || DRIVE_FOLDER_DEFAULT;
    if (token.trim()) patch.token = token.trim();
    if (await save({ drive: patch }, 'save', on ? t('Seafile enregistré') : t('Seafile relié : vos fichiers y partent.'))) {
      setUrl(null);
      setFolder(null);
      setToken('');
    }
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
        <form
          className={styles.block}
          onSubmit={event => {
            event.preventDefault();
            if (canSave) void saveDrive();
          }}
        >
          <div className={styles.fields}>
            <TextField label={t('Adresse de Seafile')} value={urlValue} onChange={setUrl} placeholder={t('https://drive.exemple.fr')} inputMode="url" autoComplete="off" spellCheck={false} autoCapitalize="none" />
            <TextField
              label={t('Dossier')}
              value={folderValue}
              onChange={setFolder}
              placeholder={DRIVE_FOLDER_DEFAULT}
              help={t('Créé s’il n’existe pas. Le serveur le range lui-même : n’y déplacez pas les fichiers.')}
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="none"
            />
          </div>
          <div className={styles.tokenWrap}>
            <TextField
              label={drive.tokenHint ? t('Remplacer le jeton') : t('Jeton de la bibliothèque')}
              value={token}
              onChange={value => {
                setToken(value);
                setError(null);
              }}
              type={showToken ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="none"
              help={drive.tokenHint ? t('Dans Seafile : la bibliothèque, puis ⋯, « Jeton d’API », en lecture et écriture. Gardé sur votre serveur. Actuel : {hint}', { hint: drive.tokenHint }) : t('Dans Seafile : la bibliothèque, puis ⋯, « Jeton d’API », en lecture et écriture. Gardé sur votre serveur.')}
              inputClassName={styles.tokenInput}
            />
            <IconButton icon={showToken ? 'eyeOff' : 'eye'} label={showToken ? t('Masquer le jeton') : t('Afficher le jeton')} className={styles.eyeTop} onClick={() => setShowToken(shown => !shown)} />
          </div>
          {error ? (
            <p className={`${styles.error} t-body`} role="alert">
              {t(error)}
            </p>
          ) : null}
          <div className={styles.buttons}>
            <Button type="submit" icon="server" busy={busy === 'save'} disabled={!canSave}>
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
