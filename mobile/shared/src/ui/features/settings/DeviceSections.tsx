/**
 * The Réglages every app shares, the device's own. On Réglages' page, after the app's own sections:
 * « Apparence » (one row, the look in words and its two pebbles, opening its own screen), « Langue »
 * (the interface's, with what the app says it changes besides, `APP_WORDS`), and, last, the way to
 * the Administration. On « Apparence »'s screen (`AppearanceScreen`): the theme and the paper's
 * grain (`ThemeSection`), then the colours and the ground (`ColorsSection`, `GroundSection`); the
 * look is this app's, sent to the others on « Appliquer aux autres » (`LookShare`).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { APPS, type AppId } from '@unlease/core/apps';
import { languageWords } from '@unlease/core/appWords';
import { eraseRowWords } from '@unlease/core/services/erase';
import { LOCALE_NAMES, LOCALES, t } from '@unlease/core/i18n';
import { SETTINGS_SECTIONS } from '@unlease/core/services/settingsSearch';
import { lookWords } from '@unlease/design/appearance';
import { useServerFeature } from '@shared/app/hooks/useServerFeature';
import { ownApp } from '@shared/app/store/library';
import { selectAppearance, selectGrain, selectLocale, selectThemePreference, setGrain, setInterfaceLocale, setTheme, useSettingsStore } from '@shared/app/store/settingsStore';

import { AppText, groundStyle, Icon, ListRow, Organic, Segmented } from '../../components';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { SwitchRow } from '../appearance/SwitchRow';
import { Section } from './Section';

/** Réglages' last section, the way to the Administration, in the same words in every app and on the web: its row names it, so no title repeats it. */
export function AdminEntrySection({ onOpen }: { onOpen: () => void }) {
  const theme = useTheme();
  return (
    <Section>
      <ListRow icon="server" title={t('Administration')} supporting={t('Server, apps, Claude, backups and files')} trailing={<Icon name="chevronRight" size={20} color={theme.color.inkMuted} />} onPress={onOpen} />
    </Section>
  );
}

/**
 * « Apparence » on Réglages' page: one row, as Android's settings open a large group (the colours'
 * and the ground's galleries) on a page of its own, its second line the look now, its end the look's
 * pebbles (the palette's split pebble as the colours show it, the ground as it is painted), then the
 * chevron. Its row names it, so no title repeats it.
 */
export function AppearanceEntrySection({ onOpen }: { onOpen: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const preference = useSettingsStore(selectThemePreference);
  const appearance = useSettingsStore(selectAppearance);
  const { leaf, action } = theme.color;
  const pebbles = (
    <View style={styles.look}>
      <Organic pebble={1} style={[styles.pebble, { backgroundColor: leaf, backgroundImage: `linear-gradient(135deg, ${leaf} 0%, ${leaf} 50%, ${action} 50%, ${action} 100%)` }]} />
      <Organic pebble={3} style={[styles.pebble, groundStyle(theme.ground)]} />
      <Icon name="chevronRight" size={20} color={theme.color.inkMuted} />
    </View>
  );
  return (
    <Section>
      <ListRow icon="palette" title={t('Appearance')} supporting={lookWords(preference, appearance)} trailing={pebbles} onPress={onOpen} />
    </Section>
  );
}

/** « Apparence »'s first panel, under its screen's title: the theme, then the paper's grain, said for what it is (the ground's own is « Fond »'s). */
export function ThemeSection() {
  const styles = useThemedStyles(makeStyles);
  const themePreference = useSettingsStore(selectThemePreference);
  const grain = useSettingsStore(selectGrain);
  return (
    <Section anchor={SETTINGS_SECTIONS.appearance}>
      <View style={styles.fields}>
        {/* Its name over it as a field's is (6 above, 4 in). */}
        <View style={styles.field}>
          <AppText variant="metaStrong" style={styles.fieldLabel}>
            {t('Theme')}
          </AppText>
          <Segmented
            label={t('Theme')}
            value={themePreference}
            onChange={setTheme}
            options={[
              { value: 'system', label: t('System'), icon: 'settings' },
              { value: 'light', label: t('Light'), icon: 'sun' },
              { value: 'dark', label: t('Dark'), icon: 'moon' },
            ]}
          />
        </View>
      </View>
      <SwitchRow title={t('Paper grain')} supporting={t('A fine paper texture on notes, cards and panels.')} value={grain} onChange={setGrain} />
    </Section>
  );
}

/**
 * The interface's language, explained by the app (`APP_WORDS`, the web's words too: Carnet's says what
 * Claude writes of a link). The section's title names it; the choice's own name (« Langue de
 * l’interface ») is for TalkBack, the note under it saying what it changes.
 */
export function LanguageSection() {
  const styles = useThemedStyles(makeStyles);
  const locale = useSettingsStore(selectLocale);
  // Carnet's and Pages' note names what Claude writes: only once Claude has a key.
  const words = languageWords(ownApp(), useServerFeature('claude'));
  return (
    <Section title={t('Language')} anchor={SETTINGS_SECTIONS.language}>
      <View style={[styles.fields, styles.choice]}>
        {/* Each language named in itself, so it is found whichever is shown. */}
        <Segmented label={words.language} value={locale} onChange={setInterfaceLocale} options={LOCALES.map(option => ({ value: option, label: LOCALE_NAMES[option] }))} />
        <AppText variant="meta">{words.languageNote}</AppText>
      </View>
    </Section>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    fields: { gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
    field: { gap: 6 },
    fieldLabel: { marginLeft: 4 },
    // A choice and its note under it, as a field and its help.
    choice: { gap: 8 },
    // The look's two pebbles before the chevron, a little apart from it.
    look: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    pebble: { width: 24, height: 24, borderWidth: 1, borderColor: theme.color.hairline },
  });

/** « Effacer des données », last in an app's « Données », in danger ink: its own screen asks what goes, the token and the word. */
export function EraseEntryRow({ app, onOpen }: { app: AppId; onOpen: () => void }) {
  const words = eraseRowWords(APPS[app].name);
  return <ListRow icon="eraser" title={words.title} supporting={words.meta} danger onPress={onOpen} />;
}
