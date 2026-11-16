/** Clock's root: the suite's shell (`AppShell`) around its navigator, with what feeds every screen (the sync's lifecycle, another app's « set an alarm », the presses on its notices). */
import React, { useEffect } from 'react';

import { useAppLifecycle } from '@shared/app/hooks/useAppLifecycle';
import { selectOnboarded, useSettingsStore } from '@shared/app/store/settingsStore';
import { AppShell } from '@shared/ui/AppShell';
import { onForegroundNotices } from '@platform/noticeEvents';
import { linking, RootNavigator } from '@ui/navigation/RootNavigator';
import { navigate, navigationRef, push } from '@ui/navigation/navigationRef';

import { bootstrap } from '../bootstrap';
import { onNoticeEvent } from '../evening';
import { listenForAlarms } from '../intake';
import { later } from '../later';
import { askNotificationsOnce } from '../permissions';
import { createAlarm } from '../store/actions';

/** An assistant's « set an alarm for 7 »: set, said (« Alarme réglée dans 9 h 12 »), shown on the home. */
function setHanded(draft: Parameters<typeof createAlarm>[0]): void {
  createAlarm(draft);
  later(askNotificationsOnce());
  navigate('Alarms');
}

/** Above every screen: the sync follows the app in and out of the foreground; another app's « set an alarm » opens the editor, filled; a notice pressed does what it says. */
function Overlays(): null {
  useAppLifecycle();
  const onboarded = useSettingsStore(selectOnboarded);
  useEffect(() => (onboarded ? listenForAlarms({ open: handed => push('Edit', { handed }), set: setHanded }) : undefined), [onboarded]);
  useEffect(() => onForegroundNotices(onNoticeEvent), []);
  return null;
}

export function AppProviders(): React.ReactElement {
  return (
    <AppShell app="clock" bootstrap={bootstrap} linking={linking} navigationRef={navigationRef} overlays={<Overlays />} onSettings={() => navigate('Settings')}>
      <RootNavigator />
    </AppShell>
  );
}
