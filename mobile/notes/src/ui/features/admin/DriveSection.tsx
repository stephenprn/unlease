/**
 * "Fichiers sur Seafile": the drive folder that holds the photos, videos and documents, how it is
 * going, a pass now, and turning it off (the files come back to the server first). The server tries
 * the address, the token and the folder before it keeps them.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t, tx } from '@unlease/core/i18n';
import { driveLine } from '@unlease/core/services/admin';
import { DRIVE_FOLDER_DEFAULT, type DrivePatch, type DriveSettings } from '@unlease/core/sync/settings';
import type { AdminState } from '@app/hooks/useAdmin';
import type { ServerConfig } from '@app/store/settingsStore';
import { showSnack } from '@app/store/uiStore';
import { saveServerSettings, startDriveSync } from '@app/sync/transport';

import { Button, ListRow, TextField } from '../../components';
import type { AdminOverlays } from './overlays';
import { SecretField } from './SecretField';
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'sync' | null>(null);

  const saved: Record<DriveField, string> = { url: drive.url, folder: drive.folder || DRIVE_FOLDER_DEFAULT };
  const value = (field: DriveField): string => draft[field] ?? saved[field];
  const edit = (field: DriveField) => (next: string) => {
    setDraft(current => ({ ...current, [field]: next }));
    setError(null);
  };
  const changed = (['url', 'folder'] as const).filter(field => value(field).trim() !== saved[field]);
  const canSave = value('url').trim().length > 0 && (drive.tokenHint !== null || token.trim().length > 0) && (changed.length > 0 || token.trim().length > 0 || drive.provider === null);

  const save = async (patch: DrivePatch | null, done: string) => {
    setBusy('save');
    setError(null);
    try {
      admin.setSettings(await saveServerSettings(server, { drive: patch }));
      setDraft({});
      setToken('');
      showSnack(done, undefined, { tone: 'success' });
      admin.reload();
    } catch (failure) {
      const message = failure instanceof Error ? t(failure.message) : t('Réglage refusé');
      if (patch) setError(message);
      else showSnack(message, undefined, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const saveDrive = () => {
    const patch: { provider: 'seafile'; url?: string; folder?: string; token?: string } = { provider: 'seafile' };
    for (const field of changed) patch[field] = value(field).trim();
    if (drive.provider === null && !patch.url) patch.url = value('url').trim();
    if (token.trim()) patch.token = token.trim();
    save(patch, t('Seafile relié : vos fichiers y seront rangés.'));
  };

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
      <StatusRow line={driveLine(drive, status?.drive ?? null, now)} />

      {drive.leaving ? null : (
        <View style={styles.fields}>
          <TextField label={t('Adresse de Seafile')} value={value('url')} onChangeText={edit('url')} placeholder="https://drive.exemple.fr" keyboardType="url" autoCapitalize="none" autoCorrect={false} />
          <SecretField
            label={drive.tokenHint ? t('Remplacer le jeton') : t('Jeton de la bibliothèque')}
            value={token}
            onChangeText={next => {
              setToken(next);
              setError(null);
            }}
            what={t('le jeton')}
            help={t('Dans Seafile : la bibliothèque, puis ⋯, « Jeton d’API », en lecture et écriture. Gardé sur votre serveur.')}
            error={error}
          />
          <TextField
            label={t('Dossier')}
            value={value('folder')}
            onChangeText={edit('folder')}
            placeholder={DRIVE_FOLDER_DEFAULT}
            help={t('Créé s’il n’existe pas. Le serveur le range lui-même : n’y déplacez pas les fichiers.')}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.row}>
            <Button label={t('Tester et enregistrer')} icon="server" busy={busy === 'save'} disabled={!canSave} onPress={saveDrive} />
            {on ? (
              <Button
                kind="dangerText"
                label={t('Désactiver Seafile')}
                onPress={() =>
                  overlays.ask({
                    title: t('Désactiver Seafile ?'),
                    message: t('Vos fichiers reviennent d’abord sur le serveur, puis Seafile n’est plus utilisé. Ils restent aussi dans votre dossier Seafile.'),
                    confirmLabel: t('Désactiver'),
                    danger: true,
                    run: () => save(null, t('Vos fichiers reviennent sur le serveur…')),
                  })
                }
              />
            ) : null}
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
