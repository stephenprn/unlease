/**
 * Settings: the way to the Administration (the server, Claude's reading of links, backups and
 * files), appearance (theme, layout, the paper's grain), the colours and the ground, the language,
 * reminders (only while exact alarms are refused), data.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, ScrollView, StyleSheet, View } from 'react-native';

import { APP_NAME } from '@unlease/notes/brand';
import { LOCALE_NAMES, LOCALES, t, tc } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { cleanSavedLinks, emptyTrash, trackedLinkIds } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { emptyPagesBin } from '@app/store/pages';
import { selectGrain, selectLayout, selectLocale, selectThemePreference, setGrain, setInterfaceLocale, setLayout, setTheme, useSettingsStore } from '@app/store/settingsStore';
import { showSnack } from '@app/store/uiStore';
import { canScheduleExact, openExactAlarmSettings } from '@platform/notifications';

import { AppText, Dialog, Ground, ListRow, Segmented, TopBar } from '../components';
import { ColorsSection, GroundSection, useAppearanceEditors } from '../features/appearance/AppearanceSections';
import { useServicesCssHint } from '../features/appearance/ServicesCssSheet';
import { SwitchRow } from '../features/appearance/SwitchRow';
import { Section } from '../features/settings/Section';
import type { ScreenProps } from '../navigation/types';
import { useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';

export function SettingsScreen({ navigation }: ScreenProps<'Settings'>) {
  const styles = useThemedStyles(makeStyles);
  const { editColor, editGradient, editors } = useAppearanceEditors();
  const themePreference = useSettingsStore(selectThemePreference);
  const layout = useSettingsStore(selectLayout);
  const grain = useSettingsStore(selectGrain);
  const locale = useSettingsStore(selectLocale);
  const [exact, setExact] = useState<boolean | null>(null);
  const [confirmTrash, setConfirmTrash] = useState(false);
  useServicesCssHint();
  const tracked = useLibraryStore(s => trackedLinkIds(s.links).length);

  const refresh = useCallback(() => {
    canScheduleExact().then(setExact).catch(() => setExact(null));
  }, []);
  useEffect(() => {
    refresh();
    // Back from Android's "Alarmes et rappels" page: the answer may have changed there.
    const subscription = AppState.addEventListener('change', state => state === 'active' && refresh());
    return () => subscription.remove();
  }, [refresh]);

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Réglages')} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Section title={t('Administration')}>
          <ListRow icon="server" title={t('Administration')} supporting={t('Serveur, lecture des liens par Claude, sauvegardes et fichiers')} onPress={() => navigation.navigate('Admin')} />
        </Section>

        <Section title={t('Apparence')}>
          <View style={styles.fields}>
            <AppText variant="metaStrong">{t('Thème')}</AppText>
            <Segmented
              value={themePreference}
              onChange={setTheme}
              options={[
                { value: 'system', label: t('Système'), icon: 'phone' },
                { value: 'light', label: t('Clair'), icon: 'sun' },
                { value: 'dark', label: t('Sombre'), icon: 'moon' },
              ]}
            />
            <AppText variant="metaStrong">{tc('layout', 'Tableau')}</AppText>
            <Segmented
              value={layout}
              onChange={setLayout}
              options={[
                { value: 'wall', label: t('Mur'), icon: 'grid' },
                { value: 'list', label: t('Liste'), icon: 'rows' },
              ]}
            />
          </View>
          <SwitchRow title={t('Grain du papier')} supporting={t('Le grain du papier sur les notes et les feuilles, sur cet appareil.')} value={grain} onChange={setGrain} />
        </Section>

        <ColorsSection onEdit={editColor} />
        <GroundSection onEditColor={() => editColor('ground')} onEditGradient={editGradient} />

        <Section title={t('Langue')}>
          <View style={styles.fields}>
            <AppText variant="metaStrong">{t('Langue de l’interface et des lectures')}</AppText>
            {/* Each language named in itself, so it is found whichever is shown. */}
            <Segmented value={locale} onChange={setInterfaceLocale} options={LOCALES.map(option => ({ value: option, label: LOCALE_NAMES[option] }))} />
            <AppText variant="meta">{t('Les écrans de l’application, et ce que Claude écrit quand il lit un lien enregistré depuis cet appareil : titre, résumé, détails. Un lien déjà lu garde sa langue ; « Relire la page » le relit dans celle-ci.')}</AppText>
          </View>
        </Section>

        {/* Only while Android refuses exact alarms: once allowed there is nothing to say or do here. */}
        {exact === false ? (
          <Section title={t('Rappels')}>
            <ListRow
              icon="clock"
              title={t('Rappels à l’heure approximative')}
              supporting={t('Autorisez « Alarmes et rappels » pour qu’ils sonnent à la minute près.')}
              onPress={() => openExactAlarmSettings()}
            />
          </Section>
        ) : null}

        <Section title={t('Données')}>
          <ListRow icon="download" title={t('Importer depuis Google Keep')} supporting={t('Archive Google Takeout (.zip)')} onPress={() => navigation.navigate('Import')} />
          <ListRow
            icon="broom"
            title={t('Nettoyer les liens enregistrés')}
            supporting={
              tracked > 0
                ? t('{links} des paramètres de suivi (utm, fbclid…) : ils seront retirés, le reste de l’adresse est gardé.', { links: plural(tracked, 'lien garde', 'liens gardent') })
                : t('Aucun paramètre de suivi dans vos liens : les nouveaux sont nettoyés en arrivant.')
            }
            onPress={
              tracked > 0
                ? () => {
                    const { count, undo } = cleanSavedLinks();
                    showSnack(plural(count, 'lien nettoyé', 'liens nettoyés'), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
                  }
                : undefined
            }
          />
          <ListRow icon="trash" title={t('Vider la corbeille')} onPress={() => setConfirmTrash(true)} />
        </Section>

        <AppText variant="meta" style={styles.about}>{t('{app} · notes, listes et liens, chez vous', { app: APP_NAME })}</AppText>
      </ScrollView>

      <Dialog
        visible={confirmTrash}
        title={t('Vider la corbeille ?')}
        message={t('Toutes les notes et les pages de la corbeille seront supprimées définitivement, sur tous vos appareils.')}
        confirmLabel={t('Vider')}
        danger
        onCancel={() => setConfirmTrash(false)}
        onConfirm={() => {
          setConfirmTrash(false);
          // One bin for notes and pages, emptied as the Corbeille's own head does.
          const notes = emptyTrash();
          const pages = emptyPagesBin();
          const notesGone = plural(notes, 'note supprimée', 'notes supprimées');
          const pagesGone = plural(pages, 'page supprimée', 'pages supprimées');
          showSnack(notes > 0 && pages > 0 ? t('{notes} et {pages} définitivement', { notes: notesGone, pages: pagesGone }) : t('{deleted} définitivement', { deleted: pages > 0 ? pagesGone : notesGone }), undefined, { tone: 'success' });
        }}
      />

      {editors}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    content: { padding: 12, paddingBottom: 48, gap: 20 },
    fields: { gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
    about: { textAlign: 'center' },
  });
