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
export const SEERR_INFO = tx('Seerr is the app where people request films and series from a Plex or Jellyfin server. Linked here, a module opens each film or series in your collections in your Seerr, to request it or see whether it is already there.');

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
  const form = useForm({ url: serviceAddressProblem(urlValue, t('Enter your Seerr’s address.'), t('https://seerr.example.org')), apiKey: null });

  /** Saves; the server's refusal of the link comes back on its form, anything else on a slip. */
  const save = async (patch: SettingsPatch, what: Exclude<Busy, null>, done: string): Promise<boolean> => {
    setBusy(what);
    try {
      setServerSettings(await saveServerSettings(server, patch));
      showSnack(done, undefined, { tone: 'success' });
      return true;
    } catch (failure) {
      const said = failure instanceof Error ? failure.message : tx('Setting refused');
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
    if (!(await save({ seerr: patch }, 'save', on ? t('Seerr saved') : t('Seerr linked: its module shows on films and series.')))) return false;
    setUrl(null);
    setKey('');
    form.reset();
    return true;
  };

  const meta = !on ? t('The Seerr module shows only once it is linked.') : seerr.keyHint ? t('{address} · key {hint}', { address: seerr.url.replace(/^https?:\/\//, ''), hint: seerr.keyHint }) : t('{address} · no key: Seerr’s search only', { address: seerr.url.replace(/^https?:\/\//, '') });

  return (
    <>
      <StatusRow tone={on ? 'ok' : 'off'} title={on ? t('Seerr linked') : t('Seerr not linked')} meta={meta}>
        {on ? (
          <Button kind="dangerText" small busy={busy === 'remove'} onClick={() => setConfirmRemove(true)}>
            {t('Unlink Seerr')}
          </Button>
        ) : null}
      </StatusRow>

      <form className={styles.block} onSubmit={form.onSubmit(saveSeerr)} noValidate>
        <div className={styles.fields}>
          <TextField label={t('Seerr address')} kind="url" value={urlValue} onChange={setUrl} field={form.field('url')} help={t('For example {example}.', { example: t('https://seerr.example.org') })} />
        </div>
        <TextField
          label={seerr.keyHint ? t('Replace the API key') : t('API key')}
          kind="secret"
          optional={!seerr.keyHint}
          value={key}
          onChange={setKey}
          field={form.field('apiKey')}
          // The key kept is in the status line over the form (« clé …7d1e »): its help does not say it again.
          help={t('In Seerr: Settings, then General, “API Key”. Kept on your server.')}
          revealLabels={{ show: t('Show the key'), hide: t('Hide the key') }}
        />
        <FormMessage form={form} />
        <div className={styles.buttons}>
          {on && seerr.keyHint ? (
            <Button kind="text" busy={busy === 'key'} disabled={busy !== null} onClick={() => void save({ seerr: { apiKey: '' } }, 'key', t('Key removed: Seerr is only searched.'))}>
              {t('Remove the key')}
            </Button>
          ) : null}
          <Button type="submit" icon="server" busy={form.busy} disabled={unchanged || (busy !== null && busy !== 'save')}>
            {t('Test and save')}
          </Button>
        </div>
      </form>

      <Confirm
        open={confirmRemove}
        title={t('Unlink Seerr?')}
        message={t('The Seerr module goes from films and series. Nothing changes in Seerr.')}
        confirmLabel={t('Unlink')}
        danger
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          void save({ seerr: null }, 'remove', t('Seerr unlinked'));
        }}
      />
    </>
  );
}
