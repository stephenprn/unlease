/**
 * Contacts' settings: the way to the Administration, the theme, the colours and the ground, the
 * language; then the address book's own: the list's order (Google's « Trier par »), the country of
 * the numbers written without their `+` (« Indicatif par défaut »), the maps app addresses open in
 * (« Ouvrir les adresses dans »), the imports, the export as a
 * `.vcf`, and the bin. What this phone alone keeps; the server's settings are the
 * Administration's.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { APP_NAME } from '@unlease/contacts/brand';
import { t } from '@unlease/core/i18n';
import { SETTINGS_SECTIONS } from '@unlease/core/services/settingsSearch';
import { BIRTHDAYS_SETTINGS_SECTION, CONTACTS_SETTINGS_SECTION } from '@unlease/contacts/services/settingsPlaces';
import { plural } from '@unlease/core/services/format';
import { sortContacts } from '@unlease/contacts/services/names';
import { liveContacts, useTrashedContacts } from '@app/hooks/useContacts';
import { emptyContactsBin } from '@app/store/actions';
import { selectBirthdays, selectRegion, selectSortOrder, setRegion, setSortOrder, useContactsUiStore } from '@app/store/contactsUi';
import { useLibraryStore } from '@app/store/libraryStore';
import { exportContacts, phoneRegion } from '@app/reach';
import { showSnack } from '@shared/app/store/uiStore';
import { makerBatterySettings } from '@platform/notifications';

import { AppText, Dialog, Ground, ListRow, PickerField, Segmented, TopBar } from '@shared/ui/components';
import { ColorsSection, GroundSection, useAppearanceEditors } from '@shared/ui/features/appearance/AppearanceSections';
import { MapsChoiceField } from '@shared/ui/features/maps/MapsSheets';
import { useServicesCssHint } from '@shared/ui/features/appearance/ServicesCssSheet';
import { AdminEntrySection, LanguageSection, ThemeSection } from '@shared/ui/features/settings/DeviceSections';
import { ReminderHealthSection } from '@shared/ui/features/settings/ReminderHealthSection';
import { Section } from '@shared/ui/features/settings/Section';
import { SettingsScroll } from '@shared/ui/features/settings/SettingsScroll';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { BirthdayNotices } from '../features/contacts/BirthdayNotices';
import { RegionSheet, regionWords } from '../features/contacts/RegionSheet';
import type { ScreenProps } from '../navigation/types';
import { later } from '@app/later';

export function SettingsScreen({ navigation, route }: ScreenProps<'Settings'>) {
  const styles = useThemedStyles(makeStyles);
  const { editColor, editGradient, editors } = useAppearanceEditors();
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const binned = useTrashedContacts().length;
  const count = useLibraryStore(s => s.liveContacts.length);
  const order = useContactsUiStore(selectSortOrder);
  const region = useContactsUiStore(selectRegion);
  const birthdays = useContactsUiStore(selectBirthdays);
  const [pickingRegion, setPickingRegion] = useState(false);
  useServicesCssHint();

  const exportAll = async (): Promise<void> => {
    const state = useLibraryStore.getState();
    const outcome = await exportContacts(sortContacts(liveContacts(state), order));
    if (outcome === 'ok') showSnack(t('{contacts} exportés', { contacts: plural(count, 'contact') }), undefined, { tone: 'success' });
    else if (outcome === 'error') showSnack(t('L’export n’a pas pu être enregistré.'), undefined, { tone: 'error' });
  };

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Réglages')} onBack={() => navigation.goBack()} />
      {/* Landed on the section a search asked for. */}
      <SettingsScroll section={route.params?.section} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AdminEntrySection onOpen={() => navigation.navigate('Admin')} />

        <ThemeSection />
        <ColorsSection onEdit={editColor} />
        <GroundSection onEditColor={() => editColor('ground')} onEditGradient={editGradient} />

        <LanguageSection />

        <Section title={t('Contacts')} anchor={CONTACTS_SETTINGS_SECTION}>
          <View style={styles.fields}>
            {/* A field as the pickers under it are: its label, its control and its help 6 apart, the words 4 in. */}
            <View style={styles.field}>
              <AppText variant="metaStrong" style={styles.fieldWords}>
                {t('Trier par')}
              </AppText>
              <Segmented
                label={t('Trier par')}
                value={order}
                onChange={setSortOrder}
                options={[
                  { value: 'firstName', label: t('Prénom') },
                  { value: 'lastName', label: t('Nom de famille') },
                ]}
              />
              <AppText variant="meta" style={styles.fieldWords}>
                {t('Sur ce téléphone seulement. Trié par nom de famille, la liste écrit aussi le nom en premier.')}
              </AppText>
            </View>
            <PickerField
              label={t('Indicatif par défaut')}
              value={regionWords(region, phoneRegion())}
              onPress={() => setPickingRegion(true)}
              help={t('Un numéro écrit sans indicatif (06 12 34 56 78) prend celui-ci : la fiche du contact l’affiche et l’appelle avec, WhatsApp aussi, et un nouveau numéro le propose.')}
            />
            <MapsChoiceField />
          </View>
        </Section>

        <Section title={t('Anniversaires')} anchor={BIRTHDAYS_SETTINGS_SECTION}>
          <BirthdayNotices />
        </Section>
        <ReminderHealthSection wanted={birthdays.enabled} makerSettings={makerBatterySettings} />

        <Section title={t('Données')} anchor={SETTINGS_SECTIONS.data}>
          <ListRow icon="download" title={t('Importer')} supporting={t('Un fichier exporté de Google Contacts, ou les contacts de ce téléphone')} onPress={() => navigation.navigate('Import')} />
          <ListRow icon="upload" title={t('Exporter')} supporting={count > 0 ? t('{contacts} dans un fichier .vcf', { contacts: plural(count, 'contact') }) : t('Aucun contact à exporter.')} onPress={count > 0 ? () => later(exportAll()) : undefined} />
          <ListRow
            icon="trash"
            title={t('Vider la corbeille')}
            supporting={binned > 0 ? t('{contacts} dans la corbeille', { contacts: plural(binned, 'contact') }) : t('La corbeille est vide.')}
            onPress={binned > 0 ? () => setConfirmEmpty(true) : undefined}
          />
        </Section>

        <AppText variant="meta" style={styles.about}>
          {t('{app} · vos contacts, chez vous', { app: APP_NAME })}
        </AppText>
      </SettingsScroll>

      <Dialog
        visible={confirmEmpty}
        title={t('Vider la corbeille ?')}
        message={t('Tous les contacts de la corbeille seront supprimés définitivement, sur tous vos appareils.')}
        confirmLabel={t('Vider')}
        danger
        onCancel={() => setConfirmEmpty(false)}
        onConfirm={() => {
          setConfirmEmpty(false);
          const gone = emptyContactsBin();
          showSnack(t('{deleted} définitivement', { deleted: plural(gone, 'contact supprimé', 'contacts supprimés') }), undefined, { tone: 'success' });
        }}
      />

      <RegionSheet visible={pickingRegion} chosen={region} phone={phoneRegion()} onChoose={setRegion} onDismiss={() => setPickingRegion(false)} />

      {editors}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    content: { padding: 12, paddingBottom: 48, gap: 20 },
    fields: { gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
    field: { gap: 6 },
    fieldWords: { marginHorizontal: 4 },
    about: { textAlign: 'center' },
  });
