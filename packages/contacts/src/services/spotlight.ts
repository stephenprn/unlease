/**
 * What the spotlight searches of Contacts (`searchIndex`): every live contact as a document, its
 * name the title, its company and note as the body, its numbers, emails, addresses and labels as
 * meta. Nothing in the bin.
 */
import { spotKey, type SpotMeta } from '@unlease/core/services/spotlight';
import type { SearchDoc, SearchPart } from '@unlease/core/services/searchIndex';
import type { Contact, ContactLabel } from '../models/contacts';
import { addressLine } from './addresses';
import { nameOrNull } from './names';

export const CONTACTS_SPOT_TYPES = ['contact'] as const;

export type ContactsSpotType = (typeof CONTACTS_SPOT_TYPES)[number];

export function contactsSpotlightDocs(contacts: Iterable<Contact>, labels: Readonly<Record<string, ContactLabel>>): SearchDoc<SpotMeta>[] {
  const docs: SearchDoc<SpotMeta>[] = [];
  for (const contact of contacts) {
    if (contact.deletedAt !== null || contact.trashedAt !== null) continue;
    const parts: SearchPart[] = [];
    const work = [contact.jobTitle, contact.company].filter(part => part.trim()).join(', ');
    if (work) parts.push({ text: work, role: 'heading' });
    for (const phone of contact.phones) if (phone.number.trim()) parts.push({ text: `${phone.number} ${phone.number.replace(/[^0-9+]/g, '')}`, role: 'meta' });
    for (const email of contact.emails) if (email.address.trim()) parts.push({ text: email.address, role: 'meta' });
    for (const address of contact.addresses) {
      const line = addressLine(address);
      if (line) parts.push({ text: line, role: 'body' });
    }
    if (contact.note.trim()) parts.push({ text: contact.note, role: 'body' });
    const labelNames = contact.labelIds.map(id => labels[id]).filter(label => label && label.deletedAt === null).map(label => label!.name);
    if (labelNames.length > 0) parts.push({ text: labelNames.join(' '), role: 'meta' });
    docs.push({
      key: spotKey('contact', contact.id),
      title: nameOrNull(contact) ?? '',
      parts,
      editedAt: contact.editedAt,
      meta: { type: 'contact', id: contact.id, labelIds: contact.labelIds, archived: false, within: null },
    });
  }
  return docs;
}
