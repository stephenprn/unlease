/**
 * « Idée cadeau »: a product's link, typed or pasted (the clipboard's offered when it holds one), kept
 * in Carnet's « Cadeaux » collection for this person by the server, who names them among its people.
 * The field says what it wants once left (or when « Ajouter » is pressed); « Ajouter », pinned at the
 * sheet's foot with « Annuler », rides on the keyboard, and the keyboard's « OK » adds too. What the
 * server refuses comes back on the form's line; closing with a link typed asks first.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { APPS } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import { extractUrls } from '@unlease/core/services/url';
import { clipboardLink, giftsUnavailable, sendGift } from '@app/gifts';
import { later } from '@app/later';

import { AppText, Button, FormFoot, Sheet, SHEET_INSET, TextField, useForm, useUnsaved } from '@shared/ui/components';

export function GiftSheet({ visible, name, contactId, onDismiss }: { visible: boolean; name: string; contactId?: string; onDismiss: () => void }) {
  const [url, setUrl] = useState('');
  const [clip, setClip] = useState('');
  const why = visible ? giftsUnavailable() : null;
  useEffect(() => {
    if (!visible) return undefined;
    setUrl('');
    let live = true;
    clipboardLink()
      .then(link => live && setClip(link))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [visible]);
  const link = extractUrls(url)[0] ?? '';
  const unsaved = useUnsaved(visible && url.trim() !== '');
  const add = async (): Promise<boolean> => {
    if (!link) return false;
    const refused = await sendGift(link, name, contactId);
    if (refused) {
      form.fail(null, refused);
      return false;
    }
    unsaved.saved();
    onDismiss();
    return true;
  };
  const form = useForm({ url: url.trim() && !link ? t('Paste the address of a web page, starting with https://') : null }, { order: ['url'], sendOnDone: add });
  const close = unsaved.guard(() => {
    form.reset();
    onDismiss();
  });
  return (
    <>
      <Sheet visible={visible} onDismiss={close} title={t('Gift idea for {name}', { name })}>
        <View style={styles.body}>
          <View style={styles.fields}>
            <TextField
              kind="url"
              field={form.field('url')}
              label={t('Product link')}
              value={url}
              onChangeText={setUrl}
              placeholder="https://"
              help={t('Kept in {app}’s “Gifts” collection.', { app: APPS.notes.name })}
            />
            {clip && clip !== link ? <Button label={t('Paste the copied link')} icon="copy" kind="text" onPress={() => setUrl(clip)} style={styles.paste} /> : null}
            {why ? <AppText variant="meta">{why}</AppText> : null}
          </View>
          <FormFoot message={form.message}>
            <Button label={t('Cancel')} kind="text" onPress={close} />
            {/* Nothing to add without a link; without a server running Carnet, pressed, it says why on the form's line. */}
            <Button label={t('Add')} icon="plus" busy={form.busy} disabled={!url.trim()} onPress={() => later(form.submit(add))} />
          </FormFoot>
        </View>
      </Sheet>
      {unsaved.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12, paddingBottom: 12 },
  // On the sheet's column, as the suite's other sheets' fields; the foot stands there by itself.
  fields: { gap: 12, paddingHorizontal: SHEET_INSET },
  paste: { alignSelf: 'flex-start' },
});
