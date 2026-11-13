/**
 * « Applications »: the suite's apps the server runs, each ready one by its mark with its switch
 * (never the last one off: a server runs at least one), the announced ones listed « Bientôt
 * disponible ». An app turned off keeps its data; its screens and its work stop. Turning off this
 * very app says so first (the web's too).
 */
import React, { useState } from 'react';
import { View } from 'react-native';

import { APP_IDS, APPS, type AppId } from '@unlease/core/apps';
import { APP_WORDS } from '@unlease/core/appWords';
import { t, tx } from '@unlease/core/i18n';
import { toggleSetupApp } from '@unlease/core/services/setup';
import type { AdminState } from '@shared/app/hooks/useAdmin';
import type { ServerConfig } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';
import { saveServerSettings } from '@shared/app/sync/transport';

import { AppText, ListRow } from '../../components';
import { BrandMark } from '../../icons/BrandMark';
import { useTheme } from '../../theme/ThemeProvider';
import { SwitchRow } from '../appearance/SwitchRow';
import type { AdminOverlays } from './overlays';

/** « How it works » (the web's `APPS_INFO`). */
export const APPS_INFO = tx('The apps your server runs, for all your devices. An app turned off keeps its data: it is synced and backed up, and comes back as it was when you turn it on again.');

export function AppsSection({ server, admin, own, overlays }: { server: ServerConfig; admin: AdminState; own: AppId; overlays: AdminOverlays }) {
  const theme = useTheme();
  const [busy, setBusy] = useState<AppId | null>(null);
  const enabled = admin.settings!.apps.enabled;

  const save = async (id: AppId, next: readonly AppId[]) => {
    setBusy(id);
    try {
      admin.setSettings(await saveServerSettings(server, { apps: [...next] }));
      const name = APPS[id].name;
      showSnack(next.includes(id) ? t('{app} turned on on the server', { app: name }) : t('{app} turned off: its data is kept', { app: name }), undefined, { tone: 'success' });
    } catch (failure) {
      showSnack(failure instanceof Error ? t(failure.message) : t('Setting refused'), undefined, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const toggle = (id: AppId) => {
    const next = toggleSetupApp(enabled, id, null);
    if (next === enabled) return;
    if (id === own && !next.includes(id)) {
      overlays.ask({
        title: t('Turn {app} off?', { app: APPS[id].name }),
        message: t('It will not open, here or on your other devices, while it is off on the server. Its data is kept.'),
        confirmLabel: t('Turn off'),
        danger: true,
        run: () => void save(id, next),
      });
      return;
    }
    void save(id, next);
  };

  return (
    <View>
      {APP_IDS.map(id => {
        const words = APP_WORDS[id];
        if (APPS[id].status !== 'ready') return <ListRow key={id} leading={<BrandMark app={id} size={32} />} title={APPS[id].name} supporting={words.replaces} trailing={<AppText variant="labelSmall" color={theme.color.inkMuted}>{t('Coming soon')}</AppText>} />;
        const on = enabled.includes(id);
        // The last one on stays on.
        const locked = on && enabled.length === 1;
        return (
          <SwitchRow
            key={id}
            leading={<BrandMark app={id} size={32} />}
            title={APPS[id].name}
            supporting={locked ? t('{description} At least one app stays on.', { description: words.description }) : words.description}
            value={on}
            disabled={locked || busy !== null}
            onChange={() => toggle(id)}
          />
        );
      })}
    </View>
  );
}
