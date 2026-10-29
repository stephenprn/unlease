/**
 * "Notes": Claude looks up a film's, a series', a book's, an album's or a game's ratings on the sites
 * that rate its kind (SensCritique, IMDb, Rotten Tomatoes...), each against its scale. Nothing is
 * written; the server keeps the answer a week. The phone's `RatingsSheet`.
 */
import { type CSSProperties, useId } from 'react';

import { t } from '@unlease/core/i18n';
import { MODULE_NAMES } from '@unlease/notes/models/modules';
import { formatClock, formatDay } from '@unlease/core/services/format';
import { linkShop } from '@unlease/notes/services/modules';
import { ratingShare, ratingSource, ratingValue } from '@unlease/notes/services/works';
import type { Rating } from '@unlease/notes/sync/works';

import { useMinute } from '../../../app/hooks/useMinute';
import { findRatings } from '../../../app/modules';
import { useLibraryStore } from '../../../app/store/library';
import { Button } from '../../components/Button';
import { DialogFrame } from '../../components/Dialog';
import { IconButton } from '../../components/IconButton';
import { Layer } from '../../components/Layer';
import { useOutline } from '../../components/Outline';
import { ReadingTrack } from './ReadingTrack';
import { useModuleSearch } from './useModuleSearch';
import styles from './links.module.css';

export function RatingsDialog({ id, open, onDismiss }: { id: string; open: boolean; onDismiss: () => void }) {
  const titleId = useId();
  return (
    <Layer open={open} onDismiss={onDismiss} labelledBy={titleId}>
      <RatingsBody id={id} titleId={titleId} onDismiss={onDismiss} />
    </Layer>
  );
}

/** One site's rating: the site, the value against its scale, a meter, how many it rests on; its page from its end. */
function RatingRow({ rating, index }: { rating: Rating; index: number }) {
  const url = rating.url;
  return (
    <li className={`${styles.coupon} ${styles.arriving}`} style={{ '--arrive': index } as CSSProperties}>
      <div className={styles.couponText}>
        <p className={styles.offerHead}>
          <span className="t-body-strong">{ratingSource(rating)}</span>
          <span className="t-body-strong tabular">{ratingValue(rating)}</span>
        </p>
        <span className={styles.ratingMeter} style={{ '--share': ratingShare(rating) } as CSSProperties} aria-hidden="true" />
        {rating.count ? <p className="t-meta">{rating.count}</p> : null}
      </div>
      {url ? <IconButton icon="external" label={t('Voir sur {site}', { site: rating.source })} onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} /> : <span className={styles.offerSpace} aria-hidden="true" />}
    </li>
  );
}

function RatingsBody({ id, titleId, onDismiss }: { id: string; titleId: string; onDismiss: () => void }) {
  const link = useLibraryStore(s => s.links[id]);
  const now = useMinute();
  const { phase, search } = useModuleSearch((fresh, signal) => findRatings(id, fresh, signal));
  const { ref: wellRef, vars: wellVars } = useOutline<HTMLUListElement>('panel');
  if (!link) return null;
  const work = link.title || linkShop(link);

  const body =
    phase.kind === 'asking' ? (
      <div className={styles.couponsWaiting} role="status">
        <ReadingTrack width={120} />
        <p className="t-body">{t('Claude cherche les notes de {work}…', { work })}</p>
        <p className="t-meta">{t('Une recherche sur le web prend souvent une demi-minute.')}</p>
      </div>
    ) : phase.kind === 'failed' ? (
      <p className={`${styles.couponsError} t-body`} role="alert">
        {t('Claude n’a pas pu chercher : {reason}', { reason: t(phase.reason) })}
      </p>
    ) : (
      <>
        {phase.answer.work ? <p className="t-body-strong">{phase.answer.work}</p> : null}
        {phase.answer.ratings.length === 0 ? (
          <p className="t-body">{t('Aucune note trouvée pour l’instant.')}</p>
        ) : (
          <ul ref={wellRef} className={`${styles.couponsWell} paper`} style={wellVars} aria-label={MODULE_NAMES.ratings}>
            {phase.answer.ratings.map((rating, index) => (
              <RatingRow key={`${rating.source}-${rating.label}`} rating={rating} index={index} />
            ))}
          </ul>
        )}
        <p className="t-meta">
          {t('Trouvé sur le web par Claude le {day} à {time}. Les notes bougent, vérifiez-les sur chaque site.', { day: formatDay(phase.answer.searchedAt, now), time: formatClock(phase.answer.searchedAt) })}
        </p>
      </>
    );
  const foot =
    phase.kind === 'asking' ? null : (
      <>
        {phase.kind === 'failed' ? (
          <Button kind="text" onClick={() => search(false)}>
            {t('Réessayer')}
          </Button>
        ) : (
          <Button kind="text" icon="refresh" onClick={() => search(true)}>
            {t('Chercher à nouveau')}
          </Button>
        )}
        <Button icon="external" href={link.url}>
          {t('Ouvrir la page')}
        </Button>
      </>
    );

  return (
    <DialogFrame title={MODULE_NAMES.ratings} titleId={titleId} onClose={onDismiss} foot={foot} className={styles.couponsFrame}>
      {body}
    </DialogFrame>
  );
}
