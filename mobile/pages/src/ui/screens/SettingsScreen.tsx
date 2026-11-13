/**
 * Pages' settings, in every app's order (Pages has none of its own yet): « Apparence » (one row
 * opening its own page: the theme, the paper's grain, the colours and the ground), the language,
 * « Données » (the import first, the bin, « Effacer des données » last), and the way to the
 * Administration last (the server, Claude, backups and files). What this phone alone keeps; the
 * server's settings are the Administration's.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { APP_NAME } from '@unlease/pages/brand';
import { t } from '@unlease/core/i18n';
import { SETTINGS_SECTIONS } from '@unlease/core/services/settingsSearch';
import { plural } from '@unlease/core/services/format';
import { useTrashedPages } from '@app/hooks/usePages';
import { emptyPagesBin } from '@app/store/pages';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, Dialog, Ground, ListRow, TopBar } from '@shared/ui/components';
import { AdminEntrySection, AppearanceEntrySection, EraseEntryRow, LanguageSection } from '@shared/ui/features/settings/DeviceSections';
import { BackgroundSyncSection } from '@shared/ui/features/settings/BackgroundSyncRows';
import { Section } from '@shared/ui/features/settings/Section';
import { SettingsScroll } from '@shared/ui/features/settings/SettingsScroll';
import { AppearanceScreen } from '@shared/ui/screens/AppearanceScreen';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import type { ScreenProps } from '../navigation/types';

export function SettingsScreen({ navigation, route }: ScreenProps<'Settings'>) {
  const styles = useThemedStyles(makeStyles);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const binned = useTrashedPages().length;

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Settings')} onBack={() => navigation.goBack()} />
      {/* Landed on the section a search asked for. */}
      <SettingsScroll section={route.params?.section} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BackgroundSyncSection />

        <AppearanceEntrySection onOpen={() => navigation.navigate('Appearance')} />
        <LanguageSection />

        {/* Imports first, as in every app's Données; erasing last. */}
        <Section title={t('Data')} anchor={SETTINGS_SECTIONS.data}>
          <ListRow icon="download" title={t('Import')} supporting={t('Markdown files (Obsidian…); Notion’s export from the web')} onPress={() => navigation.navigate('Import')} />
          <ListRow
            icon="trash"
            title={t('Empty the bin')}
            supporting={binned > 0 ? t('{pages} in the bin', { pages: plural(binned, 'page') }) : t('The bin is empty.')}
            onPress={binned > 0 ? () => setConfirmEmpty(true) : undefined}
          />
          <EraseEntryRow app="pages" onOpen={() => navigation.navigate('Erase')} />
        </Section>

        {/* What is set once and rarely, last. */}
        <AdminEntrySection onOpen={() => navigation.navigate('Admin')} />

        <AppText variant="meta" style={styles.about}>
          {t('{app} · your documents, at home', { app: APP_NAME })}
        </AppText>
      </SettingsScroll>

      <Dialog
        visible={confirmEmpty}
        title={t('Empty the bin?')}
        message={t('Every page in the bin will be deleted for good, on all your devices.')}
        confirmLabel={t('Empty')}
        danger
        onCancel={() => setConfirmEmpty(false)}
        onConfirm={() => {
          setConfirmEmpty(false);
          const pages = emptyPagesBin();
          showSnack(t('{deleted} forever', { deleted: plural(pages, 'page deleted', 'pages deleted') }), undefined, { tone: 'success' });
        }}
      />
    </View>
  );
}

/** Réglages' « Apparence » page, from its row or a search. */
export function AppearanceSettingsScreen({ navigation, route }: ScreenProps<'Appearance'>) {
  return <AppearanceScreen section={route.params?.section} onBack={() => navigation.goBack()} />;
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    content: { padding: 12, paddingBottom: 48, gap: 20 },
    about: { textAlign: 'center' },
  });
