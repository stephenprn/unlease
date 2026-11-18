/**
 * A card or a paper as a tile, the shape of the thing itself (ID-1, 85.6 × 54): a card in its
 * pigment's wash with its name and the end of its number, a gift card's balance, a star when it is a
 * favourite; a paper on paper with its kind's glyph on a stone of its colour (`PAPER_INKS`), whose
 * it is, and how long it is valid (Safran once its first reminder is near, danger once expired).
 */
import { memo } from 'react';

import { t } from '@unlease/core/i18n';
import { formatPrice } from '@unlease/core/services/format';
import type { WalletItem } from '@unlease/wallet/models/item';
import { expiryOf } from '@unlease/wallet/services/expiry';
import { pebbleTurnOf } from '@unlease/design/pebbles';
import { expiryWords, itemInk, kindName, KIND_GLYPHS } from '@unlease/wallet/services/words';

import { Icon } from '@shared/ui/components/Icon';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { Link } from '@shared/ui/router';
import { paths } from '../routes';
import styles from '../wallet.module.css';

/** The end of a number, as a card's tile shows it: « •• 4821 ». */
const numberEnd = (number: string): string => {
  const clean = number.replace(/\s+/g, '');
  return clean.length > 4 ? `•• ${clean.slice(-4)}` : clean;
};

function ExpiryLine({ item, today }: { item: WalletItem; today: string }) {
  const state = expiryOf(item, today);
  const words = expiryWords(state);
  if (!words) return null;
  return <span className={state.tone === 'expired' ? styles.expired : state.tone === 'soon' ? styles.soon : undefined}>{words}</span>;
}

function CardTileComponent({ item, today }: { item: WalletItem; today: string }) {
  const d = item.details;
  const end = d.balance ? formatPrice(d.balance.amount, d.balance.currency) : d.number || d.barcode?.value ? numberEnd(d.number || d.barcode!.value) : '';
  return (
    <li>
      <OutlinedBox kind="card" lift="card" edge={false} data-line={itemInk(item)}>
        <Link to={paths.item(item.id)} background={paths.cards} className={`${styles.tile} t-label`}>
          <span className={styles.tileHead}>
            <span className={`${styles.tileTitle} t-card-title`}>{item.title || kindName(item.kind)}</span>
            {item.favourite ? <Icon name="star" size={18} className={styles.star} /> : <Icon name={KIND_GLYPHS[item.kind]} size={20} className={styles.tileGlyph} />}
          </span>
          <span className={`${styles.tileFoot} t-meta`}>
            <span className={styles.tabular}>{item.kind === 'emergency' ? t('In case of emergency') : end}</span>
            <ExpiryLine item={item} today={today} />
          </span>
        </Link>
      </OutlinedBox>
    </li>
  );
}

export const CardTile = memo(CardTileComponent);

function PaperTileComponent({ item, today, person, background }: { item: WalletItem; today: string; person: string | null; background: string }) {
  const d = item.details;
  return (
    <li>
      <OutlinedBox kind="card" lift="card">
        <Link to={paths.item(item.id)} background={background} className={`${styles.tile} ${styles.paperTile} t-label`}>
          <span className={styles.tileHead}>
            <span className={`${styles.tileTitle} t-card-title`}>{item.title || kindName(item.kind)}</span>
            <span className={styles.tileStone} data-line={itemInk(item)} data-pebble-under={pebbleTurnOf(item.id)} data-still>
              <Icon name={KIND_GLYPHS[item.kind]} size={20} />
            </span>
          </span>
          <span className={`${styles.tileFoot} t-meta`}>
            <span>{person ?? d.holder}</span>
            <ExpiryLine item={item} today={today} />
          </span>
        </Link>
      </OutlinedBox>
    </li>
  );
}

export const PaperTile = memo(PaperTileComponent);
