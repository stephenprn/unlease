/**
 * The wallet's search, from the header's box: the open items holding every word typed (a title, an
 * issuer, a number, a label, the words read on a scan), best first, as rows. Searched in memory only,
 * in what this browser has opened: a locked tier is not searched (the frost says so above).
 */
import { useMemo } from 'react';

import { t } from '@unlease/core/i18n';
import { noResults, searchSummary } from '@unlease/core/services/searchWords';
import { searchItems } from '@unlease/wallet/services/search';

import { useQuery } from '@shared/app/store/search';
import { EmptyLine } from '@shared/ui/components/EmptyLine';
import { liveItems, useWalletStore } from '../../app/store/library';
import styles from '../wallet.module.css';
import { ItemRow } from './ItemRow';

export const useSearchQuery = (): string => useQuery().trim();

export function SearchResults({ query }: { query: string }) {
  const items = useWalletStore(state => state.items);
  const found = useMemo(() => searchItems(liveItems(items), query), [items, query]);
  return (
    <section aria-label={t('Search results')}>
      <p className={`${styles.sectionTitle} t-meta`} role="status">
        {searchSummary(query, found.length)}
      </p>
      {found.length > 0 ? (
        <ul className={styles.rows}>
          {found.map(item => (
            <ItemRow key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <EmptyLine glyph="search" text={noResults(query)} />
      )}
    </section>
  );
}
