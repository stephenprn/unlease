/**
 * The Administration's server side, as last read: its settings, its live status (asked again every
 * few seconds while a backup, a pass over the drive, a restore or the files' return runs), and the
 * backups on S3. What finishes is said once, in a snackbar.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { t } from '@unlease/core/i18n';
import { adminBusy, restoreSummary } from '@unlease/core/services/admin';
import type { AdminStatus, BackupList } from '@unlease/core/sync/admin';
import type { ServerSettings } from '@unlease/core/sync/settings';

import { rememberServerSettings, type ServerConfig } from '../store/settingsStore';
import { showSnack } from '../store/uiStore';
import { fetchAdminStatus, fetchBackups, fetchServerSettings } from '../sync/transport';

const POLL_MS = 3_000;

export interface AdminState {
  readonly settings: ServerSettings | null;
  readonly status: AdminStatus | null;
  /** The server did not answer the settings. */
  readonly unavailable: boolean;
  /** Changes whenever the backups on S3 may have changed (a backup or a restore finished). */
  readonly backupsVersion: number;
  readonly reload: () => void;
  readonly setSettings: (settings: ServerSettings) => void;
  readonly setStatus: (status: AdminStatus | null) => void;
}

/** `active`: the screen is shown; nothing is asked while it is not. */
export function useAdmin(server: ServerConfig | null, active: boolean): AdminState {
  const [settings, setSettingsState] = useState<ServerSettings | null>(null);
  const [status, setStatusState] = useState<AdminStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [backupsVersion, setBackupsVersion] = useState(0);

  const setSettings = useCallback((next: ServerSettings) => {
    setSettingsState(next);
    rememberServerSettings(next);
  }, []);
  const setStatus = useCallback((next: AdminStatus | null) => {
    if (next) setStatusState(next);
  }, []);

  const loadSettings = useCallback(() => {
    if (!server) return;
    fetchServerSettings(server).then(next => {
      setUnavailable(!next);
      if (next) setSettings(next);
    });
  }, [server, setSettings]);
  const loadStatus = useCallback(() => {
    if (!server) return;
    fetchAdminStatus(server).then(setStatus);
  }, [server, setStatus]);
  const reload = useCallback(() => {
    loadSettings();
    loadStatus();
  }, [loadSettings, loadStatus]);

  // Another server has its own settings: nothing of the last one is shown meanwhile.
  useEffect(() => {
    setSettingsState(null);
    setStatusState(null);
    setUnavailable(false);
  }, [server]);

  useEffect(() => {
    if (!active) return;
    reload();
    const subscription = AppState.addEventListener('change', state => state === 'active' && reload());
    return () => subscription.remove();
  }, [active, reload]);

  // While the files come back, the settings change at the end too (the drive is forgotten).
  const leaving = settings?.drive.leaving === true;
  const busy = adminBusy(status, settings?.drive ?? null) || leaving;
  useEffect(() => {
    if (!active || !busy) return;
    const timer = setInterval(() => {
      loadStatus();
      if (leaving) loadSettings();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [active, busy, leaving, loadStatus, loadSettings]);

  const previous = useRef<AdminStatus | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = status;
    if (!before || !status) return;
    if (before.restore.running && !status.restore.running) {
      const { error, report } = status.restore;
      showSnack(error ? t(error) : report ? restoreSummary(report) : t('Sauvegarde restaurée'), undefined, { tone: error ? 'error' : 'success' });
      loadSettings();
      setBackupsVersion(version => version + 1);
    }
    if (before.backup.running && !status.backup.running) setBackupsVersion(version => version + 1);
  }, [status, loadSettings]);

  const wasLeaving = useRef(false);
  useEffect(() => {
    if (!settings) return;
    if (wasLeaving.current && !settings.drive.leaving) showSnack(t('Seafile désactivé : vos fichiers sont sur le serveur.'));
    wasLeaving.current = settings.drive.leaving;
  }, [settings]);

  return { settings, status, unavailable, backupsVersion, reload, setSettings, setStatus };
}

export interface BackupsState {
  readonly list: BackupList | null;
  /** Why the list could not be read, in the server's words. */
  readonly error: string | null;
  readonly reload: () => void;
}

/** The snapshots on S3, read once S3 is set, again after every backup or restore. */
export function useBackups(server: ServerConfig | null, configured: boolean, version: number, active: boolean): BackupsState {
  const [list, setList] = useState<BackupList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState(0);
  const reload = useCallback(() => setAsked(count => count + 1), []);

  useEffect(() => {
    if (!server || !configured) {
      setList(null);
      setError(null);
      return;
    }
    if (!active) return;
    let current = true;
    fetchBackups(server).then(
      next => {
        if (!current) return;
        setList(next);
        setError(null);
      },
      (failure: unknown) => {
        if (current) setError(failure instanceof Error ? failure.message : t('Sauvegardes indisponibles'));
      },
    );
    return () => {
      current = false;
    };
  }, [server, configured, active, version, asked]);

  return { list, error, reload };
}
