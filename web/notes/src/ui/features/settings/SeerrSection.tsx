/**
 * "Seerr": the address of the person's Seerr (Jellyseerr, Overseerr) and its API key, tried before
 * they are kept; with the key the films and series modules open the title's own page and say whether
 * it is there, without it Seerr's search. Unlinked, the module goes. The phone's SeerrSection.
 */
import { useState } from 'react';

import { t, tx } from '@unlease/core/i18n';
import type { SeerrSettings, SettingsPatch } from '@unlease/core/sync/settings';

import { setServerSettings } from '../../../app/store/serverSettings';
import type { ServerConfig } from '../../../app/store/settings';
import { showError, showSnack } from '../../../app/store/ui';
import { saveServerSettings } from '../../../app/sync/transport';
import { Button } from '../../components/Button';
import { Confirm } from '../../components/Dialog';
import { IconButton } from '../../components/IconButton';
import { TextField } from '../../components/TextField';
import { StatusRow } from './Section';
import styles from './settings.module.css';

/** In French, translated where it is shown (`Section` reads its `info` through `t`). */
export const SEERR_INFO = tx('Seerr est l’application où l’on demande films et séries à un serveur Plex ou Jellyfin. Relié ici, un module ouvre chaque film ou série de vos collections dans votre Seerr, pour le demander ou voir s’il est déjà là.');

type Busy = 'save' | 'key' | 'remove' | null;

export function SeerrSection({ server, seerr }: { server: ServerConfig; seerr: SeerrSettings }) {
  const [url, setUrl] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const on = seerr.url !== '';
  const urlValue = url ?? seerr.url;
  const canSave = urlValue.trim() !== '' && (urlValue.trim() !== seerr.url || key.trim() !== '');

  const save = async (patch: SettingsPatch, what: Exclude<Busy, null>, done: string): Promise<boolean> => {
    setBusy(what);
    if (what === 'save') setError(null);
    try {
      setServerSettings(await saveServerSettings(server, patch));
      showSnack(done, undefined, { tone: 'success' });
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

  const saveSeerr = async (): Promise<void> => {
    const patch = { url: urlValue.trim(), ...(key.trim() ? { apiKey: key.trim() } : {}) };
    if (await save({ seerr: patch }, 'save', on ? t('Seerr enregistré') : t('Seerr relié : son module apparaît sur les films et les séries.'))) {
      setUrl(null);
      setKey('');
    }
  };

  const meta = !on ? t('Le module Seerr n’apparaît qu’une fois relié.') : seerr.keyHint ? t('{address} · clé {hint}', { address: seerr.url.replace(/^https?:\/\//, ''), hint: seerr.keyHint }) : t('{address} · sans clé : la recherche de Seerr seulement', { address: seerr.url.replace(/^https?:\/\//, '') });

  return (
    <>
      <StatusRow tone={on ? 'ok' : 'off'} title={on ? t('Seerr relié') : t('Seerr non relié')} meta={meta}>
        {on ? (
          <Button kind="dangerText" small busy={busy === 'remove'} onClick={() => setConfirmRemove(true)}>
            {t('Délier Seerr')}
          </Button>
        ) : null}
      </StatusRow>

      <form
        className={styles.block}
        onSubmit={event => {
          event.preventDefault();
          if (canSave) void saveSeerr();
        }}
      >
        <div className={styles.fields}>
          <TextField label={t('Adresse de Seerr')} value={urlValue} onChange={setUrl} placeholder={t('https://seerr.exemple.fr')} inputMode="url" autoComplete="off" spellCheck={false} autoCapitalize="none" />
        </div>
        <div className={styles.tokenWrap}>
          <TextField
            label={seerr.keyHint ? t('Remplacer la clé API') : t('Clé API (facultative)')}
            value={key}
            onChange={value => {
              setKey(value);
              setError(null);
            }}
            type={showKey ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="none"
            help={seerr.keyHint ? t('Dans Seerr : Réglages, puis Général, « Clé API ». Gardée sur votre serveur. Actuelle : {hint}', { hint: seerr.keyHint }) : t('Dans Seerr : Réglages, puis Général, « Clé API ». Gardée sur votre serveur.')}
            inputClassName={styles.tokenInput}
          />
          <IconButton icon={showKey ? 'eyeOff' : 'eye'} label={showKey ? t('Masquer la clé') : t('Afficher la clé')} className={styles.eyeTop} onClick={() => setShowKey(shown => !shown)} />
        </div>
        {error ? (
          <p className={`${styles.error} t-body`} role="alert">
            {t(error)}
          </p>
        ) : null}
        <div className={styles.buttons}>
          {on && seerr.keyHint ? (
            <Button kind="text" busy={busy === 'key'} disabled={busy !== null} onClick={() => void save({ seerr: { apiKey: '' } }, 'key', t('Clé retirée : Seerr est seulement cherché.'))}>
              {t('Retirer la clé')}
            </Button>
          ) : null}
          <Button type="submit" icon="server" busy={busy === 'save'} disabled={!canSave || busy !== null}>
            {t('Tester et enregistrer')}
          </Button>
        </div>
      </form>

      <Confirm
        open={confirmRemove}
        title={t('Délier Seerr ?')}
        message={t('Le module Seerr disparaît des films et des séries. Rien ne change dans Seerr.')}
        confirmLabel={t('Délier')}
        danger
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          void save({ seerr: null }, 'remove', t('Seerr délié'));
        }}
      />
    </>
  );
}
