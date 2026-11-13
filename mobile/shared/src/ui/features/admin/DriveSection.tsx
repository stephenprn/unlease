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
  'Your photos, videos and documents are kept in a folder of your Seafile, sorted by note and by page: you find them in your drive. The server keeps only small previews, and the S3 backups say where they are without copying them.',
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
      url: serviceAddressProblem(value('url'), t('Enter your Seafile’s address.'), t('https://drive.example.com')),
      token: drive.tokenHint !== null || token.trim() ? null : t('Enter the library’s token.'),
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
      const message = failure instanceof Error ? t(failure.message) : t('Setting refused');
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
    return save(patch, t('Seafile linked: your files will be kept there.'));
  }

  const syncNow = async () => {
    setBusy('sync');
    try {
      admin.setStatus(await startDriveSync(server));
    } catch (failure) {
      showSnack(failure instanceof Error ? t(failure.message) : t('Sync refused'), undefined, { tone: 'error' });
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
            label={t('Turn off Seafile')}
            onPress={() =>
              overlays.ask({
                title: t('Turn off Seafile?'),
                message: t('Your files first come back to the server, then Seafile is no longer used. They also stay in your Seafile folder.'),
                confirmLabel: t('Turn off'),
                danger: true,
                run: () => void save(null, t('Your files are coming back to the server…')),
              })
            }
          />
        ) : null}
      </StatusRow>

      {drive.leaving ? null : (
        <View style={styles.fields}>
          <TextField
            label={t('Seafile address')}
            kind="url"
            value={value('url')}
            onChangeText={edit('url')}
            field={form.field('url')}
            help={t('For example {example}.', { example: t('https://drive.example.com') })}
          />
          <TextField
            label={t('Folder')}
            kind="code"
            optional
            value={value('folder')}
            onChangeText={edit('folder')}
            field={form.field('folder')}
            placeholder={DRIVE_FOLDER_DEFAULT}
            help={t('Created if it doesn’t exist. The server organises it itself: don’t move the files in it.')}
          />
          <TextField
            label={drive.tokenHint ? t('Replace the token') : t('Library token')}
            kind="secret"
            value={token}
            onChangeText={setToken}
            field={form.field('token')}
            help={
              drive.tokenHint
                ? t('In Seafile: the library, then ⋯, “API token”, read and write. Kept on your server. Current: {hint}', { hint: drive.tokenHint })
                : t('In Seafile: the library, then ⋯, “API token”, read and write. Kept on your server.')
            }
            revealLabels={{ show: t('Show the token'), hide: t('Hide the token') }}
          />
          <FormMessage message={form.message} />
          <View style={styles.row}>
            <Button label={t('Test and save')} icon="server" busy={form.busy} disabled={unchanged || busy === 'sync'} onPress={() => void form.submit(saveDrive)} />
          </View>
        </View>
      )}

      {on ? <ListRow icon="refresh" title={t('Sync now')} onPress={status?.drive.running || busy === 'sync' ? undefined : () => syncNow()} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 14, paddingHorizontal: 16, paddingBottom: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
});
