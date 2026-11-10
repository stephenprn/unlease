/**
 * Carnet's notes and links that point at something (`GET /api/notes/mentions`, `core/sync/mentions`):
 * a formatted note whose body holds the mention (`{@contact=<id>}`), and, for a person, a note or a
 * link that names them among its people (`contactIds`: a gift idea kept from Contacts, a note about
 * them), said `linked`. The most recently changed first; nothing in the bin, nor in a collection in
 * the bin.
 */
import { MENTION_PLACES_MAX, mentionMarkups, type MentionPlace } from '@unlease/core/sync/mentions';
import { editedAt } from '@unlease/core/sync/record';
import { prettyUrl } from '@unlease/core/services/url';
import { shownTitle, type Note } from '@unlease/notes/models/entities';
import { bodyText } from '@unlease/notes/services/noteBody';
import { linkFromRecord, noteFromRecord } from '@unlease/notes/sync/entities';
import type { RecordStore } from '../../sync/records';

const names = (value: unknown, ids: readonly string[]): boolean => Array.isArray(value) && value.some(id => typeof id === 'string' && ids.includes(id));

const noteTitle = (note: Note): string => shownTitle(note).trim() || bodyText(note).trim().split('\n')[0]!.slice(0, 80);

export function notesMentioning(records: RecordStore, type: string, ids: readonly string[]): MentionPlace[] {
  const markups = mentionMarkups(type, ids);
  const people = type === 'contact';
  const places: MentionPlace[] = [];
  for (const record of records.ofType('note')) {
    const body = record.fields.body;
    const mentions = typeof body === 'string' && markups.some(markup => body.includes(markup));
    const linked = people && names(record.fields.contactIds, ids);
    if (!mentions && !linked) continue;
    const note = noteFromRecord(record);
    if (note.deletedAt !== null || note.trashedAt !== null) continue;
    places.push({ app: 'notes', type: 'note', id: note.id, title: noteTitle(note), within: '', icon: null, editedAt: note.editedAt, ...(linked && !mentions ? { linked: true } : {}) });
  }
  if (people) {
    for (const record of records.ofType('link')) {
      if (!names(record.fields.contactIds, ids)) continue;
      const link = linkFromRecord(record);
      if (link.deletedAt !== null) continue;
      const within = records.get('note', link.noteId);
      const collection = within ? noteFromRecord(within) : null;
      if (!collection || collection.deletedAt !== null || collection.trashedAt !== null) continue;
      places.push({ app: 'notes', type: 'link', id: link.id, title: link.title.trim() || prettyUrl(link.url), within: shownTitle(collection).trim(), icon: null, editedAt: editedAt(record), linked: true });
    }
  }
  return places.sort((a, b) => b.editedAt - a.editedAt).slice(0, MENTION_PLACES_MAX);
}
