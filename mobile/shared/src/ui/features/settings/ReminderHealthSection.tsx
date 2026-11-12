/**
 * « Notifications à l’heure », in the settings of an app that rings: what keeps its notifications
 * from coming on the minute, each with the page that fixes it. Shown only while something does: on a
 * phone where they ring as they should there is nothing to say (exact alarms are granted at install
 * from Android 13). A maker's own battery saver (Samsung's sleeping apps, Xiaomi's autostart…) is
 * named only on the phones that have one, with Android's « Sans restriction » beside it. Read again
 * each time the app comes back to the front: the answer changes in Android's settings.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { t } from '@unlease/core/i18n';
import { openReminderSetting, remindersHealth, type RemindersHealth } from '@shared/platform/reminders';
import { selectServer, useSettingsStore } from '@shared/app/store/settingsStore';

import { ListRow } from '../../components';
import { Section } from './Section';

export interface ReminderHealthProps {
  /** Whether the app has anything to ring here (birthdays turned on…): without, nothing to fix. */
  readonly wanted?: boolean;
  /** A maker's own battery settings, when this phone has a known page for them (Notifee's `getPowerManagerInfo`). */
  readonly makerSettings?: () => Promise<(() => void) | null>;
}

export function ReminderHealthSection({ wanted = true, makerSettings }: ReminderHealthProps) {
  const [health, setHealth] = useState<RemindersHealth | null>(null);
  const [maker, setMaker] = useState<(() => void) | null>(null);
  // With a server, « Synchronisation en arrière-plan » names the battery's « Restreinte », the notifications included.
  const server = useSettingsStore(selectServer);

  const refresh = useCallback(() => {
    remindersHealth().then(setHealth, () => setHealth(null));
    makerSettings?.().then(
      open => setMaker(() => open),
      () => setMaker(null),
    );
  }, [makerSettings]);

  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener('change', state => state === 'active' && refresh());
    return () => subscription.remove();
  }, [refresh]);

  if (!wanted || !health) return null;
  const rows: React.ReactNode[] = [];
  if (!health.notifications) {
    rows.push(<ListRow key="notifications" icon="bellOff" title={t('Notifications désactivées')} supporting={t('Autorisez-les dans les réglages d’Android : sans elles, rien ne s’affiche.')} onPress={() => void openReminderSetting('notifications')} />);
  }
  if (!health.exactAlarms) {
    rows.push(<ListRow key="exact" icon="clock" title={t('Rappels à l’heure approximative')} supporting={t('Autorisez « Alarmes et rappels » pour qu’ils sonnent à la minute près.')} onPress={() => void openReminderSetting('exactAlarms')} />);
  }
  if (health.backgroundRestricted && !server) {
    rows.push(
      <ListRow key="battery" icon="alert" title={t('Batterie « Restreinte »')} supporting={t('Android retient les notifications tant que l’application est fermée : dans « Batterie », choisissez « Optimisée » ou « Sans restriction ».')} onPress={() => void openReminderSetting('battery')} />,
    );
  }
  if (maker) {
    rows.push(<ListRow key="maker" icon="settings" title={t('Économie d’énergie du fabricant')} supporting={t('Ce téléphone peut fermer l’application et retarder ses notifications : laissez-la démarrer et s’exécuter en arrière-plan.')} onPress={maker} />);
    if (!health.unrestricted) {
      rows.push(<ListRow key="unrestricted" icon="alert" title={t('Batterie sans restriction')} supporting={t('Que l’application reste prête à sonner, même après des jours sans l’ouvrir.')} onPress={() => void openReminderSetting('unrestricted')} />);
    }
  }
  if (rows.length === 0) return null;
  return <Section title={t('Notifications à l’heure')}>{rows}</Section>;
}
