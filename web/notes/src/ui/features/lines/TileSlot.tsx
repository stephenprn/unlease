/**
 * A tile's place on a wall of tiles (collections, recent pages): it measures the tile, lifts it (a
 * drop shadow along its outline, which a clipped tile cannot cast itself), hands the clip down
 * (`--outline-clip`) and shows a focus ring around it. The tile draws its own edge (`OutlineEdge`
 * with the `d` it is given), inside its clip.
 */
import type { ReactNode } from 'react';

import { OutlineRing, useOutline } from '../../components/Outline';
import styles from './lines.module.css';

export function TileSlot({ dashed = false, children }: { dashed?: boolean; children: (d: string | null) => ReactNode }) {
  const { ref, d, vars, size } = useOutline<HTMLLIElement>('card');
  return (
    <li ref={ref} className={styles.tileSlot} style={vars} data-dashed={dashed || undefined}>
      {children(d)}
      <OutlineRing kind="card" width={size?.width} height={size?.height} className={styles.tileRing} />
    </li>
  );
}
