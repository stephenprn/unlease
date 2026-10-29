/**
 * How a mention looks in a page: a page wears its emoji, a collection its cut-out, a note or a
 * link its glyph, beside the name it has now (a rename shows at once). A mention whose subject is
 * gone says so, muted.
 */
import { collectionEmblem } from '@unlease/notes/models/collections';
import { localized, t, tx } from '@unlease/core/i18n';
import type { BlockTarget, TargetType } from '@unlease/notes/models/blocks';
import { isRefType } from '@unlease/core/refs';
import { asLineColor } from '@unlease/design/colors';
import { parseRich } from '@unlease/core/services/richText';

import { targetTitle } from '../../../app/hooks/usePages';
import type { LibraryState } from '../../../app/store/library';
import { paths } from '../../router';
import { KIND_ICONS } from '../links/kindIcon';
import type { MentionLook } from './richDom';

const GONE: Readonly<Record<TargetType, string>> = localized({ note: tx('Note supprimée'), link: tx('Lien supprimé'), page: tx('Page supprimée') });

export function lookOf(s: LibraryState, target: BlockTarget): MentionLook {
  const title = targetTitle(s, target);
  // A type a newer client added: another app's, which this build cannot show.
  const gone = isRefType(target.type) ? GONE[target.type] : t('Indisponible ici');
  const base = { title: title ?? gone, gone: title === null, emoji: null, emblem: null };
  switch (target.type) {
    case 'page':
      return { ...base, emoji: title === null ? null : (s.blocks[target.id]?.icon ?? null), glyph: 'page' };
    case 'note': {
      const note = s.notes[target.id];
      if (note?.kind === 'links') return { ...base, title: title ?? t('Collection supprimée'), emblem: { shape: collectionEmblem(note.id, note.emblem), color: asLineColor(note.color) ?? 'grey' }, glyph: 'collections' };
      return { ...base, glyph: note?.kind === 'checklist' ? 'checklist' : 'note' };
    }
    case 'link': {
      const link = s.links[target.id];
      return { ...base, glyph: link ? KIND_ICONS[link.kind] : 'link' };
    }
    default:
      return { ...base, glyph: 'link' };
  }
}

/** What the mentions of a text look like, as one string: a block draws its text again when it changes. */
export function mentionsKey(s: LibraryState, markup: string): string {
  if (!markup.includes('{@')) return '';
  let key = '';
  for (const run of parseRich(markup)) {
    if (run.kind !== 'mention') continue;
    const look = lookOf(s, run.target);
    key += `${run.target.id}|${look.title}|${look.emoji ?? ''}|${look.emblem?.shape ?? ''}${look.emblem?.color ?? ''}|${look.gone ? 1 : 0};`;
  }
  return key;
}

/** Where a mention opens: a page in place, a note, a collection or a link in a new tab. */
export function targetPath(s: LibraryState, target: BlockTarget): string {
  if (target.type === 'page') return paths.page(target.id);
  if (target.type === 'link') return paths.link(target.id);
  return s.notes[target.id]?.kind === 'links' ? paths.line(target.id) : paths.note(target.id);
}
