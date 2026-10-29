/**
 * « Questions sur les pages »: whether the pages offer « Demander à Claude », and how far one
 * question may read. Off until turned on here, and only with Claude's key (the section above):
 * nothing of the pages is sent before. The web's `PagesAskSection`.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { askWords } from '@unlease/notes/services/pagesAsk';
import { askCost } from '@unlease/notes/sync/pagesAsk';
import { CLAUDE_MODEL_NAMES, PAGES_REACH_CHARS, PAGES_REACH_NAMES, PAGES_REACHES, type PagesAskSettings } from '@unlease/core/sync/settings';
import type { AdminState } from '@app/hooks/useAdmin';
import { selectModel, selectReading, useSettingsStore, type ServerConfig } from '@app/store/settingsStore';
import { showSnack } from '@app/store/uiStore';
import { saveServerSettings } from '@app/sync/transport';

import { AppText, ListRow, Segmented, SwitchMark } from '../../components';
import { formatUsd } from '../settings/money';

export function PagesAskSection({ server, admin }: { server: ServerConfig; admin: AdminState }) {
  const pages = admin.settings!.pages;
  // The key and the model as the reading's section last saved them (it keeps its own copy of the settings).
  const keyed = useSettingsStore(selectReading) === true;
  const model = useSettingsStore(selectModel);
  const on = pages.enabled && keyed;
  const [busy, setBusy] = useState(false);

  const save = async (patch: Partial<PagesAskSettings>, done: string): Promise<void> => {
    setBusy(true);
    try {
      // The store hears it too, so the pages show (or drop) « Demander à Claude » at once.
      admin.setSettings(await saveServerSettings(server, { pages: patch }));
      showSnack(done, undefined, { tone: 'success' });
    } catch (failure) {
      showSnack(failure instanceof Error ? t(failure.message) : t('Réglage refusé'), undefined, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  // The whole row is the switch (the web's): its title names it, the switch is drawn at its end.
  const toggle = (value: boolean, onChange: (next: boolean) => void) => ({
    onPress: () => onChange(!value),
    disabled: busy,
    accessibilityRole: 'switch' as const,
    accessibilityState: { checked: value, disabled: busy },
    trailing: <SwitchMark checked={value} />,
  });
  const chars = PAGES_REACH_CHARS[pages.reach];

  return (
    <>
      <ListRow
        icon="sparkle"
        title={t('« Demander à Claude » sur les pages')}
        supporting={!keyed ? t('Ajoutez d’abord une clé Claude, plus haut.') : on ? t('Un bouton discret sur chaque page : Claude répond d’après vos pages et cite les passages.') : t('Désactivé : rien de vos pages n’est envoyé à Claude.')}
        {...(keyed ? toggle(on, next => void save({ enabled: next }, next ? t('Questions sur les pages activées') : t('Questions sur les pages désactivées'))) : {})}
      />
      {on ? (
        <>
          <ListRow
            icon="collections"
            title={t('Questions sur toutes les pages')}
            supporting={t('Claude lit alors les pages les plus proches de la question, pas seulement celle ouverte et ses sous-pages.')}
            {...toggle(pages.everywhere, next => void save({ everywhere: next }, t('Réglage enregistré')))}
          />
          <ListRow
            icon="globe"
            title={t('Compléter par le web')}
            supporting={t('Chaque question peut aussi chercher sur le web, si vous le cochez (plus cher).')}
            {...toggle(pages.web, next => void save({ web: next }, t('Réglage enregistré')))}
          />
          <View style={styles.block}>
            <AppText variant="metaStrong">{t('Lecture par question')}</AppText>
            <Segmented
              options={PAGES_REACHES.map(reach => ({ value: reach, label: PAGES_REACH_NAMES[reach] }))}
              value={pages.reach}
              disabled={busy}
              onChange={reach => void save({ reach }, t('Lecture par question : {reach}', { reach: PAGES_REACH_NAMES[reach] }))}
            />
            <AppText variant="meta">
              {t('Jusqu’à environ {words} mots de vos pages par question, {cost} au plus avec {model}. Une suite de conversation coûte moins : les pages déjà lues sont en cache.', {
                words: askWords(chars),
                cost: formatUsd(askCost(chars, model, false)),
                model: CLAUDE_MODEL_NAMES[model],
              })}
            </AppText>
            <AppText variant="meta">{t('« Garder hors de Claude », dans le menu d’une page, la retire de toute question, avec ses sous-pages.')}</AppText>
          </View>
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
});
