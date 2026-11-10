/**
 * Every change the person makes to their contacts: each action is one `writeLocal` batch (one clock
 * tick, pending, synced), and those that can be taken back return their undo, which writes the old
 * values with a newer clock. Never mutate contacts another way.
 */
import { createId } from '@unlease/core/services/ids';
import { positionBetween } from '@unlease/core/services/fractionalIndex';
import { foldText } from '@unlease/core/services/search';
import type { Fields } from '@unlease/core/sync/record';
import { mergeField } from '@unlease/core/sync/textMerge';
import { nextLineColor, type LineColor } from '@unlease/design/colors';
import { CONTACT_LIMITS, CONTACTS_TEXT_LIMITS, isLive, type Contact } from '@unlease/contacts/models/contacts';
import { mergeContacts } from '@unlease/contacts/services/duplicates';
import type { ImportPlan } from '@unlease/contacts/services/importing';
import { contactFields, contactLabelFields } from '@unlease/contacts/sync/entities';

import { getRecord, writeLocal, type LocalChange } from '@shared/app/store/records';
import { cleanDraft, draftPatch, type ContactDraft } from '../drafts';
import { useContactsStore } from './library';
import { callingRegion } from './prefs';

export type Undo = () => void;

const state = () => useContactsStore.getState();

/** Exactly these fields of these records back to what they were. */
function undoFor(changes: readonly LocalChange[]): Undo {
  const previous: LocalChange[] = changes.map(change => {
    const record = getRecord(change.type, change.id);
    const patch: Fields = {};
    for (const field of Object.keys(change.patch)) patch[field] = record?.fields[field] ?? null;
    return { type: change.type, id: change.id, patch };
  });
  return () => writeLocal(previous);
}

/** Writes, and hands back the way to take it back. */
function writeWithUndo(changes: LocalChange[], now: number = Date.now()): Undo {
  const undo = undoFor(changes);
  writeLocal(changes, now);
  return undo;
}

// ── a contact ───────────────────────────────────────────────────────────────

/**
 * Typed text saved as `saveTypedText` saves it: an edit from elsewhere since `since` (the text the
 * form showed) is merged with what was typed, word by word, rather than overwritten.
 */
function typedNote(id: string, since: string | null, typed: string): string {
  const record = getRecord('contact', id);
  const stored = typeof record?.fields.note === 'string' ? record.fields.note : '';
  const kept = typed.slice(0, CONTACTS_TEXT_LIMITS.contact.note);
  return since === null || stored === since || stored === kept ? kept : mergeField('contact', 'note', since, kept, stored, false);
}

/** A contact's note as typed, saved through the merge (`since`: the note the editor last showed). Returns the note now stored. */
export function saveTypedText(type: 'contact', id: string, field: 'note', since: string | null, typed: string): string {
  const next = typedNote(id, since, typed);
  const stored = getRecord(type, id)?.fields[field];
  if (next !== stored) writeLocal([{ type, id, patch: { [field]: next } }]);
  return next;
}

/** The note the form opened with, and what is typed now: saved through the merge. */
export interface TypedNote {
  readonly since: string | null;
  readonly typed: string;
}

/**
 * The form's « Enregistrer »: a new contact whole, or what changed of one already here (only the
 * fields that differ, so an edit made elsewhere to another field stands), the note merged as typed
 * text, all in one batch. Returns the contact's id.
 */
export function saveContact(id: string | null, draft: ContactDraft, note: TypedNote, now: number = Date.now()): string {
  const clean = cleanDraft(draft);
  if (id === null || !getRecord('contact', id)) {
    const made = id ?? createId(now);
    writeLocal(
      [
        {
          type: 'contact',
          id: made,
          patch: contactFields({
            ...clean,
            note: note.typed.slice(0, CONTACTS_TEXT_LIMITS.contact.note),
            mergedInto: null,
            trashedAt: null,
            createdAt: now,
            deletedAt: null,
          }),
        },
      ],
      now,
    );
    return made;
  }
  const current = state().contacts[id];
  const patch = current ? draftPatch(current, clean) : {};
  const typed = typedNote(id, note.since, note.typed);
  if (typed !== (current?.note ?? '')) patch.note = typed;
  if (Object.keys(patch).length > 0) writeLocal([{ type: 'contact', id, patch }], now);
  return id;
}

/** Starred, or no longer, for each of `ids`. */
export function setFavorite(ids: readonly string[], favorite: boolean): Undo {
  return writeWithUndo(ids.filter(id => state().contacts[id]).map(id => ({ type: 'contact', id, patch: { favorite } })));
}

/** A label put on (or taken off) every one of `ids`. */
export function setLabelOn(ids: readonly string[], labelId: string, on: boolean): Undo {
  const changes: LocalChange[] = [];
  for (const id of ids) {
    const contact = state().contacts[id];
    if (!contact) continue;
    const has = contact.labelIds.includes(labelId);
    if (on && !has && contact.labelIds.length < CONTACT_LIMITS.labels) changes.push({ type: 'contact', id, patch: { labelIds: [...contact.labelIds, labelId] } });
    if (!on && has) changes.push({ type: 'contact', id, patch: { labelIds: contact.labelIds.filter(each => each !== labelId) } });
  }
  return writeWithUndo(changes);
}

export function trashContacts(ids: readonly string[], now: number = Date.now()): Undo {
  return writeWithUndo(
    ids.filter(id => state().contacts[id]).map(id => ({ type: 'contact', id, patch: { trashedAt: now } })),
    now,
  );
}

/** Out of the bin; one merged into another is itself again (its mentions name it again). */
export function restoreContacts(ids: readonly string[]): Undo {
  return writeWithUndo(
    ids
      .filter(id => state().contacts[id])
      .map(id => ({ type: 'contact', id, patch: state().contacts[id]!.mergedInto ? { trashedAt: null, mergedInto: null } : { trashedAt: null } })),
  );
}

/**
 * A group of duplicates made one (`mergeContacts`): the first kept and completed, the others to the
 * bin pointing at it, in one batch that can be undone.
 */
export function mergeGroup(ids: readonly string[], now: number = Date.now()): Undo {
  return mergeGroups([ids], now);
}

/** « Tout fusionner »: every group as `mergeGroup` makes it one, all in one batch, one undo. */
export function mergeGroups(groups: readonly (readonly string[])[], now: number = Date.now()): Undo {
  const changes: LocalChange[] = [];
  for (const ids of groups) {
    const contacts = ids.map(id => state().contacts[id]).filter((contact): contact is Contact => !!contact && isLive(contact));
    const [keep, ...others] = contacts;
    if (!keep || others.length === 0) continue;
    for (const write of mergeContacts(keep, others, { now, newId: () => createId(now), region: callingRegion() })) changes.push({ type: 'contact', id: write.id, patch: write.patch });
  }
  if (changes.length === 0) return () => undefined;
  return writeWithUndo(changes, now);
}

/** Gone for good: a tombstone, the note emptied (its photo goes with it on the server). */
export function deleteForever(ids: readonly string[], now: number = Date.now()): void {
  writeLocal(
    ids.filter(id => state().contacts[id]).map(id => ({ type: 'contact', id, patch: { deletedAt: now, note: '' } })),
    now,
  );
}

/** Empties the bin for good (Réglages > « Vider la corbeille »): how many went. */
export function emptyContactsBin(now: number = Date.now()): number {
  const binned = Object.values(state().contacts).filter(contact => contact.deletedAt === null && contact.trashedAt !== null);
  deleteForever(
    binned.map(contact => contact.id),
    now,
  );
  return binned.length;
}

// ── photos ──────────────────────────────────────────────────────────────────

/** A photo's blob as the contact wears it. */
export interface PhotoFields {
  readonly photoId: string | null;
  readonly photoMime: string;
  readonly photoUploaded: boolean;
}

/** Photos taken after an import (each contact that still has none), in one batch. */
export function setPhotos(photos: readonly { readonly contactId: string; readonly photo: PhotoFields }[], now: number = Date.now()): number {
  const changes: LocalChange[] = photos
    .filter(({ contactId }) => {
      const contact = state().contacts[contactId];
      return contact && contact.deletedAt === null && contact.photoId === null;
    })
    .map(({ contactId, photo }) => ({ type: 'contact', id: contactId, patch: { ...photo } }));
  writeLocal(changes, now);
  return changes.length;
}

/** The server holds the photo now: every contact wearing it says so. */
export function markPhotoUploaded(photoId: string): void {
  writeLocal(
    Object.values(state().contacts)
      .filter(contact => contact.photoId === photoId && !contact.photoUploaded)
      .map(contact => ({ type: 'contact', id: contact.id, patch: { photoUploaded: true } })),
  );
}

// ── labels ──────────────────────────────────────────────────────────────────

/** The live labels, in their order of creation. */
function liveLabels() {
  return Object.values(state().labels)
    .filter(label => label.deletedAt === null)
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
}

/** Another live label already has this name (case and accents aside). */
export function labelNameTaken(name: string, except: string | null = null): boolean {
  const key = foldText(name.trim());
  return liveLabels().some(label => label.id !== except && foldText(label.name.trim()) === key);
}

/** A new label after the others, in the next colour; `onto`: the contacts that wear it at once. */
export function createLabel(name: string, onto: readonly string[] = [], now: number = Date.now()): string {
  const labels = liveLabels();
  const id = createId(now);
  const changes: LocalChange[] = [
    {
      type: 'contactLabel',
      id,
      patch: contactLabelFields({
        name: name.trim().slice(0, CONTACT_LIMITS.labelName),
        color: nextLineColor(labels.map(label => label.color)),
        position: positionBetween(labels.at(-1)?.position ?? null, null),
        createdAt: now,
        deletedAt: null,
      }),
    },
  ];
  for (const contactId of onto) {
    const contact = state().contacts[contactId];
    if (contact && contact.labelIds.length < CONTACT_LIMITS.labels) changes.push({ type: 'contact', id: contactId, patch: { labelIds: [...contact.labelIds, id] } });
  }
  writeLocal(changes, now);
  return id;
}

export function renameLabel(id: string, name: string): void {
  writeLocal([{ type: 'contactLabel', id, patch: { name: name.trim().slice(0, CONTACT_LIMITS.labelName) } }]);
}

export function recolorLabel(id: string, color: LineColor): void {
  writeLocal([{ type: 'contactLabel', id, patch: { color } }]);
}

/** The label goes, and off every contact that wore it (the bin's too), in one batch that can be undone. */
export function deleteLabel(id: string, now: number = Date.now()): Undo {
  const changes: LocalChange[] = [{ type: 'contactLabel', id, patch: { deletedAt: now } }];
  for (const contact of Object.values(state().contacts)) {
    if (contact.deletedAt === null && contact.labelIds.includes(id)) changes.push({ type: 'contact', id: contact.id, patch: { labelIds: contact.labelIds.filter(each => each !== id) } });
  }
  return writeWithUndo(changes, now);
}

// ── an import ───────────────────────────────────────────────────────────────

/** The import's plan (`planImport`), written as one batch: the new labels, the new contacts, what the others gained. */
export function applyImport(plan: ImportPlan, now: number = Date.now()): void {
  writeLocal(
    [
      ...plan.labels.map(label => ({ type: 'contactLabel', id: label.id, patch: label.fields })),
      ...plan.creates.map(write => ({ type: 'contact', id: write.id, patch: write.fields })),
      ...plan.updates.filter(write => Object.keys(write.fields).length > 0).map(write => ({ type: 'contact', id: write.id, patch: write.fields })),
    ],
    now,
  );
}

/** Every live contact, for an export or an import's plan. */
export function liveContacts(): Contact[] {
  return Object.values(state().contacts).filter(isLive);
}
