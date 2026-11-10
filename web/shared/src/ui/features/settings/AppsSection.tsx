/**
 * « Applications »: which apps the server runs, for every device. Each ready app with its switch
 * (never the last one off: the server always runs one), the announced ones listed under « Bientôt
 * disponible ». An app turned off says so in its own web and phone apps and stops its work; its data
 * is kept, synced and backed up, and comes back as it was when it is turned on again. Saved at once;
 * turning off this very app asks first (the phone's too).
 */
import { useState } from 'react';

import { APP_IDS, APPS, isReadyApp, type AppId } from '@unlease/core/apps';
import { APP_WORDS } from '@unlease/core/appWords';
import { t, tx } from '@unlease/core/i18n';
import { toggleSetupApp } from '@unlease/core/services/setup';
import type { ServerSettings } from '@unlease/core/sync/settings';

import { setServerSettings } from '../../../app/store/serverSettings';
import type { ServerConfig } from '../../../app/store/settings';
import { showError, showSnack } from '../../../app/store/ui';
import { saveServerSettings } from '../../../app/sync/transport';
import { requestSync } from '../../../app/sync/loop';
import { SwitchMark } from '../../components/Checkbox';
import { Confirm } from '../../components/Dialog';
import { theApp } from '../../../modules';
import { AppMark } from '../../navigation/AppBrand';
import styles from './settings.module.css';

export const APPS_INFO = tx('Les applications que votre serveur fait tourner, pour tous vos appareils. Une application désactivée garde ses données : elles sont synchronisées et sauvegardées, et reviennent telles quelles quand vous la réactivez.');

/** Save the apps on: the server's answer is kept, and the next pull asks for their records. */
export async function saveApps(server: ServerConfig, apps: readonly AppId[]): Promise<ServerSettings> {
  const next = await saveServerSettings(server, { apps });
  setServerSettings(next);
  requestSync();
  return next;
}

export function AppsSection({ server, settings }: { server: ServerConfig | null; settings: ServerSettings | null }) {
  const [busy, setBusy] = useState<AppId | null>(null);
  // This very app turned off asks first, as on the phone: it closes here at once.
  const [turningOff, setTurningOff] = useState<readonly AppId[] | null>(null);
  const own = theApp().id;
  const enabled = settings?.apps.enabled ?? [];
  const toggle = (id: AppId): void => {
    if (!server || !settings) return;
    const next = toggleSetupApp(enabled, id, null);
    if (next === enabled) return;
    if (id === own && !next.includes(id)) setTurningOff(next);
    else void save(id, next);
  };
  const save = async (id: AppId, next: readonly AppId[]): Promise<void> => {
    if (!server) return;
    setBusy(id);
    try {
      await saveApps(server, next);
      showSnack(next.includes(id) ? t('{app} activé sur le serveur', { app: APPS[id].name }) : t('{app} désactivé : ses données sont gardées', { app: APPS[id].name }), undefined, { tone: 'success' });
    } catch (failure) {
      showError(failure instanceof Error ? t(failure.message) : t('Réglage refusé'));
    } finally {
      setBusy(null);
    }
  };
  const ready = APP_IDS.filter(isReadyApp);
  const soon = APP_IDS.filter((id): boolean => !isReadyApp(id));
  return (
    <>
      {!server ? <p className={`${styles.help} t-meta`}>{t('Reliez un serveur pour choisir les applications qu’il fait tourner.')}</p> : null}
      {ready.map(id => {
        const on = enabled.includes(id);
        // The last app on stays: a server always runs one.
        const last = on && enabled.length === 1;
        const disabled = !server || !settings || busy !== null || last;
        return (
          <button
            key={id}
            type="button"
            role="switch"
            aria-checked={on}
            aria-disabled={disabled || undefined}
            className={styles.row}
            onClick={() => !disabled && toggle(id)}
          >
            <AppMark app={id} size={32} />
            <span className={styles.rowText}>
              <span className="t-body">{APPS[id].name}</span>
              <span className="t-meta">{last ? t('{words} · le serveur fait toujours tourner au moins une application', { words: APP_WORDS[id].tagline }) : APP_WORDS[id].description}</span>
            </span>
            <SwitchMark checked={on} />
          </button>
        );
      })}
      {soon.length > 0 ? <p className={`${styles.help} t-meta-strong`}>{t('Bientôt disponible')}</p> : null}
      <Confirm
        open={turningOff !== null}
        title={t('Désactiver {app} ?', { app: APPS[own].name })}
        message={t('Il ne s’ouvrira plus, ici ni sur vos autres appareils, tant qu’il est désactivé sur le serveur. Ses données sont gardées.')}
        confirmLabel={t('Désactiver')}
        danger
        onCancel={() => setTurningOff(null)}
        onConfirm={() => {
          const next = turningOff;
          setTurningOff(null);
          if (next) void save(own, next);
        }}
      />
      {soon.map(id => (
        <div key={id} className={styles.row} aria-disabled="true">
          <AppMark app={id} size={32} />
          <span className={styles.rowText}>
            <span className="t-body">{APPS[id].name}</span>
            <span className="t-meta">{APP_WORDS[id].description}</span>
          </span>
        </div>
      ))}
    </>
  );
}
