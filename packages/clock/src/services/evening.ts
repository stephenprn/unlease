/**
 * The evening check: at an hour of the person's choosing (21:00 by default), the phone looks at the
 * alarm that will wake them tomorrow and at tomorrow's first event; when the event starts less than
 * the margin after the alarm (30 minutes by default), or before it rings, it says so in a
 * notification that offers to ring earlier. Nothing is said when no alarm rings tomorrow.
 *
 * The phone arms it like a reminder (`planAlarms`, the book `clockEvening`), its words read when it
 * is armed and armed again whenever the alarms, the events or the settings change, and by the hourly
 * refresh. A clash that appears after the hour (an event synced late) is said at once while the
 * evening lasts (`eveningWorthRinging`), never in the night.
 */
import { t } from '@unlease/core/i18n';
import type { Day } from '@unlease/calendar/models/events';
import { clockWords } from '@unlease/calendar/services/eventText';
import { spanWords } from '@unlease/calendar/services/today';
import { addDays, instantToDay, instantToWall } from '@unlease/calendar/services/time';
import type { Alarm } from '../models/alarm';
import type { ClockPrefs } from '../models/prefs';
import { clashWith, dayAhead, earlierTime, type AgendaRecords, type Clash } from './morning';
import { ringAt, wakingOn } from './schedule';

/** How long after its hour a check found late is still said: the evening, not the night. */
export const EVENING_LATE_MS = 3 * 3_600_000;

export interface EveningCheck {
  /** Which evening (`2026-11-16`): the book's id. */
  readonly evening: Day;
  /** When it is said. */
  readonly at: number;
  /** The morning it is about. */
  readonly day: Day;
  readonly alarm: Alarm;
  readonly ringAt: number;
  readonly clash: Clash;
  /** The time that would leave the margin, while it is still ahead of the check itself. */
  readonly earlier: { readonly day: Day; readonly time: string; readonly at: number } | null;
}

/** What it looks at. */
export interface EveningInput {
  readonly alarms: Iterable<Alarm>;
  readonly agenda: AgendaRecords;
  readonly prefs: Pick<ClockPrefs, 'eveningCheck' | 'eveningAt' | 'marginMinutes'>;
  readonly now: number;
  readonly zone?: string;
}

/** The check said on the evening of `evening`, about the morning after; null when there is nothing to say. */
export function checkOn(input: EveningInput, evening: Day): EveningCheck | null {
  const { prefs, zone = '' } = input;
  if (!prefs.eveningCheck) return null;
  const day = addDays(evening, 1);
  const live = [...input.alarms].filter(alarm => alarm.deletedAt === null);
  const waking = wakingOn(live, day, zone);
  if (!waking) return null;
  const clash = clashWith(dayAhead(input.agenda, day), waking.at, prefs.marginMinutes, zone);
  if (!clash) return null;
  const at = ringAt(evening, prefs.eveningAt, zone);
  const earlier = earlierTime(clash, prefs.marginMinutes, zone);
  return { evening, at, day, alarm: waking.alarm, ringAt: waking.at, clash, earlier: earlier.at > Math.max(at, input.now) && earlier.at < waking.at ? earlier : null };
}

/**
 * The checks the phone keeps: last evening's while its alarm is still to come (past midnight, the
 * notice it left stays in the shade until the morning it is about), this evening's (about tomorrow)
 * and tomorrow evening's (about the day after); a check whose hour went by stays in the list so a
 * clash found late can be said at once.
 */
export function eveningChecks(input: EveningInput): EveningCheck[] {
  const today = instantToDay(input.now, input.zone ?? '');
  return [addDays(today, -1), today, addDays(today, 1)].flatMap(evening => {
    const check = checkOn(input, evening);
    return check && input.now < check.ringAt ? [check] : [];
  });
}

/** A check found after its hour is still said within the evening, and never once its alarm is less than an hour away. */
export const eveningWorthRinging = (check: Pick<EveningCheck, 'at' | 'ringAt'>, now: number): boolean => now < check.at + EVENING_LATE_MS && now < check.ringAt - 3_600_000;

/** What the check's notification says: its title, a line, and its action while ringing earlier still helps. */
export interface EveningWords {
  readonly title: string;
  readonly body: string;
  readonly action: string | null;
}

export function eveningWords(check: EveningCheck, twelveHours = false, zone = ''): EveningWords {
  const event = check.clash.occurrence.event.title.trim() || t('Untitled');
  const alarm = clockWords(check.alarm.time, twelveHours);
  const start = clockWords(instantToWall(check.clash.occurrence.startAt, zone).slice(11, 16), twelveHours);
  const minutes = check.clash.minutes;
  const title =
    minutes < 0
      ? t('Tomorrow, “{event}” starts before your alarm', { event })
      : minutes === 0
        ? t('Tomorrow, “{event}” starts as your alarm rings', { event })
        : t('Tomorrow, “{event}” starts {span} after your alarm', { event, span: spanWords(minutes) });
  const body = t('Your alarm rings at {alarm}; “{event}” starts at {start}.', { alarm, event, start });
  return { title, body, action: check.earlier ? t('Ring at {time}', { time: clockWords(check.earlier.time, twelveHours) }) : null };
}
