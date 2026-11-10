/**
 * The app off: connected to a server that does not run this app (its Administration turned it off,
 * or it was never chosen), the app says so in place of its pages, with the one way out: turn it on
 * there (`PUT /api/settings { apps }`). Its data was kept meanwhile; nothing else changes. The
 * Réglages and the Administration stay in reach. The phone's twin is `mobile/shared`'s.
 */
import { useState } from 'react';

import { APPS } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import { appOffWords } from '@unlease/core/services/setup';

import { selectServer, selectServerApps, useSettingsStore } from '../../app/store/settings';
import { showError, showSnack } from '../../app/store/ui';
import { theApp } from '../../modules';
import { BrandMark } from '../components/BrandMark';
import { Button } from '../components/Button';
import { saveApps } from '../features/settings/AppsSection';
import { navigate, paths } from '../router';
import styles from './screens.module.css';

export function AppOffScreen() {
  const app = theApp().id;
  const server = useSettingsStore(selectServer);
  const apps = useSettingsStore(selectServerApps);
  const [busy, setBusy] = useState(false);
  const words = appOffWords(app);

  const turnOn = async (): Promise<void> => {
    if (!server) return;
    setBusy(true);
    try {
      await saveApps(server, [...(apps ?? []).filter(id => id !== app), app]);
      showSnack(t('{app} activé sur le serveur', { app: APPS[app].name }), undefined, { tone: 'success' });
    } catch (failure) {
      showError(failure instanceof Error ? t(failure.message) : t('Réglage refusé'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.appOff}>
      <BrandMark app={app} size={72} />
      <h1 className="t-title">{words.title}</h1>
      <p className="t-body">{words.lead}</p>
      <Button kind="filled" icon="server" busy={busy} disabled={!server} onClick={() => void turnOn()}>
        {words.action}
      </Button>
      {server ? <p className="t-meta">{server.url.replace(/^https?:\/\//, '')}</p> : null}
      <Button kind="text" icon="settings" onClick={() => navigate(paths.settings)}>
        {t('Réglages')}
      </Button>
    </div>
  );
}
