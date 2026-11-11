/**
 * "Codes promo": Claude searches the web for codes that work now at a priced link's shop, and for
 * other ways to pay less there. A code copies in one press; the foot opens the page to use it, or
 * searches again. Nothing is written: the server keeps the answer a few hours, so opening it again
 * costs nothing. The web's `CouponsDialog`.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { couponPrice, couponStatus } from '@unlease/notes/services/coupons';
import { linkShop } from '@unlease/notes/services/modules';
import { formatClock, formatDay } from '@unlease/core/services/format';
import type { Coupon, CouponResponse } from '@unlease/notes/sync/coupons';
import { findCoupons } from '@app/modules';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@shared/app/store/uiStore';
import { copyText } from '@shared/platform/clipboard';

import { AppText, EmptyLine, IconButton, Organic, Sheet, SHEET_INSET, SheetScroll } from '../../components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { ReadingTrack } from '@shared/ui/components/ReadingTrack';
import { openPage as open, SearchFoot } from './SearchFoot';

type Phase = { readonly kind: 'asking' } | { readonly kind: 'failed'; readonly reason: string } | { readonly kind: 'ready'; readonly answer: CouponResponse };

export function CouponsSheet({ id, visible, onDismiss }: { id: string; visible: boolean; onDismiss: () => void }) {
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('Codes promo')} tall>
      <CouponsBody id={id} />
    </Sheet>
  );
}

/** Mounted with the sheet each time it opens: it asks then (and again on demand), and drops the question when the sheet goes. */
function CouponsBody({ id }: { id: string }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const link = useLibraryStore(s => s.links[id]);
  const [phase, setPhase] = useState<Phase>({ kind: 'asking' });
  const [ask, setAsk] = useState({ fresh: false, round: 0 });

  useEffect(() => {
    const controller = new AbortController();
    findCoupons(id, ask.fresh, controller.signal).then(
      answer => {
        if (!controller.signal.aborted) setPhase({ kind: 'ready', answer });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setPhase({ kind: 'failed', reason: error instanceof Error ? t(error.message) : t('erreur inconnue') });
      },
    );
    return () => controller.abort();
  }, [id, ask]);

  if (!link) return null;
  const shop = linkShop(link);
  // After a failure nothing was kept, so asking again searches again either way.
  const search = (fresh: boolean) => {
    setPhase({ kind: 'asking' });
    setAsk(previous => ({ fresh, round: previous.round + 1 }));
  };

  if (phase.kind === 'asking') {
    return (
      <View style={styles.waiting} accessibilityLiveRegion="polite">
        <ReadingTrack width={120} />
        <AppText variant="body" color={theme.color.inkMuted}>
          {t('Claude cherche des codes promo pour {shop}…', { shop })}
        </AppText>
        <AppText variant="meta">{t('Une recherche sur le web prend souvent une demi-minute.')}</AppText>
      </View>
    );
  }
  if (phase.kind === 'failed') {
    return (
      <>
        <SheetScroll contentContainerStyle={styles.body}>
          <AppText variant="body" color={theme.color.danger} accessibilityLiveRegion="polite">
            {t('Claude n’a pas pu chercher de codes : {reason}', { reason: phase.reason })}
          </AppText>
        </SheetScroll>
        <SearchFoot failed url={link.url} onSearch={search} />
      </>
    );
  }
  const { coupons, tips, searchedAt } = phase.answer;
  const now = Date.now();
  return (
    <>
    <SheetScroll contentContainerStyle={styles.body}>
      {coupons.length === 0 ? (
        <EmptyLine size="body" text={t('Aucun code en cours trouvé pour {shop}.', { shop })} />
      ) : (
        <Organic outline="panel" style={styles.well} accessibilityLabel={t('Codes promo')}>
          {coupons.map((coupon, index) => (
            <CouponRow key={coupon.code} coupon={coupon} price={couponPrice(coupon, link)} first={index === 0} now={now} />
          ))}
        </Organic>
      )}
      {tips.length > 0 ? (
        <View style={styles.tips}>
          <AppText variant="section" accessibilityRole="header">
            {t('Autres façons de payer moins')}
          </AppText>
          {tips.map(tip => (
            <AppText key={tip.text} variant="body">
              {tip.text}
              {tip.url ? (
                <>
                  {' '}
                  <AppText variant="body" color={theme.color.link} onPress={() => open(tip.url!)} accessibilityRole="link">
                    {t('Voir la page')}
                  </AppText>
                </>
              ) : null}
            </AppText>
          ))}
        </View>
      ) : null}
      <AppText variant="meta">
        {t('Trouvé sur le web par Claude le {day} à {time}. Un code peut ne plus marcher au moment de payer.', { day: formatDay(searchedAt, now), time: formatClock(searchedAt) })}
      </AppText>
    </SheetScroll>
    <SearchFoot failed={false} url={link.url} onSearch={search} />
    </>
  );
}

/** One code: what it gives and what it comes to, its conditions, how sure it is and where it was found; copied from its end. */
function CouponRow({ coupon, price, first, now }: { coupon: Coupon; price: string | null; first: boolean; now: number }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const status = couponStatus(coupon, now);
  const source = coupon.sourceUrl;
  const copy = () =>
    copyText(coupon.code).then(copied =>
      copied ? showSnack(t('Code {code} copié', { code: coupon.code }), undefined, { tone: 'success' }) : showSnack(t('Impossible de copier le code'), undefined, { tone: 'error' }),
    );
  return (
    <View style={[styles.coupon, first ? null : styles.couponRule]}>
      <View style={styles.couponText}>
        <Organic style={styles.codeChip}>
          <AppText variant="body" style={styles.code} selectable>
            {coupon.code}
          </AppText>
        </Organic>
        <AppText variant="body">{coupon.benefit}</AppText>
        {price ? <AppText variant="bodyStrong">{price}</AppText> : null}
        {coupon.conditions ? <AppText variant="meta">{coupon.conditions}</AppText> : null}
        {status || coupon.source ? (
          <AppText variant="meta">
            {status}
            {status && coupon.source ? ' · ' : null}
            {source && coupon.source ? (
              <AppText variant="meta" color={theme.color.link} onPress={() => open(source)} accessibilityRole="link">
                {coupon.source}
              </AppText>
            ) : (
              coupon.source
            )}
          </AppText>
        ) : null}
      </View>
      <IconButton icon="copy" label={t('Copier le code {code}', { code: coupon.code })} onPress={copy} style={styles.copy} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { gap: 16, paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
    waiting: { gap: 12, paddingHorizontal: SHEET_INSET, paddingTop: 8, paddingBottom: 24, alignItems: 'flex-start' },
    // The codes: a well in its own outline, ruled by paper, as the link's facts are.
    well: { backgroundColor: theme.color.paperHigh, overflow: 'hidden' },
    coupon: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, paddingLeft: 16, paddingRight: 4, paddingVertical: 12 },
    couponRule: { borderTopWidth: 1, borderTopColor: theme.color.paper },
    couponText: { flex: 1, gap: 2, alignItems: 'flex-start' },
    // The code as it is typed at checkout: the monospace on paper, in the detail radius.
    codeChip: { marginBottom: 6, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: theme.color.paper, ...corners(SHAPES.detail) },
    code: { fontFamily: 'monospace', fontSize: 15, lineHeight: 22, letterSpacing: 0.6, color: theme.color.ink },
    tips: { gap: 6 },
    // Centred on the code it copies (its chip 26 high), not on the row's top.
    copy: { marginTop: -7 },
  });
