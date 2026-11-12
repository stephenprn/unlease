/**
 * « Effacer des données » in Contacts (`core/services/erase`): three parts, apart from each other so
 * each can be kept. The contacts (every one but the favourites, those in the bin included), the
 * favourites (the starred ones), and the labels. A contact merged into another (in the bin with
 * `mergedInto`) goes with the one it was merged into, so keeping the favourites keeps what a mention
 * of their old cards opens. Erasing the labels takes them off the contacts that stay, as deleting one
 * label does.
 */
import { t } from '@unlease/core/i18n';
import type { ErasePart } from '@unlease/core/services/erase';
import { plural } from '@unlease/core/services/format';
import type { Fields } from '@unlease/core/sync/record';
import type { Contact, ContactLabel } from '../models/contacts';
import { resolveContact } from './duplicates';

/** What the parts are counted from: every contact and label this device holds, deleted ones too. */
export interface EraseLibrary {
  readonly contacts: Readonly<Record<string, Contact>>;
  readonly labels: Readonly<Record<string, ContactLabel>>;
}

export const CONTACTS_ERASE_PARTS = ['contacts', 'favorites', 'labels'] as const;
export type ContactsErasePart = (typeof CONTACTS_ERASE_PARTS)[number];

/** A change the erase writes: a tombstone, or the labels erased taken off a contact that stays. */
export interface EraseWrite {
  readonly type: 'contact' | 'contactLabel';
  readonly id: string;
  readonly patch: Fields;
}

/** The part a contact goes with: a live favourite, one merged into a live favourite, or every other one. */
function partOf(contact: Contact, contacts: Readonly<Record<string, Contact>>): 'contacts' | 'favorites' {
  if (contact.mergedInto !== null && contact.trashedAt !== null) {
    const kept = resolveContact(contacts, contact.id);
    return kept && kept.id !== contact.id && kept.trashedAt === null && kept.favorite ? 'favorites' : 'contacts';
  }
  return contact.trashedAt === null && contact.favorite ? 'favorites' : 'contacts';
}

interface Sorted {
  readonly contacts: Contact[];
  readonly favorites: Contact[];
  readonly labels: ContactLabel[];
}

function sort(library: EraseLibrary): Sorted {
  const sorted: Sorted = { contacts: [], favorites: [], labels: Object.values(library.labels).filter(label => label.deletedAt === null) };
  for (const contact of Object.values(library.contacts)) if (contact.deletedAt === null) sorted[partOf(contact, library.contacts)].push(contact);
  return sorted;
}

/** The parts as the form lists them, each counted from the records as they are now. */
export function eraseParts(library: EraseLibrary): ErasePart[] {
  const { contacts, favorites, labels } = sort(library);
  const binned = contacts.filter(contact => contact.trashedAt !== null).length;
  const starred = favorites.filter(contact => contact.trashedAt === null).length;
  const merged = favorites.length - starred;
  const people = plural(contacts.length, 'contact');
  const contactsDetail =
    contacts.length === 0
      ? t('Aucun contact hors favoris')
      : favorites.length > 0
        ? binned > 0
          ? t('{contacts} hors favoris, dont {binned} dans la corbeille', { contacts: people, binned })
          : t('{contacts} hors favoris', { contacts: people })
        : binned > 0
          ? t('{contacts}, dont {binned} dans la corbeille', { contacts: people, binned })
          : people;
  const starredWords = t('{contacts} en favori', { contacts: plural(starred, 'contact') });
  return [
    { id: 'contacts', title: t('Contacts'), detail: contactsDetail, count: contacts.length, glyph: 'people' },
    {
      id: 'favorites',
      title: t('Favoris'),
      detail: favorites.length === 0 ? t('Aucun favori') : merged > 0 ? t('{favorites}, et {merged} dans la corbeille', { favorites: starredWords, merged: plural(merged, 'doublon fusionné', 'doublons fusionnés') }) : starredWords,
      count: favorites.length,
      glyph: 'star',
    },
    {
      id: 'labels',
      title: t('Libellés'),
      detail: labels.length === 0 ? t('Aucun libellé') : t('{labels} ; les contacts qui les portent restent', { labels: plural(labels.length, 'libellé') }),
      count: labels.length,
      glyph: 'tag',
    },
  ];
}

/**
 * The batch erasing the parts `chosen`: a tombstone for each of their records (those in the bin
 * too), and, the labels erased, each contact that stays without them. Records already deleted are
 * left alone.
 */
export function eraseChanges(library: EraseLibrary, chosen: ReadonlySet<string>, now: number): EraseWrite[] {
  const sorted = sort(library);
  const writes: EraseWrite[] = [];
  const erased = new Set<string>();
  for (const part of ['contacts', 'favorites'] as const) {
    if (!chosen.has(part)) continue;
    for (const contact of sorted[part]) {
      erased.add(contact.id);
      writes.push({ type: 'contact', id: contact.id, patch: { deletedAt: now } });
    }
  }
  if (chosen.has('labels') && sorted.labels.length > 0) {
    const gone = new Set(sorted.labels.map(label => label.id));
    for (const label of sorted.labels) writes.push({ type: 'contactLabel', id: label.id, patch: { deletedAt: now } });
    for (const contact of Object.values(library.contacts)) {
      if (contact.deletedAt !== null || erased.has(contact.id) || !contact.labelIds.some(id => gone.has(id))) continue;
      writes.push({ type: 'contact', id: contact.id, patch: { labelIds: contact.labelIds.filter(id => !gone.has(id)) } });
    }
  }
  return writes;
}

/** How many records a batch erases (its tombstones; a contact only losing its labels is not one). */
export function erasedCount(writes: readonly EraseWrite[]): number {
  return writes.filter(write => 'deletedAt' in write.patch).length;
}
