/**
 * « Photos sur Immich »: the address of the person's Immich and an API key, tried by the server before
 * they are kept (it pings Immich, then reads its albums and people with the key). Linked, Pages shows
 * an album or photos in a page and Contacts takes a contact's photo from its people; the key never
 * comes back, only its last characters. The web's `ImmichSection`.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t, tx } from '@unlease/core/i18n';
import { serviceAddressProblem, serviceRefusalField } from '@unlease/core/services/setup';
import type { AdminState } from '@shared/app/hooks/useAdmin';
import type { ServerConfig } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';
import { saveServerSettings } from '@shared/app/sync/transport';

import { Button, FormMessage, TextField, useForm } from '../../components';
import type { AdminOverlays } from './overlays';
import { StatusRow } from './StatusRow';

export const IMMICH_INFO = tx(
  'Immich is a photo library you run yourself. Linked here, a page can show one of its albums or photos you pick, and a contact can take its photo from the faces Immich recognised. Your server asks Immich for them: the key never leaves it.',
);

const EXAMPLE = 'https://photos.example.org';

export function ImmichSection({ server, admin, overlays }: { server: ServerConfig; admin: AdminState; overlays: AdminOverlays }) {
  const immich = admin.settings!.immich;
  const [url, setUrl] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [unlinking, setUnlinking] = useState(false);

  const on = immich.url !== '';
  const address = (url ?? immich.url).trim();
  const unchanged = on && address === immich.url && key.trim() === '';
  const form = useForm(
    // A new link needs a key; a linked one keeps its own.
    { url: serviceAddressProblem(address, t('Enter your Immich’s address.'), EXAMPLE), key: !on && !key.trim() ? t('Paste an Immich API key') : null },
    { order: ['url', 'key'], sendOnDone: () => saveImmich() },
  );

  async function saveImmich(): Promise<boolean> {
    if (unchanged) return true;
    try {
      admin.setSettings(await saveServerSettings(server, { immich: { url: address, ...(key.trim() ? { apiKey: key.trim() } : {}) } }));
    } catch (failure) {
      const message = failure instanceof Error ? t(failure.message) : t('Setting refused');
      const field = failure instanceof Error ? serviceRefusalField(failure.message) : null;
      form.fail(field === 'address' ? 'url' : field === 'key' ? 'key' : null, message);
      return false;
    }
    showSnack(on ? t('Immich saved') : t('Immich linked: its albums show in pages, its faces for contacts.'), undefined, { tone: 'success' });
    setUrl(null);
    setKey('');
    form.reset();
    return true;
  }

  async function unlink(): Promise<void> {
    setUnlinking(true);
    try {
      admin.setSettings(await saveServerSettings(server, { immich: null }));
      showSnack(t('Immich unlinked'), undefined, { tone: 'success' });
    } catch (failure) {
      showSnack(failure instanceof Error ? t(failure.message) : t('Setting refused'), undefined, { tone: 'error' });
    } finally {
      setUnlinking(false);
    }
  }

  const host = immich.url.replace(/^https?:\/\//, '');
  const meta = !on ? t('Pages and Contacts show Immich only once it is linked.') : immich.keyHint ? t('{address} · key {hint}', { address: host, hint: immich.keyHint }) : host;

  return (
    <View>
      <StatusRow line={{ tone: on ? 'ok' : 'off', title: on ? t('Immich linked') : t('Immich not linked'), meta }}>
        {on ? (
          <Button
            kind="dangerText"
            small
            label={t('Unlink Immich')}
            busy={unlinking}
            disabled={unlinking}
            onPress={() =>
              overlays.ask({
                title: t('Unlink Immich?'),
                message: t('Pages stop showing its photos and nothing more is taken from it. Photos already given to contacts stay. Nothing changes in Immich.'),
                confirmLabel: t('Unlink'),
                danger: true,
                run: () => void unlink(),
              })
            }
          />
        ) : null}
      </StatusRow>
      <View style={styles.fields}>
        <TextField label={t('Immich address')} kind="url" value={url ?? immich.url} onChangeText={setUrl} field={form.field('url')} help={t('For example {example}.', { example: EXAMPLE })} />
        <TextField
          label={immich.keyHint ? t('Replace the API key') : t('API key')}
          kind="secret"
          value={key}
          onChangeText={setKey}
          field={form.field('key')}
          help={t('In Immich: Account Settings, then API Keys, “New API Key”, with album.read, asset.read, asset.view and person.read. Kept on your server.')}
          revealLabels={{ show: t('Show the key'), hide: t('Hide the key') }}
        />
        <FormMessage message={form.message} />
        <View style={styles.row}>
          <Button label={t('Test and save')} icon="server" busy={form.busy} disabled={unchanged || unlinking} onPress={() => void form.submit(saveImmich)} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 14, paddingHorizontal: 16, paddingBottom: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
});
