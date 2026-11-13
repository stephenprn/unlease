/**
 * What « @ », a bookmark and an embed can point at, found by their words (ranked as every « @ » of
 * the suite ranks: `core/services/mentionSearch`): pages, notes, collections and links, the ones
 * changed last first while nothing is typed, a few of each; « @ » mentions contacts and
 * Agenda's events too (named in a sentence, never shown as a bookmark or an embed), the coming
 * events first.
 */
import { t, tx } from '@unlease/core/i18n';
import { UNTITLED_PAGE, type BlockTarget } from '@unlease/pages/models/blocks';
import { ancestorPages, isInBin } from '@unlease/pages/services/blocks';
import { plural } from '@unlease/core/services/format';
import { mentionList, type MentionEntry, type MentionSection } from '@unlease/core/services/mentionSearch';
import { foldText } from '@unlease/core/services/search';
import { displayHost, prettyUrl } from '@unlease/core/services/url';
import { bodyText } from '@unlease/notes/services/noteBody';
import { isLive } from '@unlease/contacts/models/contacts';
import { contactName, workLine } from '@unlease/contacts/services/names';

import { findEvents } from '@notes/app/events/find';
import { useEventsStore } from '@notes/app/events/store';

import { targetTitle } from '../../../app/hooks/usePages';
import { type PagesLibrary } from '../../../app/store/blocks';

export type TargetSection = 'Pages' | 'Notes' | 'Collections' | 'Links' | 'Contacts' | 'Events';

export interface TargetHit {
  readonly target: BlockTarget;
  readonly title: string;
  /** A page's own emoji, drawn in its glyph's place (kept out of the title, so « Voy » still finds « ✈️ Voyage » first). */
  readonly emoji?: string;
  readonly detail: string;
  /** Words it is found by that are not written beside it: a note's kind, which its glyph already shows. */
  readonly words?: string;
  readonly section: TargetSection;
  readonly edited: number;
}

/** Shown through `t` where the menu draws them: what « @ » offers. */
const SECTIONS: readonly TargetSection[] = [tx('Pages'), tx('Contacts'), tx('Events'), tx('Notes'), tx('Collections'), tx('Links')];

/** What a bookmark can show: anything but a contact or an event. */
export const BOOKMARK_SECTIONS: readonly TargetSection[] = ['Pages', 'Notes', 'Collections', 'Links'];

/** What an embed can show whole: a note, a collection or a link (a page is better opened, as a bookmark). */
export const EMBED_SECTIONS: readonly TargetSection[] = ['Notes', 'Collections', 'Links'];

export function searchTargets(s: PagesLibrary, query: string, options: { readonly sections?: readonly TargetSection[]; readonly perSection?: number } = {}): TargetHit[] {
  const wanted = foldText(query.trim());
  const sections = options.sections ?? SECTIONS;
  const perSection = options.perSection ?? (wanted ? 6 : 4);
  const found: TargetHit[] = [];
  if (sections.includes('Pages')) {
    for (const block of Object.values(s.blocks)) {
      if (block.kind !== 'page' || isInBin(s.blocks, block.id)) continue;
      const path = ancestorPages(s.blocks, block.id).map(page => page.text.trim() || t(UNTITLED_PAGE));
      found.push({ target: { type: 'page', id: block.id }, title: block.text.trim() || t(UNTITLED_PAGE), ...(block.icon ? { emoji: block.icon } : {}), detail: path.join(' / '), section: 'Pages', edited: block.editedAt });
    }
  }
  for (const id of s.noteOrder) {
    const note = s.notes[id];
    if (!note || note.trashedAt !== null) continue;
    const section: TargetSection = note.kind === 'links' ? 'Collections' : 'Notes';
    if (!sections.includes(section)) continue;
    const title = targetTitle(s, { type: 'note', id }) ?? '';
    // A note's glyph says its kind: « Liste », « Dessin » or « Note » beside it would say it twice, so they only help find it.
    const kind = note.kind === 'checklist' ? t('List') : note.kind === 'drawing' ? t('Drawing') : t('Note');
    const detail = note.kind === 'links' ? plural((s.linksByNote[id] ?? []).length, 'link') : note.kind !== 'checklist' && note.kind !== 'drawing' && note.title.trim() ? bodyText(note).split('\n')[0]!.slice(0, 80) : '';
    found.push({ target: { type: 'note', id }, title, detail, ...(note.kind === 'links' ? {} : { words: kind }), section, edited: note.editedAt });
  }
  if (sections.includes('Links')) {
    for (const link of Object.values(s.links)) {
      if (link.deletedAt !== null) continue;
      found.push({ target: { type: 'link', id: link.id }, title: link.title || prettyUrl(link.url), detail: link.siteName || displayHost(link.url), section: 'Links', edited: link.analyzedAt ?? link.createdAt });
    }
  }
  if (sections.includes('Contacts')) {
    for (const contact of Object.values(s.contacts)) {
      if (!isLive(contact)) continue;
      const detail = workLine(contact) || contact.phones.find(entry => entry.number.trim())?.number || contact.emails.find(entry => entry.address.trim())?.address || t('Contact');
      found.push({ target: { type: 'contact', id: contact.id }, title: contactName(contact), detail, section: 'Contacts', edited: contact.editedAt });
    }
  }
  if (sections.includes('Events')) {
    // Already ranked by Agenda's search (or the coming ones first when nothing is typed): kept in that order.
    findEvents(s.events, useEventsStore.getState().feeds, query, target => targetTitle(s, target) ?? '', perSection).forEach((hit, at) => {
      found.push({ target: { type: 'event', id: hit.id }, title: hit.title || t('Untitled'), detail: hit.when, section: 'Events', edited: -at });
    });
  }
  // Ranked as every « @ » of the suite ranks (`mentionSearch`): the names the words start first, the kind of the best
  // answer first once something is typed; the latest changed first while nothing is. Events come found by Agenda's own
  // search, which reads their place and notes too: their order is kept.
  const newest = Math.max(0, ...found.map(hit => hit.edited));
  const entries = (section: TargetSection): (TargetHit & MentionEntry)[] =>
    found
      .filter(hit => hit.section === section)
      .sort((a, b) => b.edited - a.edited)
      .map(hit => ({ ...hit, also: hit.words ? `${hit.detail} ${hit.words}` : hit.detail, boost: section === 'Events' ? 0 : Math.max(0, 1 - (newest - hit.edited) / (30 * 86_400_000)) }));
  const kinds: MentionSection<TargetSection, TargetHit & MentionEntry>[] = sections.map(section => ({ section, entries: entries(section), ranked: section === 'Events' }));
  return mentionList(kinds, wanted ? query : '', { grouped: true, perSection, idle: perSection }).map(hit => hit.entry);
}
