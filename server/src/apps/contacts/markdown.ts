/**
 * Contacts in a backup, as people read it and as other apps import it: `Contacts/Contacts.vcf`,
 * every live contact as a vCard (Google Contacts, a phone, Thunderbird read it back), and
 * `Contacts/Contacts.md`, the same as a list, each with its photo linked where the archive keeps it.
 */
import type { Contact, ContactLabel } from '@unlease/contacts/models/contacts';
import { addressLine, phoneKindName, placeKindName } from '@unlease/contacts/services/addresses';
import { formatBirthday, readBirthday } from '@unlease/contacts/services/birthdays';
import { contactName, sortContacts } from '@unlease/contacts/services/names';
import { contactLabelFromRecord } from '@unlease/contacts/sync/entities';
import { toVCards } from '@unlease/contacts/services/vcard';
import { escapeLabel, FILES_DIR, relativeLink, type MarkdownFile } from '../../backup/markdown';
import type { StoredRecord } from '../../sync/records';
import { FOLDER } from './files';

function labelsOf(all: readonly StoredRecord[]): Record<string, ContactLabel> {
  const out: Record<string, ContactLabel> = {};
  for (const record of all) if (record.type === 'contactLabel') out[record.id] = contactLabelFromRecord(record);
  return out;
}

/** The vCard and the list; nothing for an address book with nobody in it. */
export function contactsMarkdown(contacts: readonly Contact[], all: readonly StoredRecord[], files: ReadonlyMap<string, string>): MarkdownFile[] {
  const live = sortContacts(contacts.filter(contact => contact.trashedAt === null), 'firstName');
  if (live.length === 0) return [];
  const labels = labelsOf(all);
  const listPath = `${FOLDER}/${FOLDER}.md`;
  const photoPath = (contact: Contact): string | undefined => {
    const path = contact.photoId ? files.get(contact.photoId) : undefined;
    return path ? `${FILES_DIR}/${path}` : undefined;
  };
  const vcf = toVCards(live, labels, contact => {
    const path = photoPath(contact);
    return path ? encodeURI(`../${path}`) : undefined;
  });
  const lines = [`# ${FOLDER}`, ''];
  for (const contact of live) {
    lines.push(`## ${escapeLabel(contactName(contact))}${contact.favorite ? ' ★' : ''}`, '');
    const photo = photoPath(contact);
    if (photo) lines.push(`![](${relativeLink(listPath, photo)})`, '');
    const work = [contact.jobTitle, contact.company].filter(part => part.trim()).join(', ');
    if (work && work !== contactName(contact)) lines.push(`- ${escapeLabel(work)}`);
    for (const phone of contact.phones) if (phone.number.trim()) lines.push(`- ${phoneKindName(phone)} : ${phone.number.trim()}`);
    for (const email of contact.emails) if (email.address.trim()) lines.push(`- ${placeKindName(email)} : <${email.address.trim()}>`);
    for (const address of contact.addresses) {
      const line = addressLine(address);
      if (line) lines.push(`- ${placeKindName(address)} : ${escapeLabel(line)}`);
    }
    const birthday = readBirthday(contact.birthday);
    if (birthday) lines.push(`- Anniversaire : ${formatBirthday(birthday)}`);
    const names = contact.labelIds.map(id => labels[id]).filter(label => label && label.deletedAt === null).map(label => label!.name);
    if (names.length > 0) lines.push(`- Libellés : ${names.map(escapeLabel).join(', ')}`);
    if (contact.note.trim()) lines.push('', ...contact.note.trim().split('\n').map(line => `> ${line}`));
    lines.push('');
  }
  return [
    { path: `${FOLDER}/${FOLDER}.vcf`, text: vcf },
    { path: listPath, text: `${lines.join('\n').trimEnd()}\n` },
  ];
}
