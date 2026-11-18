/**
 * A timer's form: « Nouveau minuteur » (from the timers' pebble, the launcher's shortcut, the widget's
 * « + ») or a saved timer's (its card). Its length typed on the keypad as on a microwave, with the
 * lengths started lately (or the usual ones) one tap away above it; a label (« Pâtes »); what it rings
 * with. At its foot, « Démarrer » starts it now, and a new one is gone once it has rung (an instant
 * timer, nothing kept); « Enregistrer » keeps it among the saved timers for next time. A saved
 * timer's form saves its changes, and starts it as changed; « Supprimer » takes it away.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { t, tc } from '@unlease/core/i18n';
import { TIMER_LIMITS } from '@unlease/clock/models/timer';
import { SILENT, soundName } from '@unlease/clock/services/sounds';
import { digitsOf, eraseDigit, keypadSeconds, lengthWords, quickLengths, typeDigits } from '@unlease/clock/services/timers';
import { later } from '@app/later';
import { askNotificationsOnce } from '@app/permissions';
import { createTimer, deleteTimer, saveTimer, type TimerDraft } from '@app/store/actions';
import { selectPrefs, useClockUiStore } from '@app/store/clockUi';
import { useLibraryStore } from '@app/store/libraryStore';
import { startTimer, useToolsStore } from '@app/store/toolsStore';

import { AppText, Button, FormFoot, Ground, Icon, ListRow, RevealScrollView, Tappable, TextField, TopBar, useUnsaved } from '@shared/ui/components';
import { SwitchRow } from '@shared/ui/features/appearance/SwitchRow';
import { Section } from '@shared/ui/features/settings/Section';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { SHAPES } from '@unlease/design/shapes';
import { SoundSheet } from '../features/editor/SoundSheet';
import { Keypad, LengthDisplay } from '../features/timers/Keypad';
import type { ScreenProps } from '../navigation/types';

export function TimerScreen({ navigation, route }: ScreenProps<'Timer'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const editing = route.params?.id ?? null;
  const prefs = useClockUiStore(selectPrefs);
  const timer = useLibraryStore(state => (editing ? state.timers[editing] : undefined));
  const recent = useToolsStore(state => state.recent);
  const [initial] = useState(() => ({
    digits: timer ? digitsOf(timer.seconds) : '',
    label: timer?.label ?? '',
    sound: timer?.sound ?? prefs.timerSound,
    vibrate: timer?.vibrate ?? prefs.timerVibrate,
  }));
  const [digits, setDigits] = useState(initial.digits);
  const [label, setLabel] = useState(initial.label);
  const [sound, setSound] = useState(initial.sound);
  const [vibrate, setVibrate] = useState(initial.vibrate);
  const [picking, setPicking] = useState(false);
  const left = useRef(false);

  const seconds = keypadSeconds(digits);
  const draft: TimerDraft = { label, seconds, sound, vibrate };
  const dirty = editing !== null && (digits !== initial.digits || label !== initial.label || sound !== initial.sound || vibrate !== initial.vibrate);
  const unsaved = useUnsaved(dirty, { screen: true });
  const markSaved = unsaved.saved;

  // A saved timer deleted elsewhere while its form is open: nothing left to edit.
  const gone = editing !== null && (!timer || timer.deletedAt !== null);
  useEffect(() => {
    if (!gone || left.current) return;
    markSaved();
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.reset({ index: 0, routes: [{ name: 'Alarms', params: { tab: 'timers' } }] });
  }, [gone, navigation, markSaved]);

  const leave = (): void => {
    left.current = true;
    markSaved();
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.reset({ index: 0, routes: [{ name: 'Alarms', params: { tab: 'timers' } }] });
  };
  const save = (): string | null => {
    if (seconds <= 0) return null;
    if (editing) {
      saveTimer(editing, draft);
      return editing;
    }
    return createTimer(draft);
  };
  const start = (): void => {
    if (seconds <= 0) return;
    // A saved timer starts as changed (and keeps the change); a new one runs once, with what was typed.
    const id = editing ? save() : null;
    const saved = id ? useLibraryStore.getState().timers[id] : undefined;
    if (saved) startTimer({ seconds, timer: saved });
    else startTimer({ seconds, label: label.trim(), sound, vibrate });
    // Without the notifications, Android 13 and later show no ringing window: asked once, as the first timer starts.
    later(askNotificationsOnce());
    leave();
  };
  const keep = (): void => {
    if (!save()) return;
    leave();
  };
  const remove = (): void => {
    if (!editing) return;
    deleteTimer(editing);
    leave();
  };

  const quick = useMemo(() => quickLengths(recent), [recent]);
  const silentAndStill = sound === SILENT && !vibrate;

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={editing ? t('Edit timer') : t('New timer')} closes onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <RevealScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <LengthDisplay digits={digits} />
          {editing ? null : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick} accessibilityLabel={t('Usual lengths')}>
              {quick.map(length => {
                const chosen = seconds === length;
                return (
                  <Tappable key={length} onPress={() => setDigits(digitsOf(length))} accessibilityRole="button" accessibilityState={{ selected: chosen }} style={[styles.chip, chosen && styles.chipChosen]}>
                    <AppText variant={chosen ? 'labelStrong' : 'label'} color={chosen ? theme.color.onActionContainer : theme.color.ink}>
                      {lengthWords(length)}
                    </AppText>
                  </Tappable>
                );
              })}
            </ScrollView>
          )}
          <Keypad empty={digits === ''} onKey={key => setDigits(before => typeDigits(before, key))} onErase={() => setDigits(eraseDigit)} onClear={() => setDigits('')} />

          <TextField
            kind="text"
            label={t('Label')}
            optional
            value={label}
            onChangeText={setLabel}
            maxLength={TIMER_LIMITS.label}
            placeholder={t('Pasta, green tea…')}
            returnKeyType="done"
          />

          <Section>
            <ListRow icon="music" title={t('Sound')} supporting={soundName(sound)} onPress={() => setPicking(true)} trailing={<Icon name="chevronRight" size={20} color={theme.color.inkMuted} />} />
            <SwitchRow
              leading={<Icon name="phone" size={24} color={theme.color.ink} />}
              title={t('Vibrate')}
              supporting={silentAndStill ? t('Silent and without vibration, it only shows on the screen.') : undefined}
              value={vibrate}
              onChange={setVibrate}
            />
          </Section>

          {editing ? <Button label={t('Delete')} kind="dangerText" icon="trash" onPress={remove} style={styles.delete} /> : null}
        </RevealScrollView>
        <FormFoot screen>
          <Button kind="tonal" label={editing ? t('Save') : t('Save for later')} disabled={seconds <= 0} onPress={keep} />
          <Button icon="go" label={tc('timer', 'Start')} disabled={seconds <= 0} onPress={start} />
        </FormFoot>
      </KeyboardAvoidingView>

      <SoundSheet visible={picking} sound={sound} onSound={setSound} onDismiss={() => setPicking(false)} title={t('Timer sound')} />
      {unsaved.dialog}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    fill: { flex: 1 },
    content: { padding: 16, paddingBottom: 32, gap: 20 },
    quick: { gap: 8, paddingHorizontal: 2 },
    chip: { minHeight: 40, paddingHorizontal: 16, justifyContent: 'center', borderWidth: 1, borderColor: theme.color.edge, ...corners(SHAPES.chip) },
    chipChosen: { backgroundColor: theme.color.actionContainer, borderColor: theme.color.actionContainer },
    delete: { alignSelf: 'flex-start' },
  });
