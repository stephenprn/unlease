/**
 * First run ("Mise en route"), short on purpose (`core/services/setup.ts`, shared with the web):
 * connect to the server, or keep the notes on this phone; how the app looks here (Carnet's own,
 * kept with "Passer"); then, on a server that held nothing when this phone came, "Votre serveur":
 * what the Administration sets, one row each, every one optional and opened from its row. Reopened
 * mid-setup, it resumes after the server.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Linking, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Keyframe, LayoutAnimationConfig } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';

import { SELF_HOSTING_GUIDE } from '@unlease/core/apps';
import { APP_NAME } from '@unlease/notes/brand';
import { DEFAULT_APPEARANCE, isDefaultAppearance } from '@unlease/design/appearance';
import { PAGES_ASK_INFO } from '@unlease/notes/services/pagesAsk';
import { SHAPES } from '@unlease/design/shapes';
import { LOCALE_NAMES, t } from '@unlease/core/i18n';
import {
  connectFailureField,
  connectFailureMessage,
  nextSetupStep,
  previousSetupStep,
  serverEmpty,
  SETUP_TASK_WORDS,
  SETUP_WORDS,
  setupChecklistShown,
  setupForward,
  setupProgress,
  setupStartedEmpty,
  setupTaskForward,
  setupTaskLine,
  setupTasks,
  setupTaskSet,
  setupSteps,
  type SetupStep,
  type SetupTask,
  type SetupTaskLine,
} from '@unlease/core/services/setup';
import { useAdmin, useBackups } from '@app/hooks/useAdmin';
import { useMinute } from '@app/hooks/useMinute';
import { selectAppearance, selectLocale, selectReading, selectServer, setAppearance, setInterfaceLocale, setOnboarded, setReading, setServer, useSettingsStore } from '@app/store/settingsStore';
import { checkServer, fetchAdminStatus, SyncError } from '@app/sync/transport';
import { startSync, stopSync } from '@app/sync/syncManager';

import { AppText, Button, Collage, Dialog, Ground, Icon, ListRow, Tappable, TextField } from '../components';
import { useKeyboardVisible } from '../components/useKeyboardVisible';
import { BACKUP_INFO, BackupSection } from '../features/admin/BackupSection';
import { ColorsSection, GroundSection, useAppearanceEditors } from '../features/appearance/AppearanceSections';
import { DRIVE_INFO, DriveSection } from '../features/admin/DriveSection';
import type { AdminOverlays, Confirmation } from '../features/admin/overlays';
import { SEERR_INFO, SeerrSection } from '../features/admin/SeerrSection';
import { SecretField } from '../features/admin/SecretField';
import { SetupRestore } from '../features/admin/SetupRestore';
import { toneColor } from '../features/admin/StatusRow';
import { InfoBubble, InfoButton, useInfoBubble } from '../features/settings/InfoBubble';
import { PagesAskSection } from '../features/admin/PagesAskSection';
import { ReadingSection } from '../features/settings/ReadingSection';
import { Section } from '../features/settings/Section';
import { BrandMark } from '../icons/BrandMark';
import type { ScreenProps } from '../navigation/types';
import { decelerate, duration } from '../theme/motion';
import { corners } from '../theme/shape';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';

/** Every step in order, a row opened from "Votre serveur" one deeper: to tell going on from going back. */
const ORDER: readonly SetupStep[] = ['server', 'appearance', 'checklist'];
const depth = (step: SetupStep, task: SetupTask | null): number => ORDER.indexOf(step) * 2 + (task ? 1 : 0);

/** A step comes in with a short shift and a fade, from the left going back. */
const stepIn = (from: number) =>
  new Keyframe({ 0: { opacity: 0, transform: [{ translateX: from }] }, 100: { opacity: 1, transform: [{ translateX: 0 }], easing: decelerate } }).duration(duration.medium);
const STEP_ON = stepIn(24);
const STEP_BACK = stepIn(-24);

const INFO: Partial<Record<SetupTask, string>> = { backup: BACKUP_INFO, drive: DRIVE_INFO, seerr: SEERR_INFO };

interface Place {
  readonly step: SetupStep;
  /** A row of "Votre serveur" opened. */
  readonly task: SetupTask | null;
  readonly back: boolean;
}

export function SetupScreen({ navigation }: ScreenProps<'Setup'>) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const server = useSettingsStore(selectServer);
  const reading = useSettingsStore(selectReading);
  const appearance = useSettingsStore(selectAppearance);
  const { editColor, editGradient, editors } = useAppearanceEditors();
  const focused = useIsFocused();
  const now = useMinute();
  const keyboard = useKeyboardVisible();
  const admin = useAdmin(server, focused);
  // Reopened mid-setup (a server, not yet onboarded): back after the server.
  const [place, setPlace] = useState<Place>({ step: server ? 'appearance' : 'server', task: null, back: false });
  // Whether the server held nothing when this phone connected; null until known.
  const [startedEmpty, setStartedEmpty] = useState<boolean | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const { step, task } = place;
  // Once on "Votre serveur" it stays a step, whatever is set there.
  const steps = setupSteps(server !== null, setupChecklistShown(server !== null, startedEmpty) || step === 'checklist');
  const backups = useBackups(server, admin.settings?.backup.configured === true, admin.backupsVersion, focused && task === 'restore');

  // Resumed: the server's first status says whether it started empty.
  useEffect(() => {
    if (startedEmpty === null && admin.status) setStartedEmpty(setupStartedEmpty(admin.status));
  }, [startedEmpty, admin.status]);

  const { reload } = admin;
  const go = useCallback(
    (next: SetupStep, opened: SetupTask | null = null) => {
      setPlace(current => ({ step: next, task: opened, back: depth(next, opened) < depth(current.step, current.task) }));
      // What a row changed shows on the list (and the list's rows on what they open).
      if (next !== 'server') reload();
    },
    [reload],
  );

  const index = steps.indexOf(step);
  const last = index === steps.length - 1;
  const previous = previousSetupStep(steps, step);
  // A restore running holds the setup on its list or its own view; another row opened meanwhile still goes back to the list.
  const held = admin.status?.restore.running === true && step === 'checklist' && (task === null || task === 'restore');
  useFocusEffect(
    useCallback(() => {
      if (step === 'server') return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (held) return true;
        if (task) go('checklist');
        else go(previous);
        return true;
      });
      return () => subscription.remove();
    }, [step, task, previous, held, go]),
  );

  const finish = () => {
    setOnboarded();
    navigation.reset({ index: 0, routes: [{ name: 'Board' }] });
  };

  // The setup's sections list no snapshot and restore nothing: its own row does.
  const overlays: AdminOverlays = { ask: setConfirmation, openSnapshot: () => undefined, restore: () => undefined };

  const unavailable = <ListRow icon="info" title={t('Réglages du serveur indisponibles')} supporting={admin.unavailable ? t('Le serveur ne répond pas pour l’instant.') : t('Lecture des réglages du serveur…')} onPress={admin.reload} />;

  const body = (): React.ReactNode => {
    // How the app looks here needs no server.
    if (step === 'appearance') {
      return (
        <>
          <ColorsSection onEdit={editColor} />
          <GroundSection onEditColor={() => editColor('ground')} onEditGradient={editGradient} />
          {/* Back to Carnet's own; what the person made stays among their own grounds. */}
          {isDefaultAppearance(appearance) ? null : (
            <Button
              kind="text"
              icon="undo"
              label={t('Revenir à l’apparence d’origine')}
              onPress={() => setAppearance({ ...DEFAULT_APPEARANCE, ownColor: appearance.ownColor, ownGradient: appearance.ownGradient })}
              style={styles.reset}
            />
          )}
        </>
      );
    }
    if (!server) return null;
    switch (task) {
      case null:
        return (
          <Section>
            {admin.settings
              ? setupTasks(startedEmpty === true).map(each => <TaskRow key={each} line={setupTaskLine(each, admin.settings, admin.status)} onPress={() => go('checklist', each)} />)
              : unavailable}
          </Section>
        );
      case 'backup':
        return <Section>{admin.settings ? <BackupSection setup server={server} admin={admin} backups={backups} overlays={overlays} now={now} /> : unavailable}</Section>;
      case 'restore':
        return <SetupRestore server={server} admin={admin} backups={backups} now={now} onSetBackup={() => go('checklist', 'backup')} />;
      case 'drive':
        return <Section>{admin.settings ? <DriveSection server={server} admin={admin} overlays={overlays} now={now} /> : unavailable}</Section>;
      case 'reading':
        return (
          <>
            <Section>
              <ReadingSection server={server} ask={overlays.ask} />
            </Section>
            <Section title={t('Questions sur les pages')} info={PAGES_ASK_INFO}>
              {admin.settings ? <PagesAskSection server={server} admin={admin} /> : unavailable}
            </Section>
          </>
        );
      case 'seerr':
        return <Section>{admin.settings ? <SeerrSection server={server} admin={admin} overlays={overlays} /> : unavailable}</Section>;
    }
  };

  const foot = (): React.ReactNode => {
    if (task) {
      // The reading's section keeps its own copy of the settings; the store hears what it saves.
      const set = task === 'reading' ? reading === true : setupTaskSet(task, admin.settings, admin.status);
      return (
        <>
          <Button kind="text" label={t('Retour')} disabled={held} onPress={() => go('checklist')} />
          <Button kind={set ? 'filled' : 'tonal'} label={setupTaskForward(set)} disabled={held} onPress={() => go('checklist')} />
        </>
      );
    }
    const set = step === 'appearance' ? !isDefaultAppearance(appearance) : true;
    return (
      <>
        <Button kind="text" label={t('Retour')} disabled={held} onPress={() => go(previous)} />
        {last ? (
          <Button icon="check" label={setupForward(true, true)} disabled={held} onPress={finish} />
        ) : (
          <Button kind={set ? 'filled' : 'tonal'} label={setupForward(set, false)} onPress={() => go(nextSetupStep(steps, step))} />
        )}
      </>
    );
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <Ground />
      <LayoutAnimationConfig skipExiting>
        {step === 'server' ? (
          <Welcome
            onConnected={empty => {
              setStartedEmpty(empty);
              go('appearance');
            }}
            onLater={() => go('appearance')}
          />
        ) : (
          // Scrolls below the status bar, not under it (the ground still lies behind the bar).
          <ScrollView key={`${step}:${task ?? ''}`} style={{ marginTop: insets.top }} contentContainerStyle={[styles.content, { paddingTop: 24 }]} keyboardShouldPersistTaps="handled">
            <Animated.View entering={place.back ? STEP_BACK : STEP_ON} style={styles.step}>
              <StepHead steps={steps} step={step} task={task} />
              {body()}
            </Animated.View>
          </ScrollView>
        )}
      </LayoutAnimationConfig>

      {step !== 'server' && !keyboard ? <View style={[styles.foot, { paddingBottom: insets.bottom + 12 }]}>{foot()}</View> : null}

      <Dialog
        visible={confirmation !== null}
        title={confirmation?.title ?? ''}
        message={confirmation?.message}
        confirmLabel={confirmation?.confirmLabel ?? ''}
        danger={confirmation?.danger}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          const run = confirmation?.run;
          setConfirmation(null);
          run?.();
        }}
      />

      {editors}
    </KeyboardAvoidingView>
  );
}

/** A row of "Votre serveur": its state's dot, what it is, what it holds now (or would do), the way in. */
function TaskRow({ line, onPress }: { line: SetupTaskLine; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <Tappable onPress={onPress} accessibilityLabel={line.title} accessibilityValue={{ text: line.meta }} style={styles.task}>
      <View style={[styles.taskDot, { backgroundColor: toneColor(theme, line.tone) }]} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{line.title}</AppText>
        <AppText variant="meta">{line.meta}</AppText>
      </View>
      <Icon name="chevronRight" size={20} color={theme.color.inkMuted} />
    </Tappable>
  );
}

/** Where the setup stands, the title of the step or of the row opened (with its "how it works" when it has one), and what it is for. */
function StepHead({ steps, step, task }: { steps: readonly SetupStep[]; step: SetupStep; task: SetupTask | null }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const bubble = useInfoBubble();
  const words = task ? SETUP_TASK_WORDS[task] : SETUP_WORDS[step];
  const info = task ? INFO[task] : undefined;
  const index = steps.indexOf(step);
  return (
    <View style={styles.head}>
      <View style={styles.progress} accessible accessibilityLabel={t('{progress} : {step}', { progress: setupProgress(steps, step), step: SETUP_WORDS[step].short })}>
        <AppText variant="metaStrong">{setupProgress(steps, step)}</AppText>
        <View style={styles.marks}>
          {steps.map((each, at) => (
            <View key={each} style={styles.mark}>
              <View style={[styles.dot, { backgroundColor: at <= index ? theme.color.focus : theme.color.edge }]} />
              <AppText variant="labelSmall" color={each === step ? theme.color.ink : theme.color.inkMuted}>
                {SETUP_WORDS[each].short}
              </AppText>
            </View>
          ))}
        </View>
      </View>
      <View>
        <View style={styles.titleRow}>
          <AppText variant="title" accessibilityRole="header" style={styles.flex}>
            {words.title}
          </AppText>
          {info ? <InfoButton open={bubble.open} label={bubble.open ? t('Masquer l’explication') : t('Comment ça marche')} onPress={bubble.toggle} /> : null}
        </View>
        {info && bubble.open ? <InfoBubble text={t(info)} /> : null}
      </View>
      <AppText variant="body" color={theme.color.inkMuted}>
        {words.lead}
      </AppText>
    </View>
  );
}

/**
 * The welcome: the brand, the interface's language, and the one decision: connect to the server
 * (its address and its token), or keep the notes on this phone. Connected, it reads whether the
 * server holds anything before this device sends a thing. Keeping the notes here leaves no server
 * behind.
 */
function Welcome({ onConnected, onLater }: { onConnected: (startedEmpty: boolean) => void; onLater: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const server = useSettingsStore(selectServer);
  const locale = useSettingsStore(selectLocale);
  const other = locale === 'fr' ? 'en' : 'fr';
  const [url, setUrl] = useState(server?.url ?? '');
  const [token, setToken] = useState(server?.token ?? '');
  const [busy, setBusy] = useState(false);
  // A failure says what went wrong under the field it points at, and keeps what was typed.
  const [error, setError] = useState<{ readonly field: 'address' | 'token'; readonly message: string } | null>(null);

  const connect = async () => {
    setBusy(true);
    setError(null);
    const address = url.trim().replace(/\/+$/, '');
    const config = { url: /^https?:\/\//.test(address) ? address : `https://${address}`, token: token.trim() };
    try {
      const health = await checkServer(config);
      const status = await fetchAdminStatus(config);
      setServer(config);
      setReading(health.analysis);
      startSync();
      onConnected(serverEmpty(status));
    } catch (failure) {
      const message = failure instanceof Error ? t(failure.message) : t('Serveur injoignable');
      if (failure instanceof SyncError) setError({ field: connectFailureField(failure.kind, failure.status), message: connectFailureMessage(failure.kind, message) });
      else setError({ field: 'address', message });
    } finally {
      setBusy(false);
    }
  };

  const later = () => {
    // Back here once connected: staying on the phone lets the server go.
    if (server) {
      stopSync();
      setServer(null);
      startSync();
    }
    onLater();
  };

  return (
    <ScrollView style={{ marginTop: insets.top }} contentContainerStyle={[styles.welcome, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
      {/* The interface's language, named in itself. */}
      <View style={styles.language}>
        <Button kind="text" icon="globe" label={LOCALE_NAMES[other]} onPress={() => setInterfaceLocale(other)} />
      </View>
      <View style={styles.brand}>
        <BrandMark size={72} />
        <AppText variant="display">{APP_NAME}</AppText>
        <AppText variant="body" style={styles.tagline}>
          {SETUP_WORDS.server.lead}
        </AppText>
      </View>
      <Collage scene="welcome" width={264} />
      <View style={styles.form}>
        <TextField
          label={t('Adresse du serveur')}
          value={url}
          onChangeText={value => {
            setUrl(value);
            if (error?.field === 'address') setError(null);
          }}
          help={t('Par exemple https://carnet.exemple.fr')}
          error={error?.field === 'address' ? error.message : null}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <SecretField
          label={t('Jeton')}
          value={token}
          onChangeText={value => {
            setToken(value);
            if (error?.field === 'token') setError(null);
          }}
          what={t('le jeton')}
          help={t('Le jeton défini dans UNLEASE_TOKEN sur le serveur.')}
          error={error?.field === 'token' ? error.message : null}
        />
        <Button label={t('Se connecter')} icon="server" busy={busy} disabled={!url.trim() || !token.trim()} onPress={connect} style={styles.submit} />
        <View style={styles.local}>
          <Button kind="text" label={t('Garder mes notes sur ce téléphone')} onPress={later} />
          <AppText variant="meta" style={styles.center}>
            {t('Vous pourrez relier un serveur plus tard, dans les Réglages.')}
          </AppText>
        </View>
      </View>
      <View style={styles.guide}>
        <AppText variant="meta">{t('Pas encore de serveur ?')}</AppText>
        <Button kind="text" small label={t('Le guide d’installation')} onPress={() => void Linking.openURL(SELF_HOSTING_GUIDE)} />
      </View>
    </ScrollView>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    welcome: { paddingHorizontal: 24, paddingTop: 8, gap: 24, alignItems: 'center' },
    language: { alignSelf: 'flex-end', marginRight: -12 },
    brand: { alignItems: 'center', gap: 8 },
    tagline: { textAlign: 'center', color: theme.color.inkMuted, maxWidth: 320 },
    form: { alignSelf: 'stretch', gap: 16 },
    submit: { alignSelf: 'stretch' },
    local: { alignItems: 'center', gap: 2 },
    center: { textAlign: 'center' },
    guide: { alignItems: 'center' },
    content: { padding: 12, paddingBottom: 32 },
    step: { gap: 20 },
    // In line with what the panels hold (16 in from their edge).
    head: { paddingHorizontal: 16, gap: 12 },
    progress: { gap: 8 },
    marks: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
    mark: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 6, height: 6, ...corners(SHAPES.dot) },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44 },
    flex: { flex: 1 },
    // A list row's shape (inset 6, its press cut like a tab), its dot on the title's 23 dp line.
    task: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 6, paddingHorizontal: 10, paddingVertical: 10, ...corners(SHAPES.tab) },
    taskDot: { width: 10, height: 10, alignSelf: 'flex-start', marginTop: 6.5, ...corners(SHAPES.dot) },
    foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.color.hairline },
    reset: { alignSelf: 'center' },
  });
