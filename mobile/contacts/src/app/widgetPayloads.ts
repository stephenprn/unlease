/**
 * What each home-screen widget draws, handed to it as JSON (`widgets.ts`): the widgets never read the
 * database. « Appels rapides » shows the favourites, or one label's contacts, in the list's order:
 * each with their face (a photo, kept here or on the server, else initials on their pigment) and the
 * number a tap calls (`callNumber`), none when they have no number (a tap then opens them).
 */
import { t } from '@unlease/core/i18n';
import type { Contact } from '@unlease/contacts/models/contacts';
import { avatarColor } from '@unlease/contacts/services/avatar';
import { contactName, initials, sortContacts, type SortOrder } from '@unlease/contacts/services/names';
import { callNumber, dialable } from '@unlease/contacts/services/phones';

import type { LibraryState } from './store/libraryStore';

/** The most faces one widget holds: a few rows of them, and their pictures stay small enough for the launcher. */
export const MAX_PEOPLE = 24;

export interface WidgetPerson {
  readonly id: string;
  /** The first name, as a face's caption; the whole name when there is none. */
  readonly name: string;
  /** Said by TalkBack: « Appeler Léa Martin ». */
  readonly said: string;
  readonly initials: string;
  /** Their pigment, behind the initials. */
  readonly color: string;
  /** Their photo's blob, '' for none. */
  readonly photo: string;
  /** This phone's copy of it, before (or after) it was sent; '' for none. */
  readonly local: string;
  /** What a tap dials, '' for no number: the tap opens them. The tap names the contact only, and the widget finds the number here (`WidgetRouterActivity`). */
  readonly call: string;
}

export interface CallsPayload {
  /** The widget's target, so a picture of another one is never drawn (`favorites`, `label:<id>`). */
  readonly id: string;
  readonly kind: 'favorites' | 'label';
  readonly title: string;
  /** A label's pigment; '' for the favourites. */
  readonly color: string;
  /** What the head opens: `unlease-contacts://<open>`. */
  readonly open: string;
  /** Its label was deleted. */
  readonly gone: boolean;
  readonly people: readonly WidgetPerson[];
}

function person(contact: Contact, localPaths: ReadonlyMap<string, string>): WidgetPerson {
  const name = contactName(contact);
  const number = callNumber(contact);
  return {
    id: contact.id,
    name: contact.firstName.trim() || name,
    said: number ? t('Call {name}', { name }) : name,
    initials: initials(contact),
    color: avatarColor(contact.id),
    photo: contact.photoId ?? '',
    local: contact.photoId ? (localPaths.get(contact.photoId) ?? '') : '',
    call: number ? dialable(number.number) : '',
  };
}

/** « Appels rapides » for `target` (`favorites` or `label:<id>`). */
export function callsPayload(target: string, state: Pick<LibraryState, 'contacts' | 'liveContacts' | 'labels'>, order: SortOrder, localPaths: ReadonlyMap<string, string> = new Map()): CallsPayload {
  const labelId = target.startsWith('label:') ? target.slice('label:'.length) : null;
  const label = labelId ? state.labels[labelId] : undefined;
  const live = state.liveContacts.map(id => state.contacts[id]).filter((contact): contact is Contact => contact !== undefined);
  const chosen = labelId ? live.filter(contact => contact.labelIds.includes(labelId)) : live.filter(contact => contact.favorite);
  return {
    id: target,
    kind: labelId ? 'label' : 'favorites',
    title: labelId ? (label?.name ?? '') : t('Favourites'),
    color: label?.color ?? '',
    open: labelId ? `label/${labelId}` : 'favorites',
    gone: labelId !== null && (!label || label.deletedAt !== null),
    people: sortContacts(chosen, order)
      .slice(0, MAX_PEOPLE)
      .map(contact => person(contact, localPaths)),
  };
}
