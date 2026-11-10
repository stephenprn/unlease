/**
 * Agenda's settings: the way to the Administration, the theme, the colours and the ground, the
 * language; then the calendar's own on this phone: the week's first day, weekends and week numbers,
 * the hours' format, a new event's length and reminders, the maps app places open in, what keeps the reminders from ringing on
 * the minute (only while something does), the import and the export of one's events as an `.ics`, the bin.
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
import { showSnack } from '@shared/app/store/uiStore';
import { saveFile } from '@shared/platform/media';
import { makerBatterySettings } from '@platform/notifications';

import { AppText, Dialog, Ground, Icon, ListRow, PickerField, Segmented, Sheet, SheetScroll, TopBar } from '@shared/ui/components';
import { SwitchRow } from '@shared/ui/features/appearance/SwitchRow';
import { ColorsSection, GroundSection, useAppearanceEditors } from '@shared/ui/features/appearance/AppearanceSections';
import { MapsChoiceField } from '@shared/ui/features/maps/MapsSheets';
import { useServicesCssHint } from '@shared/ui/features/appearance/ServicesCssSheet';
import { AdminEntrySection, LanguageSection, ThemeSection } from '@shared/ui/features/settings/DeviceSections';
import { ReminderHealthSection } from '@shared/ui/features/settings/ReminderHealthSection';
import { Section } from '@shared/ui/features/settings/Section';
import { SettingsScroll } from '@shared/ui/features/settings/SettingsScroll';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
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
  const { editColor, editGradient, editors } = useAppearanceEditors();
  const events = useLibraryStore(s => s.events);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [reminding, setReminding] = useState<'timed' | 'allDay' | null>(null);
  const [lengthOpen, setLengthOpen] = useState(false);
  useServicesCssHint();
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
    if (saved.status === 'ok') showSnack(t('{events} exportés', { events: plural(own, 'événement') }), undefined, { tone: 'success' });
    else if (saved.status === 'error') showSnack(t('L’export n’a pas pu être enregistré.'), undefined, { tone: 'error' });
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

        <Section title={t('Agenda')} anchor={CALENDAR_SETTINGS_SECTION}>
          <View style={styles.fields}>
            <AppText variant="metaStrong">{t('La semaine commence le')}</AppText>
            <Segmented
              value={String(prefs.weekStart)}
              onChange={value => setPrefs({ weekStart: Number(value) })}
              options={[
                { value: '1', label: t('Lundi') },
                { value: '0', label: t('Dimanche') },
                { value: '6', label: t('Samedi') },
              ]}
            />
          </View>
          {/* The web's words. */}
          <SwitchRow title={t('Masquer les week-ends')} supporting={t('La semaine et le mois sans samedi ni dimanche.')} value={prefs.hideWeekends} onChange={hideWeekends => setPrefs({ hideWeekends })} />
          <SwitchRow title={t('Numéros de semaine')} supporting={t('Le numéro ISO de la semaine, à gauche de ses jours.')} value={prefs.weekNumbers} onChange={weekNumbers => setPrefs({ weekNumbers })} />
          <SwitchRow title={t('Heures sur 12')} supporting={t('2 PM plutôt que 14:00.')} value={prefs.twelveHours} onChange={twelveHours => setPrefs({ twelveHours })} />
          <View style={styles.fields}>
            <PickerField label={t('Durée d’un nouvel événement')} icon="clock" value={lengthWords(prefs.eventLength)} onPress={() => setLengthOpen(true)} />
          </View>
          <ListRow icon="bell" title={t('Rappels d’un nouvel événement')} supporting={prefs.reminders.map(minutes => reminderWords(minutes, false)).join(', ') || t('Aucun')} onPress={() => setReminding('timed')} />
          {/* Its glyph keeps its words on the column of the row it empties. */}
          {prefs.reminders.length > 0 ? <ListRow icon="bellOff" title={t('Retirer les rappels par défaut')} onPress={() => setPrefs({ reminders: [] })} /> : null}
          <ListRow icon="bell" title={t('Rappels d’un événement sur la journée')} supporting={prefs.allDayReminders.map(minutes => reminderWords(minutes, true)).join(', ') || t('Aucun')} onPress={() => setReminding('allDay')} />
          {prefs.allDayReminders.length > 0 ? <ListRow icon="bellOff" title={t('Retirer les rappels de la journée')} onPress={() => setPrefs({ allDayReminders: [] })} /> : null}
          <View style={styles.fields}>
            <MapsChoiceField />
          </View>
        </Section>

        <ReminderHealthSection makerSettings={makerBatterySettings} />

        <Section title={t('Données')} anchor={SETTINGS_SECTIONS.data}>
          <ListRow icon="download" title={t('Importer')} supporting={t('Un fichier .ics : l’export de Google Agenda, une invitation')} onPress={() => navigation.navigate('Import')} />
          <ListRow icon="upload" title={t('Exporter')} supporting={own > 0 ? t('{events} dans un fichier .ics', { events: plural(own, 'événement') }) : t('Aucun événement à exporter.')} onPress={own > 0 ? () => later(exportAll()) : undefined} />
          <ListRow icon="calendar" title={t('Autres agendas')} supporting={t('Vos abonnements et les jours fériés')} onPress={() => navigation.navigate('Feeds')} />
          <ListRow icon="trash" title={t('Vider la corbeille')} supporting={binned > 0 ? t('{events} dans la corbeille', { events: plural(binned, 'événement') }) : t('La corbeille est vide.')} onPress={binned > 0 ? () => setConfirmEmpty(true) : undefined} />
        </Section>

        <AppText variant="meta" style={styles.about}>
          {t('{app} · votre agenda, chez vous', { app: APP_NAME })}
        </AppText>
      </SettingsScroll>
      <Sheet visible={lengthOpen} onDismiss={() => setLengthOpen(false)} title={t('Durée d’un nouvel événement')}>
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
        title={t('Vider la corbeille ?')}
        message={t('Tous les événements de la corbeille seront supprimés définitivement, sur tous vos appareils.')}
        confirmLabel={t('Vider')}
        danger
        onCancel={() => setConfirmEmpty(false)}
        onConfirm={() => {
          setConfirmEmpty(false);
          showSnack(deletedForGoodWords(emptyBin()), undefined, { tone: 'success' });
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
    // As the shared sections' above it (Apparence, Langue).
    fields: { gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
    about: { textAlign: 'center' },
  });
