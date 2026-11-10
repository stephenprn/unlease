/**
 * Settings: the way to the Administration (the server, Claude's reading of links, backups and
 * files), appearance (theme, layout, the paper's grain), the colours and the ground, the language,
 * reminders on time (only while something keeps them from it), then data, the Keep import first.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { APP_NAME } from '@unlease/notes/brand';
import { t, tc } from '@unlease/core/i18n';
import { SETTINGS_SECTIONS } from '@unlease/core/services/settingsSearch';
import { plural } from '@unlease/core/services/format';
import { cleanSavedLinks, emptyTrash, trackedLinkIds } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { selectLayout, setLayout, useLayoutStore } from '@app/store/layoutStore';
import { showSnack } from '@shared/app/store/uiStore';
import { makerBatterySettings } from '@platform/notifications';

import { AppText, Dialog, Ground, ListRow, Segmented, TopBar } from '../components';
import { ColorsSection, GroundSection, useAppearanceEditors } from '@shared/ui/features/appearance/AppearanceSections';
import { useServicesCssHint } from '@shared/ui/features/appearance/ServicesCssSheet';
import { AdminEntrySection, LanguageSection, ThemeSection } from '@shared/ui/features/settings/DeviceSections';
import { ReminderHealthSection } from '@shared/ui/features/settings/ReminderHealthSection';
import { Section } from '@shared/ui/features/settings/Section';
import { SettingsScroll } from '@shared/ui/features/settings/SettingsScroll';
import type { ScreenProps } from '../navigation/types';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

export function SettingsScreen({ navigation, route }: ScreenProps<'Settings'>) {
  const styles = useThemedStyles(makeStyles);
  const { editColor, editGradient, editors } = useAppearanceEditors();
  const layout = useLayoutStore(selectLayout);
  const [confirmTrash, setConfirmTrash] = useState(false);
  useServicesCssHint();
  const tracked = useLibraryStore(s => trackedLinkIds(s.links).length);
  // What « Vider la corbeille » would erase (`emptyTrash`).
  const binned = useLibraryStore(s => s.noteOrder.filter(id => s.notes[id]?.deletedAt === null && s.notes[id]!.trashedAt !== null).length);

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Réglages')} onBack={() => navigation.goBack()} />
      {/* Landed on the section a search asked for. */}
      <SettingsScroll section={route.params?.section} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AdminEntrySection onOpen={() => navigation.navigate('Admin')} />

        <ThemeSection>
          <AppText variant="metaStrong">{tc('layout', 'Tableau')}</AppText>
          <Segmented
            value={layout}
            onChange={setLayout}
            options={[
              { value: 'wall', label: t('Mur'), icon: 'grid' },
              { value: 'list', label: t('Liste'), icon: 'rows' },
            ]}
          />
        </ThemeSection>

        <ColorsSection onEdit={editColor} />
        <GroundSection onEditColor={() => editColor('ground')} onEditGradient={editGradient} />

        <LanguageSection />

        {/* Only while something keeps the reminders from ringing on the minute: else nothing to say. */}
        <ReminderHealthSection makerSettings={makerBatterySettings} />

        {/* Imports first, as in every app's Données (Contacts', Agenda's): the Keep import is one row, named once. */}
        <Section title={t('Données')} anchor={SETTINGS_SECTIONS.data}>
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
          {/* As in every app's Données: what the bin holds, nothing to press while it is empty. */}
          <ListRow
            icon="trash"
            title={t('Vider la corbeille')}
            supporting={binned > 0 ? t('{notes} dans la corbeille', { notes: plural(binned, 'note') }) : t('La corbeille est vide.')}
            onPress={binned > 0 ? () => setConfirmTrash(true) : undefined}
          />
        </Section>

        <AppText variant="meta" style={styles.about}>{t('{app} · notes, listes et liens, chez vous', { app: APP_NAME })}</AppText>
      </SettingsScroll>

      <Dialog
        visible={confirmTrash}
        title={t('Vider la corbeille ?')}
        message={t('Toutes les notes de la corbeille seront supprimées définitivement, sur tous vos appareils.')}
        confirmLabel={t('Vider')}
        danger
        onCancel={() => setConfirmTrash(false)}
        onConfirm={() => {
          setConfirmTrash(false);
          // Emptied as the Corbeille's own head does.
          const notes = emptyTrash();
          showSnack(t('{deleted} définitivement', { deleted: plural(notes, 'note supprimée', 'notes supprimées') }), undefined, { tone: 'success' });
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
    about: { textAlign: 'center' },
  });
