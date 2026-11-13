/**
 * Agenda's settings, in every app's order: the calendar's own on this phone first (the week's first
 * day, weekends and week numbers, the hours' format, a new event's length and reminders, the maps app
 * places open in, the morning summary, then what keeps the reminders from ringing on the minute, only while something
 * does); then « Apparence » (one row opening its own page: the theme, the paper's grain, the colours
 * and the ground), the language, the import and the export of one's events as an `.ics`, the other
 * calendars, the bin and « Effacer des données », and the way to the Administration last.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { APP_NAME } from '@unlease/calendar/brand';
import { t } from '@unlease/core/i18n';
import { SETTINGS_SECTIONS } from '@unlease/core/services/settingsSearch';
import { CALENDAR_SETTINGS_SECTION } from '@unlease/calendar/services/settingsPlaces';
import { plural } from '@unlease/core/services/format';
import { EVENT_LENGTHS } from '@unlease/calendar/models/prefs';
import { deletedForGoodWords, lengthWords, reminderWords } from '@unlease/calendar/services/eventText';
import { writeIcs } from '@unlease/calendar/services/ics';
import { markupToPlain } from '@unlease/core/services/richText';
import { SUITE_NAME } from '@unlease/core/apps';
import { emptyBin, ownLiveEvents } from '@app/store/actions';
import { selectPrefs, setPrefs, useCalendarUiStore } from '@app/store/calendarUi';
import { useLibraryStore } from '@app/store/libraryStore';
import { nameOf } from '@app/mentionNames';
import { later } from '@app/later';
import { calendarMirror } from '@app/phoneMirror';
import { showSnack } from '@shared/app/store/uiStore';
import { saveFile } from '@shared/platform/media';
import { makerBatterySettings } from '@platform/notifications';

import { AppText, Dialog, Ground, Icon, ListRow, PickerField, Segmented, Sheet, SheetScroll, TopBar } from '@shared/ui/components';
import { SwitchRow } from '@shared/ui/features/appearance/SwitchRow';
import { MapsChoiceField } from '@shared/ui/features/maps/MapsSheets';
import { AdminEntrySection, AppearanceEntrySection, EraseEntryRow, LanguageSection } from '@shared/ui/features/settings/DeviceSections';
import { BackgroundSyncSection } from '@shared/ui/features/settings/BackgroundSyncRows';
import { PhoneMirrorRows } from '@shared/ui/features/settings/PhoneMirrorRows';
import { ReminderHealthSection } from '@shared/ui/features/settings/ReminderHealthSection';
import { Section } from '@shared/ui/features/settings/Section';
import { SettingsScroll } from '@shared/ui/features/settings/SettingsScroll';
import { AppearanceScreen } from '@shared/ui/screens/AppearanceScreen';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { DigestSection } from '../features/digest/DigestSection';
import { ReminderSheet } from '../features/event/ReminderSheet';
import type { ScreenProps } from '../navigation/types';

/** Text as UTF-8 bytes (the save screen takes bytes). */
function utf8(text: string): Uint8Array {
  const bytes: number[] = [];
  const tail = (code: number, shift: number): number => 0x80 + (Math.floor(code / 2 ** shift) % 64);
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 + Math.floor(code / 64), tail(code, 0));
    else if (code < 0x10000) bytes.push(0xe0 + Math.floor(code / 4096), tail(code, 6), tail(code, 0));
    else bytes.push(0xf0 + Math.floor(code / 262144), tail(code, 12), tail(code, 6), tail(code, 0));
  }
  return Uint8Array.from(bytes);
}

export function SettingsScreen({ navigation, route }: ScreenProps<'Settings'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const prefs = useCalendarUiStore(selectPrefs);
  const events = useLibraryStore(s => s.events);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [reminding, setReminding] = useState<'timed' | 'allDay' | null>(null);
  const [lengthOpen, setLengthOpen] = useState(false);
  const binned = Object.values(events).filter(event => event.deletedAt === null && event.trashedAt !== null && !event.recurringId && event.feedId === null).length;
  const own = Object.values(events).filter(event => event.deletedAt === null && event.trashedAt === null && event.feedId === null && !event.recurringId).length;

  const exportAll = async (): Promise<void> => {
    const state = useLibraryStore.getState();
    const text = writeIcs(ownLiveEvents(), {
      name: APP_NAME,
      productId: `-//${SUITE_NAME}//${APP_NAME}//FR`,
      now: Date.now(),
      plain: event => markupToPlain(event.description, target => nameOf(state, target) ?? ''),
      categories: event => event.labelIds.map(id => state.calendarLabels[id]?.name ?? '').filter(Boolean),
    });
    const saved = await saveFile(`${APP_NAME}.ics`, 'text/calendar', utf8(text));
    if (saved.status === 'ok') showSnack(t('{events} exported', { events: plural(own, 'event') }), undefined, { tone: 'success' });
    else if (saved.status === 'error') showSnack(t('The export couldn’t be saved.'), undefined, { tone: 'error' });
  };

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Settings')} onBack={() => navigation.goBack()} />
      {/* Landed on the section a search asked for. */}
      <SettingsScroll section={route.params?.section} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* The calendar's own first. */}
        <Section title={t('Calendar')} anchor={CALENDAR_SETTINGS_SECTION}>
          <View style={styles.fields}>
            <AppText variant="metaStrong">{t('The week starts on')}</AppText>
            <Segmented
              value={String(prefs.weekStart)}
              onChange={value => setPrefs({ weekStart: Number(value) })}
              options={[
                { value: '1', label: t('Monday') },
                { value: '0', label: t('Sunday') },
                { value: '6', label: t('Saturday') },
              ]}
            />
          </View>
          {/* The web's words. */}
          <SwitchRow title={t('Hide weekends')} supporting={t('The week and the month without Saturday and Sunday.')} value={prefs.hideWeekends} onChange={hideWeekends => setPrefs({ hideWeekends })} />
          <SwitchRow title={t('Week numbers')} supporting={t('The week’s ISO number, left of its days.')} value={prefs.weekNumbers} onChange={weekNumbers => setPrefs({ weekNumbers })} />
          <SwitchRow title={t('12-hour clock')} supporting={t('2 PM rather than 14:00.')} value={prefs.twelveHours} onChange={twelveHours => setPrefs({ twelveHours })} />
          <View style={styles.fields}>
            <PickerField label={t('A new event’s length')} icon="clock" value={lengthWords(prefs.eventLength)} onPress={() => setLengthOpen(true)} />
          </View>
          <ListRow icon="bell" title={t('A new event’s reminders')} supporting={prefs.reminders.map(minutes => reminderWords(minutes, false)).join(', ') || t('None')} onPress={() => setReminding('timed')} />
          {/* Its glyph keeps its words on the column of the row it empties. */}
          {prefs.reminders.length > 0 ? <ListRow icon="bellOff" title={t('Remove the default reminders')} onPress={() => setPrefs({ reminders: [] })} /> : null}
          <ListRow icon="bell" title={t('An all-day event’s reminders')} supporting={prefs.allDayReminders.map(minutes => reminderWords(minutes, true)).join(', ') || t('None')} onPress={() => setReminding('allDay')} />
          {prefs.allDayReminders.length > 0 ? <ListRow icon="bellOff" title={t('Remove the all-day reminders')} onPress={() => setPrefs({ allDayReminders: [] })} /> : null}
          <View style={styles.fields}>
            <MapsChoiceField />
          </View>
        </Section>

        <DigestSection />

        <Section title={t('On this phone')}>
          <PhoneMirrorRows
            mirror={calendarMirror}
            title={t('Copy to the phone’s calendar')}
            supporting={t('Your events show in the phone’s own calendar, read-only, under an account of their own: the Clock, Maps and your other apps see them. Your other accounts are never touched, and reminders still ring from here only.')}
          />
        </Section>

        <BackgroundSyncSection />


        <ReminderHealthSection makerSettings={makerBatterySettings} />

        <AppearanceEntrySection onOpen={() => navigation.navigate('Appearance')} />
        <LanguageSection />

        <Section title={t('Data')} anchor={SETTINGS_SECTIONS.data}>
          <ListRow icon="download" title={t('Import')} supporting={t('An .ics file: Google Calendar’s export, an invitation')} onPress={() => navigation.navigate('Import')} />
          <ListRow icon="upload" title={t('Export')} supporting={own > 0 ? t('{events} in an .ics file', { events: plural(own, 'event') }) : t('No event to export.')} onPress={own > 0 ? () => later(exportAll()) : undefined} />
          <ListRow icon="calendar" title={t('Other calendars')} supporting={t('Your subscriptions and the public holidays')} onPress={() => navigation.navigate('Feeds')} />
          <ListRow icon="trash" title={t('Empty the bin')} supporting={binned > 0 ? t('{events} in the bin', { events: plural(binned, 'event') }) : t('The bin is empty.')} onPress={binned > 0 ? () => setConfirmEmpty(true) : undefined} />
          <EraseEntryRow app="calendar" onOpen={() => navigation.navigate('Erase')} />
        </Section>

        {/* What is set once and rarely, last. */}
        <AdminEntrySection onOpen={() => navigation.navigate('Admin')} />

        <AppText variant="meta" style={styles.about}>
          {t('{app} · your calendar, at home', { app: APP_NAME })}
        </AppText>
      </SettingsScroll>
      <Sheet visible={lengthOpen} onDismiss={() => setLengthOpen(false)} title={t('A new event’s length')}>
        <SheetScroll>
          {EVENT_LENGTHS.map(minutes => {
            const current = minutes === prefs.eventLength;
            return (
              <ListRow
                key={minutes}
                title={lengthWords(minutes)}
                trailing={current ? <Icon name="check" size={22} color={theme.color.focus} /> : null}
                accessibilityRole="radio"
                accessibilityState={{ checked: current }}
                onPress={() => {
                  setPrefs({ eventLength: minutes });
                  setLengthOpen(false);
                }}
              />
            );
          })}
        </SheetScroll>
      </Sheet>
      <ReminderSheet
        visible={reminding !== null}
        allDay={reminding === 'allDay'}
        chosen={reminding === 'allDay' ? prefs.allDayReminders : prefs.reminders}
        onDismiss={() => setReminding(null)}
        onPick={minutes => (reminding === 'allDay' ? setPrefs({ allDayReminders: [...prefs.allDayReminders, minutes].slice(-5) }) : setPrefs({ reminders: [...prefs.reminders, minutes].slice(-5) }))}
      />
      <Dialog
        visible={confirmEmpty}
        title={t('Empty the bin?')}
        message={t('Every event in the bin will be deleted for good, on all your devices.')}
        confirmLabel={t('Empty')}
        danger
        onCancel={() => setConfirmEmpty(false)}
        onConfirm={() => {
          setConfirmEmpty(false);
          showSnack(deletedForGoodWords(emptyBin()), undefined, { tone: 'success' });
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
    // As the shared sections' (Apparence's theme, Langue).
    fields: { gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
    about: { textAlign: 'center' },
  });
