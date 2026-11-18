/**
 * Clock in a backup, as people read it: `Clock/Clock.md`, every alarm with its time, its days, its
 * label and how it rings, switched on or off; then the saved timers (their length and label) and the
 * world clocks (their city and zone). Nothing when Clock holds nothing.
 */
import { getLocale, setLocale } from '@unlease/core/i18n';
import { APP_NAME } from '@unlease/clock/brand';
import { addClockFrench } from '@unlease/clock/i18n';
import type { Alarm } from '@unlease/clock/models/alarm';
import { byLength, type Timer } from '@unlease/clock/models/timer';
import type { WorldClock } from '@unlease/clock/models/worldClock';
import { lengthWords } from '@unlease/clock/services/timers';
import { byOffset } from '@unlease/clock/services/worldClocks';
import { byTime } from '@unlease/clock/services/schedule';
import { soundName } from '@unlease/clock/services/sounds';
import { daysWords } from '@unlease/clock/services/words';
import { alarmFromRecord, timerFromRecord, worldClockFromRecord } from '@unlease/clock/sync/entities';
import { escapeLabel, type MarkdownFile } from '../../backup/markdown';
import type { StoredRecord } from '../../sync/records';

export const FOLDER = APP_NAME;

let frenchAdded = false;

export function readAlarms(all: readonly StoredRecord[]): Alarm[] {
  return all.filter(record => record.type === 'alarm').map(alarmFromRecord).filter(alarm => alarm.deletedAt === null);
}

export function readTimers(all: readonly StoredRecord[]): Timer[] {
  return all.filter(record => record.type === 'timer').map(timerFromRecord).filter(timer => timer.deletedAt === null);
}

export function readWorldClocks(all: readonly StoredRecord[]): WorldClock[] {
  return all.filter(record => record.type === 'worldClock').map(worldClockFromRecord).filter(clock => clock.deletedAt === null);
}

/** The list, in French as the server's own words in an archive are (`docs/ARCHITECTURE.md`, Interface language). */
export function clockMarkdown(alarms: readonly Alarm[], now: number, timers: readonly Timer[] = [], clocks: readonly WorldClock[] = []): MarkdownFile[] {
  if (alarms.length === 0 && timers.length === 0 && clocks.length === 0) return [];
  if (!frenchAdded) {
    addClockFrench();
    frenchAdded = true;
  }
  const before = getLocale();
  setLocale('fr');
  try {
    const lines = [`# ${FOLDER}`, ''];
    for (const alarm of [...alarms].sort(byTime)) {
      const state = alarm.enabled ? '' : ' (désactivée)';
      lines.push(`## ${alarm.time}${alarm.label.trim() ? ` · ${escapeLabel(alarm.label.trim())}` : ''}${state}`, '');
      lines.push(`- Jours : ${daysWords(alarm, now, 1)}`);
      lines.push(`- Son : ${soundName(alarm.sound)}${alarm.vibrate ? ', vibreur' : ''}`);
      const shows = [alarm.weather ? 'la météo' : '', alarm.agenda ? 'les événements du jour' : ''].filter(Boolean);
      if (shows.length > 0) lines.push(`- Au réveil : ${shows.join(' et ')}`);
      lines.push('');
    }
    if (timers.length > 0) {
      lines.push('## Minuteurs enregistrés', '');
      for (const timer of [...timers].sort(byLength)) lines.push(`- ${lengthWords(timer.seconds)}${timer.label.trim() ? ` · ${escapeLabel(timer.label.trim())}` : ''} (${soundName(timer.sound)}${timer.vibrate ? ', vibreur' : ''})`);
      lines.push('');
    }
    if (clocks.length > 0) {
      lines.push('## Horloges', '');
      for (const clock of [...clocks].sort(byOffset(now))) lines.push(`- ${escapeLabel(clock.name)} (${clock.zone})`);
      lines.push('');
    }
    return [{ path: `${FOLDER}/${FOLDER}.md`, text: `${lines.join('\n').trimEnd()}\n` }];
  } finally {
    setLocale(before);
  }
}
