/**
 * « Photos sur Immich »: the address of the person's Immich and an API key, tried before they are
 * kept (the server pings it, then reads its albums and people with the key). Linked, Pages shows an
 * album or photos in a page and Contacts takes a contact's photo from its people; the key stays on
 * the server. The phone's ImmichSection.
 */
import { useState } from 'react';

import { t, tx } from '@unlease/core/i18n';
import { serviceAddressProblem, serviceRefusalField } from '@unlease/core/services/setup';
import type { ImmichSettings, SettingsPatch } from '@unlease/core/sync/settings';

import { setServerSettings } from '../../../app/store/serverSettings';
import type { ServerConfig } from '../../../app/store/settings';
import { showError, showSnack } from '../../../app/store/ui';
import { saveServerSettings } from '../../../app/sync/transport';
import { Button } from '../../components/Button';
import { Confirm } from '../../components/Dialog';
import { FormMessage } from '../../components/FormMessage';
import { TextField } from '../../components/TextField';
import { useForm } from '../../components/useForm';
import { StatusRow } from './Section';
import styles from './settings.module.css';

/** Translated where it is shown (`Section` reads its `info` through `t`). */
export const IMMICH_INFO = tx('Immich is a photo library you run yourself. Linked here, a page can show one of its albums or photos you pick, and a contact can take its photo from the faces Immich recognised. Your server asks Immich for them: the key never leaves it.');

const EXAMPLE = 'https://photos.example.org';

export function ImmichSection({ server, immich }: { server: ServerConfig; immich: ImmichSettings }) {
  const [url, setUrl] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const on = immich.url !== '';
  const urlValue = url ?? immich.url;
  const unchanged = on && urlValue.trim() === immich.url && key.trim() === '';
  const form = useForm({
    url: serviceAddressProblem(urlValue, t('Enter your Immich’s address.'), EXAMPLE),
    // A new link needs a key; a linked one keeps its own.
    apiKey: !on && !key.trim() ? t('Paste an Immich API key') : null,
  });

  const saveImmich = async (): Promise<boolean> => {
    if (unchanged) return true;
    const patch: SettingsPatch = { immich: { url: urlValue.trim(), ...(key.trim() ? { apiKey: key.trim() } : {}) } };
    try {
      setServerSettings(await saveServerSettings(server, patch));
    } catch (failure) {
      const said = failure instanceof Error ? failure.message : tx('Setting refused');
      const field = serviceRefusalField(said);
      form.fail(field === 'address' ? 'url' : field === 'key' ? 'apiKey' : null, t(said));
      return false;
    }
    showSnack(on ? t('Immich saved') : t('Immich linked: its albums show in pages, its faces for contacts.'), undefined, { tone: 'success' });
    setUrl(null);
    setKey('');
    form.reset();
    return true;
  };

  const unlink = async (): Promise<void> => {
    setRemoving(true);
    try {
      setServerSettings(await saveServerSettings(server, { immich: null }));
      showSnack(t('Immich unlinked'), undefined, { tone: 'success' });
    } catch (failure) {
      showError(failure instanceof Error ? t(failure.message) : t('Setting refused'));
    } finally {
      setRemoving(false);
    }
  };

  const address = immich.url.replace(/^https?:\/\//, '');
  return (
    <>
      <StatusRow
        tone={on ? 'ok' : 'off'}
        title={on ? t('Immich linked') : t('Immich not linked')}
        meta={on ? (immich.keyHint ? t('{address} · key {hint}', { address, hint: immich.keyHint }) : address) : t('Pages and Contacts show Immich only once it is linked.')}
      >
        {on ? (
          <Button kind="dangerText" small busy={removing} onClick={() => setConfirmRemove(true)}>
            {t('Unlink Immich')}
          </Button>
        ) : null}
      </StatusRow>

      <form className={styles.block} onSubmit={form.onSubmit(saveImmich)} noValidate>
        <div className={styles.fields}>
          <TextField label={t('Immich address')} kind="url" value={urlValue} onChange={setUrl} field={form.field('url')} help={t('For example {example}.', { example: EXAMPLE })} />
        </div>
        <TextField
          label={immich.keyHint ? t('Replace the API key') : t('API key')}
          kind="secret"
          value={key}
          onChange={setKey}
          field={form.field('apiKey')}
          help={t('In Immich: Account Settings, then API Keys, “New API Key”, with album.read, asset.read, asset.view and person.read. Kept on your server.')}
          revealLabels={{ show: t('Show the key'), hide: t('Hide the key') }}
        />
        <FormMessage form={form} />
        <div className={styles.buttons}>
          <Button type="submit" icon="server" busy={form.busy} disabled={unchanged || removing}>
            {t('Test and save')}
          </Button>
        </div>
      </form>

      <Confirm
        open={confirmRemove}
        title={t('Unlink Immich?')}
        message={t('Pages stop showing its photos and nothing more is taken from it. Photos already given to contacts stay. Nothing changes in Immich.')}
        confirmLabel={t('Unlink')}
        danger
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          void unlink();
        }}
      />
    </>
  );
}
