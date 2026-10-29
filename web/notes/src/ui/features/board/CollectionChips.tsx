/**
 * The collection chips at the top of the board: each its cut-out, its name and its count, ending in a
 * dashed "+ Collection". They scroll with the wall rather than staying pinned, and give way to the
 * docked navigation (which lists the collections) on wide screens. While notes are picked they rest,
 * faded and out of reach, where they are.
 */
import { memo } from 'react';

import { collectionEmblem } from '@unlease/notes/models/collections';
import { t } from '@unlease/core/i18n';
import { asLineColor } from '@unlease/design/colors';
import { INBOX_ID, shownTitle } from '@unlease/notes/models/entities';
import { plural } from '@unlease/core/services/format';

import { useLines } from '../../../app/hooks/useLines';
import { useLibraryStore } from '../../../app/store/library';
import { setNewLineOpen } from '../../../app/store/ui';
import { EmblemStone } from '../../components/Emblem';
import { Icon } from '../../components/Icon';
import { Link, paths } from '../../router';
import styles from './board.module.css';

const CollectionChip = memo(function CollectionChip({ id }: { id: string }) {
  const note = useLibraryStore(s => s.notes[id]);
  const count = useLibraryStore(s => (s.linksByNote[id] ?? []).filter(lid => s.links[lid] && !s.links[lid]!.done).length);
  if (!note) return null;
  if (id === INBOX_ID && count === 0) return null;
  return (
    <Link
      to={paths.line(id)}
      className={`${styles.tab} paper`}
      ariaLabel={`${shownTitle(note)}, ${plural(count, 'lien')}`}
    >
      <EmblemStone id={id} emblem={collectionEmblem(id, note.emblem)} color={asLineColor(note.color)} size={21} width={36} height={32} />
      <span className={styles.tabName}>{shownTitle(note)}</span>
      <span className={styles.tabCount}>{count}</span>
    </Link>
  );
});

export function CollectionChips({ resting }: { resting: boolean }) {
  const lines = useLines();
  return (
    <nav className={styles.tabs} aria-label={t('Collections')} data-resting={resting || undefined} inert={resting}>
      {lines.map(line => (
        <CollectionChip key={line.id} id={line.id} />
      ))}
      <button
        type="button"
        className={styles.newCollection}
        aria-label={t('Nouvelle collection')}
        onClick={() => setNewLineOpen(true)}
      >
        <Icon name="plus" size={18} />
        {t('Collection')}
      </button>
    </nav>
  );
}
