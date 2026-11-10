/**
 * What « @ », a bookmark and an embed can point at, found by their words (ranked as every « @ » of
 * the suite ranks: `core/services/mentionSearch`): pages, people (Contacts',
 * for « @ » only), events (Agenda's, for « @ » only, the coming ones first), notes, collections and
 * links, the ones changed last first, a few of each.
 */
import { t, tx } from '@unlease/core/i18n';
import { UNTITLED_PAGE, type BlockTarget } from '@unlease/pages/models/blocks';
import { ancestorPages, isInBin } from '@unlease/pages/services/blocks';
import { plural } from '@unlease/core/services/format';
import { mentionList, type MentionEntry, type MentionSection } from '@unlease/core/services/mentionSearch';
import { foldText } from '@unlease/core/services/search';
import { displayHost, prettyUrl } from '@unlease/core/services/url';
import { bodyText } from '@unlease/notes/services/noteBody';
import { contactName, workLine } from '@unlease/contacts/services/names';

import { findEvents } from '@carnet/ui/features/events/findEvents';
import { targetTitle } from '@app/hooks/usePages';
import type { LibraryState } from '@app/store/libraryStore';

/** A section's French name, also its key: shown through `t`. */
export type TargetSection = 'Pages' | 'Contacts' | 'Événements' | 'Notes' | 'Collections' | 'Liens';

export interface TargetHit {
  readonly target: BlockTarget;
  readonly title: string;
  readonly detail: string;
  readonly section: TargetSection;
  readonly edited: number;
  /** Words it is found by and does not show (a note's kind, which its glyph says). */
  readonly words?: string;
}

const SECTIONS: readonly TargetSection[] = [tx('Pages'), tx('Contacts'), tx('Événements'), tx('Notes'), tx('Collections'), tx('Liens')];

/** What a bookmark points at: anything but a person or an event, which a page only mentions. */
export const BOOKMARK_SECTIONS: readonly TargetSection[] = SECTIONS.filter(section => section !== 'Contacts' && section !== 'Événements');

export function searchTargets(s: LibraryState, query: string, options: { readonly sections?: readonly TargetSection[]; readonly perSection?: number } = {}): TargetHit[] {
  const wanted = foldText(query.trim());
  const sections = options.sections ?? SECTIONS;
  const perSection = options.perSection ?? (wanted ? 6 : 4);
  const found: TargetHit[] = [];
  if (sections.includes('Pages')) {
    for (const block of Object.values(s.blocks)) {
      if (block.kind !== 'page' || isInBin(s.blocks, block.id)) continue;
      const path = ancestorPages(s.blocks, block.id).map(page => page.text.trim() || t(UNTITLED_PAGE));
      found.push({ target: { type: 'page', id: block.id }, title: `${block.icon ? `${block.icon} ` : ''}${block.text.trim() || t(UNTITLED_PAGE)}`, detail: path.join(' / '), section: 'Pages', edited: block.editedAt });
    }
  }
  if (sections.includes('Contacts')) {
    for (const id of s.people.liveContacts) {
      const contact = s.people.contacts[id];
      if (!contact) continue;
      const detail = workLine(contact) || contact.phones.find(entry => entry.number.trim())?.number.trim() || contact.emails.find(entry => entry.address.trim())?.address.trim() || '';
      found.push({ target: { type: 'contact', id }, title: contactName(contact), detail, section: 'Contacts', edited: contact.editedAt });
    }
  }
  if (sections.includes('Événements')) {
    // Already ranked by Agenda's search (the coming ones first when nothing is typed): kept in that order.
    findEvents(s.agenda.events, s.agenda.feeds, query, target => targetTitle(s, target) ?? '', perSection).forEach((hit, at) => {
      found.push({ target: { type: 'event', id: hit.id }, title: hit.title || t('Sans titre'), detail: hit.when, section: 'Événements', edited: -at });
    });
  }
  for (const id of s.noteOrder) {
    const note = s.notes[id];
    if (!note || note.trashedAt !== null) continue;
    const section: TargetSection = note.kind === 'links' ? 'Collections' : 'Notes';
    if (!sections.includes(section)) continue;
    const title = targetTitle(s, { type: 'note', id }) ?? '';
    // A note's glyph says its kind: « Liste », « Dessin » or « Note » beside it would say it twice, so they only help find it (as on the web).
    const kind = note.kind === 'checklist' ? t('Liste') : note.kind === 'drawing' ? t('Dessin') : t('Note');
    const detail = note.kind === 'links' ? plural((s.linksByNote[id] ?? []).length, 'lien') : note.kind !== 'checklist' && note.kind !== 'drawing' && note.title.trim() ? bodyText(note).split('\n')[0]!.slice(0, 80) : '';
    found.push({ target: { type: 'note', id }, title, detail, ...(note.kind === 'links' ? {} : { words: kind }), section, edited: note.editedAt });
  }
  if (sections.includes('Liens')) {
    for (const link of Object.values(s.links)) {
      if (link.deletedAt !== null) continue;
      found.push({ target: { type: 'link', id: link.id }, title: link.title || prettyUrl(link.url), detail: link.siteName || displayHost(link.url), section: 'Liens', edited: link.analyzedAt ?? link.createdAt });
    }
  }
  // Ranked as every « @ » of the suite ranks (`mentionSearch`): the names the words start first, the kind of the best
  // answer first once something is typed; the latest changed first while nothing is. Events come found by Agenda's own
  // search, which reads their place and notes too: their order is kept.
  const newest = Math.max(0, ...found.map(hit => hit.edited));
  const entries = (section: TargetSection): (TargetHit & MentionEntry)[] =>
    found
      .filter(hit => hit.section === section)
      .sort((a, b) => b.edited - a.edited)
      .map(hit => ({ ...hit, also: hit.words ? `${hit.detail} ${hit.words}` : hit.detail, boost: section === 'Événements' ? 0 : Math.max(0, 1 - (newest - hit.edited) / (30 * 86_400_000)) }));
  const kinds: MentionSection<TargetSection, TargetHit & MentionEntry>[] = sections.map(section => ({ section, entries: entries(section), ranked: section === 'Événements' }));
  return mentionList(kinds, wanted ? query : '', { grouped: true, perSection, idle: perSection }).map(hit => hit.entry);
}
