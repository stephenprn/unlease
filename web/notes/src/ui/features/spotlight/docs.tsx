/**
 * A spotlight document as the person knows it, read from the library as it is now: its title as
 * shown (an untitled note's first line), what it is and where it sits, its mark, and where opening
 * it goes (a page at the block that matched, a note or a link over the page under the spotlight).
 */
import { memo } from 'react';

import { collectionEmblem } from '@unlease/notes/models/collections';
import { t } from '@unlease/core/i18n';
import { UNTITLED_PAGE } from '@unlease/notes/models/blocks';
import { asLineColor } from '@unlease/design/colors';
import { shownTitle } from '@unlease/notes/models/entities';
import { formatPrice, plural } from '@unlease/core/services/format';
import { cleanSiteName } from '@unlease/notes/services/linkRow';
import type { SearchDoc, SearchPart } from '@unlease/core/services/searchIndex';
import { linkTitle, type SpotMeta } from '@unlease/notes/services/spotlight';
import { siteDomain } from '@unlease/core/services/url';

import { pagePath } from '../../../app/hooks/usePageSearch';
import { useBlobUrl } from '../../../app/media/images';
import { useLibraryStore, type LibraryState } from '../../../app/store/library';
import { openLink, openNote } from '../../commands';
import { Emblem } from '../../components/Emblem';
import { Icon } from '../../components/Icon';
import { navigate, paths } from '../../router';
import { KIND_ICONS } from '../links/kindIcon';
import styles from './spotlight.module.css';

/** The title shown: a page's or « Sans titre », a note's or its first line, a collection's, a link's as its row says it. */
export function shownDocTitle(state: LibraryState, doc: SearchDoc<SpotMeta>): string {
  const { type, id } = doc.meta;
  switch (type) {
    case 'page':
      return state.blocks[id]?.text.trim() || t(UNTITLED_PAGE);
    case 'note': {
      const note = state.notes[id];
      if (!note) return doc.title;
      if (note.title.trim()) return note.title.trim();
      const first = doc.parts.find(part => part.role !== 'meta');
      return first ? first.text.slice(0, 120) : t('Note sans titre');
    }
    case 'collection': {
      const note = state.notes[id];
      return note ? shownTitle(note) : doc.title;
    }
    case 'link': {
      const link = state.links[id];
      return link ? linkTitle(link) : doc.title;
    }
  }
}

/** What it is and where it sits, as a row's second line says it: « Page · Voyages › Lisbonne », « Lien · Films · allocine.fr ». */
export function docFacts(state: LibraryState, doc: SearchDoc<SpotMeta>): string[] {
  const { type, id } = doc.meta;
  switch (type) {
    case 'page': {
      const path = pagePath(state, id);
      return [t('Page'), ...(path ? [path] : [])];
    }
    case 'note': {
      const note = state.notes[id];
      const labels = (note?.labelIds ?? []).map(labelId => state.labels[labelId]).filter(label => label && label.deletedAt === null).map(label => label!.name);
      return [note?.kind === 'checklist' ? t('Liste à cocher') : note?.kind === 'drawing' ? t('Dessin') : t('Note'), ...labels, ...(note?.archived ? [t('Archivée')] : [])];
    }
    case 'collection': {
      const count = (state.linksByNote[id] ?? []).length;
      return [t('Collection'), plural(count, t('lien'), t('liens'))];
    }
    case 'link': {
      const link = state.links[id];
      const collection = doc.meta.within ? state.notes[doc.meta.within] : undefined;
      if (!link) return [t('Lien')];
      const price = link.price !== null ? formatPrice(link.price, link.currency) : null;
      return [t('Lien'), ...(collection ? [shownTitle(collection)] : []), cleanSiteName(link.siteName) ?? siteDomain(link.url), ...(price ? [price] : []), ...(link.done ? [t('Fait')] : [])];
    }
  }
}

/** A link's own picture, small, in its 4:5 frame; its kind's glyph until there is one. */
const LinkThumb = memo(function LinkThumb({ id, large }: { id: string; large?: boolean }) {
  const link = useLibraryStore(s => s.links[id]);
  const kept = useBlobUrl(link?.imageIds[0]);
  const image = kept ?? link?.imageUrl ?? null;
  if (!link) return <Icon name="link" size={20} />;
  return (
    <span className={large ? styles.thumbLarge : styles.thumb} data-picture={image ? true : undefined} data-outline="frame" data-edge>
      {image ? <img src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} /> : <Icon name={KIND_ICONS[link.kind]} size={large ? 32 : 18} />}
    </span>
  );
});

/** What stands for a document in a row: a page's emoji or glyph, a note's glyph, a collection's emblem, a link's picture. */
export const DocMark = memo(function DocMark({ doc, large = false }: { doc: SearchDoc<SpotMeta>; large?: boolean }) {
  const { type, id } = doc.meta;
  const icon = useLibraryStore(s => (type === 'page' ? (s.blocks[id]?.icon ?? null) : null));
  const note = useLibraryStore(s => (type === 'note' || type === 'collection' ? s.notes[id] : undefined));
  const size = large ? 32 : 20;
  switch (type) {
    case 'page':
      return icon ? <span className={large ? styles.emojiLarge : styles.emoji}>{icon}</span> : <Icon name="page" size={size} />;
    case 'note':
      return <Icon name={note?.kind === 'checklist' ? 'checklist' : note?.kind === 'drawing' ? 'draw' : 'note'} size={size} />;
    case 'collection':
      return <Emblem emblem={collectionEmblem(id, note?.emblem ?? null)} color={asLineColor(note?.color ?? null)} size={large ? 36 : 22} />;
    case 'link':
      return <LinkThumb id={id} large={large} />;
  }
});

/** Where opening a document goes: a page at the block that matched, the others at their own address. */
export function docHref(doc: SearchDoc<SpotMeta>, part: SearchPart | null): string {
  const { type, id } = doc.meta;
  switch (type) {
    case 'page':
      return part?.ref ? `${paths.page(id)}#block-${part.ref}` : paths.page(id);
    case 'note':
      return paths.note(id);
    case 'collection':
      return paths.line(id);
    case 'link':
      return paths.link(id);
  }
}

/** Opens a document as the rest of the app does: a note or a link over the page under the spotlight. */
export function openDoc(doc: SearchDoc<SpotMeta>, part: SearchPart | null): void {
  const { type, id } = doc.meta;
  if (type === 'note') openNote(id);
  else if (type === 'link') openLink(id);
  else navigate(docHref(doc, part));
}
