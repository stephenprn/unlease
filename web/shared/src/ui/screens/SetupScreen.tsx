/**
 * The suite's first run (the phone's SetupScreen, `core/services/setup`), one thing per step:
 *
 * 1. the welcome: the suite's brand, the language, and connecting to the server (its address filled
 *    in when the server serves this page, its token), or keeping everything in this browser;
 * 2. on a server whose own setup is not done: « Vos applications » (which apps it runs, saved at
 *    once), then « Votre serveur » (what the Administration sets, only what those apps use, each row
 *    optional and opened on its own: the backup to bring back first when the server held nothing,
 *    Claude once for every app, S3, Seafile, Seerr);
 * 3. how the apps look in this browser (kept with « Garder l’apparence d’origine »).
 *
 * « Commencer » marks the server set up, so the next device goes from its colours straight to its
 * app. Reopened halfway, it resumes after the welcome.
 */
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';

import { APPS, SELF_HOSTING_GUIDE, type AppId } from '@unlease/core/apps';
import { DEFAULT_APPEARANCE, isDefaultAppearance } from '@unlease/design/appearance';
import { pebbleTurn } from '@unlease/design/pebbles';
import { LOCALE_NAMES, t } from '@unlease/core/i18n';
import { formatMoment, restoreSummary, thawingLine, snapshotMeta } from '@unlease/core/services/admin';
import {
  connectFailureField,
  connectFailureMessage,
  connectionProblem,
  nextSetupStep,
  previousSetupStep,
  SETUP_RESTORE_WORDS,
  SETUP_WORDS,
  setupAppChoices,
  setupFieldHelp,
  setupForward,
  setupNoBackupsMeta,
  setupProgress,
  setupServerShown,
  setupStartedEmpty,
  setupTaskForward,
  setupTaskLine,
  setupTasks,
  setupTaskSet,
  setupTaskWords,
  setupSteps,
  setupWelcomeLead,
  toggleSetupApp,
  type SetupAppChoice,
  type SetupStep,
  type SetupTask,
} from '@unlease/core/services/setup';
import type { ServerSettings } from '@unlease/core/sync/settings';

import { useMinute } from '../../app/hooks/useMinute';
import { selectServerSettings, setServerHealth, setServerSettings, useServerSettingsStore } from '../../app/store/serverSettings';
import { normalizeServer, selectAppearance, selectLocale, selectServer, setAppearance, setInterfaceLocale, setOnboarded, setServer, useSettingsStore, type ServerConfig } from '../../app/store/settings';
import { showError } from '../../app/store/ui';
import { startSync, stopSync } from '../../app/sync/loop';
import { checkServer, restoreFile, restoreSnapshot, saveServerSettings, servedByServer, SyncError } from '../../app/sync/transport';
import { theApp } from '../../modules';
import { BrandMark } from '../components/BrandMark';
import { Button } from '../components/Button';
import { Collage } from '../components/Collage';
import { settleIn } from '../components/EmptyLine';
import { ColorsSection, GroundSection } from '../features/appearance/AppearanceSections';
import { Icon } from '../components/Icon';
import { OutlinedBox, OutlineLift, PebbleEdge, useOutline } from '../components/Outline';
import { FormMessage } from '../components/FormMessage';
import { TextField } from '../components/TextField';
import { useForm } from '../components/useForm';
import { saveApps } from '../features/settings/AppsSection';
import { BACKUP_INFO, BackupSection } from '../features/settings/BackupSection';
import { ClaudeSection } from '../features/settings/ClaudeSection';
import { DRIVE_INFO, DriveSection } from '../features/settings/DriveSection';
import { InfoBubble, InfoButton, useInfoBubble } from '../features/settings/InfoBubble';
import { Section, StatusRow, toneColor } from '../features/settings/Section';
import settingsStyles from '../features/settings/settings.module.css';
import { useAdmin, useBackups, type Admin } from '../features/settings/useAdmin';
import { AppMark } from '../navigation/AppBrand';
import styles from './screens.module.css';

interface Place {
  readonly step: SetupStep;
  /** A row of "Votre serveur" opened. */
  readonly task: SetupTask | null;
}

/** The setup's tasks that belong to one app (Carnet's Seerr, Agenda's holidays): its own web app sets them up. */
const APP_TASKS: readonly SetupTask[] = ['seerr', 'holidays'];

/** The server's own setup is done, as last heard (its settings, else its health); null until known. */
function useServerDone(): boolean | null {
  return useServerSettingsStore(s => s.settings?.setup.done ?? s.health?.setup ?? null);
}

export function SetupScreen() {
  const server = useSettingsStore(selectServer);
  const appearance = useSettingsStore(selectAppearance);
  const settings = useServerSettingsStore(selectServerSettings);
  const serverDone = useServerDone();
  const admin = useAdmin(server);
  const app = theApp();
  const [place, setPlace] = useState<Place>({ step: server ? 'apps' : 'server', task: null });
  const [finishing, setFinishing] = useState(false);
  // Whether the server held nothing when this browser came, as first heard: kept for the whole setup, so its restore stays while it runs.
  const [startedEmpty, setStartedEmpty] = useState<{ readonly url: string; readonly empty: boolean } | null>(null);
  const status = admin.status;
  if (server && status && startedEmpty?.url !== server.url) setStartedEmpty({ url: server.url, empty: setupStartedEmpty(status) });
  const empty = server && startedEmpty?.url === server.url ? startedEmpty.empty : null;

  // The server's steps while its setup is not done (or not known yet); a device joining one set up skips them.
  const steps = setupSteps(server !== null, setupServerShown(server !== null, serverDone));
  // A step the server turned out to have done already: on to the next one there is.
  const step = steps.includes(place.step) ? place.step : place.step === 'server' ? 'server' : 'appearance';
  const task = step === place.step ? place.task : null;
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const go = (next: SetupStep, opened: SetupTask | null = null): void => {
    setPlace({ step: next, task: opened });
    window.scrollTo?.({ top: 0 });
    // The new step's title is where a screen reader and the keyboard carry on.
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  };

  if (step === 'server') {
    return <Welcome initial={server} onNext={done => go(done === false ? 'apps' : 'appearance')} />;
  }

  const index = steps.indexOf(step);
  const last = index === steps.length - 1;
  const words = task ? setupTaskWords(task, status) : SETUP_WORDS[step];
  const restoring = status?.restore.running === true;
  // What the server sets waits for its settings; the appearance does not.
  const ready = server !== null && settings !== null;
  const enabled = settings?.apps.enabled ?? [app.id];
  // This app's own forms: another app's task (Carnet's Seerr, set up from Pages) waits for that app's setup.
  const forms = app.adminSections ?? [];
  // A row opened is the page's one sheet: its "how it works" stands by the page's title.
  const info = task === 'backup' ? BACKUP_INFO : task === 'drive' ? DRIVE_INFO : task ? forms.find(form => form.task === task)?.info : undefined;

  /** « Commencer »: the server is set up for every device that comes next, then the app opens. */
  const finish = async (): Promise<void> => {
    if (server && steps.includes('apps')) {
      setFinishing(true);
      try {
        setServerSettings(await saveServerSettings(server, { setupDone: true }));
      } catch (failure) {
        // Not kept on the server: the next device will see these steps again, nothing else is lost.
        showError(failure instanceof Error ? t(failure.message) : t('Réglage refusé'));
      } finally {
        setFinishing(false);
      }
    }
    setOnboarded();
  };

  const body = (): ReactNode => {
    if (step === 'appearance') {
      return (
        <>
          <ColorsSection />
          <GroundSection />
          {isDefaultAppearance(appearance) ? null : (
            <Button kind="text" icon="undo" className={styles.setupReset} onClick={() => setAppearance({ ...DEFAULT_APPEARANCE, ownColor: appearance.ownColor, ownGradient: appearance.ownGradient })}>
              {t('Revenir à l’apparence d’origine')}
            </Button>
          )}
        </>
      );
    }
    if (!ready) return <p className="t-meta">{t('Lecture des réglages du serveur…')}</p>;
    if (step === 'apps') return <AppsStep server={server} settings={settings} />;
    switch (task) {
      case null:
        return (
          <OutlinedBox kind="panel" lift="card" className={settingsStyles.card}>
            <ul className={styles.setupTasks} aria-label={SETUP_WORDS.checklist.title}>
              {setupTasks(empty === true, enabled)
                .filter(each => !APP_TASKS.includes(each) || forms.some(form => form.task === each))
                .map(each => {
                const line = setupTaskLine(each, settings, status);
                return (
                  <li key={each}>
                    <button type="button" className={settingsStyles.row} onClick={() => go('checklist', each)}>
                      <span className={`${settingsStyles.dot} ${styles.setupTaskDot}`} style={{ '--dot': toneColor(line.tone) } as CSSProperties} aria-hidden="true" />
                      <span className={settingsStyles.rowText}>
                        <span className="t-body-strong">{line.title}</span>
                        <span className="t-meta">{line.meta}</span>
                      </span>
                      <Icon name="chevronRight" size={20} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </OutlinedBox>
        );
      case 'backup':
        return (
          <Section labelledBy={headingId}>
            <BackupSection key={server.url} server={server} backup={settings.backup} admin={admin} setup />
          </Section>
        );
      case 'restore':
        return (
          <Section labelledBy={headingId}>
            <RestoreStep server={server} settings={settings} admin={admin} onSetBackup={() => go('checklist', 'backup')} />
          </Section>
        );
      case 'drive':
        return (
          <Section labelledBy={headingId}>
            <DriveSection key={server.url} server={server} drive={settings.drive} admin={admin} />
          </Section>
        );
      case 'reading':
        // Claude's key once, for every app; then what an app asks of it (Pages' questions).
        return (
          <>
            <Section labelledBy={headingId}>
              <ClaudeSection key={server.url} server={server} onConnect={() => go('server')} />
            </Section>
            {forms
              .filter(form => form.claude)
              .map(({ id, title, info, Body }) => (
                <Section key={id} title={title()} info={info}>
                  <Body key={server.url} server={server} settings={settings} />
                </Section>
              ))}
          </>
        );
      default: {
        // An app's own task (Carnet's Seerr): its Administration section.
        const form = forms.find(each => each.task === task);
        if (!form) return null;
        const { Body } = form;
        return (
          <Section labelledBy={headingId}>
            <Body key={server.url} server={server} settings={settings} />
          </Section>
        );
      }
    }
  };

  const nav = (): ReactNode => {
    if (task) {
      // A row opened: both ways lead back to the list; a restore running holds the setup still.
      const held = task === 'restore' && restoring;
      const set = setupTaskSet(task, settings, status);
      return (
        <>
          <Button kind="text" icon="back" onClick={() => go('checklist')} disabled={held}>
            {t('Retour')}
          </Button>
          <Button kind={set ? 'filled' : 'tonal'} onClick={() => go('checklist')} disabled={held}>
            {setupTaskForward(set)}
          </Button>
        </>
      );
    }
    const set = step === 'appearance' ? !isDefaultAppearance(appearance) : true;
    return (
      <>
        <Button kind="text" icon="back" onClick={() => go(previousSetupStep(steps, step))} disabled={restoring}>
          {t('Retour')}
        </Button>
        {last ? (
          <Button icon="check" onClick={() => void finish()} busy={finishing} disabled={restoring}>
            {setupForward(step, true, true)}
          </Button>
        ) : (
          <Button kind={set ? 'filled' : 'tonal'} onClick={() => go(nextSetupStep(steps, step))}>
            {setupForward(step, set, false)}
          </Button>
        )}
      </>
    );
  };

  return (
    <main className={styles.setupFlow}>
      <header className={styles.setupHead}>
        <div className={styles.setupHeadBrand}>
          <BrandMark app={theApp().id} size={28} />
          <span className="t-body-strong">{APPS[theApp().id].name}</span>
          {/* The trail under it shows which step this is: the count is said, not shown twice. */}
          <span className={`${styles.setupHeadProgress} t-meta`}>
            {t('Mise en route')}
            <span className="sr-only">{` · ${setupProgress(steps, step)}`}</span>
          </span>
        </div>
        {/* The way through, a stone per step on one thread: ticked once done, a leaf at the step open, bare ahead. */}
        <ol className={styles.setupTrail} aria-label={t('Étapes')} style={{ '--steps': steps.length } as CSSProperties}>
          {steps.map((entry, position) => {
            const state = position < index ? 'done' : position === index ? 'here' : 'ahead';
            return (
              <li key={entry} data-state={state} aria-current={state === 'here' ? 'step' : undefined}>
                <span className={styles.setupStone} aria-hidden="true">
                  <span className={styles.setupStoneFill} data-pebble={pebbleTurn(position)} data-still>
                    {state === 'done' ? <Icon name="check" size={16} /> : state === 'here' ? <span className={styles.setupStoneLeaf} data-pebble={pebbleTurn(position + 2)} data-still /> : null}
                  </span>
                  {state === 'done' ? null : <PebbleEdge turn={pebbleTurn(position)} />}
                </span>
                <span className={state === 'here' ? 't-meta-strong' : 't-meta'}>
                  {SETUP_WORDS[entry].short}
                  {state === 'done' ? <span className="sr-only">{` · ${t('Fait')}`}</span> : null}
                </span>
              </li>
            );
          })}
        </ol>
      </header>

      <SetupIntro key={task ?? step} id={headingId} heading={heading} title={words.title} lead={words.lead} info={info} />

      {body()}

      <nav className={styles.setupNav} aria-label={t('Mise en route')}>
        {nav()}
      </nav>
    </main>
  );
}

/** The step's or the row's title, with the row's "how it works" beside it when it has one, and what it is for. */
function SetupIntro({ id, heading, title, lead, info }: { id: string; heading: RefObject<HTMLHeadingElement | null>; title: string; lead: string; info: string | undefined }) {
  const bubble = useInfoBubble();
  return (
    <div className={styles.setupIntro}>
      <div className={styles.setupIntroTitle}>
        <h1 ref={heading} id={id} tabIndex={-1} className="t-title">
          {title}
        </h1>
        {info ? <InfoButton open={bubble.open} bubble={bubble.id} onClick={bubble.toggle} /> : null}
      </div>
      {/* `info` may be a French constant (`tx`): read in the interface's language. */}
      {info ? <InfoBubble id={bubble.id} open={bubble.open} text={t(info)} /> : null}
      <p className="t-body">{lead}</p>
    </div>
  );
}

/**
 * « Vos applications »: one card per app of the suite, ready ones ticked as the server runs them,
 * announced ones shown with « Bientôt disponible » and not tickable. Each tick is saved at once; the
 * last app on stays.
 */
function AppsStep({ server, settings }: { server: ServerConfig; settings: ServerSettings }) {
  const [busy, setBusy] = useState<AppId | null>(null);
  const enabled = settings.apps.enabled;
  const own = theApp().id;
  const choices = setupAppChoices(enabled, own);
  const toggle = async (choice: SetupAppChoice): Promise<void> => {
    const next = toggleSetupApp(enabled, choice.id, own);
    if (next === enabled) return;
    setBusy(choice.id);
    try {
      await saveApps(server, next);
    } catch (failure) {
      showError(failure instanceof Error ? t(failure.message) : t('Réglage refusé'));
    } finally {
      setBusy(null);
    }
  };
  return (
    <ul className={styles.setupApps} aria-label={SETUP_WORDS.apps.title}>
      {choices.map(choice => {
        // The last app on stays, and so does this one.
        const last = (choice.checked && enabled.length === 1) || choice.locked;
        return (
          <li key={choice.id}>
            <button
              type="button"
              role="checkbox"
              aria-checked={choice.checked}
              aria-disabled={choice.soon || last || busy !== null || undefined}
              className={`${styles.setupApp} paper`}
              data-outline="card"
              data-edge
              data-soon={choice.soon || undefined}
              onClick={() => !choice.soon && !last && busy === null && void toggle(choice)}
            >
              <AppMark app={choice.id} size={44} />
              <span className={styles.setupAppText}>
                <span className={styles.setupAppName}>
                  <span className="t-title">{choice.name}</span>
                  <span className="t-meta">{choice.soon ? t('Bientôt disponible') : choice.locked ? t('Cette application') : choice.replaces}</span>
                </span>
                <span className="t-body">{choice.description}</span>
                {last && !choice.locked ? <span className="t-meta">{t('Le serveur fait toujours tourner au moins une application.')}</span> : null}
              </span>
              {choice.soon ? null : <Icon name={choice.checked ? 'boxChecked' : 'box'} size={26} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The welcome: the suite's brand, the interface's language, and the one decision: connect to the
 * server, or keep everything in this browser. Served by the server itself, its address is this
 * page's: it is shown, not asked (« Une autre adresse » opens the field). `onNext` hears whether the
 * server's own setup is done (null: no server).
 */
function Welcome({ initial, onNext }: { initial: ServerConfig | null; onNext: (serverDone: boolean | null) => void }) {
  // The form is a sheet in its own outline, lifted by its wrapper.
  const { ref: formRef, vars: formVars } = useOutline<HTMLFormElement>('dialog');
  const locale = useSettingsStore(selectLocale);
  const other = locale === 'fr' ? 'en' : 'fr';
  const [url, setUrl] = useState(initial?.url ?? '');
  const [token, setToken] = useState(initial?.token ?? '');
  // This page's own server: its address is known, only the token is left to type.
  const [served, setServed] = useState(false);
  const [editAddress, setEditAddress] = useState(false);
  const addressShown = served && !editAddress && url === window.location.origin;
  // A failure says what went wrong under the field it points at (`fail`), and keeps what was typed.
  const form = useForm({
    address: addressShown ? null : connectionProblem('address', url),
    token: connectionProblem('token', token),
  });

  useEffect(() => {
    if (initial) return;
    let live = true;
    void servedByServer().then(yes => {
      if (!live || !yes) return;
      setServed(true);
      setUrl(current => current || window.location.origin);
    });
    return () => {
      live = false;
    };
  }, [initial]);

  // As it says: no server (one connected earlier in the setup is left, as from the Administration).
  const later = (): void => {
    if (initial) {
      stopSync();
      setServer(null);
      setServerSettings(null);
      startSync();
    }
    onNext(null);
  };

  const connect = async (): Promise<boolean> => {
    const config = normalizeServer({ url, token });
    try {
      const health = await checkServer(config);
      setServer(config);
      // Known at once: the apps it runs, whether its setup is done, whether a link saved before the first sync is read.
      setServerHealth(health);
      startSync();
      onNext(health.setup);
      return true;
    } catch (failure) {
      const message = failure instanceof Error ? t(failure.message) : t('Serveur injoignable');
      const field = failure instanceof SyncError ? connectFailureField(failure.kind, failure.status) : 'address';
      if (field === 'address') setEditAddress(true);
      form.fail(field, failure instanceof SyncError ? connectFailureMessage(failure.kind, message) : message);
      return false;
    }
  };

  return (
    <main className={styles.setup}>
      <div className={styles.setupLanguage}>
        <Button kind="text" icon="globe" lang={other} onClick={() => setInterfaceLocale(other)}>
          {LOCALE_NAMES[other]}
        </Button>
      </div>
      <div className={styles.setupColumn}>
        <div className={styles.setupBrand}>
          <span className={styles.setupMark}>
            <BrandMark app={theApp().id} size={72} />
          </span>
          <h1 className="t-display">{APPS[theApp().id].name}</h1>
          <p className={`${styles.tagline} t-body`}>{setupWelcomeLead(theApp().id)}</p>
        </div>
        <div className={styles.setupArt}>
          <Collage scene="welcome" width={264} />
        </div>
        <OutlineLift lift="raised" className={styles.setupLift}>
          <form ref={formRef} style={formVars} className={`${styles.setupForm} paper`} onSubmit={form.onSubmit(connect)} noValidate>
            {addressShown ? (
              <div className={styles.setupServed}>
                <Icon name="server" size={22} />
                <span className={settingsStyles.rowText}>
                  <span className="t-body-strong">{url.replace(/^https?:\/\//, '')}</span>
                  <span className="t-meta">{setupFieldHelp('served')}</span>
                </span>
                <Button kind="text" small onClick={() => setEditAddress(true)}>
                  {t('Une autre adresse')}
                </Button>
                {/* The address a password manager keeps beside the token, when it is not typed. */}
                <input type="text" name="address" autoComplete="username" value={url} readOnly hidden />
              </div>
            ) : (
              <TextField
                label={t('Adresse du serveur')}
                kind="serverAddress"
                value={url}
                onChange={setUrl}
                field={form.field('address')}
                help={setupFieldHelp('address')}
                autoFocus
              />
            )}
            <TextField
              label={t('Jeton')}
              kind="serverToken"
              value={token}
              onChange={setToken}
              field={form.field('token')}
              autoFocus={addressShown}
              help={setupFieldHelp('token')}
              revealLabels={{ show: t('Afficher le jeton'), hide: t('Masquer le jeton') }}
            />
            <FormMessage form={form} />
            <Button type="submit" icon="server" busy={form.busy} stretch>
              {initial ? t('Continuer') : t('Se connecter')}
            </Button>
            <div className={styles.setupLocal}>
              <Button kind="text" onClick={later} stretch>
                {t('Tout garder dans ce navigateur')}
              </Button>
              <p className="t-meta">{t('Vous pourrez relier un serveur plus tard, dans l’Administration.')}</p>
            </div>
          </form>
        </OutlineLift>
        <p className={`${styles.setupAfter} t-meta`}>
          {t('Pas encore de serveur ?')}{' '}
          <a href={SELF_HOSTING_GUIDE} target="_blank" rel="noopener noreferrer">
            {t('Le guide d’installation')}
          </a>
        </p>
      </div>
    </main>
  );
}

/** A backup to bring back on a server that holds nothing: one from S3 (the newest first), or an archive kept elsewhere. Without S3, a way to add it. */
function RestoreStep({ server, settings, admin, onSetBackup }: { server: ServerConfig; settings: ServerSettings; admin: Admin; onSetBackup: () => void }) {
  const now = useMinute();
  const backups = useBackups(server, settings.backup.configured, admin.backupsVersion);
  const [chosen, setChosen] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  // What the server refused, said by the buttons rather than on a slip that leaves.
  const [refused, setRefused] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const snapshots = backups.snapshots ?? [];
  const selected = chosen ?? snapshots[0]?.name ?? null;
  const status = admin.status?.restore ?? null;

  const restore = async (start: () => ReturnType<typeof restoreSnapshot>): Promise<void> => {
    setBusy(true);
    setRefused(null);
    try {
      admin.setStatus(await start());
      setSent(true);
    } catch (failure) {
      setRefused(failure instanceof Error ? t(failure.message) : SETUP_RESTORE_WORDS.refused);
    } finally {
      setBusy(false);
    }
  };

  if (sent && status && (status.running || status.report || status.error || status.thawing)) {
    if (status.running) return <StatusRow tone="waiting" title={SETUP_RESTORE_WORDS.running} meta={SETUP_RESTORE_WORDS.runningMeta} />;
    if (status.error) return <StatusRow tone="danger" title={SETUP_RESTORE_WORDS.failed} meta={t(status.error)} />;
    if (status.thawing) {
      // Brought out of Glacier in a few hours: the same choice comes back to run it again.
      const { title, meta } = thawingLine();
      return (
        <>
          <StatusRow tone="waiting" title={title} meta={meta} />
          <div className={`${settingsStyles.buttons} ${styles.setupRestoreS3}`}>
            <Button kind="tonal" icon="restore" onClick={() => setSent(false)}>
              {t('Choisir à nouveau')}
            </Button>
          </div>
        </>
      );
    }
    return <StatusRow tone="ok" title={SETUP_RESTORE_WORDS.back} meta={status.report ? restoreSummary(status.report) : ''} />;
  }

  return (
    <>
      {!settings.backup.configured ? (
        <>
          <StatusRow tone="off" title={SETUP_RESTORE_WORDS.noStorage} meta={SETUP_RESTORE_WORDS.noStorageMeta} />
          <div className={`${settingsStyles.buttons} ${styles.setupRestoreS3}`}>
            <Button kind="tonal" icon="server" onClick={onSetBackup}>
              {SETUP_RESTORE_WORDS.addStorage}
            </Button>
          </div>
        </>
      ) : backups.error ? (
        <StatusRow tone="danger" title={SETUP_RESTORE_WORDS.unreadable} meta={t(backups.error)} />
      ) : backups.snapshots === null ? (
        <StatusRow tone="waiting" title={SETUP_RESTORE_WORDS.reading} />
      ) : snapshots.length === 0 ? (
        <div className={settleIn}>
          <StatusRow tone="off" title={SETUP_RESTORE_WORDS.none} meta={setupNoBackupsMeta(settings.backup.bucket, settings.backup.prefix)} />
        </div>
      ) : (
        <div className={settingsStyles.block}>
          <div role="radiogroup" aria-label={t('Sauvegarde à restaurer')} className={settingsStyles.choices}>
            {snapshots.slice(0, 8).map(snapshot => (
              <button key={snapshot.name} type="button" role="radio" aria-checked={selected === snapshot.name} className={settingsStyles.choice} onClick={() => setChosen(snapshot.name)}>
                <span className={settingsStyles.choiceMark} aria-hidden="true">
                  {selected === snapshot.name ? <Icon name="check" size={20} /> : null}
                </span>
                <span className={settingsStyles.rowText}>
                  <span className="t-body tabular">{formatMoment(snapshot.at, now)}</span>
                  <span className="t-meta tabular">{snapshotMeta(snapshot)}</span>
                </span>
              </button>
            ))}
          </div>
          <div className={settingsStyles.buttons}>
            <Button icon="restore" busy={busy} disabled={!selected} onClick={() => selected && void restore(() => restoreSnapshot(server, selected, 'merge'))}>
              {SETUP_RESTORE_WORDS.restore}
            </Button>
          </div>
        </div>
      )}
      <button type="button" className={settingsStyles.row} disabled={busy} onClick={() => picker.current?.click()}>
        <Icon name="restore" size={24} />
        <span className={settingsStyles.rowText}>
          <span className="t-body">{SETUP_RESTORE_WORDS.file}</span>
          <span className="t-meta">{SETUP_RESTORE_WORDS.fileMeta}</span>
        </span>
      </button>
      <FormMessage form={{ message: refused, problems: 0 }} className={styles.setupRestoreMessage} />
      <input
        ref={picker}
        type="file"
        accept=".gz,.tgz,application/gzip"
        hidden
        aria-label={t('Archive à restaurer')}
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void restore(() => restoreFile(server, file, 'merge'));
        }}
      />
    </>
  );
}
