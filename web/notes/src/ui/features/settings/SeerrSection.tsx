/**
 * "Seerr": the address of the person's Seerr (Jellyseerr, Overseerr) and its API key, tried before
 * they are kept; with the key the films and series modules open the title's own page and say whether
 * it is there, without it Seerr's search. Unlinked, the module goes. The phone's SeerrSection.
 */
import { useState } from 'react';

import { t, tx } from '@unlease/core/i18n';
import { serviceAddressProblem, serviceRefusalField } from '@unlease/core/services/setup';
import type { SeerrSettings, SettingsPatch } from '@unlease/core/sync/settings';

import { setServerSettings } from '@shared/app/store/serverSettings';
import type { ServerConfig } from '@shared/app/store/settings';
import { showError, showSnack } from '@shared/app/store/ui';
import { saveServerSettings } from '@shared/app/sync/transport';
import { Button } from '@shared/ui/components/Button';
import { Confirm } from '@shared/ui/components/Dialog';
import { FormMessage } from '@shared/ui/components/FormMessage';
import { TextField } from '@shared/ui/components/TextField';
import { useForm } from '@shared/ui/components/useForm';
import { StatusRow } from '@shared/ui/features/settings/Section';
import styles from '@shared/ui/features/settings/settings.module.css';

/** In French, translated where it is shown (`Section` reads its `info` through `t`). */
export const SEERR_INFO = tx('Seerr est l’application où l’on demande films et séries à un serveur Plex ou Jellyfin. Relié ici, un module ouvre chaque film ou série de vos collections dans votre Seerr, pour le demander ou voir s’il est déjà là.');

type Busy = 'save' | 'key' | 'remove' | null;

export function SeerrSection({ server, seerr }: { server: ServerConfig; seerr: SeerrSettings }) {
  const [url, setUrl] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const on = seerr.url !== '';
  const urlValue = url ?? seerr.url;
  // Nothing to try: linked, and nothing in the form changed.
  const unchanged = on && urlValue.trim() === seerr.url && key.trim() === '';
  // The key is optional: only Seerr's refusal of it shows under it.
  const form = useForm({ url: serviceAddressProblem(urlValue, t('Saisissez l’adresse de votre Seerr.'), t('https://seerr.exemple.fr')), apiKey: null });

  /** Saves; the server's refusal of the link comes back on its form, anything else on a slip. */
  const save = async (patch: SettingsPatch, what: Exclude<Busy, null>, done: string): Promise<boolean> => {
    setBusy(what);
    try {
      setServerSettings(await saveServerSettings(server, patch));
      showSnack(done, undefined, { tone: 'success' });
      return true;
    } catch (failure) {
      const said = failure instanceof Error ? failure.message : tx('Réglage refusé');
      const message = t(said);
      // Under the field it concerns (the address, the key), else on the whole form.
      const field = serviceRefusalField(said);
      if (what === 'save') form.fail(field === 'address' ? 'url' : field === 'key' ? 'apiKey' : null, message);
      else showError(message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveSeerr = async (): Promise<boolean> => {
    if (unchanged) return true;
    const patch = { url: urlValue.trim(), ...(key.trim() ? { apiKey: key.trim() } : {}) };
    if (!(await save({ seerr: patch }, 'save', on ? t('Seerr enregistré') : t('Seerr relié : son module apparaît sur les films et les séries.')))) return false;
    setUrl(null);
    setKey('');
    form.reset();
    return true;
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

      <form className={styles.block} onSubmit={form.onSubmit(saveSeerr)} noValidate>
        <div className={styles.fields}>
          <TextField label={t('Adresse de Seerr')} kind="url" value={urlValue} onChange={setUrl} field={form.field('url')} help={t('Par exemple {example}.', { example: t('https://seerr.exemple.fr') })} />
        </div>
        <TextField
          label={seerr.keyHint ? t('Remplacer la clé API') : t('Clé API')}
          kind="secret"
          optional={!seerr.keyHint}
          value={key}
          onChange={setKey}
          field={form.field('apiKey')}
          // The key kept is in the status line over the form (« clé …7d1e »): its help does not say it again.
          help={t('Dans Seerr : Réglages, puis Général, « Clé API ». Gardée sur votre serveur.')}
          revealLabels={{ show: t('Afficher la clé'), hide: t('Masquer la clé') }}
        />
        <FormMessage form={form} />
        <div className={styles.buttons}>
          {on && seerr.keyHint ? (
            <Button kind="text" busy={busy === 'key'} disabled={busy !== null} onClick={() => void save({ seerr: { apiKey: '' } }, 'key', t('Clé retirée : Seerr est seulement cherché.'))}>
              {t('Retirer la clé')}
            </Button>
          ) : null}
          <Button type="submit" icon="server" busy={form.busy} disabled={unchanged || (busy !== null && busy !== 'save')}>
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
