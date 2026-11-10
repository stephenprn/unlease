/**
 * « Idée cadeau »: a product's link kept for someone, in Carnet's « Cadeaux » collection (the server
 * finds or makes it, and names the contact among the link's people: `POST /api/notes/gifts`).
 * Contacts writes no Carnet record; the slip leads to the collection in Carnet. Without a server, or
 * with Carnet turned off there, the action says why instead. An address that is not a page's says so
 * once the field is left; what the server refuses comes back on the form's line; closing with a link
 * typed asks first.
 */
import { useId, useState } from 'react';

import { APPS } from '@unlease/core/apps';
import { getLocale, t } from '@unlease/core/i18n';
import type { Contact } from '@unlease/contacts/models/contacts';
import { contactName } from '@unlease/contacts/services/names';

import { addGiftIdea } from '../../app/api';
import { selectServer, selectServerApps, useSettingsStore } from '@shared/app/store/settings';
import { showSnack } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { FormMessage } from '@shared/ui/components/FormMessage';
import layers from '@shared/ui/components/layers.module.css';
import { Layer } from '@shared/ui/components/Layer';
import { TextField } from '@shared/ui/components/TextField';
import { useForm } from '@shared/ui/components/useForm';
import { useUnsaved } from '@shared/ui/components/useUnsaved';
import { browserPath } from '@shared/ui/router';

/** Why a gift idea cannot be kept now; null when it can. */
export function useGiftsUnavailable(): string | null {
  const server = useSettingsStore(selectServer);
  const apps = useSettingsStore(selectServerApps);
  if (!server) return t('Les idées cadeaux vont dans {app}, sur votre serveur : connectez-en un dans les Réglages.', { app: APPS.notes.name });
  if (apps && !apps.includes('notes')) return t('Les idées cadeaux vont dans {app}, qui n’est pas activé sur ce serveur.', { app: APPS.notes.name });
  return null;
}

const isWebAddress = (value: string): boolean => /^https?:\/\/\S+\.\S+$/i.test(value.trim());

function GiftForm({ contact, url, onUrl, onCancel, onDone }: { contact: Contact; url: string; onUrl: (url: string) => void; onCancel: () => void; onDone: () => void }) {
  const titleId = useId();
  const server = useSettingsStore(selectServer);
  const name = contactName(contact);
  const form = useForm({ url: url.trim() && !isWebAddress(url) ? t('Collez l’adresse d’une page web, qui commence par https://') : null });
  const save = async (): Promise<boolean> => {
    if (!server) return false;
    try {
      const answer = await addGiftIdea(server, { url: url.trim(), forName: name, contactId: contact.id, lang: getLocale() });
      onDone();
      // The collection's place in Carnet's web app (references name no collection: its address is written here).
      const place = `/notes/line/${encodeURIComponent(answer.collectionId)}`;
      showSnack(
        answer.existing ? t('Déjà dans Cadeaux, dans {app} : {name} s’y ajoute.', { app: APPS.notes.name, name }) : t('Ajouté à Cadeaux dans {app}', { app: APPS.notes.name }),
        { label: t('Ouvrir'), run: () => window.open(browserPath(place), '_blank', 'noopener') },
        { tone: 'success' },
      );
      return true;
    } catch (error) {
      form.fail(null, error instanceof Error && error.message ? error.message : t('Le serveur ne répond pas'));
      return false;
    }
  };
  return (
    <DialogFrame
      title={t('Idée cadeau pour {name}', { name })}
      titleId={titleId}
      onClose={onCancel}
      className={layers.dialog}
      onSubmit={form.onSubmit(save)}
      foot={
        <>
          <Button kind="text" onClick={onCancel}>
            {t('Annuler')}
          </Button>
          {/* Nothing to keep until a link is there; a link that is not a page's says so when pressed. */}
          <Button type="submit" icon="plus" busy={form.busy} disabled={!url.trim()}>
            {t('Ajouter')}
          </Button>
        </>
      }
    >
      <TextField
        kind="url"
        field={form.field('url')}
        label={t('Lien du produit')}
        value={url}
        onChange={onUrl}
        autoFocus
        enterKeyHint="done"
        placeholder="https://"
        help={t('Il rejoint la collection Cadeaux de {app}, au nom de {name}.', { app: APPS.notes.name, name })}
      />
      <FormMessage form={{ message: form.message, problems: 0 }} />
    </DialogFrame>
  );
}

export function GiftDialog({ contact, open, onClose }: { contact: Contact; open: boolean; onClose: () => void }) {
  // The link lives here, beside the layer, so closing with one typed asks first.
  const [url, setUrl] = useState('');
  const unsaved = useUnsaved(open && url.trim() !== '');
  const close = (): void => {
    setUrl('');
    onClose();
  };
  const ask = unsaved.guard(close);
  return (
    <>
      <Layer open={open} onDismiss={ask} label={t('Idée cadeau')}>
        {open ? (
          <GiftForm
            contact={contact}
            url={url}
            onUrl={setUrl}
            onCancel={ask}
            onDone={() => {
              unsaved.saved();
              close();
            }}
          />
        ) : null}
      </Layer>
      {unsaved.dialog}
    </>
  );
}
