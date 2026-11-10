/**
 * "Notes": Claude looks up a film's, a series', a book's, an album's or a game's ratings on the sites
 * that rate its kind (SensCritique, IMDb, Rotten Tomatoes...), each against its own scale. Nothing
 * is written; the server keeps the answer a week. The web's `RatingsDialog`.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { MODULE_NAMES } from '@unlease/notes/models/modules';
import { formatClock, formatDay } from '@unlease/core/services/format';
import { linkShop } from '@unlease/notes/services/modules';
import { ratingShare, ratingSource, ratingValue } from '@unlease/notes/services/works';
import type { Rating } from '@unlease/notes/sync/works';
import { findRatings } from '@app/modules';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText, IconButton, Organic, Sheet, SHEET_INSET, SheetScroll } from '../../components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { ReadingTrack } from '@shared/ui/components/ReadingTrack';
import { openPage as open, SearchFoot } from './SearchFoot';
import { useModuleSearch } from './useModuleSearch';

export function RatingsSheet({ id, visible, onDismiss }: { id: string; visible: boolean; onDismiss: () => void }) {
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={MODULE_NAMES.ratings} tall>
      <RatingsBody id={id} />
    </Sheet>
  );
}

/** Mounted with the sheet each time it opens: it asks then (and again on demand), and drops the question when the sheet goes. */
function RatingsBody({ id }: { id: string }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const link = useLibraryStore(s => s.links[id]);
  const { phase, search } = useModuleSearch((fresh, signal) => findRatings(id, fresh, signal));
  if (!link) return null;

  if (phase.kind === 'asking') {
    return (
      <View style={styles.waiting} accessibilityLiveRegion="polite">
        <ReadingTrack width={120} />
        <AppText variant="body" color={theme.color.inkMuted}>
          {t('Claude cherche les notes de {work}…', { work: link.title || linkShop(link) })}
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
            {t('Claude n’a pas pu chercher : {reason}', { reason: phase.reason })}
          </AppText>
        </SheetScroll>
        <SearchFoot failed url={link.url} onSearch={search} />
      </>
    );
  }
  const { work, ratings, searchedAt } = phase.answer;
  const now = Date.now();
  // A row without a page keeps the place of its button, so the values stay in one column.
  const linked = ratings.some(rating => rating.url);
  return (
    <>
    <SheetScroll contentContainerStyle={styles.body}>
      {work ? <AppText variant="bodyStrong">{work}</AppText> : null}
      {ratings.length === 0 ? (
        <AppText variant="body">{t('Aucune note trouvée pour l’instant.')}</AppText>
      ) : (
        <Organic outline="panel" style={styles.well} accessibilityLabel={MODULE_NAMES.ratings}>
          {ratings.map((rating, index) => (
            <RatingRow key={`${rating.source}-${rating.label}-${index}`} rating={rating} first={index === 0} slot={linked} />
          ))}
        </Organic>
      )}
      <AppText variant="meta">
        {t('Trouvé sur le web par Claude le {day} à {time}. Les notes bougent, vérifiez-les sur chaque site.', { day: formatDay(searchedAt, now), time: formatClock(searchedAt) })}
      </AppText>
    </SheetScroll>
    <SearchFoot failed={false} url={link.url} onSearch={search} />
    </>
  );
}

/**
 * One site's rating: the site and its value against its scale on one line (Signika's figures are
 * tabular), a thin meter in the second ink on the track, how many it rests on; its page from its end.
 */
function RatingRow({ rating, first, slot }: { rating: Rating; first: boolean; slot: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const url = rating.url;
  return (
    <View style={[styles.rating, slot ? styles.ratingSlot : null, first ? null : styles.ratingRule]}>
      <View style={styles.ratingText}>
        <View style={styles.ratingHead}>
          <AppText variant="bodyStrong" style={styles.ratingSource}>
            {ratingSource(rating)}
          </AppText>
          <AppText variant="bodyStrong">{ratingValue(rating)}</AppText>
        </View>
        <Organic style={styles.meter} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Organic style={[styles.meterFill, { width: `${Math.round(ratingShare(rating) * 100)}%` }]} />
        </Organic>
        {rating.count ? <AppText variant="meta">{rating.count}</AppText> : null}
      </View>
      {url ? <IconButton icon="external" label={t('Voir sur {site}', { site: rating.source })} onPress={() => open(url)} style={styles.page} /> : slot ? <View style={styles.noPage} /> : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { gap: 16, paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
    waiting: { gap: 12, paddingHorizontal: SHEET_INSET, paddingTop: 8, paddingBottom: 24, alignItems: 'flex-start' },
    // The ratings: a well in its own outline, ruled by paper, as the offers are.
    well: { backgroundColor: theme.color.paperHigh, overflow: 'hidden' },
    rating: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, paddingHorizontal: 16, paddingVertical: 12 },
    ratingSlot: { paddingRight: 4 },
    ratingRule: { borderTopWidth: 1, borderTopColor: theme.color.paper },
    ratingText: { flex: 1, gap: 2 },
    ratingHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
    ratingSource: { flexShrink: 1 },
    // A thin gauge in the second ink on the track: how full the score is on its own scale.
    meter: { height: 6, marginTop: 6, marginBottom: 4, backgroundColor: theme.color.track, overflow: 'hidden', ...corners(SHAPES.detail) },
    meterFill: { height: '100%', backgroundColor: theme.color.inkMuted, ...corners(SHAPES.detail) },
    // Centred on the row's first line (body strong's 23), the site and its value.
    page: { marginTop: -8 },
    // An icon button's 48.
    noPage: { width: 48 },
  });
