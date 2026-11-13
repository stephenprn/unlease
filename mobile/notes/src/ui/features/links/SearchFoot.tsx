/**
 * The foot of a module that searches the web (« Codes promo », « Moins cher ailleurs », « Seconde
 * main », « Autres regards », « Notes »): pinned under what scrolls, never at its end (`FormFoot`).
 * « Réessayer » after a failure, else « Chercher à nouveau », as text; then « Ouvrir la page »,
 * filled. The web's dialogs' feet.
 */
import React from 'react';
import { Linking } from 'react-native';

import { t } from '@unlease/core/i18n';
import { showSnack } from '@shared/app/store/uiStore';

import { Button, FormFoot } from '../../components';

/** Opens a page in the browser, or says it could not. */
export const openPage = (url: string) => Linking.openURL(url).catch(() => showSnack(t('Couldn’t open this link'), undefined, { tone: 'error' }));

/** `failed`: the last search failed, nothing was kept, so asking again searches again either way. */
export function SearchFoot({ failed, url, onSearch }: { failed: boolean; url: string; onSearch: (fresh: boolean) => void }) {
  return (
    <FormFoot>
      {failed ? <Button kind="text" label={t('Try again')} onPress={() => onSearch(false)} /> : <Button kind="text" label={t('Search again')} icon="refresh" onPress={() => onSearch(true)} />}
      <Button label={t('Open the page')} icon="external" onPress={() => openPage(url)} />
    </FormFoot>
  );
}
