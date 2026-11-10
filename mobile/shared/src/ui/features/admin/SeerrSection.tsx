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
  'Seerr est l’application où l’on demande films et séries à un serveur Plex ou Jellyfin. Relié ici, un module ouvre chaque film ou série de vos collections dans votre Seerr, pour le demander ou voir s’il est déjà là.',
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
    { url: serviceAddressProblem(address, t('Saisissez l’adresse de votre Seerr.'), t('https://seerr.exemple.fr')) },
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
      const message = failure instanceof Error ? t(failure.message) : t('Réglage refusé');
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
    if (!(await save({ seerr: patch }, 'save', on ? t('Seerr enregistré') : t('Seerr relié : son module apparaît sur les films et les séries.')))) return false;
    setUrl(null);
    setKey('');
    form.reset();
    return true;
  }

  const host = seerr.url.replace(/^https?:\/\//, '');
  const meta = !on ? t('Le module Seerr n’apparaît qu’une fois relié.') : seerr.keyHint ? t('{address} · clé {hint}', { address: host, hint: seerr.keyHint }) : t('{address} · sans clé : la recherche de Seerr seulement', { address: host });

  return (
    <View>
      <StatusRow line={{ tone: on ? 'ok' : 'off', title: on ? t('Seerr relié') : t('Seerr non relié'), meta }}>
        {on ? (
          <Button
            kind="dangerText"
            small
            label={t('Délier Seerr')}
            busy={busy === 'unlink'}
            disabled={busy !== null}
            onPress={() =>
              overlays.ask({
                title: t('Délier Seerr ?'),
                message: t('Le module Seerr disparaît des films et des séries. Rien ne change dans Seerr.'),
                confirmLabel: t('Délier'),
                danger: true,
                run: () => void save({ seerr: null }, 'unlink', t('Seerr délié')),
              })
            }
          />
        ) : null}
      </StatusRow>
      <View style={styles.fields}>
        <TextField
          label={t('Adresse de Seerr')}
          kind="url"
          value={url ?? seerr.url}
          onChangeText={setUrl}
          field={form.field('url')}
          help={t('Par exemple {example}.', { example: t('https://seerr.exemple.fr') })}
        />
        <TextField
          label={seerr.keyHint ? t('Remplacer la clé API') : t('Clé API')}
          kind="secret"
          optional={!seerr.keyHint}
          value={key}
          onChangeText={setKey}
          field={form.field('key')}
          help={seerr.keyHint ? t('Dans Seerr : Réglages, puis Général, « Clé API ». Gardée sur votre serveur. Actuelle : {hint}', { hint: seerr.keyHint }) : t('Dans Seerr : Réglages, puis Général, « Clé API ». Gardée sur votre serveur.')}
          revealLabels={{ show: t('Afficher la clé'), hide: t('Masquer la clé') }}
        />
        <FormMessage message={form.message} />
        <View style={styles.row}>
          <Button label={t('Tester et enregistrer')} icon="server" busy={form.busy} disabled={unchanged || (busy !== null && busy !== 'save')} onPress={() => void form.submit(saveSeerr)} />
          {on && seerr.keyHint ? <Button kind="text" label={t('Retirer la clé')} busy={busy === 'key'} disabled={busy !== null} onPress={() => void save({ seerr: { apiKey: '' } }, 'key', t('Clé retirée : Seerr est seulement cherché.'))} /> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 14, paddingHorizontal: 16, paddingBottom: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
});
