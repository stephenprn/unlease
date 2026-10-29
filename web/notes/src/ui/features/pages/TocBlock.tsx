/**
 * A page's table of contents: its headings, in order and as they change, each further in by its
 * depth under the page's biggest heading (`pageHeadings`), each a way to it: a press brings the
 * heading under the header and lights it a moment. No frame: the page reads as a document. Reached
 * from the keyboard (Entrée on the block selected), the arrows move between its entries and Échap
 * selects the block again.
 */
import { useMemo, type KeyboardEvent } from 'react';

import { t } from '@unlease/core/i18n';
import type { Block } from '@unlease/notes/models/blocks';
import { pageHeadings } from '@unlease/notes/services/blocks';
import { dateWords } from '@unlease/core/services/dates';
import { markupToPlain } from '@unlease/core/services/richText';

import { mentionLabel } from '../../../app/hooks/usePages';
import { useLibraryStore } from '../../../app/store/library';
import { browserPath, isPlainClick, paths } from '../../router';
import { editorRoot, selectBlocks } from './editorStore';
import styles from './inline.module.css';
import { usePageContext } from './PageContext';
import { showBlock } from './showBlock';

interface Entry {
  readonly id: string;
  readonly depth: number;
  readonly words: string;
}

export function TocBlock({ block }: { block: Block }) {
  const { page, readOnly } = usePageContext();
  // As one string, so the block draws again only when a heading changes (a name it mentions included).
  const key = useLibraryStore(s => JSON.stringify(pageHeadings(s.blocks, s.blocksByParent, page).map(entry => [entry.id, entry.depth, markupToPlain(entry.text, mentionLabel, dateWords)])));
  const entries = useMemo(() => (JSON.parse(key) as [string, number, string][]).map<Entry>(([id, depth, words]) => ({ id, depth, words })), [key]);

  if (entries.length === 0) return <p className={`${styles.tocEmpty} t-meta`}>{t('Ajoutez des titres à la page : ils apparaîtront ici.')}</p>;

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    const links = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-toc-entry]')];
    const at = links.indexOf(event.target as HTMLElement);
    if (at < 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      links[Math.max(0, Math.min(links.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
    } else if (event.key === 'Escape' && !readOnly) {
      event.preventDefault();
      selectBlocks([block.id]);
      editorRoot()?.focus({ preventScroll: true });
    }
  };

  return (
    <nav aria-label={t('Table des matières')}>
      <ul className={styles.toc} onKeyDown={onKeyDown}>
        {entries.map(entry => (
          <li key={entry.id}>
            <a
              href={browserPath(`${paths.page(page)}#block-${encodeURIComponent(entry.id)}`)}
              className={`${styles.tocEntry} t-body`}
              data-depth={entry.depth}
              data-toc-entry=""
              onClick={event => {
                if (!isPlainClick(event)) return;
                event.preventDefault();
                showBlock(page, entry.id, { at: 'start' });
              }}
            >
              {entry.words}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
