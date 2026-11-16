/**
 * Clock's settings, in every app's order: Clock's own first (what keeps the alarms from ringing as
 * they should, only while something does; « Alarmes »: whether this phone rings them, the snooze,
 * how long one rings, how its volume rises, the volume buttons, a new alarm's sound, the notice before
 * one, the clock's format, the week's first day, and a test ring; « Au réveil »: what a new alarm
 * shows as it rings and where the weather is read; « La veille au soir »: the evening check, its hour
 * and the time one needs to get ready); then « Apparence », the language, « Effacer des données » and
 * the way to the Administration last. What this phone alone keeps (`clockUi`); the server's settings
 * are the Administration's. The sections and rows are those a search finds (`CLOCK_SETTINGS_PLACES`).
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { SETTINGS_SECTIONS } from '@unlease/core/services/settingsSearch';
import { spanWords } from '@unlease/calendar/services/today';
import { APP_NAME } from '@unlease/clock/brand';
import { MARGIN_CHOICES, RAMP_CHOICES, SILENCE_CHOICES, SNOOZE_CHOICES, UPCOMING_CHOICES, VOLUME_KEYS, type VolumeKeys } from '@unlease/clock/models/prefs';
import { CLOCK_SETTINGS_SECTION, EVENING_SETTINGS_SECTION, RINGING_SETTINGS_SECTION } from '@unlease/clock/services/settingsPlaces';
import { soundName } from '@unlease/clock/services/sounds';
import { minutesWords, rampWords, upcomingWords, VOLUME_KEYS_WORDS } from '@unlease/clock/services/words';
import { selectPrefs, setPrefs, useClockUiStore } from '@app/store/clockUi';
import { showSnack } from '@shared/app/store/uiStore';
import { ringIn } from '@platform/alarmEngine';

import { AppText, Ground, ListRow, PickerField, PlaceSearchHost, Segmented, TopBar } from '@shared/ui/components';
import { SwitchRow } from '@shared/ui/features/appearance/SwitchRow';
import { AdminEntrySection, AppearanceEntrySection, EraseEntryRow, LanguageSection } from '@shared/ui/features/settings/DeviceSections';
import { BackgroundSyncSection } from '@shared/ui/features/settings/BackgroundSyncRows';
import { Section } from '@shared/ui/features/settings/Section';
import { SettingsScroll } from '@shared/ui/features/settings/SettingsScroll';
import { AppearanceScreen } from '@shared/ui/screens/AppearanceScreen';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { SoundSheet } from '../features/editor/SoundSheet';
import { AlarmHealthSection } from '../features/settings/AlarmHealthSection';
import { ChoiceSheet } from '../features/settings/ChoiceSheet';
import { EveningHour } from '../features/settings/EveningHour';
import { WeatherWhereFields } from '../features/settings/WeatherWhere';
import type { ScreenProps } from '../navigation/types';

/** The settings chosen in a sheet of their own. */
type Choosing = 'snooze' | 'silence' | 'ramp' | 'volumeKeys' | 'upcoming' | 'margin' | 'sound' | null;

export function SettingsScreen({ navigation, route }: ScreenProps<'Settings'>) {
  const styles = useThemedStyles(makeStyles);
  const prefs = useClockUiStore(selectPrefs);
  const [choosing, setChoosing] = useState<Choosing>(null);
  const close = (): void => setChoosing(null);

  const tryOne = (): void => {
    ringIn(10, t('Test alarm'), prefs.defaultSound);
    showSnack(t('An alarm rings in 10 seconds, as yours ring on this phone.'));
  };

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Settings')} onBack={() => navigation.goBack()} />
      {/* Landed on the section a search asked for. */}
      <SettingsScroll section={route.params?.section} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* What keeps the alarms from ringing first: on an alarm clock nothing matters more, and it shows only while something does. */}
        <AlarmHealthSection wanted={prefs.ringsHere} />

        <Section title={t('Alarms')} anchor={CLOCK_SETTINGS_SECTION}>
          <SwitchRow title={t('Ring on this phone')} supporting={t('Off on a tablet or a second phone: your alarms ring on your other phones.')} value={prefs.ringsHere} onChange={ringsHere => setPrefs({ ringsHere })} />
          <View style={styles.fields}>
            <PickerField label={t('Snooze length')} value={minutesWords(prefs.snoozeMinutes)} onPress={() => setChoosing('snooze')} />
            <PickerField label={t('Stop ringing after')} value={minutesWords(prefs.silenceAfter)} onPress={() => setChoosing('silence')} help={t('Left ringing, an alarm stops and says it was missed.')} />
            <PickerField label={t('Volume rises over')} value={rampWords(prefs.rampSeconds)} onPress={() => setChoosing('ramp')} />
            <PickerField label={t('Volume buttons')} value={VOLUME_KEYS_WORDS[prefs.volumeKeys]} onPress={() => setChoosing('volumeKeys')} help={t('What they do while an alarm rings.')} />
            <PickerField label={t('A new alarm’s sound')} value={soundName(prefs.defaultSound)} onPress={() => setChoosing('sound')} />
            <PickerField label={t('Notice before an alarm')} value={upcomingWords(prefs.upcomingMinutes)} onPress={() => setChoosing('upcoming')} help={t('A quiet notification before it rings, to skip it.')} />
          </View>
          <SwitchRow title={t('12-hour clock')} supporting={t('2 PM rather than 14:00.')} value={prefs.twelveHours} onChange={twelveHours => setPrefs({ twelveHours })} />
          <View style={styles.fields}>
            <View style={styles.field}>
              <AppText variant="metaStrong" style={styles.fieldWords}>
                {t('The week starts on')}
              </AppText>
              <Segmented
                label={t('The week starts on')}
                value={String(prefs.weekStart)}
                onChange={value => setPrefs({ weekStart: Number(value) })}
                options={[
                  { value: '1', label: t('Monday') },
                  { value: '0', label: t('Sunday') },
                  { value: '6', label: t('Saturday') },
                ]}
              />
            </View>
          </View>
          <ListRow icon="bell" title={t('Try an alarm')} supporting={t('One rings in 10 seconds, with a new alarm’s sound.')} onPress={tryOne} />
        </Section>

        <Section title={t('As it rings')} anchor={RINGING_SETTINGS_SECTION}>
          <SwitchRow title={t('Weather')} supporting={t('A new alarm shows the weather as it rings.')} value={prefs.weatherDefault} onChange={weatherDefault => setPrefs({ weatherDefault })} />
          <WeatherWhereFields />
          <SwitchRow title={t('The day’s events')} supporting={t('A new alarm shows the day’s first events from your calendar as it rings.')} value={prefs.agendaDefault} onChange={agendaDefault => setPrefs({ agendaDefault })} />
        </Section>

        <Section title={t('The evening before')} anchor={EVENING_SETTINGS_SECTION}>
          <SwitchRow
            title={t('Evening check')}
            supporting={t('A word the evening before when tomorrow’s first event comes too soon after your alarm, with a way to ring earlier.')}
            value={prefs.eveningCheck}
            onChange={eveningCheck => setPrefs({ eveningCheck })}
          />
          {prefs.eveningCheck ? (
            <View style={styles.fields}>
              <EveningHour at={prefs.eveningAt} twelveHours={prefs.twelveHours} onChange={eveningAt => setPrefs({ eveningAt })} />
              <PickerField label={t('Time to get ready')} value={spanWords(prefs.marginMinutes)} onPress={() => setChoosing('margin')} help={t('Between your alarm and the first event.')} />
            </View>
          ) : null}
        </Section>

        <BackgroundSyncSection />

        <AppearanceEntrySection onOpen={() => navigation.navigate('Appearance')} />
        <LanguageSection />

        <Section title={t('Data')} anchor={SETTINGS_SECTIONS.data}>
          <EraseEntryRow app="clock" onOpen={() => navigation.navigate('Erase')} />
        </Section>

        {/* What is set once and rarely, last. */}
        <AdminEntrySection onOpen={() => navigation.navigate('Admin')} />

        <AppText variant="meta" style={styles.about}>
          {t('{app} · your alarms, at home', { app: APP_NAME })}
        </AppText>
      </SettingsScroll>

      <ChoiceSheet visible={choosing === 'snooze'} title={t('Snooze length')} choices={SNOOZE_CHOICES} value={prefs.snoozeMinutes} words={minutesWords} onChoose={snoozeMinutes => setPrefs({ snoozeMinutes })} onDismiss={close} />
      <ChoiceSheet visible={choosing === 'silence'} title={t('Stop ringing after')} choices={SILENCE_CHOICES} value={prefs.silenceAfter} words={minutesWords} onChoose={silenceAfter => setPrefs({ silenceAfter })} onDismiss={close} />
      <ChoiceSheet visible={choosing === 'ramp'} title={t('Volume rises over')} choices={RAMP_CHOICES} value={prefs.rampSeconds} words={rampWords} onChoose={rampSeconds => setPrefs({ rampSeconds })} onDismiss={close} />
      <ChoiceSheet<VolumeKeys> visible={choosing === 'volumeKeys'} title={t('Volume buttons')} choices={VOLUME_KEYS} value={prefs.volumeKeys} words={keys => VOLUME_KEYS_WORDS[keys]} onChoose={volumeKeys => setPrefs({ volumeKeys })} onDismiss={close} />
      <ChoiceSheet visible={choosing === 'upcoming'} title={t('Notice before an alarm')} choices={UPCOMING_CHOICES} value={prefs.upcomingMinutes} words={upcomingWords} onChoose={upcomingMinutes => setPrefs({ upcomingMinutes })} onDismiss={close} />
      <ChoiceSheet visible={choosing === 'margin'} title={t('Time to get ready')} choices={MARGIN_CHOICES} value={prefs.marginMinutes} words={spanWords} onChoose={marginMinutes => setPrefs({ marginMinutes })} onDismiss={close} />
      <SoundSheet visible={choosing === 'sound'} title={t('A new alarm’s sound')} sound={prefs.defaultSound} onSound={defaultSound => setPrefs({ defaultSound })} onDismiss={close} />
      <PlaceSearchHost />
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
