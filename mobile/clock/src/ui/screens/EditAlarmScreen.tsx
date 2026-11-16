/**
 * An alarm's editor, Material's full-screen dialog (× at the bar's start, its title, « Enregistrer »
 * at its end; leaving with changes asks first, `useUnsaved`): the time first and large, set on two
 * wheels with a thumb, and under it how far away it would ring, live; the days as seven round
 * toggles in the week's order with the quick choices; the label; then, on a panel, the sound (a sheet
 * that plays each one), the vibration, what it shows as it rings (the weather, the day's events), and
 * for a saved repeating alarm « Ignorer la prochaine » or « Ne plus ignorer »; « Supprimer » last.
 * Saving writes one batch, switches it on and says when it will ring.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { clockWords, weekdayDay } from '@unlease/calendar/services/eventText';
import { addDays, instantToDay, instantToWall } from '@unlease/calendar/services/time';
import { ALARM_LIMITS } from '@unlease/clock/models/alarm';
import { linkedOccurrence, offDaysFrom } from '@unlease/clock/services/agenda';
import { blankDraft, draftChanged, draftOf, type AlarmDraft } from '@unlease/clock/services/editing';
import { DEFAULT_BEFORE, draftRing, linkedDraft, retimedDraft, ringsInWords } from '@unlease/clock/services/editor';
import { isOn, nextRing, skippedDay } from '@unlease/clock/services/schedule';
import { SILENT, soundName } from '@unlease/clock/services/sounds';
import { useNow } from '@app/hooks/useNow';
import { useRingingAlarms } from '@app/hooks/useRingingAlarms';
import { later } from '@app/later';
import { askNotificationsOnce } from '@app/permissions';
import { createAlarm, deleteAlarm, saveAlarm, skipNext, unskip } from '@app/store/actions';
import { selectPrefs, useClockUiStore } from '@app/store/clockUi';
import { useLibraryStore } from '@app/store/libraryStore';
import { selectWorkDays, useSettingsStore } from '@shared/app/store/settingsStore';

import { AppText, Button, Ground, Icon, ListRow, RevealScrollView, TextField, TopBar, useUnsaved } from '@shared/ui/components';
import { SwitchRow } from '@shared/ui/features/appearance/SwitchRow';
import { Section } from '@shared/ui/features/settings/Section';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { DayToggles } from '../features/editor/DayToggles';
import { EventLinkPanel } from '../features/editor/EventLinkPanel';
import { SoundSheet } from '../features/editor/SoundSheet';
import { TimeWheels } from '../features/editor/TimeWheels';
import type { ScreenProps } from '../navigation/types';

export function EditAlarmScreen({ navigation, route }: ScreenProps<'Edit'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const editing = route.params?.id ?? null;
  const handed = route.params?.handed ?? null;
  const asked = route.params?.event ? { eventId: route.params.event, eventStart: route.params.occurrence ?? '', at: Number(route.params.at), title: route.params.title ?? '' } : null;
  const prefs = useClockUiStore(selectPrefs);
  const workDays = useSettingsStore(selectWorkDays);
  // As it rings: an alarm for an event at that event's time now.
  const ringing = useRingingAlarms();
  const alarm = editing ? ringing[editing] : undefined;
  const events = useLibraryStore(s => s.events);
  const now = useNow();
  // What it opened on: the alarm, a draft handed (another app's « set an alarm », the home's « Ajouter une alarme » for a morning's event), an Agenda event to wake up for, or a new one with this phone's defaults.
  const [blank] = useState(() => blankDraft(prefs));
  const [initial] = useState<AlarmDraft>(() => {
    if (alarm) return draftOf(alarm);
    if (asked) {
      // The event as this phone has it, else as Agenda handed it (not synced here yet).
      const startAt = linkedOccurrence(asked, events)?.startAt ?? asked.at;
      if (Number.isFinite(startAt)) {
        // An hour before, or less when the event is near: never a ring already gone by.
        const before = Math.max(0, Math.min(DEFAULT_BEFORE, Math.floor((startAt - Date.now()) / 60_000) - 5));
        return linkedDraft({ ...blank, label: asked.title.trim().slice(0, ALARM_LIMITS.label) }, asked, startAt, before);
      }
    }
    return handed ?? blank;
  });
  const [draft, setDraft] = useState<AlarmDraft>(initial);
  const [picking, setPicking] = useState(false);
  const saved = useRef(false);

  const dirty = draftChanged(alarm ?? null, draft, blank);
  const unsaved = useUnsaved(dirty, { screen: true });
  const markSaved = unsaved.saved;

  // An alarm deleted elsewhere (or one that never was here) while the editor is open: nothing left to edit.
  const gone = editing !== null && (!alarm || alarm.deletedAt !== null);
  useEffect(() => {
    if (!gone || saved.current) return;
    markSaved();
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.reset({ index: 0, routes: [{ name: 'Alarms' }] });
  }, [gone, navigation, markSaved]);

  const update = <K extends keyof AlarmDraft>(key: K, value: AlarmDraft[K]): void => setDraft(before => ({ ...before, [key]: value }));
  // The event this alarm is for, as this phone has it now (moved since, its new time).
  const occurrence = useMemo(() => (draft.link ? linkedOccurrence(draft.link, events) : null), [draft.link, events]);
  const eventStart = occurrence?.startAt ?? (asked && Number.isFinite(asked.at) ? asked.at : null);
  const eventStartRef = useRef(eventStart);
  eventStartRef.current = eventStart;
  // An alarm for an event stays for it when its wheels turn: it rings that much earlier or later before it.
  const onTime = useMemo(() => (time: string) => setDraft(before => retimedDraft(before, time, eventStartRef.current)), []);
  const onDays = useMemo(() => (days: number[]) => setDraft(before => ({ ...before, days })), []);

  const leave = (): void => {
    saved.current = true;
    markSaved();
    navigation.goBack();
  };
  const save = (): void => {
    if (editing) saveAlarm(editing, draft);
    else createAlarm(draft);
    // Without the notifications, Android 13 and later show no ringing screen: asked once, as the first alarm is saved.
    later(askNotificationsOnce());
    leave();
  };
  const remove = (): void => {
    if (!editing) return;
    deleteAlarm(editing);
    leave();
  };

  // Agenda's holidays and days off, which a repeating alarm that asks for it skips.
  const quiet = useMemo(() => offDaysFrom({ events: Object.values(events), feeds: [] }, addDays(instantToDay(now), -1)), [events, now]);
  const ring = draftRing(draft, now, '', quiet);
  // « Ignorer la prochaine » acts on the alarm as saved: a repeating one, on, with a ring to come.
  const live = alarm && alarm.deletedAt === null ? alarm : null;
  const skipped = live ? skippedDay(live, now) : null;
  const skippable = live && live.days.length > 0 && isOn(live, now) ? nextRing(live, now) : null;
  const silentAndStill = draft.sound === SILENT && !draft.vibrate;

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={editing ? t('Edit alarm') : t('New alarm')} closes onBack={() => navigation.goBack()} actions={<Button label={t('Save')} small onPress={save} style={styles.saveButton} />} />
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <RevealScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.when}>
            <TimeWheels time={draft.time} twelveHours={prefs.twelveHours} onTime={onTime} />
            <AppText variant="body" color={theme.color.inkMuted} style={styles.until} accessibilityLiveRegion="polite">
              {ring ? ringsInWords(ring.at, now) : ' '}
            </AppText>
          </View>

          {draft.link ? (
            <EventLinkPanel
              title={occurrence?.event.title ?? (asked?.title || draft.label)}
              when={eventStart !== null ? `${weekdayDay(instantToWall(eventStart, '').slice(0, 10))}, ${clockWords(instantToWall(eventStart, '').slice(11, 16), prefs.twelveHours)}` : ''}
              before={draft.link.before}
              onBefore={minutes => setDraft(before => (before.link && eventStart !== null ? linkedDraft(before, before.link, eventStart, minutes) : before))}
              onUnlink={() => update('link', null)}
            />
          ) : (
            <DayToggles days={draft.days} weekStart={prefs.weekStart} workDays={workDays} onDays={onDays} />
          )}

          <TextField
            kind="text"
            label={t('Label')}
            value={draft.label}
            onChangeText={value => update('label', value)}
            maxLength={ALARM_LIMITS.label}
            help={t('Shown as it rings, such as “Train to Lyon”.')}
            returnKeyType="done"
          />

          <Section>
            {!draft.link && draft.days.length > 0 ? (
              <SwitchRow
                leading={<Icon name="bellOff" size={24} color={theme.color.ink} />}
                title={t('Not on holidays and days off')}
                supporting={t('From Agenda: its public holidays and your days off.')}
                value={draft.offDays}
                onChange={value => update('offDays', value)}
              />
            ) : null}
            <ListRow icon="music" title={t('Sound')} supporting={soundName(draft.sound)} onPress={() => setPicking(true)} trailing={<Icon name="chevronRight" size={20} color={theme.color.inkMuted} />} />
            <SwitchRow
              leading={<Icon name="phone" size={24} color={theme.color.ink} />}
              title={t('Vibrate')}
              supporting={silentAndStill ? t('Silent and without vibration, it only shows on the screen.') : undefined}
              value={draft.vibrate}
              onChange={value => update('vibrate', value)}
            />
            <SwitchRow leading={<Icon name="sun" size={24} color={theme.color.ink} />} title={t('Weather as it rings')} value={draft.weather} onChange={value => update('weather', value)} />
            <SwitchRow leading={<Icon name="today" size={24} color={theme.color.ink} />} title={t('The day’s events as it rings')} value={draft.agenda} onChange={value => update('agenda', value)} />
            {live && skipped ? (
              <ListRow icon="bell" title={t('Stop skipping')} supporting={t('It won’t ring on {day}', { day: weekdayDay(skipped) })} onPress={() => unskip(live.id)} />
            ) : live && skippable ? (
              <ListRow icon="bellOff" title={t('Skip the next one ({day})', { day: weekdayDay(skippable.day) })} supporting={t('It rings again the time after.')} onPress={() => skipNext(live.id)} />
            ) : null}
          </Section>

          {editing ? <Button label={t('Delete')} kind="dangerText" icon="trash" onPress={remove} style={styles.delete} /> : null}
        </RevealScrollView>
      </KeyboardAvoidingView>

      <SoundSheet visible={picking} sound={draft.sound} onSound={sound => update('sound', sound)} onDismiss={() => setPicking(false)} />
      {unsaved.dialog}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    fill: { flex: 1 },
    content: { padding: 16, paddingBottom: 64, gap: 24 },
    saveButton: { marginRight: 8 },
    when: { gap: 8, paddingTop: 4 },
    until: { textAlign: 'center' },
    delete: { alignSelf: 'flex-start' },
  });
