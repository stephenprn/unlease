/**
 * "Moins cher ailleurs" and "Seconde main": Claude searches the web for the same item at other shops
 * (`new`) or second-hand (`used`), the cheapest first, each against the link's own price. Second-hand
 * also says what it usually goes for, and opens the resale sites' own searches to look further.
 * Nothing is written; the server keeps the answer a few hours. The web's `OffersDialog`.
 */
import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { getLocale, t } from '@unlease/core/i18n';
import type { LinkItem } from '@unlease/notes/models/entities';
import { MODULE_NAMES } from '@unlease/notes/models/modules';
import { formatClock, formatDay, formatPrice } from '@unlease/core/services/format';
import { linkShop, marketplaceSearches } from '@unlease/notes/services/modules';
import { offerDetails, offerGap, rangeText } from '@unlease/notes/services/offers';
import type { Offer, OfferMarket, OfferResponse } from '@unlease/notes/sync/offers';
import { findOffers } from '@app/modules';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@app/store/uiStore';

import { AppText, Button, IconButton, Organic, Sheet, SheetScroll } from '../../components';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { ReadingTrack } from './ReadingTrack';

type Phase = { readonly kind: 'asking' } | { readonly kind: 'failed'; readonly reason: string } | { readonly kind: 'ready'; readonly answer: OfferResponse };

export function OffersSheet({ id, market, visible, onDismiss }: { id: string; market: OfferMarket; visible: boolean; onDismiss: () => void }) {
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={MODULE_NAMES[market === 'new' ? 'cheaper' : 'secondhand']} tall>
      <OffersBody id={id} market={market} />
    </Sheet>
  );
}

const open = (url: string) => Linking.openURL(url).catch(() => showSnack(t('Impossible d’ouvrir ce lien'), undefined, { tone: 'error' }));

/** Mounted with the sheet each time it opens: it asks then (and again on demand), and drops the question when the sheet goes. */
function OffersBody({ id, market }: { id: string; market: OfferMarket }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const link = useLibraryStore(s => s.links[id]);
  const [phase, setPhase] = useState<Phase>({ kind: 'asking' });
  const [ask, setAsk] = useState({ fresh: false, round: 0 });

  useEffect(() => {
    const controller = new AbortController();
    findOffers(id, market, ask.fresh, controller.signal).then(
      answer => {
        if (!controller.signal.aborted) setPhase({ kind: 'ready', answer });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setPhase({ kind: 'failed', reason: error instanceof Error ? t(error.message) : t('erreur inconnue') });
      },
    );
    return () => controller.abort();
  }, [id, market, ask]);

  if (!link) return null;
  const item = link.title || linkShop(link);
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
          {market === 'new' ? t('Claude cherche {item} dans d’autres boutiques…', { item }) : t('Claude cherche {item} d’occasion…', { item })}
        </AppText>
        <AppText variant="meta">{t('Une recherche sur le web prend souvent une demi-minute.')}</AppText>
      </View>
    );
  }
  const sites = market === 'used' ? marketplaceSearches(link, getLocale()) : [];
  // The resale sites' own searches need no Claude: there in every answer, and when it could not search.
  const siteSearches =
    sites.length > 0 ? (
      <View style={styles.sites}>
        <AppText variant="section" accessibilityRole="header">
          {t('Chercher vous-même')}
        </AppText>
        <View style={styles.siteRow}>
          {sites.map(site => (
            <Button key={site.name} kind="tonal" small label={site.name} icon="external" onPress={() => open(site.url)} />
          ))}
        </View>
      </View>
    ) : null;
  if (phase.kind === 'failed') {
    return (
      <View style={styles.body}>
        <AppText variant="body" color={theme.color.danger} accessibilityLiveRegion="polite">
          {t('Claude n’a pas pu chercher : {reason}', { reason: phase.reason })}
        </AppText>
        {siteSearches}
        <View style={styles.actions}>
          <Button kind="text" label={t('Réessayer')} onPress={() => search(false)} />
          <Button label={t('Ouvrir la page')} icon="external" onPress={() => open(link.url)} />
        </View>
      </View>
    );
  }
  const { offers, range, note, searchedAt } = phase.answer;
  const now = Date.now();
  // A row without a page keeps the place of its button, so the prices stay in one column.
  const linked = offers.some(offer => offer.url);
  return (
    <SheetScroll contentContainerStyle={styles.body}>
      {market === 'used' && range ? <AppText variant="bodyStrong">{rangeText(range)}</AppText> : null}
      {offers.length === 0 ? (
        <AppText variant="body">{market === 'new' ? t('Rien trouvé de moins cher ailleurs pour l’instant.') : t('Aucune offre d’occasion trouvée pour l’instant.')}</AppText>
      ) : (
        <Organic outline="panel" style={styles.well} accessibilityLabel={MODULE_NAMES[market === 'new' ? 'cheaper' : 'secondhand']}>
          {offers.map((offer, index) => (
            <OfferRow key={`${offer.shop}-${offer.url ?? index}`} offer={offer} market={market} link={link} first={index === 0} slot={linked} />
          ))}
        </Organic>
      )}
      {note ? <AppText variant="body">{note}</AppText> : null}
      {siteSearches}
      <AppText variant="meta">
        {t('Trouvé sur le web par Claude le {day} à {time}. Les prix changent vite, vérifiez-les sur le site.', { day: formatDay(searchedAt, now), time: formatClock(searchedAt) })}
      </AppText>
      <View style={styles.actions}>
        <Button kind="text" label={t('Chercher à nouveau')} icon="refresh" onPress={() => search(true)} />
        <Button label={t('Ouvrir la page')} icon="external" onPress={() => open(link.url)} />
      </View>
    </SheetScroll>
  );
}

/** One offer: where and how much, against the link's price, in what state; its page from its end. */
function OfferRow({ offer, market, link, first, slot }: { offer: Offer; market: OfferMarket; link: LinkItem; first: boolean; slot: boolean }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const gap = market === 'new' ? offerGap(offer, link) : null;
  const details = offerDetails(offer, market);
  const url = offer.url;
  return (
    <View style={[styles.offer, slot ? styles.offerSlot : null, first ? null : styles.offerRule]}>
      <View style={styles.offerText}>
        <View style={styles.offerHead}>
          <AppText variant="bodyStrong" style={styles.shop}>
            {offer.shop}
          </AppText>
          <AppText variant="bodyStrong">{formatPrice(offer.price, offer.currency ?? link.currency)}</AppText>
        </View>
        {offer.title ? <AppText variant="body">{offer.title}</AppText> : null}
        {gap ? (
          <AppText variant="metaStrong" color={gap.cheaper ? theme.color.ok : theme.color.inkMuted}>
            {gap.text}
          </AppText>
        ) : null}
        {details ? <AppText variant="meta">{details}</AppText> : null}
      </View>
      {url ? <IconButton icon="external" label={t('Voir l’offre de {shop}', { shop: offer.shop })} onPress={() => open(url)} /> : slot ? <View style={styles.noPage} /> : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { gap: 16, paddingHorizontal: 8, paddingBottom: 8 },
    waiting: { gap: 12, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 24, alignItems: 'flex-start' },
    actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
    // The offers: a well in its own outline, ruled by paper, as the promo codes are.
    well: { backgroundColor: theme.color.paperHigh, overflow: 'hidden' },
    offer: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, paddingHorizontal: 16, paddingVertical: 12 },
    offerSlot: { paddingRight: 4 },
    offerRule: { borderTopWidth: 1, borderTopColor: theme.color.paper },
    offerText: { flex: 1, gap: 2 },
    offerHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
    shop: { flexShrink: 1 },
    // An icon button's 48.
    noPage: { width: 48 },
    sites: { gap: 8 },
    siteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  });
