/**
 * "Serveur": the address and the token, the sync's state in the phone's words, what the server holds,
 * a sync on demand, and leaving the server (the notes stay in this browser).
 */
import { useState, type CSSProperties, type RefObject } from 'react';

import { t, tx } from '@unlease/core/i18n';
import { formatRelative, plural } from '@unlease/core/services/format';
import { connectFailureField, connectFailureMessage, connectionProblem, setupFieldHelp } from '@unlease/core/services/setup';

import { useMinute } from '../../../app/hooks/useMinute';
import { retryFailedImages } from '../../../app/media/images';
import { setServerHealth, setServerSettings } from '../../../app/store/serverSettings';
import { normalizeServer, selectServer, setServer, useSettingsStore } from '../../../app/store/settings';
import { useSyncStore } from '../../../app/store/syncStatus';
import { showSnack, showWarning } from '../../../app/store/ui';
import { requestSync, startSync, stopSync } from '../../../app/sync/loop';
import { checkServer, SyncError } from '../../../app/sync/transport';
import { Button } from '../../components/Button';
import { Confirm } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { FormMessage } from '../../components/FormMessage';
import { TextField } from '../../components/TextField';
import { useForm } from '../../components/useForm';
import styles from './settings.module.css';

/** In French, translated where it is shown (`Section` reads its `info` through `t`). */
export const SERVER_INFO =
  tx('The server keeps your data and syncs it between your devices, for every app. With a Claude key, it reads your links and answers about your pages.');

/** `facts`: what the server holds, once it has said (`serverFacts`). */
export function ServerSection({ address, facts }: { address: RefObject<HTMLInputElement | HTMLTextAreaElement | null>; facts: string | null }) {
  const server = useSettingsStore(selectServer);
  const { phase, pending, lastSyncAt, message, clock } = useSyncStore();
  const now = useMinute();
  const [url, setUrl] = useState(server?.url ?? '');
  const [token, setToken] = useState(server?.token ?? '');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  // What the server refused comes back under the field it concerns: the token, or the address.
  const form = useForm({
    address: connectionProblem('address', url),
    token: connectionProblem('token', token),
  });

  const connect = async (): Promise<boolean> => {
    try {
      const config = normalizeServer({ url, token });
      const health = await checkServer(config);
      setServer(config);
      // Known at once: the apps it runs, and whether Claude reads a link saved before its settings answer.
      setServerHealth(health);
      setUrl(config.url);
      retryFailedImages();
      startSync();
      if (health.analysis) showSnack(t('Connected, with Claude.'), undefined, { tone: 'success' });
      else showWarning(t('Connected, but the server has no Claude key.'));
      return true;
    } catch (failure) {
      const message = failure instanceof Error ? t(failure.message) : t('Server unreachable');
      if (failure instanceof SyncError) form.fail(connectFailureField(failure.kind, failure.status), connectFailureMessage(failure.kind, message));
      else form.fail('address', message);
      return false;
    }
  };

  const dot = phase === 'synced' ? 'var(--ok)' : phase === 'unauthorized' ? 'var(--danger)' : phase === 'local' ? 'var(--ink-faint)' : 'var(--waiting)';
  // The phone's words for each phase.
  const status =
    phase === 'local'
      ? t('Not connected: everything stays in this browser.')
      : phase === 'unauthorized'
        ? t('The server refuses this token.')
        : phase === 'offline'
          ? [t('Offline'), pending > 0 ? t('{changes} waiting', { changes: plural(pending, 'change') }) : '', message ? t(message) : '', lastSyncAt ? t('Synced {when}', { when: formatRelative(lastSyncAt, now) }) : ''].filter(Boolean).join(' · ')
          : phase === 'syncing'
            ? t('Syncing…')
            : [lastSyncAt ? t('Synced {when}', { when: formatRelative(lastSyncAt, now) }) : t('Connected'), clock ? t(clock) : ''].filter(Boolean).join(' · ');

  return (
    <>
      <div className={`${styles.status} ${facts ? styles.statusTop : ''}`}>
        <span className={styles.dot} style={{ '--dot': dot } as CSSProperties} aria-hidden="true" />
        <div className={styles.rowText}>
          <p className="t-body">{status}</p>
          {server && facts ? <p className="t-meta">{facts}</p> : null}
        </div>
      </div>
      <form className={styles.block} onSubmit={form.onSubmit(connect)} noValidate>
        <div className={styles.fields}>
          <TextField ref={address} label={t('Address')} kind="serverAddress" value={url} onChange={setUrl} field={form.field('address')} help={setupFieldHelp('address')} />
          <TextField
            label={t('Token')}
            kind="serverToken"
            value={token}
            onChange={setToken}
            field={form.field('token')}
            revealLabels={{ show: t('Show the token'), hide: t('Hide the token') }}
          />
        </div>
        <FormMessage form={form} />
        <div className={styles.buttons}>
          <Button type="submit" icon="server" busy={form.busy}>
            {server ? t('Test and save') : t('Connect')}
          </Button>
          {server ? (
            <Button
              kind="tonal"
              icon="refresh"
              onClick={() => {
                startSync();
                requestSync();
              }}
            >
              {t('Sync')}
            </Button>
          ) : null}
        </div>
      </form>
      {server ? (
        <button type="button" className={styles.row} onClick={() => setConfirmDisconnect(true)}>
          <Icon name="cloudOff" size={24} />
          <span className={styles.rowText}>
            <span className="t-body">{t('Disconnect from the server')}</span>
            <span className="t-meta">{t('Everything stays in this browser.')}</span>
          </span>
        </button>
      ) : null}
      <Confirm
        open={confirmDisconnect}
        title={t('Disconnect?')}
        message={t('This browser will stop syncing. What it holds stays here.')}
        confirmLabel={t('Disconnect')}
        onCancel={() => setConfirmDisconnect(false)}
        onConfirm={() => {
          setConfirmDisconnect(false);
          stopSync();
          setServer(null);
          setServerSettings(null);
          startSync();
        }}
      />
    </>
  );
}
