/**
 * What « @ » offers in an event's description on the phone, from the records Agenda holds (it syncs
 * Contacts', Pages' and Carnet's): people (the favourites, then those changed last), events (the
 * coming ones, nearest first), pages, notes, collections, links (the latest first); ranked as every
 * « @ » of the suite ranks them (`core/services/mentionSearch`), in one list, the best answer first.
 */
import { t, tx } from '@unlease/core/i18n';
import type { Ref } from '@unlease/core/refs';
import { plural } from '@unlease/core/services/format';
import { mentionList, type MentionEntry, type MentionSection } from '@unlease/core/services/mentionSearch';
import { displayHost, prettyUrl } from '@unlease/core/services/url';
import type { GlyphName } from '@unlease/design/glyphs';
import { isLive as isLiveEvent } from '@unlease/calendar/models/events';
import { whenLine } from '@unlease/calendar/services/eventText';
import { findOccurrence, upcoming } from '@unlease/calendar/services/occurrences';
import { contactName, workLine } from '@unlease/contacts/services/names';
import { shownTitle } from '@unlease/notes/models/entities';
import { ancestorPages, isInBin } from '@unlease/pages/services/blocks';
import type { LibraryState } from '@app/store/libraryStore';

export interface MentionCandidate extends MentionEntry {
  readonly target: Ref;
  readonly icon: GlyphName;
  readonly emoji?: string;
  /** What tells it apart, worked out only for the rows shown. */
  readonly detail: () => string;
}

const KINDS = { contact: tx('Contacts'), event: tx('Events'), page: tx('Pages'), note: tx('Notes'), line: tx('Collections'), link: tx('Links') } as const;
type Kind = (typeof KINDS)[keyof typeof KINDS];

const DAY = 86_400_000;
const recency = (at: number, now: number): number => Math.max(0, 1 - (now - at) / (30 * DAY));

/** Every kind's candidates, in the panel's order while nothing is typed; `except` (the event being edited) left out. */
export function mentionSections(state: LibraryState, except: string | null, now: number): MentionSection<Kind, MentionCandidate>[] {
  const { people, carnet, blocks, events } = state;
  const contacts: MentionCandidate[] = people.liveContacts
    .map(id => people.contacts[id])
    .filter(contact => contact !== undefined)
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.editedAt - a.editedAt)
    .map(contact => {
      const work = workLine(contact);
      return {
        target: { type: 'contact', id: contact.id },
        title: contactName(contact),
        also: [work, ...contact.phones.map(entry => entry.number), ...contact.emails.map(entry => entry.address)].join(' '),
        boost: contact.favorite ? 1 : recency(contact.editedAt, now) / 2,
        icon: 'person',
        detail: () => work || contact.phones.find(entry => entry.number.trim())?.number.trim() || contact.emails.find(entry => entry.address.trim())?.address.trim() || '',
      };
    });
  const next = new Map<string, number>();
  upcoming(Object.values(events).filter(isLiveEvent), now, 90, 200).forEach((item, at) => {
    if (!next.has(item.seriesId)) next.set(item.seriesId, at);
  });
  const coming = (id: string): number => next.get(id) ?? Infinity;
  const eventRows: MentionCandidate[] = Object.values(events)
    .filter(event => isLiveEvent(event) && !event.recurringId && !event.feedId && event.id !== except && event.title.trim())
    .sort((a, b) => coming(a.id) - coming(b.id) || b.editedAt - a.editedAt)
    .map(event => ({
      target: { type: 'event', id: event.id },
      title: event.title.trim(),
      also: event.place,
      boost: next.has(event.id) ? 1 - Math.min(1, next.get(event.id)! / 50) : 0,
      icon: 'calendar',
      detail: () => {
        const shown = (event.rrule ? upcoming([event, ...Object.values(events).filter(other => other.recurringId === event.id)], now, 400, 1)[0] : undefined) ?? findOccurrence(events, event.id, null);
        return shown ? whenLine(shown, now) : '';
      },
    }));
  const pages: MentionCandidate[] = Object.values(blocks)
    .filter(block => block.kind === 'page' && block.deletedAt === null && !isInBin(blocks, block.id))
    .sort((a, b) => b.editedAt - a.editedAt)
    .map(block => {
      const path = ancestorPages(blocks, block.id).map(page => page.text.trim() || t('Untitled')).join(' / ');
      return { target: { type: 'page', id: block.id }, title: block.text.trim() || t('Untitled'), also: path, boost: recency(block.editedAt, now), icon: 'page', ...(block.icon ? { emoji: block.icon } : {}), detail: () => path };
    });
  const kept = Object.values(carnet.notes)
    .filter(note => note.deletedAt === null && note.trashedAt === null && shownTitle(note).trim())
    .sort((a, b) => b.editedAt - a.editedAt);
  const notes: MentionCandidate[] = kept
    .filter(note => note.kind !== 'links')
    .map(note => ({ target: { type: 'note', id: note.id }, title: shownTitle(note).trim(), boost: recency(note.editedAt, now), icon: note.kind === 'checklist' ? 'checklist' : 'note', detail: () => (note.kind === 'checklist' ? t('List') : note.kind === 'drawing' ? t('Drawing') : t('Note')) }));
  const collections: MentionCandidate[] = kept
    .filter(note => note.kind === 'links')
    .map(note => ({ target: { type: 'note', id: note.id }, title: shownTitle(note).trim(), boost: recency(note.editedAt, now), icon: 'collections', detail: () => plural((carnet.linksByNote[note.id] ?? []).length, 'link') }));
  const links: MentionCandidate[] = Object.values(carnet.links)
    .filter(link => link.deletedAt === null)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(link => ({ target: { type: 'link', id: link.id }, title: link.title.trim() || prettyUrl(link.url), also: link.url, boost: recency(link.createdAt, now) / 2, icon: 'link', detail: () => link.siteName || displayHost(link.url) }));
  return [
    { section: KINDS.contact, entries: contacts },
    { section: KINDS.event, entries: eventRows },
    { section: KINDS.page, entries: pages },
    { section: KINDS.note, entries: notes },
    { section: KINDS.line, entries: collections },
    { section: KINDS.link, entries: links },
  ];
}

/** The candidates for `query`, the best first whatever their kind (a few of each while nothing is typed). */
export function mentionCandidates(sections: readonly MentionSection<Kind, MentionCandidate>[], query: string): MentionCandidate[] {
  return mentionList(sections, query, { perSection: 6, idle: 2, total: 12 }).map(hit => hit.entry);
}
