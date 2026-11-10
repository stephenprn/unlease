/**
 * From the root: birthday notifications re-armed a moment after the address book, their setting or
 * the language changes, and what a pressed one asks done (open the contact, call, write; on the
 * birthday itself or the day after, « Message » writes the wish, the way picked on their page).
 */
import { useEffect, useRef } from 'react';

import { readBirthday } from '@unlease/contacts/services/birthdays';
import { callNumber as numberToCall } from '@unlease/contacts/services/phones';
import { wishDaysLate } from '@unlease/contacts/services/wishes';
import { selectLocale, useSettingsStore } from '@shared/app/store/settingsStore';
import { initialEvent, onForegroundEvent, type BirthdayEvent } from '@platform/notifications';

import { reconcileBirthdays } from '../birthdayAlerts';
import { later } from '../later';
import { callNumber, textNumber, writeEmail } from '../reach';
import { selectBirthdays, useContactsUiStore } from '../store/contactsUi';
import { useLibraryStore } from '../store/libraryStore';

const RECONCILE_AFTER_MS = 600;

/**
 * What a pressed notification asks: its contact opened, or called, or written to (it opens too, as
 * Google's do). « Message » on their birthday or the day after opens their page on « Souhaiter »
 * (the one way there is goes at once); the day before, it writes to their number, else their e-mail.
 */
export function answerBirthday(event: BirthdayEvent, open: (contactId: string, wish?: boolean) => void, now: number = Date.now()): void {
  const contact = useLibraryStore.getState().contacts[event.contactId];
  const birthday = contact ? readBirthday(contact.birthday) : null;
  if (event.kind === 'message' && birthday && wishDaysLate(birthday, now) !== null) {
    open(event.contactId, true);
    return;
  }
  open(event.contactId);
  const number = contact ? numberToCall(contact) : null;
  if (event.kind === 'call' && number) later(callNumber(number.number));
  if (event.kind !== 'message') return;
  const email = contact?.emails.find(entry => entry.address.trim());
  if (number) later(textNumber(number.number));
  else if (email) later(writeEmail(email.address));
}

export function useBirthdayAlerts(open: (contactId: string, wish?: boolean) => void): void {
  const contacts = useLibraryStore(s => s.contacts);
  const settings = useContactsUiStore(selectBirthdays);
  const locale = useSettingsStore(selectLocale);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => later(reconcileBirthdays()), RECONCILE_AFTER_MS);
    return () => clearTimeout(timer.current);
  }, [contacts, settings, locale]);

  useEffect(() => {
    const handle = (event: BirthdayEvent): void => answerBirthday(event, open);
    initialEvent()
      .then(event => event && setTimeout(() => handle(event), 400))
      .catch(() => undefined);
    return onForegroundEvent(handle);
  }, [open]);
}
