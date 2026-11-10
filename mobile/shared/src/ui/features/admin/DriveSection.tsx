/**
 * "Fichiers sur Seafile": the drive folder that holds the photos, videos and documents, how it is
 * going, a pass now, and turning it off (the files come back to the server first). The server tries
 * the address, the token and the folder before it keeps them.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t, tx } from '@unlease/core/i18n';
import { driveLine } from '@unlease/core/services/admin';
import { serviceAddressProblem, serviceRefusalField } from '@unlease/core/services/setup';
import { DRIVE_FOLDER_DEFAULT, type DrivePatch, type DriveSettings } from '@unlease/core/sync/settings';
import type { AdminState } from '@shared/app/hooks/useAdmin';
import type { ServerConfig } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';
import { saveServerSettings, startDriveSync } from '@shared/app/sync/transport';

import { Button, FormMessage, ListRow, TextField, useForm } from '../../components';
import type { AdminOverlays } from './overlays';
import { StatusRow } from './StatusRow';

export const DRIVE_INFO = tx(
  'Vos photos, vidéos et documents sont rangés dans un dossier de votre Seafile, classés par note et par page : vous les retrouvez dans votre drive. Le serveur n’en garde que de petits aperçus, et les sauvegardes S3 disent où ils sont sans les copier.',
);

type DriveField = 'url' | 'folder';

export function DriveSection({ server, admin, overlays, now }: { server: ServerConfig; admin: AdminState; overlays: AdminOverlays; now: number }) {
  const drive: DriveSettings = admin.settings!.drive;
  const status = admin.status;
  const [draft, setDraft] = useState<Partial<Record<DriveField, string>>>({});
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<'save' | 'sync' | null>(null);

  const saved: Record<DriveField, string> = { url: drive.url, folder: drive.folder || DRIVE_FOLDER_DEFAULT };
  const value = (field: DriveField): string => draft[field] ?? saved[field];
  const edit = (field: DriveField) => (next: string) => setDraft(current => ({ ...current, [field]: next }));
  const changed = (['url', 'folder'] as const).filter(field => value(field).trim() !== saved[field]);
  // Nothing to try: linked, and nothing in the form changed.
  const unchanged = drive.provider !== null && changed.length === 0 && token.trim() === '';
  // The same order as on the web: the address, the folder, then the token, whose « OK » saves.
  const form = useForm(
    {
      url: serviceAddressProblem(value('url'), t('Saisissez l’adresse de votre Seafile.'), t('https://drive.exemple.fr')),
      token: drive.tokenHint !== null || token.trim() ? null : t('Saisissez le jeton de la bibliothèque.'),
    },
    { order: ['url', 'folder', 'token'], sendOnDone: () => saveDrive() },
  );

  /** Saves; the server's refusal of the drive comes back on its form, turning it off on a slip. */
  async function save(patch: DrivePatch | null, done: string): Promise<boolean> {
    setBusy('save');
    try {
      admin.setSettings(await saveServerSettings(server, { drive: patch }));
      setDraft({});
      setToken('');
      form.reset();
      showSnack(done, undefined, { tone: 'success' });
      admin.reload();
      return true;
    } catch (failure) {
      const message = failure instanceof Error ? t(failure.message) : t('Réglage refusé');
      // Under the field it concerns (the address, the token), else on the whole form.
      const field = failure instanceof Error ? serviceRefusalField(failure.message) : null;
      if (patch) form.fail(field === 'address' ? 'url' : field === 'key' ? 'token' : null, message);
      else showSnack(message, undefined, { tone: 'error' });
      return false;
    } finally {
      setBusy(null);
    }
  }

  function saveDrive(): boolean | Promise<boolean> {
    if (unchanged) return true;
    const patch: { provider: 'seafile'; url?: string; folder?: string; token?: string } = { provider: 'seafile' };
    for (const field of changed) patch[field] = value(field).trim();
    if (drive.provider === null && !patch.url) patch.url = value('url').trim();
    if (token.trim()) patch.token = token.trim();
    return save(patch, t('Seafile relié : vos fichiers y seront rangés.'));
  }

  const syncNow = async () => {
    setBusy('sync');
    try {
      admin.setStatus(await startDriveSync(server));
    } catch (failure) {
      showSnack(failure instanceof Error ? t(failure.message) : t('Synchronisation refusée'), undefined, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const on = drive.provider !== null && !drive.leaving;

  return (
    <View>
      {/* Its removal in the status row, as on the web. */}
      <StatusRow line={driveLine(drive, status?.drive ?? null, now)}>
        {on ? (
          <Button
            kind="dangerText"
            small
            label={t('Désactiver Seafile')}
            onPress={() =>
              overlays.ask({
                title: t('Désactiver Seafile ?'),
                message: t('Vos fichiers reviennent d’abord sur le serveur, puis Seafile n’est plus utilisé. Ils restent aussi dans votre dossier Seafile.'),
                confirmLabel: t('Désactiver'),
                danger: true,
                run: () => void save(null, t('Vos fichiers reviennent sur le serveur…')),
              })
            }
          />
        ) : null}
      </StatusRow>

      {drive.leaving ? null : (
        <View style={styles.fields}>
          <TextField
            label={t('Adresse de Seafile')}
            kind="url"
            value={value('url')}
            onChangeText={edit('url')}
            field={form.field('url')}
            help={t('Par exemple {example}.', { example: t('https://drive.exemple.fr') })}
          />
          <TextField
            label={t('Dossier')}
            kind="code"
            optional
            value={value('folder')}
            onChangeText={edit('folder')}
            field={form.field('folder')}
            placeholder={DRIVE_FOLDER_DEFAULT}
            help={t('Créé s’il n’existe pas. Le serveur le range lui-même : n’y déplacez pas les fichiers.')}
          />
          <TextField
            label={drive.tokenHint ? t('Remplacer le jeton') : t('Jeton de la bibliothèque')}
            kind="secret"
            value={token}
            onChangeText={setToken}
            field={form.field('token')}
            help={
              drive.tokenHint
                ? t('Dans Seafile : la bibliothèque, puis ⋯, « Jeton d’API », en lecture et écriture. Gardé sur votre serveur. Actuel : {hint}', { hint: drive.tokenHint })
                : t('Dans Seafile : la bibliothèque, puis ⋯, « Jeton d’API », en lecture et écriture. Gardé sur votre serveur.')
            }
            revealLabels={{ show: t('Afficher le jeton'), hide: t('Masquer le jeton') }}
          />
          <FormMessage message={form.message} />
          <View style={styles.row}>
            <Button label={t('Tester et enregistrer')} icon="server" busy={form.busy} disabled={unchanged || busy === 'sync'} onPress={() => void form.submit(saveDrive)} />
          </View>
        </View>
      )}

      {on ? <ListRow icon="refresh" title={t('Synchroniser maintenant')} onPress={status?.drive.running || busy === 'sync' ? undefined : () => syncNow()} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 14, paddingHorizontal: 16, paddingBottom: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
});
