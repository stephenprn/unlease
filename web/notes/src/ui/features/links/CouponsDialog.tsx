/**
 * "Codes promo": Claude searches the web for codes that work now at a priced link's shop, and for
 * other ways to pay less there. A code copies in one press; the foot opens the page to use it, or
 * searches again. Nothing is written: the server keeps the answer a few hours, so opening it again
 * costs nothing. The phone's `CouponsSheet`.
 */
import { type CSSProperties, useEffect, useId, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { couponPrice, couponStatus } from '@unlease/notes/services/coupons';
import { linkShop } from '@unlease/notes/services/modules';
import { formatClock, formatDay } from '@unlease/core/services/format';
import type { Coupon, CouponResponse } from '@unlease/notes/sync/coupons';

import { findCoupons } from '../../../app/modules';
import { useMinute } from '@shared/app/hooks/useMinute';
import { useLibraryStore } from '../../../app/store/library';
import { showError, showSnack } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { EmptyLine } from '@shared/ui/components/EmptyLine';
import { IconButton } from '@shared/ui/components/IconButton';
import { Layer } from '@shared/ui/components/Layer';
import { useOutline } from '@shared/ui/components/Outline';
import { ReadingTrack } from './ReadingTrack';
import styles from './links.module.css';

type Phase = { readonly kind: 'asking' } | { readonly kind: 'failed'; readonly reason: string } | { readonly kind: 'ready'; readonly answer: CouponResponse };

export function CouponsDialog({ id, open, onDismiss }: { id: string; open: boolean; onDismiss: () => void }) {
  const titleId = useId();
  return (
    <Layer open={open} onDismiss={onDismiss} labelledBy={titleId}>
      <CouponsBody id={id} titleId={titleId} onDismiss={onDismiss} />
    </Layer>
  );
}

/** One code: what it gives and what it comes to, its conditions, how sure it is and where it was found; copied from its end. */
function CouponRow({ coupon, price, index, now }: { coupon: Coupon; price: string | null; index: number; now: number }) {
  const status = couponStatus(coupon, now);
  const copy = (): void => {
    // No clipboard outside a secure page (an http:// server).
    const copied = navigator.clipboard?.writeText(coupon.code) ?? Promise.reject(new Error('no clipboard'));
    copied.then(
      () => showSnack(t('Code {code} copied', { code: coupon.code }), undefined, { tone: 'success' }),
      () => showError(t('Couldn’t copy the code')),
    );
  };
  return (
    <li className={`${styles.coupon} ${styles.arriving}`} style={{ '--arrive': index } as CSSProperties}>
      <div className={styles.couponText}>
        <code className={styles.couponCode}>{coupon.code}</code>
        <p className="t-body">{coupon.benefit}</p>
        {price ? <p className="t-body-strong">{price}</p> : null}
        {coupon.conditions ? <p className="t-meta">{coupon.conditions}</p> : null}
        {status || coupon.source ? (
          <p className={`${styles.couponSource} t-meta`}>
            {status}
            {status && coupon.source ? ' · ' : null}
            {coupon.sourceUrl && coupon.source ? (
              <a href={coupon.sourceUrl} target="_blank" rel="noopener noreferrer">
                {coupon.source}
              </a>
            ) : (
              coupon.source
            )}
          </p>
        ) : null}
      </div>
      <IconButton icon="copy" label={t('Copy the code {code}', { code: coupon.code })} onClick={copy} />
    </li>
  );
}

/** Mounted each time the dialog opens: it asks then (and again on demand), and drops the question when the dialog goes. */
function CouponsBody({ id, titleId, onDismiss }: { id: string; titleId: string; onDismiss: () => void }) {
  const link = useLibraryStore(s => s.links[id]);
  const now = useMinute();
  const [phase, setPhase] = useState<Phase>({ kind: 'asking' });
  const [ask, setAsk] = useState({ fresh: false, round: 0 });
  // The codes' well, in its own outline.
  const { ref: wellRef, vars: wellVars } = useOutline<HTMLUListElement>('panel');

  useEffect(() => {
    const controller = new AbortController();
    findCoupons(id, ask.fresh, controller.signal).then(
      answer => {
        if (!controller.signal.aborted) setPhase({ kind: 'ready', answer });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setPhase({ kind: 'failed', reason: error instanceof Error ? error.message : t('unknown error') });
      },
    );
    return () => controller.abort();
  }, [id, ask]);

  if (!link) return null;
  const shop = linkShop(link);
  // After a failure nothing was kept, so asking again searches again either way.
  const search = (fresh: boolean): void => {
    setPhase({ kind: 'asking' });
    setAsk(previous => ({ fresh, round: previous.round + 1 }));
  };

  const body =
    phase.kind === 'asking' ? (
      <div className={styles.couponsWaiting} role="status">
        <ReadingTrack width={120} />
        <p className="t-body">{t('Claude is looking for promo codes for {shop}…', { shop })}</p>
        <p className="t-meta">{t('A web search often takes half a minute.')}</p>
      </div>
    ) : phase.kind === 'failed' ? (
      <p className={`${styles.couponsError} t-body`} role="alert">
        {t('Claude couldn’t look for codes: {reason}', { reason: t(phase.reason) })}
      </p>
    ) : (
      <>
        {phase.answer.coupons.length === 0 ? (
          <EmptyLine size="body" text={t('No current code found for {shop}.', { shop })} />
        ) : (
          <ul ref={wellRef} className={`${styles.couponsWell} paper`} style={wellVars} aria-label={t('Promo codes')}>
            {phase.answer.coupons.map((coupon, index) => (
              <CouponRow key={coupon.code} coupon={coupon} price={couponPrice(coupon, link)} index={index} now={now} />
            ))}
          </ul>
        )}
        {phase.answer.tips.length > 0 ? (
          <section className={styles.couponTips} aria-labelledby={`${titleId}-tips`}>
            <h3 id={`${titleId}-tips`} className="t-section">
              {t('Other ways to pay less')}
            </h3>
            <ul>
              {phase.answer.tips.map(tip => (
                <li key={tip.text} className="t-body">
                  {tip.text}
                  {tip.url ? (
                    <>
                      {' '}
                      <a href={tip.url} target="_blank" rel="noopener noreferrer">
                        {t('See the page')}
                      </a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <p className="t-meta">
          {t('Found on the web by Claude on {day} at {time}. A code may no longer work by the time you pay.', { day: formatDay(phase.answer.searchedAt, now), time: formatClock(phase.answer.searchedAt) })}
        </p>
      </>
    );
  const foot =
    phase.kind === 'asking' ? null : (
      <>
        {phase.kind === 'failed' ? (
          <Button kind="text" onClick={() => search(false)}>
            {t('Try again')}
          </Button>
        ) : (
          <Button kind="text" icon="refresh" onClick={() => search(true)}>
            {t('Search again')}
          </Button>
        )}
        <Button icon="external" href={link.url}>
          {t('Open the page')}
        </Button>
      </>
    );

  return (
    <DialogFrame title={t('Promo codes')} titleId={titleId} onClose={onDismiss} foot={foot} className={styles.couponsFrame}>
      {body}
    </DialogFrame>
  );
}
