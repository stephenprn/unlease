/**
 * A link in its collection: its kept image in a cut 4:5 frame (every row the same, so a list of
 * shoes or films compares at a glance); beside it where it comes from and what it costs, what it
 * is, and two facts (`linkRowText`, shared with the phone); the stamp that marks it done. A
 * price that moved says by how much beside it (a drop in the `ok` ink, a rise in the second); the
 * owner's note, quoted, takes the facts' line, so a list shows which links carry one.
 *
 * While the server reads it, the row says so; when the reading lands, title and price fill their
 * places and the row keeps its height, so nothing jumps under the pointer. A link still pending
 * with nothing to read it is a plain link, never a reading that does not end.
 */
import { memo, useState, type MouseEvent } from 'react';

import { t } from '@unlease/core/i18n';
import { formatDay } from '@unlease/core/services/format';
import { linkRowText } from '@unlease/notes/services/linkRow';
import { priceChangeText } from '@unlease/notes/services/priceWatch';
import { peopleNames } from '@unlease/notes/services/noteMentions';

import { useBlobUrl } from '@shared/app/media/images';
import { reanalyzeLink, setLinkDone } from '../../../app/store/actions';
import { useLibraryStore } from '../../../app/store/library';
import { useCanRead } from '../../../app/store/prefs';
import { useServerFeature } from '@shared/app/store/serverSettings';
import { showUndo } from '@shared/app/store/ui';
import controls from '@shared/ui/components/controls.module.css';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton, pebbleUnder } from '@shared/ui/components/IconButton';
import { useLeaving } from '@shared/ui/components/presence';
import { Stamp, stampWord } from '../../components/Stamp';
import { browserPath, isPlainClick } from '@shared/ui/router';
import { paths } from '../../routes';
import { KIND_ICONS } from './kindIcon';
import styles from './links.module.css';
import { OutlineEdge, useOutline } from '@shared/ui/components/Outline';
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
  // How its reading stands (unknown counts as on: a link saved meanwhile waits for the server)…
  const reading = useCanRead();
  // …and what may be asked of Claude, once the server has said it has a key.
  const claude = useServerFeature('claude');
  const kept = useBlobUrl(link?.imageIds[0]);
  // A picture that would not load (a site refusing to be shown elsewhere): the kind's glyph instead, never an empty frame.
  const [lost, setLost] = useState<string | null>(null);
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
  const { source, title, facts, price, priceChange, note } = linkRowText(link);
  const people = peopleNames(link.contactIds);
  const wanted = kept ?? link.imageUrl;
  const image = wanted && wanted !== lost ? wanted : null;

  return (
    <li ref={rowRef} className={styles.row} style={rowVars} data-done={link.done || undefined} data-status={link.status} data-flip={id}>
      <a
        className={styles.hit}
        href={browserPath(paths.link(id))}
        aria-label={[title, source, pending ? null : price, pending || !priceChange ? null : priceChangeText(link, now)?.text, note ? t('Votre note : {note}', { note }) : null].filter(Boolean).join(', ')}
        onClick={(event: MouseEvent) => {
          if (!isPlainClick(event)) return;
          event.preventDefault();
          onOpen(id);
        }}
      />
      <div className={styles.frame}>
        <div ref={frameRef} className={styles.image} style={frameVars} data-picture={image ? true : undefined}>
          {image ? (
            <img src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setLost(image)} />
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
            {price && priceChange && !pending ? (
              // Heard with the price, in the row's name.
              <span className={styles.priceChange} data-direction={priceChange.direction} aria-hidden="true">
                <Icon name={priceChange.direction === 'down' ? 'arrowDown' : 'arrowUp'} size={14} />
                {priceChange.amount}
              </span>
            ) : null}
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
            <span className={styles.readingText}>{t('Lecture de la page…')}</span>
          </p>
        ) : failed ? (
          <p className={`${styles.failed} t-meta`}>
            <Icon name="alert" size={14} />
            <span className={styles.failedText}>{link.error ? t(link.error) : t('Lecture impossible')}</span>
            {claude ? (
              <button type="button" className={styles.retry} onClick={() => reanalyzeLink(id)}>
                {t('Réessayer')}
              </button>
            ) : null}
          </p>
        ) : unread && claude ? (
          <p className={`${styles.skipped} t-meta`}>
            <button type="button" className={styles.retry} onClick={() => reanalyzeLink(id)} aria-label={t('Lire {title}', { title })}>
              {t('Lire la page')}
            </button>
          </p>
        ) : people.length > 0 || facts.length > 0 || note ? (
          // Whom it is for first (a gift idea's), then its facts.
          <p className={`${styles.facts} t-meta`}>
            {people.length > 0 ? <Icon name="person" size={14} className={styles.factsMark} /> : null}
            {[people.join(', '), ...(note ? [note] : facts)].filter(Boolean).join(' · ')}
          </p>
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
