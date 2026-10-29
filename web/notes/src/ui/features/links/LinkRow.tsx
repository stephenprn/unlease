/**
 * A link in its collection: its kept image in a cut 4:5 frame (every row the same, so a list of
 * shoes or films compares at a glance); beside it where it comes from and what it costs, what it
 * is, and two facts (`linkRowText`, shared with the phone); the stamp that marks it done.
 *
 * While the server reads it, the row says so; when the reading lands, title and price fill their
 * places and the row keeps its height, so nothing jumps under the pointer. A link still pending
 * with nothing to read it is a plain link, never a reading that does not end.
 */
import { memo, useState, type MouseEvent } from 'react';

import { t } from '@unlease/core/i18n';
import { formatDay, formatPrice } from '@unlease/core/services/format';
import { linkRowText } from '@unlease/notes/services/linkRow';

import { useBlobUrl } from '../../../app/media/images';
import { reanalyzeLink, setLinkDone } from '../../../app/store/actions';
import { useLibraryStore } from '../../../app/store/library';
import { selectCanRead, useSettingsStore } from '../../../app/store/settings';
import { showUndo } from '../../../app/store/ui';
import controls from '../../components/controls.module.css';
import { Icon } from '../../components/Icon';
import { IconButton, pebbleUnder } from '../../components/IconButton';
import { useLeaving } from '../../components/presence';
import { Stamp, stampWord } from '../../components/Stamp';
import { browserPath, isPlainClick, paths } from '../../router';
import { KIND_ICONS } from './kindIcon';
import styles from './links.module.css';
import { OutlineEdge, useOutline } from '../../components/Outline';
import { ReadingTrack } from './ReadingTrack';

/** A stamp lifted off fades where it was (`--duration-short`), as on the phone, before the row files itself back. */
const STAMP_OUT_MS = 150;

/** Stamped, or put back to do: the slip says which, and takes it back. */
export function toggleDone(id: string): void {
  const link = useLibraryStore.getState().links[id];
  if (!link) return;
  const undo = setLinkDone(id, !link.done);
  showUndo(link.done ? t('Remis à faire') : t('Tamponné « {stamp} »', { stamp: stampWord(link.kind) }), undo);
}

function LinkRowComponent({ id, now, onOpen }: { id: string; now: number; onOpen: (id: string) => void }) {
  const link = useLibraryStore(s => s.links[id]);
  const reading = useSettingsStore(selectCanRead);
  const kept = useBlobUrl(link?.imageIds[0]);
  // A stamp pressed while the row is on screen lands; one already there on arrival does not.
  const [wasDone, setWasDone] = useState(link?.done ?? false);
  const [landing, setLanding] = useState(false);
  if (link && link.done !== wasDone) {
    setWasDone(link.done);
    setLanding(link.done);
  }
  const stamped = useLeaving(link?.done && link.doneAt !== null ? link.doneAt : null, STAMP_OUT_MS);
  // The row's veil and its picture's frame, each in its own outline for life.
  const { ref: rowRef, vars: rowVars } = useOutline<HTMLLIElement>('row');
  const { ref: frameRef, vars: frameVars, d: frameD } = useOutline<HTMLDivElement>('frame');
  if (!link) return null;

  const pending = link.status === 'pending' && reading;
  const failed = link.status === 'failed';
  const unread = link.status === 'skipped' || (link.status === 'pending' && !reading);
  const { source, title, facts } = linkRowText(link);
  const price = link.price !== null ? formatPrice(link.price, link.currency) : null;
  const image = kept ?? link.imageUrl;

  return (
    <li ref={rowRef} className={styles.row} style={rowVars} data-done={link.done || undefined} data-status={link.status} data-flip={id}>
      <a
        className={styles.hit}
        href={browserPath(paths.link(id))}
        aria-label={[title, source, price].filter(Boolean).join(', ')}
        onClick={(event: MouseEvent) => {
          if (!isPlainClick(event)) return;
          event.preventDefault();
          onOpen(id);
        }}
      />
      <div className={styles.frame}>
        <div ref={frameRef} className={styles.image} style={frameVars} data-picture={image ? true : undefined}>
          {image ? (
            <img src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} />
          ) : link.done || pending ? null : (
            <Icon name={KIND_ICONS[link.kind]} size={28} />
          )}
          <OutlineEdge d={frameD} />
        </div>
        {stamped.value !== null ? (
          <span className={styles.stampSpot}>
            {/* Keyed by its date: stamped again, it is pressed again. */}
            <Stamp key={stamped.value} kind={link.kind} date={formatDay(stamped.value, now)} className={stamped.leaving ? styles.stampLeaving : landing ? styles.stampLanding : undefined} />
          </span>
        ) : null}
      </div>
      <div className={styles.text}>
        <div className={styles.head}>
          <p className={`${styles.overline} t-meta-strong`}>
            <span className={styles.source}>{source}</span>
            {price && !pending ? <span className={`${styles.price} t-price`}>{price}</span> : null}
          </p>
          {/* A title made from the address, before any reading, says so in the second ink. */}
          <p className={`${styles.title} t-body-strong`} data-address={link.title ? undefined : true}>
            {title}
          </p>
        </div>
        {pending ? (
          <p className={`${styles.reading} t-meta`}>
            <ReadingTrack width={72} />
            {t('Lecture de la page…')}
          </p>
        ) : failed ? (
          <p className={`${styles.failed} t-meta`}>
            <Icon name="alert" size={14} />
            <span className={styles.failedText}>{link.error ? t(link.error) : t('Lecture impossible')}</span>
            {reading ? (
              <button type="button" className={styles.retry} onClick={() => reanalyzeLink(id)}>
                {t('Réessayer')}
              </button>
            ) : null}
          </p>
        ) : unread && reading ? (
          <p className={`${styles.skipped} t-meta`}>
            <button type="button" className={styles.retry} onClick={() => reanalyzeLink(id)} aria-label={t('Lire {title}', { title })}>
              {t('Lire la page')}
            </button>
          </p>
        ) : facts.length > 0 ? (
          <p className={`${styles.facts} t-meta`}>{facts.join(' · ')}</p>
        ) : null}
      </div>
      <div className={styles.trailing}>
        {!pending ? (
          <IconButton className={styles.stampAction} icon={link.done ? 'undo' : 'stamp'} label={link.done ? t('Remettre à faire') : t('Marquer : {stamp}', { stamp: stampWord(link.kind).toLowerCase() })} pressed={link.done} onClick={() => toggleDone(id)} />
        ) : null}
        {/* The page itself, one click away, in a new tab; its pebble differs from the stamp's beside it. */}
        <a className={controls.iconButton} {...pebbleUnder(1)} href={link.url} target="_blank" rel="noopener noreferrer" aria-label={t('Ouvrir le lien')} data-tip={t('Ouvrir le lien')}>
          <Icon name="external" size={24} />
        </a>
      </div>
    </li>
  );
}

export const LinkRow = memo(LinkRowComponent);
