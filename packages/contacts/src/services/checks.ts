/**
 * What a contact's form checks, the same on both clients (`core/services/formChecks` says when): an
 * e-mail that reads as one, a birthday that reads as a day, and a contact that holds something. Each
 * problem is a sentence saying what is wrong and how to fix it.
 */
import { t } from '@unlease/core/i18n';

import { readTypedBirthday } from './birthdays';

/** Something before an « @ », a domain after it, no space: the shape of an address, not a test of it. */
export function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+$/.test(value.trim());
}

/** An e-mail's problem, or null (an empty row is dropped at saving, not a mistake). */
export function emailProblem(value: string): string | null {
  return value.trim() && !isEmailAddress(value) ? t('A full e-mail address, such as name@example.com.') : null;
}

/** A typed birthday's problem, or null (none typed is none). */
export function birthdayProblem(typed: string, monthFirst = false): string | null {
  if (!typed.trim() || readTypedBirthday(typed, monthFirst)) return null;
  // The example's day is past 12, so it says which part comes first.
  return monthFirst ? t('A date such as 03/27/1990, or 03/27 without the year.') : t('A date such as 27/03/1990, or 27/03 without the year.');
}

/** What an empty contact's form says on saving, under its first name. */
export const emptyContactProblem = (): string => t('Give them at least a name, a number or an e-mail address.');
