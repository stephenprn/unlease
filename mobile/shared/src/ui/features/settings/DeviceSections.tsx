/**
 * The Réglages every app shares, the device's own: the way to the Administration, « Apparence » (the theme, the paper's grain, and
 * what the app adds there: Carnet's board layout), and « Langue » (the interface's, with what the app
 * says it changes besides, `APP_WORDS`). The colours and the ground are `ColorsSection` and `GroundSection`; the
 * look is this app's, sent to the others on « Appliquer aux autres » (`LookShare`).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { APP_WORDS } from '@unlease/core/appWords';
import { LOCALE_NAMES, LOCALES, t } from '@unlease/core/i18n';
import { SETTINGS_SECTIONS } from '@unlease/core/services/settingsSearch';
import { ownApp } from '@shared/app/store/library';
import { selectGrain, selectLocale, selectThemePreference, setGrain, setInterfaceLocale, setTheme, useSettingsStore } from '@shared/app/store/settingsStore';

import { AppText, Icon, ListRow, Segmented } from '../../components';
import { useTheme } from '../../theme/ThemeProvider';
import { useLookShareHint } from '../appearance/LookShare';
import { SwitchRow } from '../appearance/SwitchRow';
import { Section } from './Section';

/** Réglages' first section, the way to the Administration, in the same words in every app and on the web: its row names it, so no title repeats it. */
export function AdminEntrySection({ onOpen }: { onOpen: () => void }) {
  const theme = useTheme();
  return (
    <Section>
      <ListRow icon="server" title={t('Administration')} supporting={t('Serveur, applications, Claude, sauvegardes et fichiers')} trailing={<Icon name="chevronRight" size={20} color={theme.color.inkMuted} />} onPress={onOpen} />
    </Section>
  );
}

export function ThemeSection({ children }: { children?: React.ReactNode }) {
  const themePreference = useSettingsStore(selectThemePreference);
  const grain = useSettingsStore(selectGrain);
  // Every Réglages shows the theme (the first run does not): a change of look there, the theme's, the colours' or the ground's, offers to send it to the other apps.
  useLookShareHint();
  return (
    <Section title={t('Apparence')} anchor={SETTINGS_SECTIONS.appearance}>
      <View style={styles.fields}>
        {/* Its name over it as a field's is (6 above, 4 in), the groups 14 apart. */}
        <View style={styles.field}>
          <AppText variant="metaStrong" style={styles.fieldLabel}>
            {t('Thème')}
          </AppText>
          <Segmented
            label={t('Thème')}
            value={themePreference}
            onChange={setTheme}
            options={[
              { value: 'system', label: t('Système'), icon: 'settings' },
              { value: 'light', label: t('Clair'), icon: 'sun' },
              { value: 'dark', label: t('Sombre'), icon: 'moon' },
            ]}
          />
        </View>
        {children}
      </View>
      <SwitchRow title={t('Grain du papier')} supporting={t('Le grain du papier sur les notes et les feuilles, sur cet appareil.')} value={grain} onChange={setGrain} />
    </Section>
  );
}

/**
 * The interface's language, explained by the app (`APP_WORDS`, the web's words too: Carnet's says what
 * Claude writes of a link). The section's title names it; the choice's own name (« Langue de
 * l’interface ») is for TalkBack, the note under it saying what it changes.
 */
export function LanguageSection() {
  const locale = useSettingsStore(selectLocale);
  const words = APP_WORDS[ownApp()];
  return (
    <Section title={t('Langue')} anchor={SETTINGS_SECTIONS.language}>
      <View style={[styles.fields, styles.choice]}>
        {/* Each language named in itself, so it is found whichever is shown. */}
        <Segmented label={words.language} value={locale} onChange={setInterfaceLocale} options={LOCALES.map(option => ({ value: option, label: LOCALE_NAMES[option] }))} />
        <AppText variant="meta">{words.languageNote}</AppText>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  field: { gap: 6 },
  fieldLabel: { marginLeft: 4 },
  // A choice and its note under it, as a field and its help.
  choice: { gap: 8 },
});
