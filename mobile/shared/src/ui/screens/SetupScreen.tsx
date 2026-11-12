/**
 * The first run, every app's (`core/services/setup.ts`, shared with the web), short on purpose and
 * parameterised by the app this phone is (`app`):
 *
 * 1. The welcome: the app's brand and what it does, the interface's language, and one decision:
 *    connect to the server (when a sibling app on this phone is connected, « Utiliser la connexion
 *    de Carnet » does it in one tap), or keep everything on this phone.
 * 2. On a server whose own setup is not done: « Vos applications » (which apps it runs, this one
 *    locked on, the announced ones « Bientôt disponible »; saved at once), then « Votre serveur »
 *    (what the Administration sets, only what the chosen apps use, each row optional and opened on
 *    its own, every field saying where its value comes from).
 * 3. How the apps look on this phone (started from the sibling's colours when there is one).
 *
 * « Commencer » marks the server set up, so the next device goes from its colours to its app.
 * Reopened mid-setup, it resumes after the welcome.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Linking, StyleSheet, View } from 'react-native';
import Animated, { Keyframe, LayoutAnimationConfig } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';

import { APPS, SELF_HOSTING_GUIDE, type AppId } from '@unlease/core/apps';
import { DEFAULT_APPEARANCE, isDefaultAppearance } from '@unlease/design/appearance';
import { GEOMETRY } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import { LOCALE_NAMES, t } from '@unlease/core/i18n';
import {
  connectFailureField,
  connectFailureMessage,
  nextSetupStep,
  previousSetupStep,
  serverEmpty,
  SETUP_WORDS,
  setupAppChoices,
  setupFieldHelp,
  setupForward,
  setupImportShown,
  setupProgress,
  setupRestored,
  setupServerShown,
  setupStartedEmpty,
  setupSteps,
  setupTaskForward,
  setupTaskLine,
  setupTasks,
  setupTaskSet,
  setupTaskWords,
  setupWelcomeLead,
  siblingAppearanceNote,
  siblingConnectionWords,
  toggleSetupApp,
  type SetupAppChoice,
  type SetupStep,
  type SetupTask,
  type SetupTaskLine,
} from '@unlease/core/services/setup';
import { setupImportLead } from '@unlease/core/services/importFlow';
import type { AdminStatus } from '@unlease/core/sync/admin';
import { useAdmin, useBackups } from '@shared/app/hooks/useAdmin';
import { useMinute } from '@shared/app/hooks/useMinute';
import { selectAppearance, selectLocale, selectServer, setAppearance, setInterfaceLocale, setOnboarded, setReading, setServer, setServerApps, useSettingsStore, type ServerConfig } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';
import { connectedSibling, findSiblings, type Sibling } from '@shared/app/suiteLink';
import { checkServer, fetchAdminStatus, saveServerSettings, SyncError, type Health } from '@shared/app/sync/transport';
import { startSync, stopSync } from '@shared/app/sync/syncManager';

import { AppText, Button, Collage, Dialog, EdgeScrollView, footEdge, FormMessage, Ground, Icon, ListRow, Organic, PanelTappable, placedRow, TextField, useForm, type RowPlace } from '../components';
import { useKeyboardVisible } from '../components/useKeyboardVisible';
import { BACKUP_INFO, BackupSection } from '../features/admin/BackupSection';
import { ClaudeSection, type ClaudeExtra } from '../features/admin/ClaudeSection';
import { ColorsSection, GroundSection, useAppearanceEditors } from '../features/appearance/AppearanceSections';
import { DRIVE_INFO, DriveSection } from '../features/admin/DriveSection';
import type { AdminOverlays, Confirmation } from '../features/admin/overlays';
import type { AppAdminSection } from './AdminScreen';
import { SEERR_INFO, SeerrSection } from '../features/admin/SeerrSection';
import { HOLIDAYS_INFO, HolidaysSection } from '../features/admin/HolidaysSection';
import { SetupRestore } from '../features/admin/SetupRestore';
import { ImportHost, type ImportWizardProps } from '../features/importing/ImportFlow';
import { toneColor } from '../features/admin/StatusRow';
import { InfoBubble, InfoButton, useInfoBubble } from '../features/settings/InfoBubble';
import { Section } from '../features/settings/Section';
import { BrandMark } from '../icons/BrandMark';
import { decelerate, duration } from '../theme/motion';
import { corners } from '../theme/shape';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';

/** Every step in order, a row opened from "Votre serveur" one deeper: to tell going on from going back. */
const ORDER: readonly SetupStep[] = ['server', 'apps', 'checklist', 'import', 'appearance'];
const depth = (step: SetupStep, task: SetupTask | null): number => ORDER.indexOf(step) * 2 + (task ? 1 : 0);

/** A step comes in with a short shift and a fade, from the left going back. */
const stepIn = (from: number) =>
  new Keyframe({ 0: { opacity: 0, transform: [{ translateX: from }] }, 100: { opacity: 1, transform: [{ translateX: 0 }], easing: decelerate } }).duration(duration.medium);
const STEP_ON = stepIn(24);
const STEP_BACK = stepIn(-24);

const NO_APPS: readonly AppId[] = [];

const INFO: Partial<Record<SetupTask, string>> = { backup: BACKUP_INFO, drive: DRIVE_INFO, seerr: SEERR_INFO, holidays: HOLIDAYS_INFO };

interface Place {
  readonly step: SetupStep;
  /** A row of "Votre serveur" opened. */
  readonly task: SetupTask | null;
  readonly back: boolean;
}

export interface SetupScreenProps {
  /** The app this phone is: its brand on the welcome, locked on among the apps. */
  readonly app: AppId;
  /** The setup is over: the app opens. */
  readonly onDone: () => void;
  /** The app's part of the Claude form (Carnet's cost per link). */
  readonly claudeExtra?: ClaudeExtra;
  /** The app's own Administration sections: those it asks Claude for (`claude`, Pages' questions) follow Claude's key, as on the web. */
  readonly appSections?: readonly AppAdminSection[];
  /** The app's import (`core/services/importFlow`), offered as a step while the app holds nothing. */
  readonly importer?: SetupImporter;
}

/** An app's import, as the first run offers it. */
export interface SetupImporter {
  /** What it reads, named (« Google Keep »), for the step's lead. */
  readonly source: () => string;
  readonly Wizard: React.ComponentType<ImportWizardProps>;
}

export function SetupScreen({ app, onDone, claudeExtra, appSections, importer }: SetupScreenProps) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const server = useSettingsStore(selectServer);
  const appearance = useSettingsStore(selectAppearance);
  const { editColor, editGradient, editors } = useAppearanceEditors();
  const focused = useIsFocused();
  const now = useMinute();
  const keyboard = useKeyboardVisible();
  const admin = useAdmin(server, focused);
  // Reopened mid-setup (a server, not yet onboarded): back after the welcome, once the server says where.
  const [place, setPlace] = useState<Place>({ step: server ? 'appearance' : 'server', task: null, back: false });
  const resumed = useRef(server !== null);
  // Whether the server held nothing when this phone connected; null until known.
  const [startedEmpty, setStartedEmpty] = useState<boolean | null>(null);
  // Whether the server's own setup is done; null until it has said (its health on connecting, its settings on resuming).
  const [serverDone, setServerDone] = useState<boolean | null>(null);
  // Once this phone sets the server up, its steps stay, whatever is set there.
  const [settingUp, setSettingUp] = useState(false);
  const [siblings, setSiblings] = useState<readonly Sibling[]>([]);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const serverSetup = settingUp || setupServerShown(server !== null, serverDone);
  // Whether the app's import is offered, decided once its records are counted (none yet: offered), kept for the whole setup.
  const [importOffer, setImportOffer] = useState<{ readonly url: string | null; readonly shown: boolean } | null>(null);
  const offered = setupImportShown(app, importer !== undefined, server !== null, admin.status);
  const offerKey = server?.url ?? null;
  useEffect(() => {
    if (offered !== null && importOffer?.url !== offerKey) setImportOffer({ url: offerKey, shown: offered });
  }, [offered, offerKey, importOffer]);
  // Not counted yet, while the import step is the one asked for: it waits there rather than flashing the next one.
  const importPending = importer !== undefined && importOffer?.url !== offerKey;
  // A backup brought back during this setup holds the app's data already: nothing to import.
  const importShown = !setupRestored(admin.status) && ((importOffer?.url === offerKey && importOffer.shown) || (importPending && place.step === 'import'));
  // The import's wizard is past its first step: its own foot leads.
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const steps = setupSteps(server !== null, serverSetup, importShown);
  // A step this setup turned out not to have (the import, for an app that holds something): on to the next one there is.
  const step = steps.includes(place.step) ? place.step : place.step === 'server' ? 'server' : 'appearance';
  const task = step === place.step ? place.task : null;
  const enabled = admin.settings?.apps.enabled ?? NO_APPS;
  const backups = useBackups(server, admin.settings?.backup.configured === true, admin.backupsVersion, focused && task === 'restore');

  // The suite's other apps on this phone: a connection to offer, colours to start from.
  useEffect(() => {
    let live = true;
    findSiblings(app).then(found => live && setSiblings(found));
    return () => {
      live = false;
    };
  }, [app]);

  useEffect(() => {
    if (serverSetup && !settingUp) setSettingUp(true);
  }, [serverSetup, settingUp]);

  // Resumed: the server's first status says whether it started empty, its settings whether its setup is done.
  useEffect(() => {
    if (startedEmpty === null && admin.status) setStartedEmpty(setupStartedEmpty(admin.status));
  }, [startedEmpty, admin.status]);
  useEffect(() => {
    if (serverDone === null && admin.settings) setServerDone(admin.settings.setup.done);
  }, [serverDone, admin.settings]);

  const { reload } = admin;
  const go = useCallback(
    (next: SetupStep, opened: SetupTask | null = null) => {
      resumed.current = false;
      setPlace(current => ({ step: next, task: opened, back: depth(next, opened) < depth(current.step, current.task) }));
      // What a row changed shows on the list (and the list's rows on what they open).
      if (next !== 'server') reload();
    },
    [reload],
  );

  // Resumed on a server still to set up: its apps come first.
  useEffect(() => {
    if (resumed.current && serverDone === false && place.step === 'appearance') go('apps');
  }, [serverDone, place.step, go]);

  // This phone's app is on: the server runs it from the start.
  const ownSaved = useRef(false);
  useEffect(() => {
    if (step !== 'apps' || !server || !admin.settings || ownSaved.current || enabled.includes(app)) return;
    ownSaved.current = true;
    saveServerSettings(server, { apps: [...enabled, app] }).then(admin.setSettings, () => undefined);
  }, [step, server, admin.settings, admin.setSettings, enabled, app]);

  // The appearance starts from a sibling's, once, when this phone's is still the original.
  const sibling = siblings.find(each => each.appearance !== null && !isDefaultAppearance(each.appearance));
  const [fromSibling, setFromSibling] = useState<AppId | null>(null);
  const tookSibling = useRef(false);
  useEffect(() => {
    if (step !== 'appearance' || tookSibling.current || !sibling?.appearance) return;
    tookSibling.current = true;
    if (!isDefaultAppearance(useSettingsStore.getState().appearance)) return;
    setAppearance(sibling.appearance);
    setFromSibling(sibling.app);
  }, [step, sibling]);

  const index = steps.indexOf(step);
  const last = index === steps.length - 1;
  const previous = previousSetupStep(steps, step);
  // A restore running holds the setup on its list or its own view; another row opened meanwhile still goes back to the list.
  const held = admin.status?.restore.running === true && step === 'checklist' && (task === null || task === 'restore');
  useFocusEffect(
    useCallback(() => {
      if (step === 'server') return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        // The import's wizard goes back a step itself.
        if (step === 'import' && importing) return false;
        if (held) return true;
        if (task) go('checklist');
        else go(previous);
        return true;
      });
      return () => subscription.remove();
    }, [step, task, previous, held, go, importing]),
  );

  const [finishing, setFinishing] = useState(false);
  const finish = async () => {
    // Set up once for every device: the next one goes from its colours to its app.
    if (server && settingUp) {
      setFinishing(true);
      try {
        admin.setSettings(await saveServerSettings(server, { setupDone: true }));
      } catch {
        showSnack(t('Le serveur n’a pas noté la mise en route : le prochain appareil la reverra.'), undefined, { tone: 'warning' });
      } finally {
        setFinishing(false);
      }
    }
    setOnboarded();
    onDone();
  };

  // The setup's sections list no snapshot and restore nothing: its own row does.
  const overlays: AdminOverlays = { ask: setConfirmation, openSnapshot: () => undefined, restore: () => undefined };

  const unavailable = <ListRow icon="info" title={t('Réglages du serveur indisponibles')} supporting={admin.unavailable ? t('Le serveur ne répond pas pour l’instant.') : t('Lecture des réglages du serveur…')} onPress={admin.reload} />;

  const [savingApp, setSavingApp] = useState<AppId | null>(null);
  const toggleApp = async (id: AppId) => {
    if (!server) return;
    const next = toggleSetupApp(enabled, id, app);
    if (next === enabled) return;
    setSavingApp(id);
    try {
      admin.setSettings(await saveServerSettings(server, { apps: [...next] }));
    } catch (failure) {
      showSnack(failure instanceof Error ? t(failure.message) : t('Réglage refusé'), undefined, { tone: 'error' });
    } finally {
      setSavingApp(null);
    }
  };

  const body = (): React.ReactNode => {
    // How the apps look here needs no server.
    if (step === 'appearance') {
      return (
        <>
          {fromSibling ? <AppText variant="meta" style={styles.note}>{siblingAppearanceNote(fromSibling)}</AppText> : null}
          <ColorsSection onEdit={editColor} />
          <GroundSection onEditColor={() => editColor('ground')} onEditGradient={editGradient} />
          {/* Back to the suite's own; what the person made stays among their own grounds. */}
          {isDefaultAppearance(appearance) ? null : (
            <Button
              kind="text"
              icon="undo"
              label={t('Revenir à l’apparence d’origine')}
              onPress={() => {
                setFromSibling(null);
                setAppearance({ ...DEFAULT_APPEARANCE, ownColor: appearance.ownColor, ownGradient: appearance.ownGradient });
              }}
              style={styles.reset}
            />
          )}
        </>
      );
    }
    if (step === 'import') return importPending ? <AppText variant="meta" style={styles.note}>{t('Lecture de vos données…')}</AppText> : null;
    if (!server) return null;
    if (step === 'apps') {
      const shownApps = enabled.includes(app) ? enabled : [...enabled, app];
      return (
        <Section>
          {admin.settings
            ? setupAppChoices(shownApps, app).map(choice => (
                // The last app on stays (`toggleSetupApp`).
                <AppCard key={choice.id} choice={choice} last={choice.checked && shownApps.length === 1} busy={savingApp === choice.id} onPress={() => void toggleApp(choice.id)} />
              ))
            : unavailable}
        </Section>
      );
    }
    switch (task) {
      case null:
        return (
          <Section>
            {admin.settings
              ? setupTasks(startedEmpty === true, enabled).map(each => <TaskRow key={each} line={setupTaskLine(each, admin.settings, admin.status)} onPress={() => go('checklist', each)} />)
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
        // Claude's key once, for every app; then what this app asks of it (Pages' questions).
        return (
          <>
            <Section>
              <ClaudeSection server={server} ask={overlays.ask} extra={claudeExtra} />
            </Section>
            {(appSections ?? [])
              .filter(each => each.claude)
              .map(each => (
                <Section key={each.id} title={each.title()} info={each.info}>
                  {admin.settings ? each.render({ server, admin, overlays, unavailable }) : unavailable}
                </Section>
              ))}
          </>
        );
      case 'seerr':
        return <Section>{admin.settings ? <SeerrSection server={server} admin={admin} overlays={overlays} /> : unavailable}</Section>;
      case 'holidays':
        return <Section>{admin.settings ? <HolidaysSection server={server} admin={admin} /> : unavailable}</Section>;
    }
  };

  const foot = (): React.ReactNode => {
    if (task) {
      // The Claude form keeps its own copy of the settings; the store hears what it saves.
      const set = task === 'reading' ? useSettingsStore.getState().reading === true : setupTaskSet(task, admin.settings, admin.status);
      return (
        <>
          <Button kind="text" label={t('Retour')} disabled={held} onPress={() => go('checklist')} />
          <Button kind={set ? 'filled' : 'tonal'} label={setupTaskForward(set)} disabled={held} onPress={() => go('checklist')} />
        </>
      );
    }
    const set = step === 'appearance' ? !isDefaultAppearance(appearance) : step === 'import' ? imported : true;
    return (
      <>
        <Button kind="text" label={t('Retour')} disabled={held} onPress={() => go(previous)} />
        {last ? (
          <Button icon="check" label={setupForward(step, true, true)} busy={finishing} disabled={held} onPress={() => void finish()} />
        ) : (
          <Button kind={set ? 'filled' : 'tonal'} label={setupForward(step, set, false)} onPress={() => go(nextSetupStep(steps, step))} />
        )}
      </>
    );
  };

  const connected = (empty: boolean, health: Health) => {
    setStartedEmpty(empty);
    // An older server knows no setup of its own: it counts as done.
    const done = health.setup !== false;
    setServerDone(done);
    setServerApps(health.apps);
    // A server set up already: the import when the app holds nothing there, else straight to the look.
    go(done ? 'import' : 'apps');
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <Ground />
      <LayoutAnimationConfig skipExiting>
        {step === 'server' ? (
          <Welcome app={app} siblings={siblings} onConnected={connected} onLater={() => go('import')} />
        ) : step === 'import' && importer && !importPending ? (
          // The wizard is the step's whole body: the setup's head above its title, the setup's foot under its first and last steps.
          <Animated.View key="import" entering={place.back ? STEP_BACK : STEP_ON} style={styles.fill}>
            <ImportHost value={{ embedded: true, head: <StepHead app={app} steps={steps} step={step} task={null} status={admin.status} importSource={importer.source()} />, foot: foot(), top: insets.top }}>
              <importer.Wizard
                onFlow={setImporting}
                onImported={() => setImported(true)}
              />
            </ImportHost>
          </Animated.View>
        ) : (
          // Scrolls below the status bar, not under it (the ground still lies behind the bar).
          <EdgeScrollView key={`${step}:${task ?? ''}`} style={{ marginTop: insets.top }} contentContainerStyle={[styles.content, { paddingTop: 24 }]} keyboardShouldPersistTaps="handled">
            <Animated.View entering={place.back ? STEP_BACK : STEP_ON} style={styles.step}>
              <StepHead app={app} steps={steps} step={step} task={task} status={admin.status} />
              {body()}
            </Animated.View>
          </EdgeScrollView>
        )}
      </LayoutAnimationConfig>

      {step !== 'server' && !(step === 'import' && importer && !importPending) && !keyboard ? <View style={[styles.foot, { paddingBottom: insets.bottom + 12 }]}>{foot()}</View> : null}

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

/**
 * One app of the suite on « Vos applications », as on the web: its mark, its name over the Google app
 * it replaces (« Cette application » for this phone's own, ticked for good; « Bientôt disponible »
 * for an announced one, which takes no tick), what it does, and its box at the end (ink when open,
 * the second ink ticked, never matcha). The last app on stays, and says why.
 */
function AppCard({ choice, last, busy, onPress, place }: { choice: SetupAppChoice; last: boolean; busy: boolean; onPress: () => void; place?: RowPlace | null }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const fixed = choice.soon || choice.locked || last;
  return (
    <PanelTappable
      place={place}
      onPress={fixed || busy ? undefined : onPress}
      disabled={fixed || busy}
      // This phone's app and the last one on read as chosen, not faded; an announced one fades once (`soon`).
      ownDisabled={fixed}
      accessibilityRole="checkbox"
      accessibilityLabel={choice.name}
      accessibilityState={{ checked: choice.checked, disabled: fixed, busy }}
      style={[styles.app, choice.soon ? styles.soon : null]}
    >
      <BrandMark app={choice.id} size={44} />
      <View style={styles.appText}>
        <View style={styles.appHead}>
          <AppText variant="title">{choice.name}</AppText>
          <AppText variant="meta">{choice.soon ? t('Bientôt disponible') : choice.locked ? t('Cette application') : choice.replaces}</AppText>
        </View>
        <AppText variant="body">{choice.description}</AppText>
        {last && !choice.locked ? <AppText variant="meta">{t('Le serveur fait toujours tourner au moins une application.')}</AppText> : null}
      </View>
      {choice.soon ? null : (
        <View style={styles.appBox}>
          <Icon name={choice.checked ? 'boxChecked' : 'box'} size={26} color={choice.checked ? theme.color.inkMuted : theme.color.ink} />
        </View>
      )}
    </PanelTappable>
  );
}

/** A row of "Votre serveur": its state's dot, what it is, what it holds now (or would do), the way in. */
function TaskRow({ line, onPress, place }: { line: SetupTaskLine; onPress: () => void; place?: RowPlace | null }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <PanelTappable place={place} onPress={onPress} accessibilityLabel={line.title} accessibilityValue={{ text: line.meta }} style={styles.task}>
      <View style={[styles.taskDot, { backgroundColor: toneColor(theme, line.tone) }]} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{line.title}</AppText>
        <AppText variant="meta">{line.meta}</AppText>
      </View>
      <Icon name="chevronRight" size={20} color={theme.color.inkMuted} />
    </PanelTappable>
  );
}

// Their sheet tells its first and last where they lie.
placedRow(AppCard);
placedRow(TaskRow);

/**
 * Where the setup stands (the app's mark and name over « Mise en route · Étape n sur m », as on the
 * web, then the steps), the title of the step or of the row opened (with its "how it works" when it
 * has one), and what it is for.
 */
function StepHead({ app, steps, step, task, status, importSource }: { app: AppId; steps: readonly SetupStep[]; step: SetupStep; task: SetupTask | null; status: AdminStatus | null; importSource?: string }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const bubble = useInfoBubble();
  const words = task ? setupTaskWords(task, status) : step === 'import' && importSource ? { ...SETUP_WORDS.import, lead: setupImportLead(importSource) } : SETUP_WORDS[step];
  const info = task ? INFO[task] : undefined;
  const index = steps.indexOf(step);
  return (
    <View style={styles.head}>
      <View style={styles.progress} accessible accessibilityLabel={t('{progress} : {step}', { progress: `${APPS[app].name} · ${t('Mise en route · {progress}', { progress: setupProgress(steps, step) })}`, step: SETUP_WORDS[step].short })}>
        <View style={styles.headBrand}>
          <BrandMark app={app} size={28} />
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{APPS[app].name}</AppText>
            <AppText variant="meta" color={theme.color.inkMuted}>
              {t('Mise en route · {progress}', { progress: setupProgress(steps, step) })}
            </AppText>
          </View>
        </View>
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
 * The welcome: the app's brand and what it does, the interface's language, and the one decision:
 * connect to the server (its address and its token, each saying where it comes from; or, when a
 * sibling app on this phone is connected, its connection in one tap), or keep everything on this
 * phone. Connected, it reads whether the server holds anything before this device sends a thing.
 * Keeping everything here leaves no server behind.
 */
function Welcome({ app, siblings, onConnected, onLater }: { app: AppId; siblings: readonly Sibling[]; onConnected: (startedEmpty: boolean, health: Health) => void; onLater: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const server = useSettingsStore(selectServer);
  const locale = useSettingsStore(selectLocale);
  const other = locale === 'fr' ? 'en' : 'fr';
  const [url, setUrl] = useState(server?.url ?? '');
  const [token, setToken] = useState(server?.token ?? '');
  const [siblingBusy, setSiblingBusy] = useState(false);
  const sibling = connectedSibling(siblings);

  const typed = (): ServerConfig => {
    const address = url.trim().replace(/\/+$/, '');
    return { url: /^https?:\/\//.test(address) ? address : `https://${address}`, token: token.trim() };
  };

  // A failure says what went wrong under the field it points at (`fail`), and keeps what was typed.
  // The keyboard goes from the address to the token, whose « OK » connects.
  const form = useForm(
    {
      address: url.trim() ? null : t('Saisissez l’adresse de votre serveur.'),
      token: token.trim() ? null : t('Saisissez le jeton de votre serveur.'),
    },
    { order: ['address', 'token'], sendOnDone: () => connect(typed()) },
  );

  async function connect(config: ServerConfig, fromSibling = false): Promise<boolean> {
    try {
      const health = await checkServer(config);
      const status = await fetchAdminStatus(config);
      setServer(config);
      setReading(health.analysis);
      startSync();
      onConnected(serverEmpty(status), health);
      return true;
    } catch (failure) {
      const message = failure instanceof Error ? t(failure.message) : t('Serveur injoignable');
      // The sibling's address lands in the fields, for the failure to point at.
      if (fromSibling) {
        setUrl(config.url);
        setToken(config.token);
      }
      if (failure instanceof SyncError) form.fail(connectFailureField(failure.kind, failure.status), connectFailureMessage(failure.kind, message));
      else form.fail('address', message);
      return false;
    }
  }

  const later = () => {
    // Back here once connected: staying on the phone lets the server go.
    if (server) {
      stopSync();
      setServer(null);
      startSync();
    }
    onLater();
  };

  const words = sibling ? siblingConnectionWords(sibling.app, sibling.server.url) : null;

  return (
    <EdgeScrollView style={{ marginTop: insets.top }} contentContainerStyle={[styles.welcome, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
      {/* The interface's language, named in itself. */}
      <View style={styles.language}>
        <Button kind="text" icon="globe" label={LOCALE_NAMES[other]} onPress={() => setInterfaceLocale(other)} />
      </View>
      <View style={styles.brand}>
        <BrandMark app={app} size={72} />
        <AppText variant="display">{APPS[app].name}</AppText>
        <AppText variant="body" style={styles.tagline}>
          {setupWelcomeLead(app)}
        </AppText>
      </View>
      <Collage scene="welcome" width={264} />
      {sibling && words ? (
        <Organic outline="card" style={[styles.sibling, { backgroundColor: theme.color.paperHigh }]}>
          <AppText variant="body">{words.note}</AppText>
          <Button
            label={words.action}
            icon="link"
            busy={siblingBusy}
            disabled={form.busy}
            onPress={() => {
              setSiblingBusy(true);
              void connect(sibling.server, true).finally(() => setSiblingBusy(false));
            }}
            style={styles.submit}
          />
        </Organic>
      ) : null}
      <View style={styles.form}>
        <TextField label={t('Adresse du serveur')} kind="serverAddress" value={url} onChangeText={setUrl} field={form.field('address')} help={setupFieldHelp('address')} />
        <TextField
          label={t('Jeton')}
          kind="serverToken"
          value={token}
          onChangeText={setToken}
          field={form.field('token')}
          help={setupFieldHelp('token')}
          revealLabels={{ show: t('Afficher le jeton'), hide: t('Masquer le jeton') }}
        />
        <FormMessage message={form.message} />
        <Button
          kind={sibling ? 'tonal' : 'filled'}
          label={t('Se connecter')}
          icon="server"
          busy={form.busy}
          disabled={siblingBusy}
          onPress={() => void form.submit(() => connect(typed()))}
          style={styles.submit}
        />
        <View style={styles.local}>
          <Button kind="text" label={t('Tout garder sur ce téléphone')} onPress={later} style={styles.centered} />
          <AppText variant="meta" style={styles.center}>
            {t('Vous pourrez relier un serveur plus tard, dans l’Administration.')}
          </AppText>
        </View>
      </View>
      <View style={styles.guide}>
        <AppText variant="meta">{t('Pas encore de serveur ?')}</AppText>
        <Button kind="text" small label={t('Le guide d’installation')} onPress={() => void Linking.openURL(SELF_HOSTING_GUIDE)} />
      </View>
    </EdgeScrollView>
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
    // A button sits at its line's start: this one stands centred, as the lines around it.
    centered: { alignSelf: 'center' },
    guide: { alignItems: 'center' },
    content: { padding: 12, paddingBottom: 32 },
    step: { gap: 20 },
    // In line with what the panels hold (16 in from their edge).
    head: { paddingHorizontal: 16, gap: 12 },
    progress: { gap: 12 },
    // The app's mark and name, the progress under the name (the web's on a phone-sized window).
    headBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    marks: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
    mark: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 6, height: 6, ...corners(SHAPES.dot) },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44 },
    flex: { flex: 1 },
    // A list row's shape (inset 6, its press cut like a tab), its dot on the title's 23 dp line.
    task: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 6, paddingHorizontal: 10, paddingVertical: 10, marginVertical: GEOMETRY.rowGap / 2, ...corners(SHAPES.tab) },
    taskDot: { width: 10, height: 10, alignSelf: 'flex-start', marginTop: 6.5, ...corners(SHAPES.dot) },
    // Under a footer's edge, as a form's foot (`FormFoot`).
    foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 12, ...footEdge(theme) },
    reset: { alignSelf: 'center' },
    fill: { flex: 1 },
    note: { paddingHorizontal: 16 },
    sibling: { alignSelf: 'stretch', gap: 12, padding: 16 },
    // A card of « Vos applications »: a list row's inset and press cut, the app's mark leading, its box at the end.
    app: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginHorizontal: 6, paddingHorizontal: 10, paddingVertical: 14, marginVertical: GEOMETRY.rowGap / 2, ...corners(SHAPES.tab) },
    soon: { opacity: 0.72 },
    appText: { flex: 1, gap: 4 },
    appHead: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 10, rowGap: 2 },
    appBox: { marginTop: 2 },
  });
