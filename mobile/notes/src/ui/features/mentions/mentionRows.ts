/**
 * « @ » in a note: whom or what it may mention, from the records this phone holds: Contacts' people
 * (the favourites, then those changed last; found by name, number, e-mail or work line), then
 * Agenda's events (found by their words, the coming ones first when nothing is typed); ranked as
 * every « @ » of the suite ranks them (`core/services/mentionSearch`), the best first.
 */
import { useMemo } from 'react';

import type { Ref } from '@unlease/core/refs';
import { t } from '@unlease/core/i18n';
import { mentionList, type MentionEntry, type MentionSection } from '@unlease/core/services/mentionSearch';
import { contactName, workLine } from '@unlease/contacts/services/names';
import { mentionName } from '@unlease/notes/services/noteMentions';
import { useLibraryStore } from '@app/store/libraryStore';

import type { SuggestionRow } from '@shared/ui/components';
import { findEvents } from '../events/findEvents';

interface Candidate extends MentionEntry {
  readonly target: Ref;
  readonly detail: string;
  readonly icon: 'person' | 'calendar';
}

/** The rows for `query` (null: none asked), each putting its mention in place through `onPick`. */
export function useMentionRows(query: string | null, onPick: (target: Ref) => void): readonly SuggestionRow[] {
  const people = useLibraryStore(s => s.people);
  const agenda = useLibraryStore(s => s.agenda);
  const asking = query !== null;
  const everyone = useMemo((): readonly Candidate[] => {
    if (!asking) return [];
    return people.liveContacts
      .map(id => people.contacts[id])
      .filter(contact => contact !== undefined)
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.editedAt - a.editedAt)
      .map(contact => {
        const work = workLine(contact);
        return {
          target: { type: 'contact', id: contact.id },
          title: contactName(contact),
          also: [work, ...contact.phones.map(entry => entry.number), ...contact.emails.map(entry => entry.address)].join(' '),
          boost: contact.favorite ? 1 : 0,
          detail: work || contact.phones.find(entry => entry.number.trim())?.number.trim() || contact.emails.find(entry => entry.address.trim())?.address.trim() || '',
          icon: 'person',
        };
      });
  }, [asking, people]);
  return useMemo(() => {
    if (query === null) return [];
    const events: Candidate[] = findEvents(agenda.events, agenda.feeds, query, mentionName, 6).map(hit => ({ target: { type: 'event', id: hit.id }, title: hit.title || t('Sans titre'), detail: hit.when, icon: 'calendar' }));
    const sections: MentionSection<string, Candidate>[] = [
      { section: 'contact', entries: everyone },
      // Agenda's own search reads an event's place and notes too: its order is kept.
      { section: 'event', entries: events, ranked: true },
    ];
    return mentionList(sections, query, { perSection: 6, idle: 3, total: 10 }).map(({ entry }) => ({
      key: `${entry.target.type}:${entry.target.id}`,
      title: entry.title,
      detail: entry.detail,
      icon: entry.icon,
      onPress: () => onPick(entry.target),
    }));
  }, [query, everyone, agenda, onPick]);
}
