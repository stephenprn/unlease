/**
 * Contacts' settings, in every app's order: the address book's own first (the list's order, Google's
 * « Trier par », the country of the numbers written without their `+`, « Indicatif par défaut », the
 * maps app addresses open in, « Ouvrir les adresses dans », then the birthdays' notices and what keeps
 * them from ringing on time, only while something does), the copy into the phone's own address book
 * (« On this phone »); then « Apparence » (one row opening its own
 * page: the theme, the paper's grain, the colours and the ground), the language, the import (its
 * wizard), the export as a `.vcf`, the bin and « Effacer des données », and the way to the
 * Administration last. What this phone alone
 * keeps; the server's settings are the Administration's.
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
import { contactsMirror } from '@app/phoneMirror';
import { showSnack } from '@shared/app/store/uiStore';
import { makerBatterySettings } from '@platform/notifications';

import { AppText, Dialog, Ground, ListRow, PickerField, Segmented, TopBar } from '@shared/ui/components';
import { MapsChoiceField } from '@shared/ui/features/maps/MapsSheets';
import { AdminEntrySection, AppearanceEntrySection, EraseEntryRow, LanguageSection } from '@shared/ui/features/settings/DeviceSections';
import { BackgroundSyncSection } from '@shared/ui/features/settings/BackgroundSyncRows';
import { PhoneMirrorRows } from '@shared/ui/features/settings/PhoneMirrorRows';
import { ReminderHealthSection } from '@shared/ui/features/settings/ReminderHealthSection';
import { Section } from '@shared/ui/features/settings/Section';
import { SettingsScroll } from '@shared/ui/features/settings/SettingsScroll';
import { AppearanceScreen } from '@shared/ui/screens/AppearanceScreen';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { BirthdayNotices } from '../features/contacts/BirthdayNotices';
import { RegionSheet, regionWords } from '../features/contacts/RegionSheet';
import type { ScreenProps } from '../navigation/types';
import { later } from '@app/later';

export function SettingsScreen({ navigation, route }: ScreenProps<'Settings'>) {
  const styles = useThemedStyles(makeStyles);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const binned = useTrashedContacts().length;
  const count = useLibraryStore(s => s.liveContacts.length);
  const order = useContactsUiStore(selectSortOrder);
  const region = useContactsUiStore(selectRegion);
  const birthdays = useContactsUiStore(selectBirthdays);
  const [pickingRegion, setPickingRegion] = useState(false);

  const exportAll = async (): Promise<void> => {
    const state = useLibraryStore.getState();
    const outcome = await exportContacts(sortContacts(liveContacts(state), order));
    if (outcome === 'ok') showSnack(t('{contacts} exported', { contacts: plural(count, 'contact') }), undefined, { tone: 'success' });
    else if (outcome === 'error') showSnack(t('The export couldn’t be saved.'), undefined, { tone: 'error' });
  };

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Settings')} onBack={() => navigation.goBack()} />
      {/* Landed on the section a search asked for. */}
      <SettingsScroll section={route.params?.section} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* The address book's own first. */}
        <Section title={t('Contacts')} anchor={CONTACTS_SETTINGS_SECTION}>
          <View style={styles.fields}>
            {/* A field as the pickers under it are: its label, its control and its help 6 apart, the words 4 in. */}
            <View style={styles.field}>
              <AppText variant="metaStrong" style={styles.fieldWords}>
                {t('Sort by')}
              </AppText>
              <Segmented
                label={t('Sort by')}
                value={order}
                onChange={setSortOrder}
                options={[
                  { value: 'firstName', label: t('First name') },
                  { value: 'lastName', label: t('Last name') },
                ]}
              />
              <AppText variant="meta" style={styles.fieldWords}>
                {t('On this phone only. Sorted by last name, the list also writes the last name first.')}
              </AppText>
            </View>
            <PickerField
              label={t('Default country code')}
              value={regionWords(region, phoneRegion())}
              onPress={() => setPickingRegion(true)}
              help={t('A number written without a country code (06 12 34 56 78) takes this one: the contact’s page shows it and calls it with it, as WhatsApp does, and a new number starts with it.')}
            />
            <MapsChoiceField />
          </View>
        </Section>

        <Section title={t('Birthdays')} anchor={BIRTHDAYS_SETTINGS_SECTION}>
          <BirthdayNotices />
        </Section>
        <Section title={t('On this phone')}>
          <PhoneMirrorRows
            mirror={contactsMirror}
            title={t('Copy to the phone’s contacts')}
            supporting={t('Your contacts show in the phone’s own address book, read-only, under an account of their own: the dialer, Messages and WhatsApp name who calls or writes. Your other accounts are never touched.')}
          />
        </Section>
        <BackgroundSyncSection />

        <ReminderHealthSection wanted={birthdays.enabled} makerSettings={makerBatterySettings} />

        <AppearanceEntrySection onOpen={() => navigation.navigate('Appearance')} />
        <LanguageSection />

        <Section title={t('Data')} anchor={SETTINGS_SECTIONS.data}>
          <ListRow icon="download" title={t('Import')} supporting={t('A file exported from Google Contacts, or this phone’s contacts')} onPress={() => navigation.navigate('Import')} />
          <ListRow icon="upload" title={t('Export')} supporting={count > 0 ? t('{contacts} in a .vcf file', { contacts: plural(count, 'contact') }) : t('No contacts to export.')} onPress={count > 0 ? () => later(exportAll()) : undefined} />
          <ListRow
            icon="trash"
            title={t('Empty the bin')}
            supporting={binned > 0 ? t('{contacts} in the bin', { contacts: plural(binned, 'contact') }) : t('The bin is empty.')}
            onPress={binned > 0 ? () => setConfirmEmpty(true) : undefined}
          />
          <EraseEntryRow app="contacts" onOpen={() => navigation.navigate('Erase')} />
        </Section>

        {/* What is set once and rarely, last. */}
        <AdminEntrySection onOpen={() => navigation.navigate('Admin')} />

        <AppText variant="meta" style={styles.about}>
          {t('{app} · your contacts, at home', { app: APP_NAME })}
        </AppText>
      </SettingsScroll>

      <Dialog
        visible={confirmEmpty}
        title={t('Empty the bin?')}
        message={t('Every contact in the bin will be deleted forever, on all your devices.')}
        confirmLabel={t('Empty')}
        danger
        onCancel={() => setConfirmEmpty(false)}
        onConfirm={() => {
          setConfirmEmpty(false);
          const gone = emptyContactsBin();
          showSnack(t('{deleted} forever', { deleted: plural(gone, 'contact deleted', 'contacts deleted') }), undefined, { tone: 'success' });
        }}
      />

      <RegionSheet visible={pickingRegion} chosen={region} phone={phoneRegion()} onChoose={setRegion} onDismiss={() => setPickingRegion(false)} />
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
    fields: { gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
    field: { gap: 6 },
    fieldWords: { marginHorizontal: 4 },
    about: { textAlign: 'center' },
  });
