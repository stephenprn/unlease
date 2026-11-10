/**
 * What a person does in Contacts. Each gesture is one `writeLocal` batch (one clock, synced); those
 * that can be taken back hand back their undo, which writes the old values with a newer clock. The
 * note is typed text: an editor saves it through `saveTypedText`, merged with an edit that landed
 * meanwhile.
 */
import { createId } from '@unlease/core/services/ids';
import { positionBetween } from '@unlease/core/services/fractionalIndex';
import { foldText } from '@unlease/core/services/search';
import type { Fields } from '@unlease/core/sync/record';
import { mergeField } from '@unlease/core/sync/textMerge';
import { nextLineColor, type LineColor } from '@unlease/design/colors';
import { CONTACT_LIMITS, CONTACTS_TEXT_LIMITS, emptyContact, type Contact } from '@unlease/contacts/models/contacts';
import { contactFields, contactLabelFields } from '@unlease/contacts/sync/entities';
import type { ImportPlan } from '@unlease/contacts/services/importing';
import { mergeContacts } from '@unlease/contacts/services/duplicates';

import { deviceRegion } from '../reach';
import { getRecord, saveTypedField, useLibraryStore, writeLocal, type LocalChange } from './libraryStore';

export type Undo = () => void;

function undoFor(changes: readonly LocalChange[]): Undo {
  const previous: LocalChange[] = changes.map(change => {
    const record = getRecord(change.type, change.id);
    const patch: Fields = {};
    for (const field of Object.keys(change.patch)) patch[field] = record?.fields[field] ?? null;
    return { type: change.type, id: change.id, patch };
  });
  return () => writeLocal(previous);
}

/** Write and hand back the way to take it back. */
function writeWithUndo(changes: LocalChange[], now?: number): Undo {
  const undo = undoFor(changes);
  writeLocal(changes, now);
  return undo;
}

// ── contacts ────────────────────────────────────────────────────────────────

/** What the edit screen holds of a contact: every field but its note (typed text) and its bookkeeping. */
export type ContactDraft = Pick<Contact, 'firstName' | 'lastName' | 'company' | 'jobTitle' | 'phones' | 'emails' | 'addresses' | 'birthday' | 'labelIds' | 'favorite' | 'photoId' | 'photoMime' | 'photoUploaded'>;

/** The fields a draft writes, trimmed, the empty rows left out. */
export function cleanDraft(draft: ContactDraft): ContactDraft {
  const trim = (value: string, max: number): string => value.trim().slice(0, max);
  return {
    ...draft,
    firstName: trim(draft.firstName, CONTACT_LIMITS.name),
    lastName: trim(draft.lastName, CONTACT_LIMITS.name),
    company: trim(draft.company, CONTACT_LIMITS.company),
    jobTitle: trim(draft.jobTitle, CONTACT_LIMITS.jobTitle),
    phones: draft.phones
      .map(entry => ({ ...entry, number: trim(entry.number, CONTACT_LIMITS.number), label: trim(entry.label, CONTACT_LIMITS.entryLabel) }))
      .filter(entry => entry.number)
      .slice(0, CONTACT_LIMITS.phones),
    emails: draft.emails
      .map(entry => ({ ...entry, address: trim(entry.address, CONTACT_LIMITS.email), label: trim(entry.label, CONTACT_LIMITS.entryLabel) }))
      .filter(entry => entry.address)
      .slice(0, CONTACT_LIMITS.emails),
    addresses: draft.addresses
      .map(entry => ({
        ...entry,
        label: trim(entry.label, CONTACT_LIMITS.entryLabel),
        street: entry.street.split('\n').map(line => line.trim()).filter(Boolean).join('\n').slice(0, CONTACT_LIMITS.addressLine),
        postalCode: trim(entry.postalCode, CONTACT_LIMITS.addressPart),
        city: trim(entry.city, CONTACT_LIMITS.addressPart),
        region: trim(entry.region, CONTACT_LIMITS.addressPart),
        country: trim(entry.country, CONTACT_LIMITS.addressPart),
      }))
      .filter(entry => entry.street || entry.postalCode || entry.city || entry.region || entry.country)
      .slice(0, CONTACT_LIMITS.addresses),
    labelIds: [...new Set(draft.labelIds)].slice(0, CONTACT_LIMITS.labels),
  };
}

/** « Créer un contact »: one batch, every field; returns its id. */
export function createContact(draft: ContactDraft, note = '', now: number = Date.now()): string {
  const id = createId(now);
  const contact: Contact = { ...emptyContact(id, now), ...cleanDraft(draft), note: note.slice(0, CONTACTS_TEXT_LIMITS.contact.note) };
  writeLocal([{ type: 'contact', id, patch: contactFields(contact) }], now);
  return id;
}

/** The fields of `draft` that differ from what the contact holds. */
export function draftPatch(contact: Contact, draft: ContactDraft): Fields {
  const clean = cleanDraft(draft);
  const patch: Fields = {};
  for (const key of Object.keys(clean) as (keyof ContactDraft)[]) {
    if (JSON.stringify(clean[key]) !== JSON.stringify(contact[key])) patch[key] = clean[key] as unknown;
  }
  return patch;
}

/** The note as an editor typed it (`typed`) since it showed `since`: the typed field's own save, in a form's batch. */
export interface TypedNote {
  readonly since: string;
  readonly typed: string;
}

/**
 * « Enregistrer » on the edit screen: the fields that changed and the note, in one batch. The note is
 * typed text: what was typed is merged with an edit that landed since the form opened, as
 * `saveTypedText` merges it (the library keeps its base for the sync). False when nothing changed.
 */
export function updateContact(id: string, draft: ContactDraft, note: TypedNote | null = null, now: number = Date.now()): boolean {
  const record = getRecord('contact', id);
  const contact = useLibraryStore.getState().contacts[id];
  if (!contact || !record) return false;
  const patch = draftPatch(contact, draft);
  if (note && note.typed !== note.since) {
    const stored = typeof record.fields.note === 'string' ? record.fields.note : '';
    const typed = note.typed.slice(0, CONTACTS_TEXT_LIMITS.contact.note);
    const next = stored === note.since || stored === typed ? typed : mergeField('contact', 'note', note.since, typed, stored, false);
    if (next !== stored) patch.note = next;
  }
  if (Object.keys(patch).length === 0) return false;
  writeLocal([{ type: 'contact', id, patch }], now);
  return true;
}

/** The star (Google's « Ajouter aux favoris »). */
export function setFavorite(id: string, favorite: boolean, now: number = Date.now()): Undo {
  return writeWithUndo([{ type: 'contact', id, patch: { favorite } }], now);
}

/** To the bin, every one in one batch; the server empties it after its retention. */
export function trashContacts(ids: readonly string[], now: number = Date.now()): Undo {
  return writeWithUndo(
    ids.map(id => ({ type: 'contact', id, patch: { trashedAt: now } })),
    now,
  );
}

/** Out of the bin, undone from the slip; one a merge put there names itself again (its `mergedInto` cleared), as on the web. */
export function restoreContacts(ids: readonly string[], now: number = Date.now()): Undo {
  const { contacts } = useLibraryStore.getState();
  return writeWithUndo(
    ids.map(id => ({ type: 'contact', id, patch: contacts[id]?.mergedInto ? { trashedAt: null, mergedInto: null } : { trashedAt: null } })),
    now,
  );
}

/** Gone for good, on every device: the tombstone. */
export function deleteContactsForever(ids: readonly string[], now: number = Date.now()): void {
  if (ids.length === 0) return;
  writeLocal(
    ids.map(id => ({ type: 'contact', id, patch: { deletedAt: now } })),
    now,
  );
}

/** « Vider la corbeille »: how many went. */
export function emptyContactsBin(now: number = Date.now()): number {
  const ids = Object.values(useLibraryStore.getState().contacts)
    .filter(contact => contact.deletedAt === null && contact.trashedAt !== null)
    .map(contact => contact.id);
  deleteContactsForever(ids, now);
  return ids.length;
}

/** What an editor holds for the note, merged with an edit that landed meanwhile; `since` is what it last saved or showed. Returns the text now stored. */
export function saveTypedText(type: 'contact', id: string, field: 'note', since: string | null, typed: string): string {
  return saveTypedField(type, id, field, since, typed);
}

/** A photo kept on this phone (`photoUploaded: false` until the sync sends it), or none. */
export function setContactPhoto(id: string, photo: { readonly id: string; readonly mime: string; readonly uploaded: boolean } | null, now: number = Date.now()): void {
  writeLocal([{ type: 'contact', id, patch: photo ? { photoId: photo.id, photoMime: photo.mime, photoUploaded: photo.uploaded } : { photoId: null, photoMime: '', photoUploaded: false } }], now);
}

/** The server has the photo: other devices may show it. */
export function markContactPhotosUploaded(photoId: string, now: number = Date.now()): void {
  const changes = Object.values(useLibraryStore.getState().contacts)
    .filter(contact => contact.photoId === photoId && !contact.photoUploaded)
    .map(contact => ({ type: 'contact', id: contact.id, patch: { photoUploaded: true } }));
  if (changes.length > 0) writeLocal(changes, now);
}

// ── labels ──────────────────────────────────────────────────────────────────

const labelKey = (name: string): string => foldText(name.trim());

/** Whether another live label already has this name (accents and case aside). */
export function labelNameTaken(name: string, except: string | null = null): boolean {
  const key = labelKey(name);
  return Object.values(useLibraryStore.getState().labels).some(label => label.id !== except && label.deletedAt === null && labelKey(label.name) === key);
}

/** A new label after the last, in the palette's next colour; returns its id. */
export function createLabel(name: string, now: number = Date.now()): string {
  const { labels, labelOrder } = useLibraryStore.getState();
  const last = labelOrder.length > 0 ? (labels[labelOrder[labelOrder.length - 1]!]?.position ?? null) : null;
  const color: LineColor = nextLineColor(labelOrder.map(id => labels[id]?.color ?? null));
  const id = createId(now);
  writeLocal([{ type: 'contactLabel', id, patch: contactLabelFields({ name: name.trim().slice(0, CONTACT_LIMITS.labelName), color, position: positionBetween(last, null), createdAt: now, deletedAt: null }) }], now);
  return id;
}

export function updateLabel(id: string, patch: { readonly name?: string; readonly color?: LineColor }, now: number = Date.now()): void {
  const fields: Fields = {};
  if (patch.name !== undefined) fields.name = patch.name.trim().slice(0, CONTACT_LIMITS.labelName);
  if (patch.color !== undefined) fields.color = patch.color;
  if (Object.keys(fields).length > 0) writeLocal([{ type: 'contactLabel', id, patch: fields }], now);
}

/** A label deleted leaves every contact that wore it, in the same batch. */
export function deleteLabel(id: string, now: number = Date.now()): Undo {
  const changes: LocalChange[] = [{ type: 'contactLabel', id, patch: { deletedAt: now } }];
  for (const contact of Object.values(useLibraryStore.getState().contacts)) {
    if (contact.deletedAt === null && contact.labelIds.includes(id)) changes.push({ type: 'contact', id: contact.id, patch: { labelIds: contact.labelIds.filter(other => other !== id) } });
  }
  return writeWithUndo(changes, now);
}

/** A label put on (or taken off) contacts, in one batch. */
export function setLabel(contactIds: readonly string[], labelId: string, on: boolean, now: number = Date.now()): void {
  const { contacts } = useLibraryStore.getState();
  const changes: LocalChange[] = [];
  for (const id of contactIds) {
    const contact = contacts[id];
    if (!contact || contact.labelIds.includes(labelId) === on) continue;
    changes.push({ type: 'contact', id, patch: { labelIds: on ? [...contact.labelIds, labelId].slice(0, CONTACT_LIMITS.labels) : contact.labelIds.filter(other => other !== labelId) } });
  }
  if (changes.length > 0) writeLocal(changes, now);
}

// ── import ──────────────────────────────────────────────────────────────────

/** An import's plan (`planImport`), written as one batch: its labels, the new contacts, what the others gained. */
export function applyImport(plan: ImportPlan, now: number = Date.now()): void {
  const changes: LocalChange[] = [
    ...plan.labels.map(label => ({ type: 'contactLabel', id: label.id, patch: label.fields })),
    ...plan.creates.map(write => ({ type: 'contact', id: write.id, patch: write.fields })),
    ...plan.updates.filter(write => Object.keys(write.fields).length > 0).map(write => ({ type: 'contact', id: write.id, patch: write.fields })),
  ];
  if (changes.length > 0) writeLocal(changes, now);
}

// ── duplicates ──────────────────────────────────────────────────────────────

/**
 * « Fusionner »: `keepId` gains what the others hold and it lacked, the others go to the bin pointing
 * at it (`mergedInto`), in one batch; the undo writes them all back.
 */
export function mergeDuplicates(keepId: string, ids: readonly string[], now: number = Date.now()): Undo | null {
  return mergeAllDuplicates([{ keepId, ids }], now);
}

/** « Tout fusionner »: every group as `mergeDuplicates` makes it one, all in one batch, one undo. */
export function mergeAllDuplicates(groups: readonly { readonly keepId: string; readonly ids: readonly string[] }[], now: number = Date.now()): Undo | null {
  const { contacts } = useLibraryStore.getState();
  const changes: LocalChange[] = [];
  for (const { keepId, ids } of groups) {
    const keep = contacts[keepId];
    if (!keep) continue;
    const others = ids.filter(id => id !== keepId).map(id => contacts[id]).filter((contact): contact is Contact => contact !== undefined);
    for (const write of mergeContacts(keep, others, { now, newId: () => createId(now), region: deviceRegion() })) changes.push({ type: 'contact', id: write.id, patch: write.patch });
  }
  if (changes.length === 0) return null;
  return writeWithUndo(changes, now);
}
