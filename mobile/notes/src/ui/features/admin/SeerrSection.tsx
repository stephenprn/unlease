/**
 * "Seerr": the address of the person's Seerr (Jellyseerr, Overseerr) and its API key, tried by the
 * server before they are kept; with the key the films and series module opens the title's own page
 * and says whether it is there, without it Seerr's search. Unlinked, the module goes. The key never
 * comes back, only its last characters. The web's `SeerrSection`.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t, tx } from '@unlease/core/i18n';
import type { SettingsPatch } from '@unlease/core/sync/settings';
import type { AdminState } from '@app/hooks/useAdmin';
import type { ServerConfig } from '@app/store/settingsStore';
import { showSnack } from '@app/store/uiStore';
import { saveServerSettings } from '@app/sync/transport';

import { Button, TextField } from '../../components';
import type { AdminOverlays } from './overlays';
import { SecretField } from './SecretField';
import { StatusRow } from './StatusRow';

export const SEERR_INFO = tx(
  'Seerr est l’application où l’on demande films et séries à un serveur Plex ou Jellyfin. Relié ici, un module ouvre chaque film ou série de vos collections dans votre Seerr, pour le demander ou voir s’il est déjà là.',
);

type Busy = 'save' | 'key' | 'unlink' | null;

export function SeerrSection({ server, admin, overlays }: { server: ServerConfig; admin: AdminState; overlays: AdminOverlays }) {
  const seerr = admin.settings!.seerr;
  const [url, setUrl] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);

  const on = seerr.url !== '';
  const address = (url ?? seerr.url).trim();
  const canSave = address !== '' && (address !== seerr.url || key.trim() !== '');

  const save = async (patch: SettingsPatch, what: Exclude<Busy, null>, done: string): Promise<boolean> => {
    setBusy(what);
    if (what === 'save') setError(null);
    try {
      // The store hears it too, so the module shows (or goes) at once.
      admin.setSettings(await saveServerSettings(server, patch));
      showSnack(done, undefined, { tone: 'success' });
      return true;
    } catch (failure) {
      const message = failure instanceof Error ? t(failure.message) : t('Réglage refusé');
      if (what === 'save') setError(message);
      else showSnack(message, undefined, { tone: 'error' });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveSeerr = async () => {
    // A key field left empty keeps the key stored.
    const patch = { url: address, ...(key.trim() ? { apiKey: key.trim() } : {}) };
    if (await save({ seerr: patch }, 'save', on ? t('Seerr enregistré') : t('Seerr relié : son module apparaît sur les films et les séries.'))) {
      setUrl(null);
      setKey('');
    }
  };

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
                run: () => save({ seerr: null }, 'unlink', t('Seerr délié')),
              })
            }
          />
        ) : null}
      </StatusRow>
      <View style={styles.fields}>
        <TextField
          label={t('Adresse de Seerr')}
          value={url ?? seerr.url}
          onChangeText={next => {
            setUrl(next);
            setError(null);
          }}
          placeholder={t('https://seerr.exemple.fr')}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <SecretField
          label={seerr.keyHint ? t('Remplacer la clé API') : t('Clé API (facultative)')}
          value={key}
          onChangeText={next => {
            setKey(next);
            setError(null);
          }}
          what={t('la clé')}
          help={seerr.keyHint ? t('Dans Seerr : Réglages, puis Général, « Clé API ». Gardée sur votre serveur. Actuelle : {hint}', { hint: seerr.keyHint }) : t('Dans Seerr : Réglages, puis Général, « Clé API ». Gardée sur votre serveur.')}
          error={error}
        />
        <View style={styles.row}>
          <Button label={t('Tester et enregistrer')} icon="server" busy={busy === 'save'} disabled={!canSave || busy !== null} onPress={saveSeerr} />
          {on && seerr.keyHint ? <Button kind="text" label={t('Retirer la clé')} busy={busy === 'key'} disabled={busy !== null} onPress={() => save({ seerr: { apiKey: '' } }, 'key', t('Clé retirée : Seerr est seulement cherché.'))} /> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 14, paddingHorizontal: 16, paddingBottom: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
});
