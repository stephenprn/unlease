/**
 * Pages' documents in the spotlight (`@unlease/pages/services/spotlight`): a page as the person
 * knows it (its title or « Sans titre », where it sits, its emoji), opened at the block that matched,
 * and as the preview beside the list shows it, its blocks with the matches marked.
 */
import { memo } from 'react';

import type { GlyphName } from '@unlease/design/glyphs';
import { t, tx } from '@unlease/core/i18n';
import { UNTITLED_PAGE, type BlockKind } from '@unlease/pages/models/blocks';
import type { Matcher, SearchDoc, SearchPart } from '@unlease/core/services/searchIndex';
import type { SpotMeta } from '@unlease/core/services/spotlight';
import { pagesSpotlightDocs } from '@unlease/pages/services/spotlight';

import { Icon } from '@shared/ui/components/Icon';
import { Marked } from '@shared/ui/features/spotlight/Preview';
import styles from '@shared/ui/features/spotlight/spotlight.module.css';
import { navigate } from '@shared/ui/router';
import type { SpotKind } from '@shared/modules';
import { targetTitle } from '../../../app/hooks/usePages';
import { pagePath } from '../../../app/hooks/usePageSearch';
import { pagesLibrary, useBlocksStore, type PagesLibrary } from '../../../app/store/blocks';
import { paths } from '../../routes';

const FILE_ICONS: Partial<Record<BlockKind, GlyphName>> = { image: 'image', video: 'video', pdf: 'pdf', file: 'file', bookmark: 'bookmark', embed: 'embed' };

let cached: { readonly blocks: PagesLibrary['blocks']; readonly notes: PagesLibrary['notes']; readonly links: PagesLibrary['links']; readonly contacts: PagesLibrary['contacts']; readonly events: PagesLibrary['events']; readonly docs: readonly SearchDoc<SpotMeta>[] } | null = null;

/** Every live page, built again only when a block, or a note, a link or a contact a mention names, changed. */
function docs(): readonly SearchDoc<SpotMeta>[] {
  const library = pagesLibrary();
  if (cached && cached.blocks === library.blocks && cached.notes === library.notes && cached.links === library.links && cached.contacts === library.contacts && cached.events === library.events) return cached.docs;
  const made = pagesSpotlightDocs(library, target => targetTitle(library, target) ?? '');
  cached = { blocks: library.blocks, notes: library.notes, links: library.links, contacts: library.contacts, events: library.events, docs: made };
  return made;
}

const PageMark = memo(function PageMark({ doc, large = false }: { doc: SearchDoc<SpotMeta>; large?: boolean }) {
  const icon = useBlocksStore(s => s.blocks[doc.meta.id]?.icon ?? null);
  return icon ? <span className={large ? styles.emojiLarge : styles.emoji}>{icon}</span> : <Icon name="page" size={large ? 32 : 20} />;
});

function PagePart({ part, matcher }: { part: SearchPart; matcher: Matcher }) {
  const block = useBlocksStore(s => (part.ref ? s.blocks[part.ref] : undefined));
  const kind = block?.kind ?? 'text';
  const text = <Marked text={part.text} matcher={matcher} />;
  const ref = part.ref ?? undefined;
  if (kind === 'h1' || kind === 'h2' || kind === 'h3' || kind === 'h4') {
    return (
      <p className={styles.blockHeading} data-ref={ref} data-level={kind}>
        {text}
      </p>
    );
  }
  if (kind === 'todo') {
    return (
      <p className={`${styles.blockTodo} t-body`} data-ref={ref} data-checked={block?.checked || undefined}>
        <Icon name={block?.checked ? 'boxChecked' : 'box'} size={20} />
        <span>{text}</span>
      </p>
    );
  }
  if (kind === 'code') {
    return (
      <pre className={styles.blockCode} data-ref={ref} data-outline="frame">
        {text}
      </pre>
    );
  }
  const icon = FILE_ICONS[kind];
  if (icon) {
    return (
      <p className={`${styles.blockFile} t-meta`} data-ref={ref}>
        <Icon name={icon} size={18} />
        <span>{text}</span>
      </p>
    );
  }
  const shape = kind === 'bullet' || kind === 'numbered' || kind === 'toggle' ? styles.blockItem : kind === 'callout' ? styles.blockCallout : kind === 'table' ? styles.blockTable : styles.blockText;
  return (
    <p className={`${shape} t-body`} data-ref={ref} data-line={kind === 'callout' ? (block?.color ?? 'grey') : undefined}>
      {text}
    </p>
  );
}

function PagePreview({ doc, matcher }: { doc: SearchDoc<SpotMeta>; matcher: Matcher }) {
  if (doc.parts.length === 0) return <p className={`${styles.quiet} t-meta`}>{t('Empty page')}</p>;
  return (
    <div className={styles.pageBody}>
      {doc.parts.slice(0, 300).map((part, at) => (
        <PagePart key={part.ref ?? at} part={part} matcher={matcher} />
      ))}
    </div>
  );
}

const href = (doc: SearchDoc<SpotMeta>, part: SearchPart | null): string => (part?.ref ? `${paths.page(doc.meta.id)}#block-${part.ref}` : paths.page(doc.meta.id));

export const PAGES_SPOT_KINDS: readonly SpotKind[] = [
  {
    type: 'page',
    label: tx('Pages'),
    docs,
    title: doc => useBlocksStore.getState().blocks[doc.meta.id]?.text.trim() || t(UNTITLED_PAGE),
    facts: doc => {
      const path = pagePath(useBlocksStore.getState(), doc.meta.id);
      return [t('Page'), ...(path ? [path] : [])];
    },
    href,
    open: (doc, part) => navigate(href(doc, part)),
    Mark: PageMark,
    Preview: PagePreview,
  },
];
