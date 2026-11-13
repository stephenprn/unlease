/**
 * What « @ » offers in an event's description, from the records this web app holds: Contacts'
 * people (the favourites, then those changed last), Agenda's events (the coming ones, nearest
 * first), Pages' pages, Carnet's notes, collections and links (the latest first); ranked as every
 * « @ » of the suite ranks them (`core/services/mentionSearch`), a few of each while nothing is typed.
 */
import { useMemo } from 'react';

import { t, tx } from '@unlease/core/i18n';
import type { Ref } from '@unlease/core/refs';
import { mentionList, type MentionEntry, type MentionSection } from '@unlease/core/services/mentionSearch';
import { plural } from '@unlease/core/services/format';
import { displayHost, prettyUrl } from '@unlease/core/services/url';
import type { GlyphName } from '@unlease/design/glyphs';
import { isLive as isLiveEvent } from '@unlease/calendar/models/events';
import { whenLine } from '@unlease/calendar/services/eventText';
import { findOccurrence, upcoming } from '@unlease/calendar/services/occurrences';
import { isLive as isLiveContact } from '@unlease/contacts/models/contacts';
import { contactName, workLine } from '@unlease/contacts/services/names';
import { shownTitle } from '@unlease/notes/models/entities';
import { ancestorPages, isInBin } from '@unlease/pages/services/blocks';

import { useMinute } from '@shared/app/hooks/useMinute';
import { useContactsStore } from '@contacts/app/store/library';
import { useLibraryStore } from '@notes/app/store/library';
import { useCalendarStore } from '../../app/store/library';
import { usePageBlocksStore } from '../../app/store/pageBlocks';

/** A kind's head, translated where shown. */
const SECTIONS = { contact: tx('Contacts'), event: tx('Events'), page: tx('Pages'), note: tx('Notes'), line: tx('Collections'), link: tx('Links') } as const;
type Section = (typeof SECTIONS)[keyof typeof SECTIONS];

export interface MentionCandidate extends MentionEntry {
  readonly target: Ref;
  readonly icon: GlyphName;
  readonly emoji?: string;
  /** What tells it apart, worked out only for the rows shown (an event's next day). */
  readonly detail: () => string;
}

export interface MentionHitRow {
  readonly section: string;
  readonly candidate: MentionCandidate;
}

const DAY = 86_400_000;

/** How likely something changed `at` is wanted: 1 today, fading over a month. */
const recency = (at: number, now: number): number => Math.max(0, 1 - (now - at) / (30 * DAY));

/** Every kind's candidates, in the menu's order while nothing is typed; `except` (the event being edited) left out. */
export function useMentionSections(except: string | null): readonly MentionSection<Section, MentionCandidate>[] {
  const contacts = useContactsStore(s => s.contacts);
  const notes = useLibraryStore(s => s.notes);
  const links = useLibraryStore(s => s.links);
  const linksByNote = useLibraryStore(s => s.linksByNote);
  const blocks = usePageBlocksStore(s => s.blocks);
  const events = useCalendarStore(s => s.events);
  const now = useMinute();
  return useMemo(() => {
    const people: MentionCandidate[] = Object.values(contacts)
      .filter(isLiveContact)
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.editedAt - a.editedAt)
      .map(contact => {
        const work = workLine(contact);
        const phone = contact.phones.find(entry => entry.number.trim())?.number.trim() ?? '';
        const mail = contact.emails.find(entry => entry.address.trim())?.address.trim() ?? '';
        return {
          target: { type: 'contact', id: contact.id },
          title: contactName(contact),
          also: [work, ...contact.phones.map(entry => entry.number), ...contact.emails.map(entry => entry.address)].join(' '),
          boost: contact.favorite ? 1 : recency(contact.editedAt, now) / 2,
          icon: 'person',
          detail: () => work || phone || mail,
        };
      });
    // The coming ones, nearest first (a series by its next occurrence), then the others, the latest first.
    const live = Object.values(events).filter(event => isLiveEvent(event) && !event.recurringId && !event.feedId && event.id !== except && event.title.trim());
    const next = new Map<string, number>();
    upcoming(Object.values(events).filter(isLiveEvent), now, 90, 200).forEach((item, at) => {
      if (!next.has(item.seriesId)) next.set(item.seriesId, at);
    });
    const coming = (id: string): number => next.get(id) ?? Infinity;
    const eventRows: MentionCandidate[] = live
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
    const kept = Object.values(notes)
      .filter(note => note.deletedAt === null && note.trashedAt === null && shownTitle(note).trim())
      .sort((a, b) => b.editedAt - a.editedAt);
    const noteRows: MentionCandidate[] = kept
      .filter(note => note.kind !== 'links')
      .map(note => ({ target: { type: 'note', id: note.id }, title: shownTitle(note).trim(), boost: recency(note.editedAt, now), icon: note.kind === 'checklist' ? 'checklist' : 'note', detail: () => (note.kind === 'checklist' ? t('List') : note.kind === 'drawing' ? t('Drawing') : t('Note')) }));
    const collections: MentionCandidate[] = kept
      .filter(note => note.kind === 'links')
      .map(note => ({ target: { type: 'note', id: note.id }, title: shownTitle(note).trim(), boost: recency(note.editedAt, now), icon: 'collections', detail: () => plural((linksByNote[note.id] ?? []).length, 'link') }));
    const linkRows: MentionCandidate[] = Object.values(links)
      .filter(link => link.deletedAt === null)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(link => ({ target: { type: 'link', id: link.id }, title: link.title.trim() || prettyUrl(link.url), also: link.url, boost: recency(link.createdAt, now) / 2, icon: 'link', detail: () => link.siteName || displayHost(link.url) }));
    return [
      { section: SECTIONS.contact, entries: people },
      { section: SECTIONS.event, entries: eventRows },
      { section: SECTIONS.page, entries: pages },
      { section: SECTIONS.note, entries: noteRows },
      { section: SECTIONS.line, entries: collections },
      { section: SECTIONS.link, entries: linkRows },
    ];
  }, [contacts, notes, links, linksByNote, blocks, events, except, now]);
}

/** What « @ » offers for `query`: grouped by kind, the kind of the best answer first. */
export function mentionHits(sections: readonly MentionSection<Section, MentionCandidate>[], query: string): MentionHitRow[] {
  return mentionList(sections, query, { grouped: true, perSection: 5, idle: 3, total: 18 }).map(hit => ({ section: t(hit.section), candidate: hit.entry }));
}
