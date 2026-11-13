/**
 * « Questions sur les pages »: whether the pages offer « Demander à Claude », and how far one
 * question may read. Off until turned on here, and only with Claude's key (the section above):
 * nothing of the pages is sent before. The web's `PagesAskSection`.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { askWords } from '@unlease/pages/services/pagesAsk';
import { askCost } from '@unlease/pages/sync/pagesAsk';
import { CLAUDE_MODEL_NAMES, PAGES_REACH_CHARS, PAGES_REACH_NAMES, PAGES_REACHES, type PagesAskSettings } from '@unlease/core/sync/settings';
import type { AdminState } from '@shared/app/hooks/useAdmin';
import { selectModel, selectReading, useSettingsStore, type ServerConfig } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';
import { saveServerSettings } from '@shared/app/sync/transport';

import { AppText, ListRow, Segmented, SwitchMark } from '@shared/ui/components';
import { formatUsd } from '@shared/ui/features/settings/money';

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
      showSnack(failure instanceof Error ? t(failure.message) : t('Setting refused'), undefined, { tone: 'error' });
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
        title={t('“Ask Claude” on pages')}
        supporting={!keyed ? t('Add a Claude key first, above.') : on ? t('A quiet button on each page: Claude answers from your pages and cites the passages.') : t('Off: nothing from your pages is sent to Claude.')}
        {...(keyed ? toggle(on, next => void save({ enabled: next }, next ? t('Questions about pages turned on') : t('Questions about pages turned off'))) : {})}
      />
      {on ? (
        <>
          <ListRow
            icon="collections"
            title={t('Questions about all pages')}
            supporting={t('Claude then reads the pages closest to the question, not only the open one and its sub-pages.')}
            {...toggle(pages.everywhere, next => void save({ everywhere: next }, t('Setting saved')))}
          />
          <ListRow
            icon="globe"
            title={t('Add the web')}
            supporting={t('Each question may also search the web, when you tick it (dearer).')}
            {...toggle(pages.web, next => void save({ web: next }, t('Setting saved')))}
          />
          <View style={styles.block}>
            <AppText variant="metaStrong">{t('Reading per question')}</AppText>
            <Segmented
              options={PAGES_REACHES.map(reach => ({ value: reach, label: PAGES_REACH_NAMES[reach] }))}
              value={pages.reach}
              disabled={busy}
              onChange={reach => void save({ reach }, t('Reading per question: {reach}', { reach: PAGES_REACH_NAMES[reach] }))}
            />
            <AppText variant="meta">
              {t('Up to about {words} words of your pages per question, {cost} at most with {model}. A follow-up costs less: the pages already read are cached.', {
                words: askWords(chars),
                cost: formatUsd(askCost(chars, model, false)),
                model: CLAUDE_MODEL_NAMES[model],
              })}
            </AppText>
            <AppText variant="meta">{t('“Keep away from Claude”, in a page’s menu, leaves it out of every question, with its sub-pages.')}</AppText>
          </View>
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
});
