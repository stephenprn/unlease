/**
 * Birthday notifications kept in step with the address book: the alerts due within the horizon
 * (`birthdayAlerts`) armed on the phone, each re-armed when its moment or its words change (a rename,
 * the language), cancelled when its contact or its birthday goes, or when they are turned off
 * (`planAlarms`). One whose hour went by unarmed today (a birthday written on another device since,
 * the phone off) comes late, that same day. What this phone armed is kept with its preferences, so a
 * start compares instead of arming again; a force stop, or exact alarms newly allowed, arms all again.
 * With the app closed, `remindersTask` does the same twice a day and after the system's changes.
 */
import { t } from '@unlease/core/i18n';
import { APP_NAME } from '@unlease/contacts/brand';
import { birthdayAlertWords, birthdayAlerts } from '@unlease/contacts/services/birthdays';
import { contactName } from '@unlease/contacts/services/names';
import { callNumber } from '@unlease/contacts/services/phones';
import { mailtoHref } from '@unlease/contacts/services/addresses';
import { mustArmAgain, planAlarms, readBook, rememberMode, type AlarmEntry } from '@shared/app/alarms';
import { pullNow } from '@shared/app/sync/syncManager';
import { readPreferences, writePreference } from '@shared/data/repositories/stateRepository';
import { showSnack } from '@shared/app/store/uiStore';
import { keepRemindersFresh } from '@shared/platform/reminders';
import { armBirthday, canScheduleExact, disarmBirthday, ensurePermission, forgetBirthday, ringBirthdayNow, type BirthdayNotification } from '@platform/notifications';

import { bootstrap } from './bootstrap';
import { setBirthdaySettings, useContactsUiStore, type BirthdaySettings } from './store/contactsUi';
import { useLibraryStore } from './store/libraryStore';

const ARMED = 'contacts.birthdayArmed';
const BOOK = 'contacts';
/** How often the birthdays are seen to with the app closed, while they are on. */
export const REFRESH_MINUTES = 12 * 60;

/** What a notification is armed with: a change of any re-arms it. */
const keyOf = (alert: BirthdayNotification): string => JSON.stringify([alert.at, alert.title, alert.body, alert.canCall, alert.canWrite]);

/** Midnight this morning, on this phone: a birthday's alert gone by unrung today still comes. */
function startOfDay(now: number): number {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

/** The notifications the settings want now, by id: those to come, and today's gone by. */
export function wantedBirthdays(settings: BirthdaySettings, now: number): Map<string, BirthdayNotification> {
  const wanted = new Map<string, BirthdayNotification>();
  if (!settings.enabled) return wanted;
  const { contacts, liveContacts } = useLibraryStore.getState();
  const live = liveContacts.map(id => contacts[id]!).filter(Boolean);
  for (const alert of birthdayAlerts(live, now, { hour: settings.hour, before: settings.dayBefore ? [0, 1] : [0], horizon: 45, since: startOfDay(now) - 1 })) {
    const contact = contacts[alert.contactId];
    if (!contact) continue;
    const id = `birthday-${alert.contactId}-${alert.before}`;
    // The nearest alert of each kind: a horizon past a year would hold two.
    if (wanted.has(id)) continue;
    wanted.set(id, { id, contactId: alert.contactId, at: alert.at, ...birthdayAlertWords(contactName(contact), alert), canCall: callNumber(contact) !== null, canWrite: callNumber(contact) !== null || contact.emails.some(entry => mailtoHref(entry.address) !== null) });
  }
  return wanted;
}

let running: Promise<void> = Promise.resolve();

/** Arms what is wanted and not armed (or armed otherwise), shows what went by unarmed today, cancels what is no longer wanted. */
export function reconcileBirthdays(now: number = Date.now()): Promise<void> {
  running = running.then(async () => {
    const settings = useContactsUiStore.getState().birthdays;
    const exact = await canScheduleExact().catch(() => false);
    const mode = exact ? 'exact' : 'inexact';
    const { armAll, first } = await mustArmAgain(BOOK, mode);
    const armed = readBook(readPreferences()[ARMED]);
    const wanted = wantedBirthdays(settings, now);
    const entries = new Map<string, AlarmEntry>([...wanted].map(([id, alert]) => [id, { at: alert.at, key: keyOf(alert) }]));
    const plan = planAlarms(entries, armed, now, { armAll, ringLate: !first });
    const next: Record<string, string> = {};
    let failed = false;
    for (const [id, entry] of entries) if (armed.get(id)?.key === entry.key || entry.at <= now) next[id] = entry.key;
    for (const id of plan.arm) {
      // Not kept when it failed (an hour that went by meanwhile, Android refusing): tried again next time.
      if (await armBirthday(wanted.get(id)!, exact).then(() => true, () => false)) next[id] = entries.get(id)!.key;
      else {
        delete next[id];
        failed = true;
      }
    }
    for (const id of plan.ringNow) await ringBirthdayNow(wanted.get(id)!).catch(() => undefined);
    for (const id of plan.gone) {
      // One that rang stays in the shade until answered; one still to come goes whole.
      const rang = (armed.get(id)?.at ?? 0) <= now;
      await (rang ? forgetBirthday(id) : disarmBirthday(id)).catch(() => undefined);
    }
    writePreference(ARMED, next);
    if (!failed) rememberMode(BOOK, mode);
    keepRemindersFresh(settings.enabled ? REFRESH_MINUTES : 0);
  });
  // A run that failed leaves the next ones free to try.
  running = running.catch(() => undefined);
  return running;
}

/**
 * The headless task (index.js, `remindersTask`), with the app closed or not: what other devices wrote
 * pulled first (the loop has it already when the app is in front), then the birthdays seen to.
 */
export async function runRemindersTask(): Promise<void> {
  if (!bootstrap().ok) return;
  await pullNow().catch(() => undefined);
  await reconcileBirthdays();
}

/** Turning them on asks Android (13 and later) first; refused, they stay off and a slip says why. */
export async function turnBirthdaysOn(on: boolean): Promise<boolean> {
  if (!on) {
    setBirthdaySettings({ enabled: false });
    return false;
  }
  const allowed = await ensurePermission();
  if (!allowed) {
    showSnack(t('Les notifications de {app} sont refusées : elles se donnent dans les réglages d’Android.', { app: APP_NAME }), undefined, { tone: 'warning' });
    return false;
  }
  setBirthdaySettings({ enabled: true });
  return true;
}
