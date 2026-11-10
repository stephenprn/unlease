/**
 * Duplicates (Google's « Fusionner et corriger »): contacts that are surely one person (the same
 * e-mail, the same number, or the same full name), grouped, and merged into one. The one kept gains
 * what the others held and it lacked (nothing it holds is overwritten, as an import does); the others
 * go to the bin with `mergedInto` set, so a mention of them (in Pages, in Carnet) names the one kept,
 * and restoring one from the bin undoes nothing else.
 */
import { foldText } from '@unlease/core/services/search';
import type { Fields } from '@unlease/core/sync/record';
import type { Contact } from '../models/contacts';
import { draftOf, fill, patchOf, type ImportedContact } from './importing';
import { phoneKey, samePhone } from './phones';

/** Why two contacts are taken for one. */
export type DuplicateReason = 'email' | 'phone' | 'name';

export interface DuplicateGroup {
  /** In the order they would be kept: the most complete first, then the oldest. */
  readonly ids: readonly string[];
  readonly reasons: readonly DuplicateReason[];
}

const live = (contact: Contact): boolean => contact.deletedAt === null && contact.trashedAt === null;
const fullName = (contact: Contact): string => foldText(`${contact.firstName} ${contact.lastName}`.replace(/\s+/g, ' ').trim());

/** How much a contact holds: the most complete one is kept. */
function richness(contact: Contact): number {
  return (
    contact.phones.length +
    contact.emails.length +
    contact.addresses.length * 2 +
    (contact.birthday ? 2 : 0) +
    (contact.photoId ? 3 : 0) +
    (contact.company ? 1 : 0) +
    (contact.note.trim() ? 1 : 0) +
    contact.labelIds.length +
    (contact.favorite ? 1 : 0)
  );
}

/**
 * The groups of live contacts that are one person, the largest first; a contact is in one group at
 * most. `region` is the person's « Indicatif par défaut » (`samePhone`): two countries' numbers that
 * end alike are two people.
 */
export function findDuplicates(contacts: Iterable<Contact>, region: string | null = null): DuplicateGroup[] {
  const all = [...contacts].filter(live);
  const parent = new Map<string, string>(all.map(contact => [contact.id, contact.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  const reasons = new Map<string, Set<DuplicateReason>>();
  const join = (a: string, b: string, reason: DuplicateReason): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
    const root = find(a);
    const set = reasons.get(root) ?? new Set<DuplicateReason>();
    for (const r of [...(reasons.get(ra) ?? []), ...(reasons.get(rb) ?? [])]) set.add(r);
    set.add(reason);
    reasons.set(root, set);
  };
  const seen = new Map<string, string>();
  const meet = (key: string, id: string, reason: DuplicateReason): void => {
    const other = seen.get(`${reason}:${key}`);
    if (other && other !== id) join(other, id, reason);
    else seen.set(`${reason}:${key}`, id);
  };
  // Numbers grouped by their last digits; a contact joins those whose number `samePhone` finds the same.
  const numbers = new Map<string, { number: string; id: string }[]>();
  const meetNumber = (number: string, id: string): void => {
    const key = phoneKey(number);
    if (key.length < 6) return;
    const group = numbers.get(key) ?? [];
    const same = group.find(entry => entry.id !== id && samePhone(entry.number, number, region));
    if (same) join(same.id, id, 'phone');
    group.push({ number, id });
    numbers.set(key, group);
  };
  for (const contact of all) {
    for (const email of contact.emails) if (email.address.includes('@')) meet(email.address.trim().toLowerCase(), contact.id, 'email');
    for (const phone of contact.phones) meetNumber(phone.number, contact.id);
    // A name alone joins only full names (a first name and a last name), never « Maman » twice.
    if (contact.firstName.trim() && contact.lastName.trim()) meet(fullName(contact), contact.id, 'name');
  }
  const groups = new Map<string, Contact[]>();
  for (const contact of all) {
    const root = find(contact.id);
    groups.set(root, [...(groups.get(root) ?? []), contact]);
  }
  return [...groups.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([root, members]) => ({
      ids: [...members].sort((a, b) => richness(b) - richness(a) || a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1)).map(contact => contact.id),
      reasons: [...(reasons.get(find(root)) ?? [])].sort(),
    }))
    .sort((a, b) => b.ids.length - a.ids.length || (a.ids[0]! < b.ids[0]! ? -1 : 1));
}

/** A contact as an import reads one, to merge it like one. */
function asImported(contact: Contact): ImportedContact {
  return {
    firstName: contact.firstName,
    lastName: contact.lastName,
    company: contact.company,
    jobTitle: contact.jobTitle,
    note: contact.note,
    birthday: contact.birthday,
    favorite: contact.favorite,
    photo: null,
    phones: contact.phones.map(entry => ({ value: entry.number, kind: entry.kind, label: entry.label })),
    emails: contact.emails.map(entry => ({ value: entry.address, kind: entry.kind, label: entry.label })),
    addresses: contact.addresses.map(({ id: _id, ...rest }) => rest),
    labels: [],
  };
}

export interface MergeWrite {
  readonly id: string;
  readonly patch: Fields;
}

/**
 * One batch: the one kept completed with what the others hold, each other in the bin and pointing
 * at it. `keep` is any of the group; `now` the bin's date; `newId` mints the entries' ids.
 */
export function mergeContacts(keep: Contact, others: readonly Contact[], options: { readonly now: number; readonly newId: () => string; readonly region?: string | null }): MergeWrite[] {
  const draft = draftOf(keep);
  let photo: Pick<Contact, 'photoId' | 'photoUploaded' | 'photoMime'> | null = null;
  for (const other of others) {
    if (other.id === keep.id) continue;
    fill(draft, asImported(other), other.labelIds, options.newId, options.region ?? null);
    if (!keep.photoId && !photo && other.photoId) photo = { photoId: other.photoId, photoUploaded: other.photoUploaded, photoMime: other.photoMime };
  }
  const patch = patchOf(draft, keep);
  if (photo) Object.assign(patch, photo);
  const writes: MergeWrite[] = [];
  if (Object.keys(patch).length > 0) writes.push({ id: keep.id, patch });
  for (const other of others) if (other.id !== keep.id) writes.push({ id: other.id, patch: { mergedInto: keep.id, trashedAt: options.now, favorite: false } });
  return writes;
}

/**
 * The contact a reference names now: itself, or the one it was merged into (followed through several
 * merges); null when it is gone. A contact in the bin that was not merged is still itself.
 */
export function resolveContact<T extends Pick<Contact, 'id' | 'mergedInto' | 'deletedAt'>>(contacts: Readonly<Record<string, T>>, id: string): T | null {
  let current = contacts[id];
  for (let hops = 0; current && current.mergedInto && hops < 20; hops += 1) {
    const next = contacts[current.mergedInto];
    if (!next || next.deletedAt !== null) break;
    current = next;
  }
  return current && current.deletedAt === null ? current : null;
}
