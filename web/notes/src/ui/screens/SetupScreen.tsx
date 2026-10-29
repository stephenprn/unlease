/**
 * First run (the phone's SetupScreen), short on purpose (`core/services/setup`): connect to the
 * server, or keep the notes in this browser; how the app looks here (Carnet's own, kept with
 * "Passer"); then, on a server that held nothing when this browser came, "Votre serveur": what the
 * Administration sets, one row each, every one optional and opened from its row. Reopened halfway,
 * it resumes after the server.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { SELF_HOSTING_GUIDE } from '@unlease/core/apps';
import { APP_NAME } from '@unlease/notes/brand';
import { DEFAULT_APPEARANCE, isDefaultAppearance } from '@unlease/design/appearance';
import { PAGES_ASK_INFO } from '@unlease/notes/services/pagesAsk';
import { LOCALE_NAMES, t } from '@unlease/core/i18n';
import { formatMoment, restoreSummary } from '@unlease/core/services/admin';
import { formatBytes } from '@unlease/core/services/format';
import {
  connectFailureField,
  connectFailureMessage,
  nextSetupStep,
  previousSetupStep,
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
} from '@unlease/core/services/setup';
import type { ServerSettings } from '@unlease/core/sync/settings';

import { useMinute } from '../../app/hooks/useMinute';
import { selectServerSettings, setServerSettings, useServerSettingsStore } from '../../app/store/serverSettings';
import { normalizeServer, selectAppearance, selectLocale, selectServer, setAppearance, setInterfaceLocale, setOnboarded, setReading, setServer, useSettingsStore, type ServerConfig } from '../../app/store/settings';
import { showError } from '../../app/store/ui';
import { startSync, stopSync } from '../../app/sync/loop';
import { checkServer, restoreFile, restoreSnapshot, servedByServer, SyncError } from '../../app/sync/transport';
import { BrandMark } from '../components/BrandMark';
import { Button } from '../components/Button';
import { Collage } from '../components/Collage';
import { ColorsSection, GroundSection } from '../features/appearance/AppearanceSections';
import { Icon } from '../components/Icon';
import { IconButton } from '../components/IconButton';
import { OutlinedBox, OutlineLift, useOutline } from '../components/Outline';
import { TextField } from '../components/TextField';
import { BACKUP_INFO, BackupSection } from '../features/settings/BackupSection';
import { DRIVE_INFO, DriveSection } from '../features/settings/DriveSection';
import { PagesAskSection } from '../features/settings/PagesAskSection';
import { ReadingSection } from '../features/settings/ReadingSection';
import { SEERR_INFO, SeerrSection } from '../features/settings/SeerrSection';
import { Section, StatusRow, toneColor } from '../features/settings/Section';
import settingsStyles from '../features/settings/settings.module.css';
import { useAdmin, useBackups, type Admin } from '../features/settings/useAdmin';
import styles from './screens.module.css';

interface Place {
  readonly step: SetupStep;
  /** A row of "Votre serveur" opened. */
  readonly task: SetupTask | null;
}

export function SetupScreen() {
  const server = useSettingsStore(selectServer);
  const appearance = useSettingsStore(selectAppearance);
  const settings = useServerSettingsStore(selectServerSettings);
  const admin = useAdmin(server);
  const [place, setPlace] = useState<Place>({ step: server ? 'appearance' : 'server', task: null });
  // Whether the server held nothing when this browser came, as first heard: kept for the whole setup, so its restore stays while it runs.
  const [startedEmpty, setStartedEmpty] = useState<{ readonly url: string; readonly empty: boolean } | null>(null);
  const status = admin.status;
  if (server && status && startedEmpty?.url !== server.url) setStartedEmpty({ url: server.url, empty: setupStartedEmpty(status) });
  const empty = server && startedEmpty?.url === server.url ? startedEmpty.empty : null;

  const { step, task } = place;
  // Once on "Votre serveur" it stays a step, whatever is set there.
  const steps = setupSteps(server !== null, setupChecklistShown(server !== null, empty) || step === 'checklist');
  const heading = useRef<HTMLHeadingElement>(null);
  const go = (next: SetupStep, opened: SetupTask | null = null): void => {
    setPlace({ step: next, task: opened });
    window.scrollTo?.({ top: 0 });
    // The new step's title is where a screen reader and the keyboard carry on.
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  };

  if (step === 'server') {
    return <Welcome initial={server} onNext={() => go('appearance')} />;
  }

  const index = steps.indexOf(step);
  const last = index === steps.length - 1;
  const words = task ? SETUP_TASK_WORDS[task] : SETUP_WORDS[step];
  const restoring = status?.restore.running === true;
  // What the server sets waits for its settings; the appearance does not.
  const ready = server !== null && settings !== null;

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
    switch (task) {
      case null:
        return (
          <OutlinedBox kind="panel" lift="card" className={settingsStyles.card}>
            <ul className={styles.setupTasks} aria-label={SETUP_WORDS.checklist.title}>
              {setupTasks(empty === true).map(each => {
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
          <Section title={t('Stockage S3')} info={BACKUP_INFO}>
            <BackupSection key={server.url} server={server} backup={settings.backup} admin={admin} setup />
          </Section>
        );
      case 'restore':
        return (
          <Section title={t('Sauvegardes trouvées')}>
            <RestoreStep server={server} settings={settings} admin={admin} onSetBackup={() => go('checklist', 'backup')} />
          </Section>
        );
      case 'drive':
        return (
          <Section title="Seafile" info={DRIVE_INFO}>
            <DriveSection key={server.url} server={server} drive={settings.drive} admin={admin} />
          </Section>
        );
      case 'reading':
        return (
          <>
            <Section title="Claude">
              <ReadingSection key={server.url} server={server} onConnect={() => go('server')} />
            </Section>
            <Section title={t('Questions sur les pages')} info={PAGES_ASK_INFO}>
              <PagesAskSection key={server.url} server={server} settings={settings} />
            </Section>
          </>
        );
      case 'seerr':
        return (
          <Section title="Seerr" info={SEERR_INFO}>
            <SeerrSection key={server.url} server={server} seerr={settings.seerr} />
          </Section>
        );
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
          <Button icon="check" onClick={setOnboarded} disabled={restoring}>
            {setupForward(true, true)}
          </Button>
        ) : (
          <Button kind={set ? 'filled' : 'tonal'} onClick={() => go(nextSetupStep(steps, step))}>
            {setupForward(set, false)}
          </Button>
        )}
      </>
    );
  };

  return (
    <main className={styles.setupFlow}>
      <header className={styles.setupHead}>
        <BrandMark size={40} />
        <div className={styles.setupHeadText}>
          <p className="t-meta">{t('Mise en route · {progress}', { progress: setupProgress(steps, step) })}</p>
          <ol className={styles.setupSteps} aria-label={t('Étapes')}>
            {steps.map((entry, position) => (
              <li key={entry} className={position === index ? 't-meta-strong' : 't-meta'} aria-current={position === index ? 'step' : undefined} data-past={position < index || undefined}>
                {position < index ? <Icon name="check" size={16} /> : null}
                {SETUP_WORDS[entry].short}
              </li>
            ))}
          </ol>
        </div>
      </header>

      <div className={styles.setupIntro}>
        <h1 ref={heading} tabIndex={-1} className="t-title">
          {words.title}
        </h1>
        <p className="t-body">{words.lead}</p>
      </div>

      {body()}

      <nav className={styles.setupNav} aria-label={t('Mise en route')}>
        {nav()}
      </nav>
    </main>
  );
}

/**
 * The welcome: the brand, the interface's language, and the one decision: connect to the server
 * (its address and its token), or keep the notes in this browser. Either way the appearance comes next.
 */
function Welcome({ initial, onNext }: { initial: ServerConfig | null; onNext: () => void }) {
  // The form is a sheet in its own outline, lifted by its wrapper.
  const { ref: formRef, vars: formVars } = useOutline<HTMLFormElement>('dialog');
  const locale = useSettingsStore(selectLocale);
  const other = locale === 'fr' ? 'en' : 'fr';
  const [url, setUrl] = useState(initial?.url ?? '');
  const [token, setToken] = useState(initial?.token ?? '');
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  // A failure says what went wrong under the field it points at, and keeps what was typed.
  const [error, setError] = useState<{ readonly field: 'address' | 'token'; readonly message: string } | null>(null);

  // Served by the server itself: its address is this page's, only the token is left to type.
  useEffect(() => {
    if (initial) return;
    let live = true;
    void servedByServer().then(served => {
      if (live && served) setUrl(current => current || window.location.origin);
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
    onNext();
  };

  const connect = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const config = normalizeServer({ url, token });
    try {
      const health = await checkServer(config);
      setServer(config);
      // Known at once, so a link saved before the first sync is read, or kept plain, rightly.
      setReading(health.analysis);
      startSync();
      onNext();
    } catch (failure) {
      const message = failure instanceof Error ? t(failure.message) : t('Serveur injoignable');
      if (failure instanceof SyncError) setError({ field: connectFailureField(failure.kind, failure.status), message: connectFailureMessage(failure.kind, message) });
      else setError({ field: 'address', message });
    } finally {
      setBusy(false);
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
            <BrandMark size={72} />
          </span>
          <h1 className="t-display">{APP_NAME}</h1>
          <p className={`${styles.tagline} t-body`}>{SETUP_WORDS.server.lead}</p>
        </div>
        <div className={styles.setupArt}>
          <Collage scene="welcome" width={264} />
        </div>
        <OutlineLift lift="raised" className={styles.setupLift}>
          <form
            ref={formRef}
            style={formVars}
            className={`${styles.setupForm} paper`}
            onSubmit={event => {
              event.preventDefault();
              void connect();
            }}
          >
            <TextField
              label={t('Adresse du serveur')}
              value={url}
              onChange={value => {
                setUrl(value);
                if (error?.field === 'address') setError(null);
              }}
              help={t('Par exemple https://carnet.exemple.fr')}
              error={error?.field === 'address' ? error.message : null}
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              autoCapitalize="none"
              autoFocus
            />
            <div className={settingsStyles.tokenWrap}>
              <TextField
                label={t('Jeton')}
                value={token}
                onChange={value => {
                  setToken(value);
                  if (error?.field === 'token') setError(null);
                }}
                type={showToken ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="none"
                help={t('Le jeton défini dans UNLEASE_TOKEN sur le serveur.')}
                error={error?.field === 'token' ? error.message : null}
                inputClassName={settingsStyles.tokenInput}
              />
              <IconButton icon={showToken ? 'eyeOff' : 'eye'} label={showToken ? t('Masquer le jeton') : t('Afficher le jeton')} className={settingsStyles.eyeTop} onClick={() => setShowToken(shown => !shown)} />
            </div>
            <Button type="submit" icon="server" busy={busy} disabled={!url.trim() || !token.trim()} stretch>
              {initial ? t('Continuer') : t('Se connecter')}
            </Button>
            <div className={styles.setupLocal}>
              <Button kind="text" onClick={later} stretch>
                {t('Garder mes notes dans ce navigateur')}
              </Button>
              <p className="t-meta">{t('Vous pourrez relier un serveur plus tard, dans les Réglages.')}</p>
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
  const picker = useRef<HTMLInputElement>(null);
  const snapshots = backups.snapshots ?? [];
  const selected = chosen ?? snapshots[0]?.name ?? null;
  const status = admin.status?.restore ?? null;

  const restore = async (start: () => ReturnType<typeof restoreSnapshot>): Promise<void> => {
    setBusy(true);
    try {
      admin.setStatus(await start());
      setSent(true);
    } catch (failure) {
      showError(failure instanceof Error ? t(failure.message) : t('Restauration refusée'));
    } finally {
      setBusy(false);
    }
  };

  if (sent && status && (status.running || status.report || status.error)) {
    if (status.running) return <StatusRow tone="waiting" title={t('Restauration en cours…')} meta={t('Les notes reviennent d’abord, puis les photos et les fichiers.')} />;
    if (status.error) return <StatusRow tone="danger" title={t('La restauration a échoué')} meta={t(status.error)} />;
    return <StatusRow tone="ok" title={t('Vos données sont revenues')} meta={status.report ? restoreSummary(status.report) : ''} />;
  }

  return (
    <>
      {!settings.backup.configured ? (
        <>
          <StatusRow tone="off" title={t('Pas de stockage S3')} meta={t('Ajoutez-le pour retrouver ses sauvegardes. Sans S3, une archive téléchargée auparavant peut tout de même revenir.')} />
          <div className={`${settingsStyles.buttons} ${styles.setupRestoreS3}`}>
            <Button kind="tonal" icon="server" onClick={onSetBackup}>
              {t('Ajouter le stockage S3')}
            </Button>
          </div>
        </>
      ) : backups.error ? (
        <StatusRow tone="danger" title={t('Sauvegardes illisibles')} meta={t(backups.error)} />
      ) : backups.snapshots === null ? (
        <StatusRow tone="waiting" title={t('Lecture des sauvegardes sur S3…')} />
      ) : snapshots.length === 0 ? (
        <StatusRow tone="off" title={t('Aucune sauvegarde sur S3')} meta={t('Rien à restaurer dans {place}.', { place: `${settings.backup.bucket}${settings.backup.prefix ? `/${settings.backup.prefix}` : ''}` })} />
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
                  <span className="t-meta tabular">{formatBytes(snapshot.bytes)}</span>
                </span>
              </button>
            ))}
          </div>
          <div className={settingsStyles.buttons}>
            <Button icon="restore" busy={busy} disabled={!selected} onClick={() => selected && void restore(() => restoreSnapshot(server, selected, 'merge'))}>
              {t('Restaurer cette sauvegarde')}
            </Button>
          </div>
        </div>
      )}
      <button type="button" className={settingsStyles.row} disabled={busy} onClick={() => picker.current?.click()}>
        <Icon name="upload" size={24} />
        <span className={settingsStyles.rowText}>
          <span className="t-body">{t('Restaurer depuis un fichier')}</span>
          <span className="t-meta">{t('Une archive .tar.gz téléchargée depuis S3 ou depuis l’Administration.')}</span>
        </span>
      </button>
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
