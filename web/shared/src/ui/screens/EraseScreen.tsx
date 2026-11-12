/**
 * « Effacer des données », Réglages' page (`/<app>/settings/erase`, the phone's `EraseScreen`;
 * `core/services/erase`): the app's parts, each ticked with how many things it holds (all of them
 * at first: the person unticks what they keep), a backup to S3 first when the server has one, then
 * the server's token typed again and the word typed in capitals, and one danger button counting what
 * goes. Pressed with a problem, it says it under its field; the server refusing the token says it
 * under the token. Then: what waits here is sent, the backup runs and must succeed, the tombstones go
 * in one batch, and the app opens on its home with a slip counting them.
 */
import { useState } from 'react';

import { APPS } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import { formatMoment } from '@unlease/core/services/admin';
import {
  ERASE_PROGRESS,
  eraseAction,
  eraseBackupWords,
  eraseDefaults,
  eraseLead,
  erasedMessage,
  erasePartsProblem,
  eraseTokenProblem,
  eraseTotal,
  eraseWord,
  eraseWordProblem,
  type EraseProgress,
} from '@unlease/core/services/erase';
import { connectFailureField, setupFieldHelp } from '@unlease/core/services/setup';
import type { AdminStatus } from '@unlease/core/sync/admin';
import type { GlyphName } from '@unlease/design/glyphs';

import { useMinute } from '../../app/hooks/useMinute';
import { useRecordsRevision } from '../../app/store/records';
import { selectServerSettings, useServerSettingsStore } from '../../app/store/serverSettings';
import { selectServer, useSettingsStore, type ServerConfig } from '../../app/store/settings';
import { showSnack } from '../../app/store/ui';
import { flushNow, requestSync } from '../../app/sync/loop';
import { checkServer, fetchAdminStatus, startBackup, SyncError } from '../../app/sync/transport';
import { theApp } from '../../modules';
import { Button } from '../components/Button';
import { CheckMark, SwitchMark } from '../components/Checkbox';
import { EmptyLine } from '../components/EmptyLine';
import { FormMessage } from '../components/FormMessage';
import { Icon } from '../components/Icon';
import { TextField } from '../components/TextField';
import { useForm } from '../components/useForm';
import { Section, StatusRow } from '../features/settings/Section';
import { useAdmin } from '../features/settings/useAdmin';
import styles from '../features/settings/settings.module.css';
import { PageHead } from '../navigation/PageHead';
import { navigate, paths } from '../router';
import screens from './screens.module.css';

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** How long a backup may take before the erase gives up waiting (a first one sends every photo). */
const BACKUP_WAIT_MS = 30 * 60_000;

/** A backup to S3 now, waited for: null once it succeeded, else why not (nothing is erased then). */
async function backupFirst(server: ServerConfig): Promise<string | null> {
  const asked = Date.now();
  let status: AdminStatus | null;
  try {
    status = await startBackup(server);
    while (status?.backup.running) {
      if (Date.now() - asked > BACKUP_WAIT_MS) return t('La sauvegarde prend trop de temps : rien n’a été effacé. Réessayez une fois finie.');
      await wait(2_000);
      status = (await fetchAdminStatus(server)) ?? status;
    }
  } catch (failure) {
    return t('La sauvegarde n’a pas pu démarrer : {problem}. Rien n’a été effacé.', { problem: failure instanceof Error ? t(failure.message) : t('Serveur injoignable') });
  }
  const last = status?.backup.last ?? null;
  if (last && last.ok && (last.finishedAt ?? 0) >= asked) return null;
  return t('La sauvegarde a échoué : {problem}. Rien n’a été effacé.', { problem: last?.error ? t(last.error) : t('raison inconnue') });
}

export function EraseScreen() {
  const app = theApp();
  const erase = app.erase;
  const name = APPS[app.id].name;
  const server = useSettingsStore(selectServer);
  const settings = useServerSettingsStore(selectServerSettings);
  const admin = useAdmin(server);
  const now = useMinute();
  // The parts' counts, read again at every write (a sync may bring more).
  useRecordsRevision();
  const parts = erase?.parts() ?? [];
  const [ticked, setTicked] = useState<ReadonlySet<string> | null>(null);
  const chosen = ticked ?? eraseDefaults(parts);
  const [token, setToken] = useState('');
  const [word, setWord] = useState('');
  const [backup, setBackup] = useState(true);
  const [stage, setStage] = useState<EraseProgress | null>(null);
  const connected = server !== null;
  const configured = settings?.backup.configured === true;
  const total = eraseTotal(parts, chosen);
  const form = useForm({ token: connected ? eraseTokenProblem(token) : null, word: eraseWordProblem(word) });

  if (!erase) {
    return (
      <div className={styles.page}>
        <PageHead title={t('Effacer des données')} />
        <Section label={t('Effacer des données')}>
          <div className={styles.block}>
            <EmptyLine size="body" text={t('Cette application n’a rien à effacer.')} />
          </div>
        </Section>
      </div>
    );
  }

  const toggle = (id: string): void => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTicked(next);
  };

  const run = async (): Promise<boolean> => {
    const problem = erasePartsProblem(parts, chosen);
    if (problem) {
      form.fail(null, problem);
      return false;
    }
    try {
      if (server) {
        setStage('checking');
        try {
          await checkServer({ url: server.url, token: token.trim() });
        } catch (failure) {
          const message = failure instanceof Error ? t(failure.message) : t('Serveur injoignable');
          if (failure instanceof SyncError && connectFailureField(failure.kind, failure.status) === 'token') form.fail('token', message);
          else form.fail(null, t('{problem} : rien n’a été effacé.', { problem: message }));
          return false;
        }
        // What waits on this device goes first, so the server holds everything the tombstones cover.
        setStage('syncing');
        await flushNow();
        if (configured && backup) {
          setStage('backup');
          const failed = await backupFirst(server);
          if (failed) {
            form.fail(null, failed);
            return false;
          }
        }
      }
      setStage('erasing');
      const count = erase.run(chosen);
      requestSync();
      showSnack(erasedMessage(count), undefined, { tone: 'success' });
      navigate(paths.home);
      return true;
    } finally {
      setStage(null);
    }
  };

  const backupWords = eraseBackupWords(configured, admin.status?.backup.lastSuccessAt ?? null, at => formatMoment(at, now));

  return (
    <div className={styles.page}>
      <PageHead title={t('Effacer des données')} />
      <p className={`${screens.eraseLead} t-body`}>{eraseLead(name, connected)}</p>

      <Section title={t('Ce qui sera effacé')}>
        {parts.map(part => {
          const empty = part.count === 0;
          const on = !empty && chosen.has(part.id);
          return (
            <button key={part.id} type="button" role="checkbox" aria-checked={on} aria-disabled={empty || undefined} className={styles.row} onClick={() => !empty && toggle(part.id)}>
              <CheckMark checked={on} />
              <span className={styles.rowText}>
                <span className="t-body">{part.title}</span>
                <span className="t-meta">{empty ? t('Rien à effacer') : part.detail}</span>
              </span>
              <Icon name={part.glyph as GlyphName} size={22} />
            </button>
          );
        })}
      </Section>

      {connected ? (
        <Section title={t('Avant d’effacer')}>
          {configured ? (
            <button type="button" role="switch" aria-checked={backup} className={styles.row} onClick={() => setBackup(!backup)}>
              <span className={styles.rowText}>
                <span className="t-body">{backupWords.title}</span>
                <span className="t-meta">{backupWords.meta}</span>
              </span>
              <SwitchMark checked={backup} />
            </button>
          ) : (
            <StatusRow tone="waiting" title={backupWords.title} meta={backupWords.meta} />
          )}
        </Section>
      ) : null}

      <Section title={t('Confirmer')}>
        <form className={styles.block} onSubmit={form.onSubmit(run)} noValidate>
          {connected ? (
            <TextField
              label={t('Jeton du serveur')}
              kind="serverToken"
              value={token}
              onChange={setToken}
              field={form.field('token')}
              help={t('Le même que pour vous connecter. {where}', { where: setupFieldHelp('token') })}
              revealLabels={{ show: t('Afficher le jeton'), hide: t('Masquer le jeton') }}
            />
          ) : null}
          <TextField label={t('Pour confirmer, tapez {word}', { word: eraseWord() })} kind="confirmWord" value={word} onChange={setWord} field={form.field('word')} />
          <FormMessage form={form} />
          <div className={styles.buttons}>
            <Button type="submit" kind="danger" icon="eraser" busy={form.busy}>
              {eraseAction(total)}
            </Button>
            <Button kind="text" disabled={form.busy} onClick={() => navigate(paths.settings)}>
              {t('Annuler')}
            </Button>
          </div>
          {stage ? (
            <p className="t-meta" role="status" aria-live="polite">
              {t(ERASE_PROGRESS[stage])}
            </p>
          ) : null}
        </form>
      </Section>
    </div>
  );
}
