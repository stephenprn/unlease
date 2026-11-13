/**
 * "Seerr": the address of the person's Seerr (Jellyseerr, Overseerr) and its API key, tried by the
 * server before they are kept; with the key the films and series module opens the title's own page
 * and says whether it is there, without it Seerr's search. Unlinked, the module goes. The key never
 * comes back, only its last characters. The web's `SeerrSection`.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t, tx } from '@unlease/core/i18n';
import { serviceAddressProblem, serviceRefusalField } from '@unlease/core/services/setup';
import type { SettingsPatch } from '@unlease/core/sync/settings';
import type { AdminState } from '@shared/app/hooks/useAdmin';
import type { ServerConfig } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';
import { saveServerSettings } from '@shared/app/sync/transport';

import { Button, FormMessage, TextField, useForm } from '../../components';
import type { AdminOverlays } from './overlays';
import { StatusRow } from './StatusRow';

export const SEERR_INFO = tx(
  'Seerr is the app where people request films and series from a Plex or Jellyfin server. Linked here, a module opens each film or series in your collections in your Seerr, to request it or see whether it is already there.',
);

type Busy = 'save' | 'key' | 'unlink' | null;

export function SeerrSection({ server, admin, overlays }: { server: ServerConfig; admin: AdminState; overlays: AdminOverlays }) {
  const seerr = admin.settings!.seerr;
  const [url, setUrl] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState<Busy>(null);

  const on = seerr.url !== '';
  const address = (url ?? seerr.url).trim();
  // Nothing to try: linked, and nothing in the form changed.
  const unchanged = on && address === seerr.url && key.trim() === '';
  const form = useForm(
    { url: serviceAddressProblem(address, t('Enter your Seerr’s address.'), t('https://seerr.example.org')) },
    { order: ['url', 'key'], sendOnDone: () => saveSeerr() },
  );

  /** Saves; the server's refusal of the link comes back on its form, anything else on a slip. */
  async function save(patch: SettingsPatch, what: Exclude<Busy, null>, done: string): Promise<boolean> {
    setBusy(what);
    try {
      // The store hears it too, so the module shows (or goes) at once.
      admin.setSettings(await saveServerSettings(server, patch));
      showSnack(done, undefined, { tone: 'success' });
      return true;
    } catch (failure) {
      const message = failure instanceof Error ? t(failure.message) : t('Setting refused');
      // Under the field it concerns (the address, the key), else on the whole form.
      const field = failure instanceof Error ? serviceRefusalField(failure.message) : null;
      if (what === 'save') form.fail(field === 'address' ? 'url' : field === 'key' ? 'key' : null, message);
      else showSnack(message, undefined, { tone: 'error' });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function saveSeerr(): Promise<boolean> {
    if (unchanged) return true;
    // A key field left empty keeps the key stored.
    const patch = { url: address, ...(key.trim() ? { apiKey: key.trim() } : {}) };
    if (!(await save({ seerr: patch }, 'save', on ? t('Seerr saved') : t('Seerr linked: its module shows on films and series.')))) return false;
    setUrl(null);
    setKey('');
    form.reset();
    return true;
  }

  const host = seerr.url.replace(/^https?:\/\//, '');
  const meta = !on ? t('The Seerr module shows only once it is linked.') : seerr.keyHint ? t('{address} · key {hint}', { address: host, hint: seerr.keyHint }) : t('{address} · no key: Seerr’s search only', { address: host });

  return (
    <View>
      <StatusRow line={{ tone: on ? 'ok' : 'off', title: on ? t('Seerr linked') : t('Seerr not linked'), meta }}>
        {on ? (
          <Button
            kind="dangerText"
            small
            label={t('Unlink Seerr')}
            busy={busy === 'unlink'}
            disabled={busy !== null}
            onPress={() =>
              overlays.ask({
                title: t('Unlink Seerr?'),
                message: t('The Seerr module goes from films and series. Nothing changes in Seerr.'),
                confirmLabel: t('Unlink'),
                danger: true,
                run: () => void save({ seerr: null }, 'unlink', t('Seerr unlinked')),
              })
            }
          />
        ) : null}
      </StatusRow>
      <View style={styles.fields}>
        <TextField
          label={t('Seerr address')}
          kind="url"
          value={url ?? seerr.url}
          onChangeText={setUrl}
          field={form.field('url')}
          help={t('For example {example}.', { example: t('https://seerr.example.org') })}
        />
        <TextField
          label={seerr.keyHint ? t('Replace the API key') : t('API key')}
          kind="secret"
          optional={!seerr.keyHint}
          value={key}
          onChangeText={setKey}
          field={form.field('key')}
          help={seerr.keyHint ? t('In Seerr: Settings, then General, “API Key”. Kept on your server. Current: {hint}', { hint: seerr.keyHint }) : t('In Seerr: Settings, then General, “API Key”. Kept on your server.')}
          revealLabels={{ show: t('Show the key'), hide: t('Hide the key') }}
        />
        <FormMessage message={form.message} />
        <View style={styles.row}>
          <Button label={t('Test and save')} icon="server" busy={form.busy} disabled={unchanged || (busy !== null && busy !== 'save')} onPress={() => void form.submit(saveSeerr)} />
          {on && seerr.keyHint ? <Button kind="text" label={t('Remove the key')} busy={busy === 'key'} disabled={busy !== null} onPress={() => void save({ seerr: { apiKey: '' } }, 'key', t('Key removed: Seerr is only searched.'))} /> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 14, paddingHorizontal: 16, paddingBottom: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
});
