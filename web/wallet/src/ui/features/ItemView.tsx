/**
 * An item open, over its place (a whole page under 720 px). A card opens at the till: its barcode
 * black on white (at the top of the screen when Réglages asks), its number under it in large figures,
 * else under its two sides; then what it says; it counts as used. An identity paper opens on its
 * head, washed in its kind's colour: whose it is, its number large to copy, how long it is valid;
 * then its pictures and the rest. A document shows its pictures and what it says (how long to keep
 * it). A paper with pictures makes a watermarked copy to send. Locked meanwhile, it says so and offers to unlock.
 */
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { t } from '@unlease/core/i18n';
import { formatIsoDay, formatPrice } from '@unlease/core/services/format';
import { today as todayOf } from '@unlease/calendar/services/time';
import { contactName } from '@unlease/contacts/services/names';
import { pebbleTurnOf } from '@unlease/design/pebbles';
import { IDENTITY_KINDS, type WalletItem } from '@unlease/wallet/models/item';
import { expiryOf, keepTermOf } from '@unlease/wallet/services/expiry';
import { documentTypeName, expiryWords, itemInk, keepWords, kindName, KIND_GLYPHS, validUntilWords } from '@unlease/wallet/services/words';

import { useContactsStore } from '@contacts/app/store/library';
import { useMinute } from '@shared/app/hooks/useMinute';
import { showSnack, showUndo } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton } from '@shared/ui/components/IconButton';
import { Layer } from '@shared/ui/components/Layer';
import { deleteItem, markUsed, setFavourite } from '../../app/store/actions';
import { useWalletStore } from '../../app/store/library';
import { usePrefsStore } from '../../app/store/prefs';
import { useVaultStatus } from '../../app/store/vault';
import styles from '../wallet.module.css';
import { Barcode } from './Barcode';
import { FileImage } from './FileImage';
import { openEdit } from './open';
import { UnlockPanel } from './vault/UnlockPanel';
import { WatermarkDialog } from './WatermarkDialog';

const FACE_LABELS = { front: 'Front [side]', back: 'Back [side]', page: 'Page', photo: 'Photo' } as const;

function copy(text: string): void {
  void navigator.clipboard
    .writeText(text)
    .then(() => showSnack(t('Number copied'), undefined, { tone: 'success' }))
    .catch(() => showSnack(t('The number couldn’t be copied'), undefined, { tone: 'error' }));
}

const isIdentity = (item: WalletItem): boolean => (IDENTITY_KINDS as readonly string[]).includes(item.kind);

function Till({ item }: { item: WalletItem }) {
  const d = item.details;
  const value = d.barcode?.value ?? d.number;
  if (!value) return null;
  return (
    <section className={styles.till} aria-label={t('At the till')}>
      {d.barcode ? <Barcode format={d.barcode.format} value={d.barcode.value} label={t('Barcode of {card}', { card: item.title || kindName(item.kind) })} /> : null}
      <p className={styles.tillNumber}>{d.number || d.barcode?.value}</p>
    </section>
  );
}

/** An identity paper's head: the thing itself, in its kind's wash. */
function PaperHead({ item }: { item: WalletItem }) {
  const contacts = useContactsStore(state => state.contacts);
  const today = todayOf(useMinute());
  const d = item.details;
  const person = d.personContactId ? contacts[d.personContactId] : undefined;
  const name = person && person.deletedAt === null ? contactName(person) : d.holder || item.title || kindName(item.kind);
  const expiry = expiryOf(item, today);
  return (
    <section className={styles.paperHead} data-line={itemInk(item)} aria-label={kindName(item.kind)}>
      <div className={styles.paperHeadTop}>
        <span className={styles.paperStone} data-pebble={pebbleTurnOf(item.id)}>
          <Icon name={KIND_GLYPHS[item.kind]} size={26} />
        </span>
        <div className={styles.paperHeadWords}>
          <p className={`${styles.paperKind} t-label`}>{kindName(item.kind)}</p>
          <p className="t-title">{name}</p>
        </div>
      </div>
      {d.number ? (
        <p className={styles.paperNumber}>
          <span className={styles.tabular}>{d.number}</span>
          <IconButton icon="copy" label={t('Copy the number')} onClick={() => copy(d.number)} />
        </p>
      ) : null}
      {d.expiresOn ? (
        <p className={`t-meta ${expiry.tone === 'expired' ? styles.expired : expiry.tone === 'soon' ? styles.soon : styles.paperValid}`}>
          {[validUntilWords(d.expiresOn), expiry.tone === 'valid' ? null : expiryWords(expiry)].filter(Boolean).join(' · ')}
        </p>
      ) : null}
    </section>
  );
}

function Facts({ item }: { item: WalletItem }) {
  const contacts = useContactsStore(state => state.contacts);
  const d = item.details;
  const today = todayOf(useMinute());
  const expiry = expiryOf(item, today);
  const person = d.personContactId ? contacts[d.personContactId] : undefined;
  const keep = item.kind === 'document' ? keepWords(keepTermOf(item)) : null;
  // An identity paper shows whose it is, its number and its term in its head.
  const identity = isIdentity(item);
  const owner = person && person.deletedAt === null ? contactName(person) : null;
  const rows: [string, ReactNode][] = [];
  if (item.kind === 'document' && d.docType) rows.push([t('Type'), documentTypeName(d.docType)]);
  if (d.issuer) rows.push([item.tier === 'cards' ? t('Shop') : t('Issued by'), d.issuer]);
  if (owner && !identity) rows.push([t('For'), owner]);
  if (d.holder && !(identity && !owner)) rows.push([t('Name on it'), d.holder]);
  if (d.number && item.tier === 'papers' && !identity)
    rows.push([
      t('Number [paper]'),
      <>
        <span className={styles.tabular}>{d.number}</span>
        <IconButton icon="copy" label={t('Copy the number')} size={18} compact onClick={() => copy(d.number)} />
      </>,
    ]);
  if (d.birthDate) rows.push([t('Born on'), formatIsoDay(d.birthDate)]);
  if (d.nationality) rows.push([t('Nationality'), d.nationality]);
  if (d.docDate) rows.push([t('Date'), formatIsoDay(d.docDate)]);
  if (d.issuedOn) rows.push([t('Issued on'), formatIsoDay(d.issuedOn)]);
  if (d.expiresOn && !identity)
    rows.push([
      item.kind === 'document' ? t('Ends on') : t('Valid until'),
      <>
        {formatIsoDay(d.expiresOn)}
        <span className={expiry.tone === 'expired' ? styles.expired : expiry.tone === 'soon' ? styles.soon : 't-meta'}>· {expiryWords(expiry)}</span>
      </>,
    ]);
  if (d.balance) rows.push([t('Balance'), formatPrice(d.balance.amount, d.balance.currency)]);
  if (keep) rows.push([t('Keep'), keep]);
  if (d.labels.length > 0) rows.push([t('Labels'), d.labels.join(', ')]);
  if (rows.length === 0) return null;
  return (
    <dl className={`${styles.facts} t-body`}>
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <dt className="t-label">{label}</dt>
          <dd>{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function Opened({ item, onClose }: { item: WalletItem; onClose: () => void }) {
  const titleId = useId();
  const [watermark, setWatermark] = useState(false);
  const counted = useRef(false);
  useEffect(() => {
    // Opened at a till: counted once, for « Cartes »' order.
    if (item.tier !== 'cards' || counted.current) return;
    counted.current = true;
    markUsed(item);
  }, [item]);
  const remove = (): void => {
    const undo = deleteItem(item.id);
    onClose();
    showUndo(t('{name} deleted', { name: item.title || kindName(item.kind) }), undo);
  };
  const pictures = item.details.files.filter(file => file.mime.startsWith('image/'));
  const top = usePrefsStore(s => s.barcodeTop);
  const card = item.tier === 'cards';
  return (
    <DialogFrame
      title={item.title || kindName(item.kind)}
      titleId={titleId}
      onClose={onClose}
      kind="list"
      page
      className={styles.editor}
      foot={
        <>
          <Button kind="dangerText" icon="trash" className={styles.footStart} onClick={remove}>
            {t('Delete')}
          </Button>
          {item.tier === 'papers' && pictures.length > 0 ? (
            <Button kind="tonal" icon="stamp" onClick={() => setWatermark(true)}>
              {t('Copy to send')}
            </Button>
          ) : null}
          {item.tier === 'cards' ? <IconButton icon="star" label={item.favourite ? t('Remove from favourites') : t('Add to favourites')} pressed={item.favourite} onClick={() => setFavourite(item, !item.favourite)} /> : null}
          <Button icon="edit" onClick={() => openEdit(item.id)}>
            {t('Edit')}
          </Button>
        </>
      }
    >
      <div className={styles.view}>
        {card && top ? <Till item={item} /> : null}
        {isIdentity(item) ? <PaperHead item={item} /> : null}
        {item.details.files.length > 0 ? (
          <div className={styles.faces}>
            {item.details.files.map((file, index) => (
              <figure key={file.id} className={styles.face}>
                <FileImage itemId={item.id} file={file} label={`${t(FACE_LABELS[file.role])} ${index + 1}`} page={file.role === 'page'} />
                {file.role !== 'page' ? <figcaption className={`${styles.faceLabel} t-meta`}>{t(FACE_LABELS[file.role])}</figcaption> : null}
              </figure>
            ))}
          </div>
        ) : null}
        {card && !top ? <Till item={item} /> : null}
        <Facts item={item} />
        {item.details.expiresOn && item.tier === 'cards' ? <p className="t-meta">{validUntilWords(item.details.expiresOn)}</p> : null}
        {item.notes.trim() ? <p className={`${styles.notes} t-body`}>{item.notes}</p> : null}
      </div>
      <WatermarkDialog item={item} open={watermark} onClose={() => setWatermark(false)} />
    </DialogFrame>
  );
}

export function ItemView({ id, closing, onClose }: { id: string; closing: boolean; onClose: () => void }) {
  const titleId = useId();
  const status = useVaultStatus();
  const shown = useWalletStore(state => state.items[id]);
  const [kept, setKept] = useState(shown);
  if (shown && shown !== kept) setKept(shown);
  const item = shown ?? (closing ? kept : undefined);
  return (
    <Layer open={!closing} onDismiss={onClose} routed full labelledBy={titleId} label={item && !item.locked ? item.title : t('Locked')}>
      {!item || item.deletedAt !== null ? (
        <DialogFrame title={t('Not found')} titleId={titleId} onClose={onClose} foot={<Button onClick={onClose}>{t('Close')}</Button>}>
          <p className="t-body">{t('This card or paper is no longer in your wallet.')}</p>
        </DialogFrame>
      ) : item.locked ? (
        <DialogFrame title={t('Locked')} titleId={titleId} onClose={onClose}>
          <UnlockPanel what={status === 'none' ? '' : t('This paper opens with the vault’s passphrase, for this visit.')} />
        </DialogFrame>
      ) : (
        <Opened item={item} onClose={onClose} />
      )}
    </Layer>
  );
}
