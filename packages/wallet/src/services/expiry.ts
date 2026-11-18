/**
 * When a card or a paper stops being valid, when to be reminded, and how long a document must be
 * kept (`models/documentTypes`). Days are civil days (`calendar/services/time`), never instants.
 *
 * Reminders are worked out on the device that holds the keys and armed there; nothing of them goes to
 * the server. Their defaults follow what renewing takes: a passport six months ahead (many countries
 * ask for six months of validity on arrival) and again a month ahead; an identity card or a licence
 * three months ahead; a residence permit four months, then two (a prefecture's appointment takes
 * that long); a gift card a month, then a week.
 */
import { addDays, addMonths, daysBetween } from '@unlease/calendar/services/time';
import { DOCUMENT_TYPE_INFO } from '../models/documentTypes';
import type { Day, ItemKind, WalletItem } from '../models/item';

export const DEFAULT_REMINDERS: Readonly<Record<ItemKind, readonly number[]>> = {
  card: [7],
  giftCard: [30, 7],
  emergency: [],
  idCard: [90],
  passport: [182, 30],
  drivingLicence: [90],
  healthCard: [30],
  residencePermit: [120, 60],
  otherId: [60],
  document: [30],
};

/** How soon is soon: the papers whose first reminder has passed. */
export const remindersOf = (item: Pick<WalletItem, 'kind' | 'details'>): readonly number[] => item.details.remind ?? DEFAULT_REMINDERS[item.kind];

export type ExpiryTone = 'none' | 'valid' | 'soon' | 'expired';

export interface ExpiryState {
  readonly tone: ExpiryTone;
  /** Days left (0 on its last day), negative once expired; null without a date. */
  readonly days: number | null;
}

/**
 * Where an item stands: `soon` from its first reminder (or 30 days without one), `expired` from the
 * day after its last valid day. The date written on a paper is its last valid day.
 */
export function expiryOf(item: Pick<WalletItem, 'kind' | 'details'>, today: Day): ExpiryState {
  const end = item.details.expiresOn;
  if (!end) return { tone: 'none', days: null };
  const days = daysBetween(today, end);
  if (days < 0) return { tone: 'expired', days };
  const first = Math.max(30, ...remindersOf(item));
  return { tone: days <= first ? 'soon' : 'valid', days };
}

export interface PlannedReminder {
  readonly itemId: string;
  /** The day it rings, in the morning (each app's book picks the hour). */
  readonly day: Day;
  /** How many days ahead of the end it rings: 0 on the last valid day. */
  readonly daysBefore: number;
  readonly kind: ItemKind;
  readonly expiresOn: Day;
}

/** How many days back a reminder missed while the phone was off still rings. */
export const LATE_REMINDER_DAYS = 3;

/**
 * Every reminder still to ring (or missed within `LATE_REMINDER_DAYS`) for the items open on this
 * device: in the bin or without an end, none.
 */
export function plannedReminders(items: readonly WalletItem[], today: Day): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  for (const item of items) {
    const end = item.details.expiresOn;
    if (!end || item.deletedAt !== null) continue;
    for (const daysBefore of remindersOf(item)) {
      const day = addDays(end, -daysBefore);
      const late = daysBetween(day, today);
      if (late > LATE_REMINDER_DAYS) continue;
      out.push({ itemId: item.id, day: late > 0 ? today : day, daysBefore, kind: item.kind, expiresOn: end });
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.itemId.localeCompare(b.itemId));
}

const endOfYear = (day: Day, years: number): Day => `${Number(day.slice(0, 4)) + years}-12-31`;
const addYears = (day: Day, years: number): Day => addMonths(day, years * 12);

/** How long a document is to be kept, by its type's rule: a day, for good, until the pension, or null (no rule tells). */
export type KeepTerm = Day | 'forever' | 'retirement' | null;

export function keepTermOf(item: Pick<WalletItem, 'kind' | 'details' | 'createdAt'>): KeepTerm {
  const details = item.details;
  if (details.keepUntil) return details.keepUntil;
  if (item.kind !== 'document' || !details.docType) return null;
  const rule = DOCUMENT_TYPE_INFO[details.docType].keep;
  const from = details.docDate;
  switch (rule.kind) {
    case 'years':
      return from ? addYears(from, rule.years) : null;
    case 'endOfYear':
      return from ? endOfYear(from, rule.years) : null;
    case 'afterEnd':
      return details.expiresOn ? addYears(details.expiresOn, rule.years) : null;
    case 'untilEnd':
      return details.expiresOn ?? (from ? addYears(from, rule.fallbackYears) : null);
    case 'retirement':
      return 'retirement';
    case 'forever':
      return 'forever';
    case 'none':
    default:
      return null;
  }
}

/** The documents that may go: kept past what their type asks. Never a paper, never one kept for good. */
export function discardable(items: readonly WalletItem[], today: Day): WalletItem[] {
  return items.filter(item => {
    if (item.deletedAt !== null || item.kind !== 'document') return false;
    const term = keepTermOf(item);
    return term !== null && term !== 'forever' && term !== 'retirement' && term < today;
  });
}
