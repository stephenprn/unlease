/**
 * The frost, the wallet's one authored moment: a locked place shows its tiles under the field's
 * veil, blurred (as many as it holds, their shape only), the unlock panel over them. Opened, the frost
 * clears (the veil and its blur fade, 250 decelerate) and the place is there; Reduce Motion cuts.
 */
import { useState, type ReactNode } from 'react';

import { useWalletStore } from '../../app/store/library';
import styles from '../wallet.module.css';
import { UnlockPanel } from './vault/UnlockPanel';

export function Frost({ tier, what, children }: { tier: 'cards' | 'papers'; what: string; children?: ReactNode }) {
  const ghosts = useWalletStore(state => Math.min(8, Math.max(3, Object.values(state.items).filter(item => item.tier === tier && item.deletedAt === null).length)));
  const [thawing, setThawing] = useState(false);
  return (
    <div className={styles.frost} data-thawing={thawing || undefined}>
      <ul className={`${styles.tiles} ${styles.frostTiles}`} aria-hidden="true">
        {Array.from({ length: ghosts }, (_, index) => (
          <li key={index} className={styles.frostGhost} />
        ))}
      </ul>
      <div className={styles.frostVeil}>
        <UnlockPanel what={what} onOpened={() => setThawing(true)} />
      </div>
      {children}
    </div>
  );
}
