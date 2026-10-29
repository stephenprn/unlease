/**
 * "Serveur": the address and the token, the sync's state in the phone's words, what the server holds,
 * a sync on demand, and leaving the server (the notes stay in this browser).
 */
import { useState, type CSSProperties, type RefObject } from 'react';

import { t, tx } from '@unlease/core/i18n';
import { formatRelative, plural } from '@unlease/core/services/format';

import { useMinute } from '../../../app/hooks/useMinute';
import { retryFailedImages } from '../../../app/media/images';
import { setServerSettings } from '../../../app/store/serverSettings';
import { normalizeServer, selectServer, setReading, setServer, useSettingsStore } from '../../../app/store/settings';
import { useSyncStore } from '../../../app/store/syncStatus';
import { showSnack, showWarning } from '../../../app/store/ui';
import { requestSync, startSync, stopSync } from '../../../app/sync/loop';
import { checkServer } from '../../../app/sync/transport';
import { Button } from '../../components/Button';
import { Confirm } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { TextField } from '../../components/TextField';
import styles from './settings.module.css';

/** In French, translated where it is shown (`Section` reads its `info` through `t`). */
export const SERVER_INFO =
  tx('Le serveur synchronise vos notes entre vos appareils. Avec une clé Claude, il lit chaque lien enregistré (titre, prix, résumé, images) et le range dans la bonne collection.');

/** `facts`: what the server holds, once it has said (`serverFacts`). */
export function ServerSection({ address, facts }: { address: RefObject<HTMLInputElement | HTMLTextAreaElement | null>; facts: string | null }) {
  const server = useSettingsStore(selectServer);
  const { phase, pending, lastSyncAt, message, clock } = useSyncStore();
  const now = useMinute();
  const [url, setUrl] = useState(server?.url ?? '');
  const [token, setToken] = useState(server?.token ?? '');
  const [showToken, setShowToken] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const connect = async (): Promise<void> => {
    setChecking(true);
    setError(null);
    try {
      const config = normalizeServer({ url, token });
      const health = await checkServer(config);
      setServer(config);
      // Known at once, so a link saved before the settings answer is read or kept plain rightly.
      setReading(health.analysis);
      setUrl(config.url);
      retryFailedImages();
      startSync();
      if (health.analysis) showSnack(t('Connecté. Les liens seront lus par Claude.'), undefined, { tone: 'success' });
      else showWarning(t('Connecté, mais le serveur n’a pas de clé Claude.'));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : tx('Serveur injoignable'));
    } finally {
      setChecking(false);
    }
  };

  const dot = phase === 'synced' ? 'var(--ok)' : phase === 'unauthorized' ? 'var(--danger)' : phase === 'local' ? 'var(--ink-faint)' : 'var(--waiting)';
  // The phone's words for each phase.
  const status =
    phase === 'local'
      ? t('Non connecté : les notes restent dans ce navigateur.')
      : phase === 'unauthorized'
        ? t('Le serveur refuse ce jeton.')
        : phase === 'offline'
          ? [t('Hors ligne'), pending > 0 ? t('{changes} en attente', { changes: plural(pending, 'modification') }) : '', message ? t(message) : ''].filter(Boolean).join(' · ')
          : phase === 'syncing'
            ? t('Synchronisation…')
            : [lastSyncAt ? t('Synchronisé {when}', { when: formatRelative(lastSyncAt, now) }) : t('Connecté'), clock ? t(clock) : ''].filter(Boolean).join(' · ');

  return (
    <>
      <div className={`${styles.status} ${facts ? styles.statusTop : ''}`}>
        <span className={styles.dot} style={{ '--dot': dot } as CSSProperties} aria-hidden="true" />
        <div className={styles.rowText}>
          <p className="t-body">{status}</p>
          {server && facts ? <p className="t-meta">{facts}</p> : null}
        </div>
      </div>
      <form
        className={styles.block}
        onSubmit={event => {
          event.preventDefault();
          void connect();
        }}
      >
        <div className={styles.fields}>
          <TextField ref={address} label={t('Adresse')} value={url} onChange={setUrl} placeholder={t('https://carnet.exemple.fr')} inputMode="url" autoComplete="url" spellCheck={false} autoCapitalize="none" />
          <div className={styles.tokenWrap}>
            <TextField
              label={t('Jeton')}
              value={token}
              onChange={setToken}
              type={showToken ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="none"
              inputClassName={styles.tokenInput}
            />
            <IconButton icon={showToken ? 'eyeOff' : 'eye'} label={showToken ? t('Masquer le jeton') : t('Afficher le jeton')} className={styles.eye} onClick={() => setShowToken(value => !value)} />
          </div>
        </div>
        {error ? (
          <p className={`${styles.error} t-body`} role="alert">
            {t(error)}
          </p>
        ) : null}
        <div className={styles.buttons}>
          <Button type="submit" icon="server" busy={checking} disabled={!url.trim() || !token.trim()}>
            {server ? t('Tester et enregistrer') : t('Se connecter')}
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
              {t('Synchroniser')}
            </Button>
          ) : null}
        </div>
      </form>
      {server ? (
        <button type="button" className={styles.row} onClick={() => setConfirmDisconnect(true)}>
          <Icon name="cloudOff" size={24} />
          <span className={styles.rowText}>
            <span className="t-body">{t('Se déconnecter du serveur')}</span>
            <span className="t-meta">{t('Les notes restent dans ce navigateur.')}</span>
          </span>
        </button>
      ) : null}
      <Confirm
        open={confirmDisconnect}
        title={t('Se déconnecter ?')}
        message={t('Ce navigateur arrêtera de se synchroniser. Ses notes restent ici, et les liens ne seront plus lus.')}
        confirmLabel={t('Se déconnecter')}
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
