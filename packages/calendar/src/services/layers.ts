/**
 * What the calendar shows of the other apps, each a layer one can hide (`CalendarPrefs`): the
 * contacts' birthdays (Contacts), the notes' reminders (Carnet). Pages' dates come from Pages'
 * package (`pages/services/pageDates`), which sits above this one.
 */
import type { Contact } from '@unlease/contacts/models/contacts';
import { readBirthday } from '@unlease/contacts/services/birthdays';
import { contactName } from '@unlease/contacts/services/names';
import type { Note } from '@unlease/notes/models/entities';
import { bodyText } from '@unlease/notes/services/noteBody';
import type { Day } from '../models/events';
import { daysInMonth, dayKey, instantToDay } from './time';

export interface BirthdayItem {
  /** `birthday:<contact>:<day>`. */
  readonly key: string;
  readonly contactId: string;
  readonly name: string;
  readonly day: Day;
  /** The age turned that day, when the year is known. */
  readonly age: number | null;
}

/** Every birthday of the live contacts in [from, to); a 29 February falls on the 28th in other years. */
export function birthdaysIn(contacts: Iterable<Contact>, from: Day, to: Day): BirthdayItem[] {
  const out: BirthdayItem[] = [];
  const firstYear = Number(from.slice(0, 4));
  const lastYear = Number(to.slice(0, 4));
  for (const contact of contacts) {
    if (contact.deletedAt !== null || contact.trashedAt !== null || contact.mergedInto) continue;
    const birthday = readBirthday(contact.birthday);
    if (!birthday) continue;
    for (let year = firstYear; year <= lastYear; year += 1) {
      const day = dayKey(year, birthday.month, Math.min(birthday.day, daysInMonth(year, birthday.month)));
      if (day < from || day >= to) continue;
      const age = birthday.year !== null && year > birthday.year ? year - birthday.year : null;
      out.push({ key: `birthday:${contact.id}:${day}`, contactId: contact.id, name: contactName(contact), day, age });
    }
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.name.localeCompare(b.name)));
}

export interface ReminderItem {
  /** `reminder:<note>`. */
  readonly key: string;
  readonly noteId: string;
  /** Its title, or its text's first line. */
  readonly title: string;
  readonly at: number;
  readonly day: Day;
  readonly kind: Note['kind'];
}

/** Carnet's notes with a reminder in [fromAt, toAt): neither in the bin nor gone. */
export function remindersIn(notes: Iterable<Note>, fromAt: number, toAt: number): ReminderItem[] {
  const out: ReminderItem[] = [];
  for (const note of notes) {
    if (note.reminderAt === null || note.deletedAt !== null || note.trashedAt !== null) continue;
    if (note.reminderAt < fromAt || note.reminderAt >= toAt) continue;
    const title = note.title.trim() || bodyText(note).split('\n').find(line => line.trim())?.trim() || '';
    out.push({ key: `reminder:${note.id}`, noteId: note.id, title, at: note.reminderAt, day: instantToDay(note.reminderAt), kind: note.kind });
  }
  return out.sort((a, b) => a.at - b.at);
}
