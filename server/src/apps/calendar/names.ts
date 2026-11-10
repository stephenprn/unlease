/**
 * What a mention in an event's description reads as outside the apps. In a backup, the person's
 * own: a contact's name, a page's, a note's, a link's or another event's title now; null once gone.
 * At the published calendar's address, which anyone holding it reads: a contact's name and the
 * title of an event it publishes anyway, nothing else (`publishedNamer`). Read from every record
 * the server holds.
 */
import type { CalendarEvent } from '@unlease/calendar/models/events';
import type { Ref } from '@unlease/core/refs';
import { resolveContact } from '@unlease/contacts/services/duplicates';
import { contactName } from '@unlease/contacts/services/names';
import { contactFromRecord } from '@unlease/contacts/sync/entities';
import type { Contact } from '@unlease/contacts/models/contacts';
import { eventFromRecord } from '@unlease/calendar/sync/entities';
import { linkFromRecord, noteFromRecord } from '@unlease/notes/sync/entities';
import { bodyText } from '@unlease/notes/services/noteBody';
import type { StoredRecord } from '../../sync/records';
import { contactNamer } from '../contacts/names';

const live = (record: StoredRecord | undefined): record is StoredRecord => !!record && (record.fields.deletedAt === null || record.fields.deletedAt === undefined);

export function calendarNamer(all: readonly StoredRecord[]): (target: Ref) => string | null {
  const byKey = new Map<string, StoredRecord>();
  for (const record of all) byKey.set(`${record.type}:${record.id}`, record);
  const contact = contactNamer(all);
  return target => {
    switch (target.type) {
      case 'contact':
        return contact(target);
      case 'page': {
        const block = byKey.get(`block:${target.id}`);
        return live(block) ? (typeof block.fields.text === 'string' && block.fields.text.trim()) || 'Sans titre' : null;
      }
      case 'note': {
        const record = byKey.get(`note:${target.id}`);
        if (!live(record)) return null;
        const note = noteFromRecord(record);
        return note.title.trim() || bodyText(note).split('\n').find(line => line.trim())?.trim() || 'Sans titre';
      }
      case 'link': {
        const record = byKey.get(`link:${target.id}`);
        if (!live(record)) return null;
        const link = linkFromRecord(record);
        return link.title || link.url;
      }
      case 'event': {
        const record = byKey.get(`calendarEvent:${target.id}`);
        return live(record) ? eventFromRecord(record).title.trim() || 'Sans titre' : null;
      }
      default:
        return null;
    }
  };
}

/** What any other mention reads as at the published address: the same in French and English, and the same for a note, a private page or one gone, so it tells nothing apart. */
export const UNNAMED = '…';

/**
 * The published calendar's names: a contact (the one a merge kept) out of the bin, and an event the
 * address publishes (`published`: one's own, live); null for anything else (a note, a link, a page,
 * private or not, a subscription's event, whatever is in the bin), which reads as `UNNAMED`.
 */
export function publishedNamer(all: readonly StoredRecord[], published: readonly CalendarEvent[]): (target: Ref) => string | null {
  const contacts: Record<string, Contact> = {};
  for (const record of all) if (record.type === 'contact') contacts[record.id] = contactFromRecord(record);
  const events = new Map(published.map(event => [event.id, event]));
  return target => {
    switch (target.type) {
      case 'contact': {
        const contact = resolveContact(contacts, target.id);
        return contact && contact.trashedAt === null ? contactName(contact) : null;
      }
      case 'event':
        return events.get(target.id)?.title.trim() || null;
      default:
        return null;
    }
  };
}
