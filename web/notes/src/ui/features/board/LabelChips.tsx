/**
 * The labels at the top of the board, when Réglages puts them under the search bar: each its tag, its
 * name and how many notes of the board wear it, in the labels' order, the collection chips' paper.
 * They scroll with the wall and give way to the docked navigation (which lists the labels) on wide
 * screens. While notes are picked they rest, faded and out of reach, where they are.
 */
import { memo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { tc } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { isLockedNote } from '@unlease/notes/services/lock';

import { useLibraryStore, type LibraryState } from '../../../app/store/library';
import { LabelTag } from '@shared/ui/components/LabelMark';
import { useScrollEdges } from '@shared/ui/components/scrollEdges';
import { Link } from '@shared/ui/router';
import { pathForView } from '../../routes';
import styles from './board.module.css';

/** The notes the board shows that wear a label: live, neither binned, archived nor protected. */
function labelCount(s: LibraryState, id: string): number {
  let count = 0;
  for (const nid of s.noteOrder) {
    const note = s.notes[nid];
    if (note && note.deletedAt === null && note.trashedAt === null && !note.archived && !isLockedNote(note) && note.labelIds.includes(id)) count += 1;
  }
  return count;
}

const LabelChip = memo(function LabelChip({ id }: { id: string }) {
  const label = useLibraryStore(s => s.labels[id]);
  const count = useLibraryStore(s => labelCount(s, id));
  if (!label) return null;
  return (
    <Link to={pathForView(`label:${id}`)} className={`${styles.tab} ${styles.labelTab} paper`} ariaLabel={`${label.name}, ${plural(count, 'note')}`}>
      <LabelTag color={label.color} size={18} />
      <span className={styles.tabName}>{label.name}</span>
      <span className={styles.tabCount}>{count}</span>
    </Link>
  );
});

export function LabelChips({ resting }: { resting: boolean }) {
  const ids = useLibraryStore(useShallow(s => s.labelOrder.filter(id => s.labels[id] && s.labels[id]!.deletedAt === null)));
  // Chips past a side fade there, as far as they run on.
  const strip = useScrollEdges<HTMLElement>({ fade: 'x' });
  if (ids.length === 0) return null;
  return (
    <nav ref={strip} className={styles.tabs} aria-label={tc('notes', 'Labels')} data-resting={resting || undefined} inert={resting}>
      {ids.map(id => (
        <LabelChip key={id} id={id} />
      ))}
    </nav>
  );
}
