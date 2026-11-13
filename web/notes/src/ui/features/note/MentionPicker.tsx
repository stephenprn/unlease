/**
 * « @ » in a note: the people of Contacts and Agenda's events, by the caret (the suite's mention
 * menu, `MentionMenu`, ranked as every « @ » ranks them: `core/services/mentionSearch`). With nothing
 * typed yet, the favourites and the people changed last, then the coming events; as the word grows,
 * the names it starts first, under the head of their kind. Arrows move, Entrée or Tab picks, Échap
 * goes (the editor's keys: `BodyEditor.mentionKey`); a press picks too, the caret staying in the text.
 */
import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';

import { t, tx } from '@unlease/core/i18n';
import type { Ref } from '@unlease/core/refs';
import { closesAfter, mentionList, type MentionEntry, type MentionSection } from '@unlease/core/services/mentionSearch';
import { isLive } from '@unlease/contacts/models/contacts';
import { contactName, workLine } from '@unlease/contacts/services/names';

import { useContactsStore } from '@contacts/app/store/library';
import { MentionMenu, useMenuKeys, type MenuRow } from '@shared/ui/components/MentionMenu';
import { findEvents } from '../../../app/events/find';
import { useEventsStore } from '../../../app/events/store';
import { nameOfMention } from '../../../app/mentions';

export interface MentionPickerHandle {
  /** A key the editor hands over while the picker is up: true when it took it. */
  readonly key: (key: string) => boolean;
}

interface Candidate extends MentionEntry {
  readonly target: Ref;
  readonly detail: string;
  readonly icon: 'person' | 'calendar';
}

/** The kinds' heads, translated where shown. */
const PEOPLE = tx('Contacts');
const EVENTS = tx('Events');

export interface MentionPickerProps {
  readonly query: string;
  readonly anchor: DOMRect;
  readonly onPick: (target: Ref) => void;
  /** Échap: the « @ » stays as typed. */
  readonly onClose?: () => void;
}

/** Every live person, the favourites then those changed last, with what else finds them. */
function usePeople(): readonly Candidate[] {
  const contacts = useContactsStore(s => s.contacts);
  return useMemo(
    () =>
      Object.values(contacts)
        .filter(isLive)
        .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.editedAt - a.editedAt)
        .map(person => {
          const work = workLine(person);
          return {
            target: { type: 'contact', id: person.id },
            title: contactName(person),
            also: [work, ...person.phones.map(entry => entry.number), ...person.emails.map(entry => entry.address)].join(' '),
            boost: person.favorite ? 1 : 0,
            detail: work || person.phones[0]?.number || person.emails[0]?.address || '',
            icon: 'person' as const,
          };
        }),
    [contacts],
  );
}

export const MentionPicker = forwardRef<MentionPickerHandle, MentionPickerProps>(function MentionPicker({ query, anchor, onPick, onClose }, ref) {
  const people = usePeople();
  const events = useEventsStore(s => s.events);
  const feeds = useEventsStore(s => s.feeds);
  // Agenda's own search reads an event's place and notes too: its order is kept.
  const found = useMemo(
    (): readonly Candidate[] => findEvents(events, feeds, query, target => nameOfMention(target) ?? '', 5).map(hit => ({ target: { type: 'event', id: hit.id }, title: hit.title || t('Untitled'), detail: hit.when, icon: 'calendar' as const })),
    [events, feeds, query],
  );
  const rows = useMemo((): readonly MenuRow[] => {
    const sections: MentionSection<string, Candidate>[] = [
      { section: PEOPLE, entries: people },
      { section: EVENTS, entries: found, ranked: true },
    ];
    return mentionList(sections, query, { grouped: true, perSection: 6, idle: 4, total: 12 }).map(hit => ({
      key: `${hit.entry.target.type}:${hit.entry.target.id}`,
      section: t(hit.section),
      label: hit.entry.title,
      detail: hit.entry.detail,
      icon: hit.entry.icon,
      pick: () => onPick(hit.entry.target),
    }));
  }, [people, found, query, onPick]);
  const keys = useMenuKeys(rows, () => onClose?.());
  // The menu stands by the « @ », where it opened, while the word after it grows.
  const [opened] = useState(anchor);
  // Words nothing answers after a space (« @rdv demain »): no menu, the keys are the text's.
  const gone = closesAfter(query, rows.length);
  useImperativeHandle(ref, () => ({ key: key => (gone || (key === 'Escape' && !onClose) ? false : keys.take(key)) }), [keys, onClose, gone]);
  if (gone) return null;
  return (
    <MentionMenu
      anchor={opened}
      rows={rows}
      active={keys.active}
      onActive={keys.setActive}
      id="note-mention-menu"
      label={t('Mention a contact or an event')}
      listLabel={t('Contacts and events')}
      empty={query.trim() ? t('No contact or event goes by that name.') : t('No contacts yet.')}
    />
  );
});
