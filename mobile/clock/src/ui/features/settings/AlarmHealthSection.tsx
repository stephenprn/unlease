/**
 * « Pour que les alarmes sonnent », in Réglages: what keeps this phone's alarms from ringing as they
 * should, each with the page that fixes it (`openFix`): the notifications turned off, exact alarms
 * refused, the ringing screen refused over the lock screen (Android 14), the alarm volume off or low,
 * the battery « Restreinte ». Shown only while something does, and only on a phone that rings them.
 */
import React from 'react';

import { t } from '@unlease/core/i18n';
import { useAlarmHealth } from '@app/hooks/useAlarmHealth';
import { later } from '@app/later';
import { openFix } from '@platform/alarmEngine';

import { ListRow } from '@shared/ui/components';
import { Section } from '@shared/ui/features/settings/Section';

/** Under a third of its most, an alarm may not wake anyone. */
const LOW_VOLUME = 1 / 3;

export function AlarmHealthSection({ wanted }: { wanted: boolean }) {
  const health = useAlarmHealth();
  if (!wanted || !health) return null;
  const fix = (what: Parameters<typeof openFix>[0]) => () => later(openFix(what));
  const rows: React.ReactNode[] = [];
  if (!health.notifications) {
    rows.push(<ListRow key="notifications" icon="bellOff" title={t('Notifications turned off')} supporting={t('Allow them in Android’s settings: without them, an alarm can’t show as it rings.')} onPress={fix('notifications')} />);
  }
  if (health.alarmsMuted) {
    rows.push(<ListRow key="dnd" icon="bellOff" title={t('Do Not Disturb silences alarms')} supporting={t('It lets no alarm through: allow alarms in it, or they ring unheard.')} onPress={fix('doNotDisturb')} />);
  }
  if (health.notifications && !health.ringingChannel) {
    rows.push(<ListRow key="channel" icon="bellOff" title={t('“Alarms ringing” turned down')} supporting={t('Let these notifications pop up on screen: without it, no ringing screen and no Snooze or Stop.')} onPress={fix('ringingChannel')} />);
  }
  if (!health.exactAlarms) {
    rows.push(<ListRow key="exact" icon="clock" title={t('Alarms may ring late')} supporting={t('Allow “Alarms & reminders” so they ring on the minute.')} onPress={fix('exactAlarms')} />);
  }
  if (!health.fullScreen) {
    rows.push(<ListRow key="fullScreen" icon="alert" title={t('The ringing screen can’t show')} supporting={t('Allow full-screen notifications, so an alarm lights the screen over the lock screen.')} onPress={fix('fullScreen')} />);
  }
  if (health.maxVolume > 0 && health.volume === 0) {
    rows.push(<ListRow key="volume" icon="bellOff" title={t('The alarm volume is off')} supporting={t('An alarm raises it to a third as it rings: set the volume you want to wake to.')} onPress={fix('volume')} />);
  } else if (health.maxVolume > 0 && health.volume / health.maxVolume < LOW_VOLUME) {
    rows.push(<ListRow key="volume" icon="bell" title={t('The alarm volume is low')} supporting={t('It may not wake you: raise the alarm volume.')} onPress={fix('volume')} />);
  }
  if (health.backgroundRestricted) {
    rows.push(
      <ListRow key="battery" icon="alert" title={t('Battery set to “Restricted”')} supporting={t('Alarms still ring, but the notices and the sync wait: under “Battery”, choose “Optimized” or “Unrestricted”.')} onPress={fix('battery')} />,
    );
  }
  if (rows.length === 0) return null;
  return <Section title={t('So that your alarms ring')}>{rows}</Section>;
}
