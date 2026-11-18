/**
 * An item as a row (the documents, a search's results): its kind's or type's glyph on a pebble in its colour, its
 * title, what it is and its date, and at its end how many pages it holds or how long it is valid.
 */
import { memo } from 'react';

import { formatIsoDay, plural } from '@unlease/core/services/format';
import { pebbleTurnOf } from '@unlease/design/pebbles';
import type { WalletItem } from '@unlease/wallet/models/item';
import { expiryOf } from '@unlease/wallet/services/expiry';
import { documentTypeGlyph, documentTypeName, expiryWords, itemInk, kindName, KIND_GLYPHS } from '@unlease/wallet/services/words';

import { Icon } from '@shared/ui/components/Icon';
import { getLocation, Link } from '@shared/ui/router';
import { paths } from '../routes';
import styles from '../wallet.module.css';

function ItemRowComponent({ item, today }: { item: WalletItem; today?: string }) {
  const d = item.details;
  const glyph = item.kind === 'document' && d.docType ? documentTypeGlyph(d.docType) : KIND_GLYPHS[item.kind];
  const what = item.kind === 'document' ? (d.docType ? documentTypeName(d.docType) : kindName(item.kind)) : kindName(item.kind);
  const meta = [what, d.issuer, d.docDate ? formatIsoDay(d.docDate) : ''].filter(Boolean).join(' · ');
  const expiry = today ? expiryOf(item, today) : null;
  const end = expiry && expiry.tone !== 'none' && expiry.tone !== 'valid' ? expiryWords(expiry) : d.files.length > 1 ? plural(d.files.length, 'page') : null;
  return (
    <li>
      <Link to={paths.item(item.id)} background={getLocation().path} className={styles.row}>
        <span className={styles.rowGlyph} data-line={itemInk(item)} data-pebble-under={pebbleTurnOf(item.id)}>
          <Icon name={glyph} size={22} />
        </span>
        <span className={styles.rowWords}>
          <span className={`${styles.rowTitle} t-body-strong`}>{item.title || kindName(item.kind)}</span>
          <span className={`${styles.rowMeta} t-meta`}>{meta}</span>
        </span>
        {end ? <span className={`${styles.rowEnd} t-meta ${expiry?.tone === 'expired' ? styles.expired : expiry?.tone === 'soon' ? styles.soon : ''}`}>{end}</span> : null}
      </Link>
    </li>
  );
}

export const ItemRow = memo(ItemRowComponent);
