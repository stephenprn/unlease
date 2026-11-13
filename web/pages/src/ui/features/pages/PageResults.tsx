/**
 * The pages a search found, above the notes: each its emoji or glyph, its title, where it sits and
 * the words that matched, the matches marked. Opening one goes to the block that matched.
 */
import { memo, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { UNTITLED_PAGE } from '@unlease/pages/models/blocks';
import { plural } from '@unlease/core/services/format';
import type { PageSearchHit } from '@unlease/pages/services/pageSearch';

import { pagePath } from '../../../app/hooks/usePageSearch';
import { useBlocksStore } from '../../../app/store/blocks';
import { Highlight } from '@shared/ui/components/Highlight';
import { Icon } from '@shared/ui/components/Icon';
import { Link } from '@shared/ui/router';
import { paths } from '../../routes';
import styles from '@notes/ui/features/board/board.module.css';

/** Enough to see the best ones at a glance; the rest one click away. */
const FIRST = 5;

/** A page found, opened at the block that matched (`#block-<id>`, which the page scrolls to). */
export function pageHitPath(hit: Pick<PageSearchHit, 'pageId' | 'blockId'>): string {
  return hit.blockId ? `${paths.page(hit.pageId)}#block-${hit.blockId}` : paths.page(hit.pageId);
}

const PageResult = memo(function PageResult({ hit, query }: { hit: PageSearchHit; query: string }) {
  const page = useBlocksStore(s => s.blocks[hit.pageId]);
  const path = useBlocksStore(s => pagePath(s, hit.pageId));
  if (!page) return null;
  const title = page.text.trim() || t(UNTITLED_PAGE);
  return (
    <li>
      <Link to={pageHitPath(hit)} className={styles.pageHit}>
        <span className={styles.pageHitIcon} aria-hidden="true">
          {page.icon ? <span className={styles.pageHitEmoji}>{page.icon}</span> : <Icon name="page" size={20} />}
        </span>
        <span className={styles.pageHitText}>
          <span className={styles.pageHitHead}>
            <span className={`${styles.pageHitTitle} t-body-strong`}>
              <Highlight text={title} query={query} />
            </span>
            {path ? <span className={`${styles.pageHitPath} t-meta`}>{path}</span> : null}
          </span>
          {hit.snippet ? (
            <span className={`${styles.pageHitSnippet} t-meta`}>
              <Highlight text={hit.snippet} query={query} />
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
});

export function PageResults({ hits, query }: { hits: readonly PageSearchHit[]; query: string }) {
  const [all, setAll] = useState(false);
  if (hits.length === 0) return null;
  const shown = all ? hits : hits.slice(0, FIRST);
  return (
    <section className={styles.pageResults} aria-labelledby="page-results">
      <h2 id="page-results" className={`${styles.resultsHead} t-section`}>
        {t('Pages')}
      </h2>
      <ul className={styles.pageHits}>
        {shown.map(hit => (
          <PageResult key={hit.pageId} hit={hit} query={query} />
        ))}
      </ul>
      {hits.length > FIRST && !all ? (
        <button type="button" className={styles.moreHits} onClick={() => setAll(true)}>
          {t('Show {pages}', { pages: plural(hits.length - FIRST, 'more page', 'more pages') })}
        </button>
      ) : null}
    </section>
  );
}
