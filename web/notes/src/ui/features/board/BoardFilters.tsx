/**
 * The board's filters, the row under the search bar when Réglages chose them: « Toutes », « Cette semaine », « À faire »,
 * « Listes », each with its count, a radio group of chips (the import's, `FilterChip`). The row runs
 * sideways when the window is narrow, fading at the side it continues past. While notes are picked
 * it rests, faded and out of reach, as the collection chips do.
 */
import { memo } from 'react';

import { t } from '@unlease/core/i18n';
import { BOARD_FILTER_NAMES, BOARD_FILTERS, type BoardFilter } from '@unlease/notes/services/boardFilter';

import { FilterChip } from '@shared/ui/components/FilterChip';
import { useScrollEdges } from '@shared/ui/components/scrollEdges';
import { setBoardFilter } from '../../../app/store/board';
import styles from './board.module.css';

function BoardFiltersComponent({ filter, counts, resting }: { filter: BoardFilter; counts: Readonly<Record<BoardFilter, number>>; resting: boolean }) {
  const strip = useScrollEdges<HTMLDivElement>({ fade: 'x' });
  return (
    <div ref={strip} role="radiogroup" aria-label={t('Show')} className={styles.filters} data-resting={resting || undefined} inert={resting}>
      {BOARD_FILTERS.map(each => (
        <FilterChip key={each} checked={filter === each} label={t(BOARD_FILTER_NAMES[each])} count={counts[each]} onClick={() => setBoardFilter(each)} />
      ))}
    </div>
  );
}

export const BoardFilters = memo(BoardFiltersComponent);
