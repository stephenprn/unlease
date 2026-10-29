/**
 * The Administration's live side: the server's settings and its status, asked again every few
 * seconds while something runs there (a backup, a pass over the drive, a restore, the files coming
 * back from the drive), and what to say when it ends.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { t, tx } from '@unlease/core/i18n';
import { adminBusy, restoreSummary } from '@unlease/core/services/admin';
import type { AdminStatus, BackupSnapshot } from '@unlease/core/sync/admin';

import { selectServerSettings, setServerSettings, useServerSettingsStore } from '../../../app/store/serverSettings';
import type { ServerConfig } from '../../../app/store/settings';
import { showError, showSnack } from '../../../app/store/ui';
import { fetchAdminStatus, fetchBackups, fetchServerSettings } from '../../../app/sync/transport';

export const ADMIN_POLL_MS = 3_000;

export interface Admin {
  readonly status: AdminStatus | null;
  /** What a call that starts something answered: the status, at once. */
  readonly setStatus: (status: AdminStatus) => void;
  /** Ask for the status (and the settings) again. */
  readonly refresh: () => Promise<void>;
  /** Bumped when a backup or a restore ends, so the list of snapshots is read again. */
  readonly backupsVersion: number;
}

export function useAdmin(server: ServerConfig | null): Admin {
  const settings = useServerSettingsStore(selectServerSettings);
  // Kept with the address it came from: another server's status is never shown.
  const [held, setHeld] = useState<{ readonly url: string; readonly status: AdminStatus } | null>(null);
  const status = server && held?.url === server.url ? held.status : null;
  const [backupsVersion, setBackupsVersion] = useState(0);
  const leaving = settings?.drive.leaving === true;

  const setStatus = useCallback((next: AdminStatus): void => {
    if (server) setHeld({ url: server.url, status: next });
  }, [server]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!server) return;
    const [next, nextSettings] = await Promise.all([fetchAdminStatus(server), fetchServerSettings(server)]);
    if (next) setStatus(next);
    if (nextSettings) setServerSettings(nextSettings);
  }, [server, setStatus]);

  useEffect(() => {
    if (!server) return;
    let live = true;
    void Promise.all([fetchAdminStatus(server), fetchServerSettings(server)]).then(([next, nextSettings]) => {
      if (!live) return;
      if (next) setHeld({ url: server.url, status: next });
      if (nextSettings) setServerSettings(nextSettings);
    });
    return () => {
      live = false;
    };
  }, [server]);

  // While something runs, ask again; the settings too while the files come back (the drive turns off at the end).
  const busy = adminBusy(status, settings?.drive ?? null) || leaving;
  // Each answer, or a failed ask, sets up the next: one lost answer must not freeze « Restauration en cours… ».
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    if (!server || !busy) return;
    const timer = setTimeout(() => {
      const ask = leaving
        ? refresh()
        : fetchAdminStatus(server).then(next => {
            if (next) setStatus(next);
          });
      void ask.finally(() => setAsked(count => count + 1));
    }, ADMIN_POLL_MS);
    return () => clearTimeout(timer);
  }, [server, busy, leaving, status, refresh, setStatus, asked]);

  // What ended since the last answer.
  const previous = useRef<AdminStatus | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = status;
    if (!before || !status) return;
    if (before.restore.running && !status.restore.running) {
      if (status.restore.error) showError(t(status.restore.error));
      else if (status.restore.report) showSnack(restoreSummary(status.restore.report), undefined, { tone: 'success' });
      setBackupsVersion(version => version + 1);
      if (server) void fetchServerSettings(server).then(next => next && setServerSettings(next));
    }
    if (before.backup.running && !status.backup.running) setBackupsVersion(version => version + 1);
  }, [status, server]);

  const wasLeaving = useRef(leaving);
  useEffect(() => {
    if (wasLeaving.current && !leaving && settings?.drive.provider === null) showSnack(t('Seafile désactivé : vos fichiers sont sur le serveur.'));
    wasLeaving.current = leaving;
  }, [leaving, settings]);

  return { status, setStatus, refresh, backupsVersion };
}

export interface Backups {
  readonly snapshots: readonly BackupSnapshot[] | null;
  readonly error: string | null;
  readonly loading: boolean;
}

/** The snapshots on S3, read when S3 is set and again at each `version`; the last list stays shown while the next is read. */
export function useBackups(server: ServerConfig | null, configured: boolean, version: number): Backups {
  const key = server && configured ? `${server.url}#${version}` : null;
  const [read, setRead] = useState<{ readonly key: string; readonly snapshots: readonly BackupSnapshot[] | null; readonly error: string | null } | null>(null);
  useEffect(() => {
    if (!server || !key) return;
    let live = true;
    fetchBackups(server).then(
      list => live && setRead({ key, snapshots: list.snapshots, error: null }),
      (failure: unknown) => live && setRead({ key, snapshots: null, error: failure instanceof Error ? failure.message : tx('Sauvegardes indisponibles') }),
    );
    return () => {
      live = false;
    };
  }, [server, key]);
  if (!key) return { snapshots: null, error: null, loading: false };
  const fresh = read?.key === key;
  return { snapshots: read?.snapshots ?? null, error: fresh ? read.error : null, loading: !fresh };
}
