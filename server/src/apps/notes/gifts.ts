/**
 * Gift ideas (`POST /api/notes/gifts`, `core/sync/gifts`): Contacts keeps a product's link for
 * someone in Carnet's « Cadeaux » collection. The collection is the one this server made for it
 * (its id kept in `meta`), else a live collection named so in either language (made by hand), else a
 * new one at the top of the board. The link's people (`contactIds`) name the contact it is for; an
 * address the collection holds already gains them. A new one is added at its top, filed by the
 * person, read by Claude as any saved link (a reading of the same address elsewhere copied, when it
 * was read with the same template as « Cadeaux » reads with). An
 * older client names no contact: « Pour <name> » in the comment says for whom instead. One change,
 * under the server's clock.
 */
import { createId } from '@unlease/core/services/ids';
import { positionBetween } from '@unlease/core/services/fractionalIndex';
import { foldText } from '@unlease/core/services/search';
import type { GiftLinkRequest, GiftLinkResponse } from '@unlease/core/sync/gifts';
import { asLineColor, nextLineColor } from '@unlease/design/colors';
import { collectionEmblem, nextEmblem } from '@unlease/notes/models/collections';
import { INBOX_ID, type LinkItem, type Note } from '@unlease/notes/models/entities';
import { GIFT_COLLECTION_NAMES } from '@unlease/notes/services/gifts';
import { planLinks, savedAddresses } from '@unlease/notes/services/savedLinks';
import { linkFields, linkFromRecord, noteFields, noteFromRecord } from '@unlease/notes/sync/entities';
import { PEOPLE_MAX } from '@unlease/notes/sync/types';
import { readMeta, writeMeta, type Database } from '../../db/database';
import type { RecordStore } from '../../sync/records';
import type { ServerEdit, SyncService } from '../../sync/service';
import { storedTemplates } from './analysis/templates';

const META_KEY = 'notes.giftsCollection';

/** The collection's name when it is made, by language (it is found by `GIFT_COLLECTION_NAMES`). */
const NAMES = { fr: 'Cadeaux', en: 'Gifts' } as const;
const HINT = { fr: 'Des idées de cadeaux pour vos proches, gardées depuis Contacts.', en: 'Gift ideas for the people close to you, kept from Contacts.' } as const;
const FOR = { fr: (name: string) => `Pour ${name}`, en: (name: string) => `For ${name}` } as const;

export interface GiftMakerOptions {
  readonly db: Database;
  readonly records: RecordStore;
  readonly sync: SyncService;
  /** Hands the new link to the reading queue (which keeps it plain when no key is set). */
  readonly read: (linkIds: readonly string[]) => void;
  readonly now: () => number;
}

export class GiftMaker {
  constructor(private readonly options: GiftMakerOptions) {}

  /** Synchronous from reading the collections to the write, so nothing lands between. */
  add(request: GiftLinkRequest): GiftLinkResponse {
    const { db, records, sync, now: clock } = this.options;
    const now = clock();
    const notes: Record<string, Note> = {};
    for (const record of records.ofType('note')) notes[record.id] = noteFromRecord(record);
    const links: Record<string, LinkItem> = {};
    for (const record of records.ofType('link')) links[record.id] = linkFromRecord(record);
    const isLive = (note: Note | undefined): note is Note => !!note && note.kind === 'links' && note.deletedAt === null && note.trashedAt === null;

    const edits: ServerEdit[] = [];
    const remembered = readMeta(db, META_KEY);
    let collection = typeof remembered === 'string' && isLive(notes[remembered]) ? notes[remembered] : undefined;
    collection ??= Object.values(notes)
      .filter(isLive)
      .filter(note => GIFT_COLLECTION_NAMES.has(foldText(note.title.trim())))
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    let created = false;
    if (!collection) {
      const id = createId(now);
      const live = Object.values(notes).filter(note => note.deletedAt === null);
      const lines = live.filter(note => note.kind === 'links');
      const first = live.filter(note => note.id !== INBOX_ID && note.trashedAt === null).sort((a, b) => (a.position < b.position ? -1 : 1))[0];
      const title = NAMES[request.lang];
      const fields = noteFields({
        kind: 'links',
        title,
        body: '',
        color: nextLineColor(lines.map(note => asLineColor(note.color))),
        pinned: false,
        archived: false,
        trashedAt: null,
        labelIds: [],
        position: positionBetween(null, first?.position ?? null),
        reminderAt: null,
        code: title.charAt(0).toUpperCase(),
        // A heart, unless another collection wears it.
        emblem: lines.some(note => collectionEmblem(note.id, note.emblem) === 'coeur') ? nextEmblem(lines) : 'coeur',
        hint: HINT[request.lang],
        createdAt: now,
        deletedAt: null,
      });
      edits.push({ type: 'note', id, create: true, patch: () => fields });
      collection = noteFromRecord({ type: 'note', id, fields, clocks: {} });
      created = true;
    }
    const into = collection.id;
    // Named by its contact, the link says for whom by its people; else by its comment.
    const contactId = request.contactId ?? null;
    const comment = contactId ? '' : FOR[request.lang](request.forName);
    const [plan] = planLinks([request.url], into, savedAddresses(links, notes), { templates: storedTemplates(records), notes });
    if (!plan) throw new Error('no plan for a gift link');
    let linkId: string;
    if (plan.existing) {
      linkId = plan.existing;
      edits.push({
        type: 'link',
        id: linkId,
        patch: current => {
          if (contactId) {
            const people = Array.isArray(current.fields.contactIds) ? current.fields.contactIds.filter((id): id is string => typeof id === 'string') : [];
            return people.includes(contactId) ? null : { contactIds: [...people, contactId].slice(-PEOPLE_MAX) };
          }
          const before = typeof current.fields.comment === 'string' ? current.fields.comment : '';
          return before.includes(comment) ? null : { comment: before.trim() ? `${before.trim()}\n${comment}` : comment };
        },
      });
    } else {
      linkId = createId(now);
      const first = Object.values(links)
        .filter(link => link.noteId === into && link.deletedAt === null)
        .sort((a, b) => (a.position < b.position ? -1 : 1))[0];
      const fields = linkFields({
        noteId: into,
        url: plan.url,
        status: 'pending',
        autoFile: false,
        filedBy: 'person',
        lang: request.lang,
        title: '',
        summary: '',
        siteName: '',
        kind: 'other',
        price: null,
        currency: null,
        attributes: [],
        imageIds: [],
        imageUrl: null,
        error: null,
        analyzedAt: null,
        ...plan.reading,
        done: false,
        doneAt: null,
        comment,
        position: positionBetween(null, first?.position ?? null),
        createdAt: now,
        deletedAt: null,
        copy: null,
        contactIds: contactId ? [contactId] : [],
      });
      edits.push({ type: 'link', id: linkId, create: true, patch: () => fields });
    }
    sync.apply(edits);
    writeMeta(db, META_KEY, into);
    if (!plan.existing && records.get('link', linkId)?.fields.status === 'pending') this.options.read([linkId]);
    return { collectionId: into, linkId, existing: plan.existing !== null, created };
  }
}
