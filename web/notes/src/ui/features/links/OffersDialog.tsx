/**
 * "Moins cher ailleurs" and "Seconde main": Claude searches the web for the same item at other shops
 * (`new`) or second-hand (`used`), the cheapest first, each against the link's own price. Second-hand
 * also says what it usually goes for, and opens the resale sites' own searches to look further.
 * Nothing is written; the server keeps the answer a few hours. The phone's `OffersSheet`.
 */
import { type CSSProperties, useEffect, useId, useState } from 'react';

import { getLocale, t } from '@unlease/core/i18n';
import type { LinkItem } from '@unlease/notes/models/entities';
import { MODULE_NAMES } from '@unlease/notes/models/modules';
import { formatClock, formatDay, formatPrice } from '@unlease/core/services/format';
import { linkShop, marketplaceSearches } from '@unlease/notes/services/modules';
import { offerDetails, offerGap, rangeText } from '@unlease/notes/services/offers';
import type { Offer, OfferMarket, OfferResponse } from '@unlease/notes/sync/offers';

import { useMinute } from '../../../app/hooks/useMinute';
import { findOffers } from '../../../app/modules';
import { useLibraryStore } from '../../../app/store/library';
import { Button } from '../../components/Button';
import { DialogFrame } from '../../components/Dialog';
import { IconButton } from '../../components/IconButton';
import { Layer } from '../../components/Layer';
import { useOutline } from '../../components/Outline';
import { ReadingTrack } from './ReadingTrack';
import styles from './links.module.css';

type Phase = { readonly kind: 'asking' } | { readonly kind: 'failed'; readonly reason: string } | { readonly kind: 'ready'; readonly answer: OfferResponse };

export function OffersDialog({ id, market, open, onDismiss }: { id: string; market: OfferMarket; open: boolean; onDismiss: () => void }) {
  const titleId = useId();
  return (
    <Layer open={open} onDismiss={onDismiss} labelledBy={titleId}>
      <OffersBody id={id} market={market} titleId={titleId} onDismiss={onDismiss} />
    </Layer>
  );
}

/** One offer: where, how much, against the link's price, in what state; its page from its end. */
function OfferRow({ offer, market, link, index }: { offer: Offer; market: OfferMarket; link: LinkItem; index: number }) {
  const gap = market === 'new' ? offerGap(offer, link) : null;
  const details = offerDetails(offer, market);
  const url = offer.url;
  return (
    <li className={`${styles.coupon} ${styles.arriving}`} style={{ '--arrive': index } as CSSProperties}>
      <div className={styles.couponText}>
        <p className={styles.offerHead}>
          <span className="t-body-strong">{offer.shop}</span>
          <span className="t-body-strong tabular">{formatPrice(offer.price, offer.currency ?? link.currency)}</span>
        </p>
        {offer.title ? <p className="t-body">{offer.title}</p> : null}
        {gap ? <p className={`t-meta-strong ${gap.cheaper ? styles.offerCheaper : ''}`}>{gap.text}</p> : null}
        {details ? <p className="t-meta">{details}</p> : null}
      </div>
      {/* Without a page, its room stays: the prices keep one column. */}
      {url ? <IconButton icon="external" label={t('Voir l’offre de {shop}', { shop: offer.shop })} onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} /> : <span className={styles.offerSpace} aria-hidden="true" />}
    </li>
  );
}

/** Mounted each time the dialog opens: it asks then (and again on demand), and drops the question when the dialog goes. */
function OffersBody({ id, market, titleId, onDismiss }: { id: string; market: OfferMarket; titleId: string; onDismiss: () => void }) {
  const link = useLibraryStore(s => s.links[id]);
  const now = useMinute();
  const [phase, setPhase] = useState<Phase>({ kind: 'asking' });
  const [ask, setAsk] = useState({ fresh: false, round: 0 });
  const { ref: wellRef, vars: wellVars } = useOutline<HTMLUListElement>('panel');

  useEffect(() => {
    const controller = new AbortController();
    findOffers(id, market, ask.fresh, controller.signal).then(
      answer => {
        if (!controller.signal.aborted) setPhase({ kind: 'ready', answer });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setPhase({ kind: 'failed', reason: error instanceof Error ? error.message : t('erreur inconnue') });
      },
    );
    return () => controller.abort();
  }, [id, market, ask]);

  if (!link) return null;
  const item = link.title || linkShop(link);
  const search = (fresh: boolean): void => {
    setPhase({ kind: 'asking' });
    setAsk(previous => ({ fresh, round: previous.round + 1 }));
  };

  const sites =
    market === 'used' ? (
      <section className={styles.couponTips} aria-labelledby={`${titleId}-sites`}>
        <h3 id={`${titleId}-sites`} className="t-section">
          {t('Chercher vous-même')}
        </h3>
        <div className={styles.moduleBar}>
          {marketplaceSearches(link, getLocale()).map(site => (
            <Button key={site.name} kind="tonal" small icon="external" href={site.url}>
              {site.name}
            </Button>
          ))}
        </div>
      </section>
    ) : null;
  const body =
    phase.kind === 'asking' ? (
      <div className={styles.couponsWaiting} role="status">
        <ReadingTrack width={120} />
        <p className="t-body">{market === 'new' ? t('Claude cherche {item} dans d’autres boutiques…', { item }) : t('Claude cherche {item} d’occasion…', { item })}</p>
        <p className="t-meta">{t('Une recherche sur le web prend souvent une demi-minute.')}</p>
      </div>
    ) : phase.kind === 'failed' ? (
      <>
        <p className={`${styles.couponsError} t-body`} role="alert">
          {t('Claude n’a pas pu chercher : {reason}', { reason: t(phase.reason) })}
        </p>
        {/* The resale sites' own searches need no Claude: still there when it could not search. */}
        {sites}
      </>
    ) : (
      <>
        {market === 'used' && phase.answer.range ? <p className="t-body-strong">{rangeText(phase.answer.range)}</p> : null}
        {phase.answer.offers.length === 0 ? (
          <p className="t-body">{market === 'new' ? t('Rien trouvé de moins cher ailleurs pour l’instant.') : t('Aucune offre d’occasion trouvée pour l’instant.')}</p>
        ) : (
          <ul ref={wellRef} className={`${styles.couponsWell} paper`} style={wellVars} aria-label={MODULE_NAMES[market === 'new' ? 'cheaper' : 'secondhand']}>
            {phase.answer.offers.map((offer, index) => (
              <OfferRow key={`${offer.shop}-${offer.url ?? index}`} offer={offer} market={market} link={link} index={index} />
            ))}
          </ul>
        )}
        {phase.answer.note ? <p className="t-body">{phase.answer.note}</p> : null}
        {sites}
        <p className="t-meta">
          {t('Trouvé sur le web par Claude le {day} à {time}. Les prix changent vite, vérifiez-les sur le site.', { day: formatDay(phase.answer.searchedAt, now), time: formatClock(phase.answer.searchedAt) })}
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
    <DialogFrame title={MODULE_NAMES[market === 'new' ? 'cheaper' : 'secondhand']} titleId={titleId} onClose={onDismiss} foot={foot} className={styles.couponsFrame}>
      {body}
    </DialogFrame>
  );
}
