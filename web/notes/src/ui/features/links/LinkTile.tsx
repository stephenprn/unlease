/**
 * A link in its collection as a picture (`LineLayout` `gallery` or `mosaic`, the phone's
 * `LinkTileView`):
 *
 * - `gallery`: its kept image large in a 4:5 frame, every tile alike so a list of shoes or films
 *   compares at a glance; under it where it comes from and what it costs, and what it is (two
 *   lines), the same strings as its row (`linkRowText`).
 * - `mosaic`: its image at its own proportions, edge to edge with the others in columns, a
 *   moodboard; its price on a paper tag in its corner, its words on a paper caption that rises
 *   under a pointer or the keyboard (held up while it is read, or could not be). A link without a
 *   picture is a sheet of its words among them.
 *
 * Both: the stamp pressed on the picture once done (faded as a done row's frame), the stamp and the
 * page from a paper capsule over the picture's corner under a pointer or the keyboard (a finger
 * stamps from the link's panel, as from a row), its reading or what stopped it under the title.
 */
import { memo, useState, type CSSProperties, type MouseEvent } from 'react';

import { t } from '@unlease/core/i18n';
import { formatDay } from '@unlease/core/services/format';
import { linkRowText } from '@unlease/notes/services/linkRow';
import { priceChangeText } from '@unlease/notes/services/priceWatch';
import { peopleNames } from '@unlease/notes/services/noteMentions';

import { useBlobUrl } from '@shared/app/media/images';
import { reanalyzeLink } from '../../../app/store/actions';
import { useLibraryStore } from '../../../app/store/library';
import { useCanRead } from '../../../app/store/prefs';
import { useServerFeature } from '@shared/app/store/serverSettings';
import controls from '@shared/ui/components/controls.module.css';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton, pebbleUnder } from '@shared/ui/components/IconButton';
import { OutlineEdge, useOutline } from '@shared/ui/components/Outline';
import { useLeaving } from '@shared/ui/components/presence';
import { browserPath, isPlainClick } from '@shared/ui/router';
import { Stamp, stampWord } from '../../components/Stamp';
import { paths } from '../../routes';
import { KIND_ICONS } from './kindIcon';
import { toggleDone } from './LinkRow';
import { ReadingTrack } from './ReadingTrack';
import rowStyles from './links.module.css';
import styles from './linkViews.module.css';
import { pictureRatio, rememberRatio } from './pictureRatios';

/** A stamp lifted off fades where it was, as on a row. */
const STAMP_OUT_MS = 150;

export type TileShape = 'gallery' | 'mosaic';

function LinkTileComponent({ id, now, shape, onOpen }: { id: string; now: number; shape: TileShape; onOpen: (id: string) => void }) {
  const link = useLibraryStore(s => s.links[id]);
  const reading = useCanRead();
  const claude = useServerFeature('claude');
  const kept = useBlobUrl(link?.imageIds[0]);
  const [lost, setLost] = useState<string | null>(null);
  // A picture's proportions, once known (here or on an earlier visit): the mosaic's piece takes them.
  const [ratio, setRatio] = useState<number | null>(null);
  const [wasDone, setWasDone] = useState(link?.done ?? false);
  const [landing, setLanding] = useState(false);
  if (link && link.done !== wasDone) {
    setWasDone(link.done);
    setLanding(link.done);
  }
  const stamped = useLeaving(link?.done && link.doneAt !== null ? link.doneAt : null, STAMP_OUT_MS);
  const { ref: frameRef, vars: frameVars, d: frameD } = useOutline<HTMLDivElement>('frame');
  if (!link) return null;

  const pending = link.status === 'pending' && reading;
  const failed = link.status === 'failed';
  const unread = link.status === 'skipped' || (link.status === 'pending' && !reading);
  const { source, title, price, priceChange, note } = linkRowText(link);
  const people = peopleNames(link.contactIds);
  const wanted = kept ?? link.imageUrl;
  const image = wanted && wanted !== lost ? wanted : null;
  const mosaic = shape === 'mosaic';
  // A mosaic's link without a picture is a sheet of its words, as tall as they are.
  const words = mosaic && !image;
  const known = image ? (ratio ?? pictureRatio(image)) : null;
  const frameStyle: CSSProperties = { ...frameVars, ...(mosaic && image ? { aspectRatio: String(known ?? 0.8) } : null) };
  const label = [title, source, pending ? null : price, pending || !priceChange ? null : priceChangeText(link, now)?.text, people.length > 0 ? people.join(', ') : null, note ? t('Your note: {note}', { note }) : null]
    .filter(Boolean)
    .join(', ');

  const status = pending ? (
    <p className={`${styles.status} t-meta`}>
      <ReadingTrack width={56} />
      <span className={styles.ellipsis}>{t('Reading the page…')}</span>
    </p>
  ) : failed ? (
    <p className={`${styles.status} ${styles.failed} t-meta`}>
      <Icon name="alert" size={14} />
      <span className={styles.ellipsis}>{link.error ? t(link.error) : t('Couldn’t read it')}</span>
      {claude ? (
        <button type="button" className={styles.retry} onClick={() => reanalyzeLink(id)}>
          {t('Try again')}
        </button>
      ) : null}
    </p>
  ) : unread && claude ? (
    <p className={`${styles.status} t-meta`}>
      <button type="button" className={`${styles.retry} ${styles.retryAlone}`} onClick={() => reanalyzeLink(id)} aria-label={t('Read {title}', { title })}>
        {t('Read the page')}
      </button>
    </p>
  ) : null;

  const overline = (
    <p className={`${styles.overline} t-meta-strong`}>
      <span className={styles.ellipsis}>{source}</span>
      {price && priceChange && !pending ? (
        <span className={styles.priceChange} data-direction={priceChange.direction} aria-hidden="true">
          <Icon name={priceChange.direction === 'down' ? 'arrowDown' : 'arrowUp'} size={14} />
          {priceChange.amount}
        </span>
      ) : null}
      {price && !pending ? <span className={`${styles.price} t-price`}>{price}</span> : null}
    </p>
  );

  return (
    <li className={styles.tile} data-shape={shape} data-done={link.done || undefined} data-words={words || undefined} data-flip={id}>
      <a
        className={styles.hit}
        href={browserPath(paths.link(id))}
        aria-label={label}
        onClick={(event: MouseEvent) => {
          if (!isPlainClick(event)) return;
          event.preventDefault();
          onOpen(id);
        }}
      />
      <div className={styles.frameSpot}>
        <div ref={frameRef} className={styles.frame} style={frameStyle} data-picture={image ? true : undefined}>
          {image ? (
            <img
              src={image}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              draggable={false}
              onError={() => setLost(image)}
              onLoad={event => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                if (mosaic && naturalWidth > 0 && naturalHeight > 0) setRatio(rememberRatio(image, naturalWidth / naturalHeight));
              }}
            />
          ) : words ? (
            <div className={styles.words}>
              <Icon name={KIND_ICONS[link.kind]} size={20} className={styles.wordsMark} />
              {overline}
              <p className={`${styles.wordsTitle} t-body-strong`} data-address={link.title ? undefined : true}>
                {title}
              </p>
              {status}
            </div>
          ) : link.done ? null : (
            // A large frame stays a frame of something while it is read: its kind.
            <Icon name={KIND_ICONS[link.kind]} size={40} />
          )}
          {/* What it costs, on its picture's corner: a moodboard of things to buy still says what they cost. */}
          {mosaic && image && price && !status ? <span className={`${styles.priceTag} t-price`}>{price}</span> : null}
          {/* Its words rise under a pointer or the keyboard (the link's name already says them); held up while it is read or could not be. */}
          {mosaic && image ? (
            <div className={styles.caption} data-held={status ? true : undefined}>
              <div aria-hidden="true">
                {overline}
                <p className={`${styles.captionTitle} t-body-strong`}>{title}</p>
              </div>
              {status}
            </div>
          ) : null}
          <OutlineEdge d={frameD} />
        </div>
        {stamped.value !== null ? (
          <span className={styles.stampSpot}>
            <Stamp key={stamped.value} kind={link.kind} date={formatDay(stamped.value, now)} className={stamped.leaving ? rowStyles.stampLeaving : landing ? rowStyles.stampLanding : undefined} />
          </span>
        ) : null}
        <div className={styles.actions}>
          {!pending ? (
            <IconButton
              compact
              className={styles.stampAction}
              icon={link.done ? 'undo' : 'stamp'}
              label={link.done ? t('Put back to do') : t('Mark as {stamp}', { stamp: stampWord(link.kind).toLowerCase() })}
              pressed={link.done}
              onClick={() => toggleDone(id)}
            />
          ) : null}
          <a className={`${controls.iconButton} ${controls.compact}`} {...pebbleUnder(1)} href={link.url} target="_blank" rel="noopener noreferrer" aria-label={t('Open the link')} data-tip={t('Open the link')}>
            <Icon name="external" size={20} />
          </a>
        </div>
      </div>
      {shape === 'gallery' ? (
        <div className={styles.text}>
          {overline}
          <p className={`${styles.title} t-body-strong`} data-address={link.title ? undefined : true}>
            {title}
          </p>
          {status}
        </div>
      ) : null}
    </li>
  );
}

export const LinkTile = memo(LinkTileComponent);
