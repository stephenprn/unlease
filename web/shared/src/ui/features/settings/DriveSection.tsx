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
  tx('Your photos, videos and documents are kept in a folder of your Seafile, sorted by note and by page: you find them in your drive. The server keeps only small previews, and the S3 backups say where they are without copying them.');

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
    url: serviceAddressProblem(urlValue, t('Enter your Seafile’s address.'), t('https://drive.example.com')),
    token: drive.tokenHint !== null || token.trim() ? null : t('Enter the library’s token.'),
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
      const said = failure instanceof Error ? failure.message : tx('Setting refused');
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
    if (!(await save({ drive: patch }, 'save', on ? t('Seafile saved') : t('Seafile connected: your files are going there.')))) return false;
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
      showError(failure instanceof Error ? t(failure.message) : t('Sync refused'));
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
            {t('Turn off Seafile')}
          </Button>
        ) : null}
      </StatusRow>

      {drive.leaving ? null : (
        <form className={styles.block} onSubmit={form.onSubmit(saveDrive)} noValidate>
          <div className={styles.fields}>
            <TextField label={t('Seafile address')} kind="url" value={urlValue} onChange={setUrl} field={form.field('url')} help={t('For example {example}.', { example: t('https://drive.example.com') })} />
            <TextField
              label={t('Folder')}
              kind="code"
              optional
              value={folderValue}
              onChange={setFolder}
              placeholder={DRIVE_FOLDER_DEFAULT}
              help={t('Created if it doesn’t exist. The server organises it itself: don’t move the files in it.')}
            />
          </div>
          <TextField
            label={drive.tokenHint ? t('Replace the token') : t('Library token')}
            kind="secret"
            value={token}
            onChange={setToken}
            field={form.field('token')}
            help={drive.tokenHint ? t('In Seafile: the library, then ⋯, “API token”, read and write. Kept on your server. Current: {hint}', { hint: drive.tokenHint }) : t('In Seafile: the library, then ⋯, “API token”, read and write. Kept on your server.')}
            revealLabels={{ show: t('Show the token'), hide: t('Hide the token') }}
          />
          <FormMessage form={form} />
          <div className={styles.buttons}>
            <Button type="submit" icon="server" busy={form.busy} disabled={on && !changed}>
              {t('Test and save')}
            </Button>
          </div>
        </form>
      )}

      {on && !drive.leaving ? (
        <button type="button" className={styles.row} disabled={busy !== null || admin.status?.drive.running === true} onClick={() => void syncNow()}>
          <Icon name="refresh" size={24} />
          <span className={styles.rowText}>
            <span className="t-body">{t('Sync now')}</span>
            <span className="t-meta">{t('Sends new files and follows changed titles.')}</span>
          </span>
        </button>
      ) : null}

      <Confirm
        open={confirmRemove}
        title={t('Turn off Seafile?')}
        message={t('Your files first come back to the server, then Seafile is no longer used. They also stay in your Seafile folder.')}
        confirmLabel={t('Turn off')}
        danger
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          void save({ drive: null }, 'remove', t('The files are coming back to the server…'));
        }}
      />
    </>
  );
}
