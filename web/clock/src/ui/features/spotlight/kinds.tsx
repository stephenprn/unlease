/**
 * Alarms in the spotlight (`@unlease/clock/services/spotlight`): an alarm by its label (« Alarme »
 * when it has none) or its time as typed every way, its time and its days under it, the clock as
 * its mark; it opens its form.
 */
import { tx, t } from '@unlease/core/i18n';
import type { SearchDoc } from '@unlease/core/services/searchIndex';
import type { SpotMeta } from '@unlease/core/services/spotlight';
import { clockSpotlightDocs } from '@unlease/clock/services/spotlight';
import { alarmClock, alarmName, daysWords } from '@unlease/clock/services/words';

import { useClockStore, type ClockState } from '../../../app/store/library';
import { usePrefsStore } from '../../../app/store/prefs';
import { Icon } from '@shared/ui/components/Icon';
import type { SpotKind } from '@shared/modules';
import { paths } from '../../routes';
import { openAlarm } from '../open';

let cached: { readonly alarms: ClockState['alarms']; readonly weekStart: number; readonly hour: number; readonly docs: readonly SearchDoc<SpotMeta>[] } | null = null;

/** Every live alarm, built again when an alarm changed, the week's order did, or the hour turned (a one-time alarm's « Demain » becomes « Aujourd’hui »). */
function docs(): readonly SearchDoc<SpotMeta>[] {
  const { alarms } = useClockStore.getState();
  const { weekStart } = usePrefsStore.getState();
  const now = Date.now();
  const hour = Math.floor(now / 3_600_000);
  if (cached && cached.alarms === alarms && cached.weekStart === weekStart && cached.hour === hour) return cached.docs;
  const made = clockSpotlightDocs(Object.values(alarms), now, weekStart);
  cached = { alarms, weekStart, hour, docs: made };
  return made;
}

function AlarmMark({ large = false }: { doc: SearchDoc<SpotMeta>; large?: boolean }) {
  return <Icon name="clock" size={large ? 32 : 20} />;
}

const href = (doc: SearchDoc<SpotMeta>): string => paths.alarm(doc.meta.id);

export const CLOCK_SPOT_KINDS: readonly SpotKind[] = [
  {
    type: 'alarm',
    label: tx('Alarms'),
    docs,
    title: doc => {
      const alarm = useClockStore.getState().alarms[doc.meta.id];
      return alarm ? alarmName(alarm) : doc.title || t('Alarm');
    },
    facts: doc => {
      const alarm = useClockStore.getState().alarms[doc.meta.id];
      if (!alarm) return [t('Alarm')];
      const { twelveHours, weekStart } = usePrefsStore.getState();
      return [alarmClock(alarm.time, twelveHours), daysWords(alarm, Date.now(), weekStart)];
    },
    href,
    open: doc => openAlarm(doc.meta.id),
    Mark: AlarmMark,
  },
];
