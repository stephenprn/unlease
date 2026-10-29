/**
 * What « @ », a bookmark and an embed can point at, found by their words: pages, notes,
 * collections and links, the ones changed last first, a few of each.
 */
import { t, tx } from '@unlease/core/i18n';
import { UNTITLED_PAGE, type BlockTarget } from '@unlease/notes/models/blocks';
import { ancestorPages, isInBin } from '@unlease/notes/services/blocks';
import { plural } from '@unlease/core/services/format';
import { foldText } from '@unlease/core/services/search';
import { displayHost, prettyUrl } from '@unlease/core/services/url';
import { bodyText } from '@unlease/notes/services/noteBody';

import { targetTitle } from '@app/hooks/usePages';
import type { LibraryState } from '@app/store/libraryStore';

/** A section's French name, also its key: shown through `t`. */
export type TargetSection = 'Pages' | 'Notes' | 'Collections' | 'Liens';

export interface TargetHit {
  readonly target: BlockTarget;
  readonly title: string;
  readonly detail: string;
  readonly section: TargetSection;
  readonly edited: number;
}

const SECTIONS: readonly TargetSection[] = [tx('Pages'), tx('Notes'), tx('Collections'), tx('Liens')];

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
  for (const id of s.noteOrder) {
    const note = s.notes[id];
    if (!note || note.trashedAt !== null) continue;
    const section: TargetSection = note.kind === 'links' ? 'Collections' : 'Notes';
    if (!sections.includes(section)) continue;
    const title = targetTitle(s, { type: 'note', id }) ?? '';
    const detail = note.kind === 'links' ? plural((s.linksByNote[id] ?? []).length, 'lien') : note.kind === 'checklist' ? t('Liste') : note.kind === 'drawing' ? t('Dessin') : note.title.trim() ? bodyText(note).split('\n')[0]!.slice(0, 80) : t('Note');
    found.push({ target: { type: 'note', id }, title, detail, section, edited: note.editedAt });
  }
  if (sections.includes('Liens')) {
    for (const link of Object.values(s.links)) {
      if (link.deletedAt !== null) continue;
      found.push({ target: { type: 'link', id: link.id }, title: link.title || prettyUrl(link.url), detail: link.siteName || displayHost(link.url), section: 'Liens', edited: link.analyzedAt ?? link.createdAt });
    }
  }
  const matches = (hit: TargetHit): boolean => !wanted || foldText(`${hit.title} ${hit.detail}`).includes(wanted);
  const rank = (hit: TargetHit): number => (wanted && foldText(hit.title).startsWith(wanted) ? 1 : 0);
  return sections.flatMap(section =>
    found
      .filter(hit => hit.section === section && matches(hit))
      .sort((a, b) => rank(b) - rank(a) || b.edited - a.edited)
      .slice(0, perSection),
  );
}
