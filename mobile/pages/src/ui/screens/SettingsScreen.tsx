/**
 * Pages' settings, in every app's order (Pages has none of its own yet): « Apparence » (one row
 * opening its own page: the theme, the paper's grain, the colours and the ground), the language, the
 * bin, and the way to the Administration last (the server, Claude, backups and files). What this
 * phone alone keeps; the server's settings are the Administration's.
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
import { AdminEntrySection, AppearanceEntrySection, LanguageSection } from '@shared/ui/features/settings/DeviceSections';
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
      <TopBar title={t('Réglages')} onBack={() => navigation.goBack()} />
      {/* Landed on the section a search asked for. */}
      <SettingsScroll section={route.params?.section} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppearanceEntrySection onOpen={() => navigation.navigate('Appearance')} />
        <LanguageSection />

        <Section title={t('Données')} anchor={SETTINGS_SECTIONS.data}>
          <ListRow
            icon="trash"
            title={t('Vider la corbeille')}
            supporting={binned > 0 ? t('{pages} dans la corbeille', { pages: plural(binned, 'page') }) : t('La corbeille est vide.')}
            onPress={binned > 0 ? () => setConfirmEmpty(true) : undefined}
          />
        </Section>

        {/* What is set once and rarely, last. */}
        <AdminEntrySection onOpen={() => navigation.navigate('Admin')} />

        <AppText variant="meta" style={styles.about}>
          {t('{app} · vos documents, chez vous', { app: APP_NAME })}
        </AppText>
      </SettingsScroll>

      <Dialog
        visible={confirmEmpty}
        title={t('Vider la corbeille ?')}
        message={t('Toutes les pages de la corbeille seront supprimées définitivement, sur tous vos appareils.')}
        confirmLabel={t('Vider')}
        danger
        onCancel={() => setConfirmEmpty(false)}
        onConfirm={() => {
          setConfirmEmpty(false);
          const pages = emptyPagesBin();
          showSnack(t('{deleted} définitivement', { deleted: plural(pages, 'page supprimée', 'pages supprimées') }), undefined, { tone: 'success' });
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
