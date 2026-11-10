/**
 * "Autres regards": Claude looks for the same story in other outlets, with each one's angle and what
 * it adds to the saved article or contradicts in it. Nothing is written; the server keeps the answer
 * half a day. The web's `CoverageDialog`.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { MODULE_NAMES } from '@unlease/notes/models/modules';
import { formatClock, formatDay, formatIsoDay } from '@unlease/core/services/format';
import type { CoverageOutlet } from '@unlease/notes/sync/coverage';
import { findCoverage } from '@app/modules';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText, IconButton, Organic, Sheet, SHEET_INSET, SheetScroll } from '../../components';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { ReadingTrack } from '@shared/ui/components/ReadingTrack';
import { openPage as open, SearchFoot } from './SearchFoot';
import { useModuleSearch } from './useModuleSearch';

export function CoverageSheet({ id, visible, onDismiss }: { id: string; visible: boolean; onDismiss: () => void }) {
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={MODULE_NAMES.coverage} tall>
      <CoverageBody id={id} />
    </Sheet>
  );
}

/** Mounted with the sheet each time it opens: it asks then (and again on demand), and drops the question when the sheet goes. */
function CoverageBody({ id }: { id: string }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const link = useLibraryStore(s => s.links[id]);
  const { phase, search } = useModuleSearch((fresh, signal) => findCoverage(id, fresh, signal));
  if (!link) return null;

  if (phase.kind === 'asking') {
    return (
      <View style={styles.waiting} accessibilityLiveRegion="polite">
        <ReadingTrack width={120} />
        <AppText variant="body" color={theme.color.inkMuted}>
          {t('Claude cherche le même sujet dans d’autres médias…')}
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
  const { story, outlets, note, searchedAt } = phase.answer;
  const now = Date.now();
  // A row without an article keeps the place of its button, so the texts stay in one column.
  const linked = outlets.some(outlet => outlet.url);
  return (
    <>
    <SheetScroll contentContainerStyle={styles.body}>
      {story ? <AppText variant="bodyStrong">{story}</AppText> : null}
      {outlets.length === 0 ? (
        <AppText variant="body">{t('Aucun autre média trouvé sur ce sujet pour l’instant.')}</AppText>
      ) : (
        <Organic outline="panel" style={styles.well} accessibilityLabel={MODULE_NAMES.coverage}>
          {outlets.map((outlet, index) => (
            <OutletRow key={`${outlet.outlet}-${outlet.url ?? index}`} outlet={outlet} first={index === 0} slot={linked} />
          ))}
        </Organic>
      )}
      {note ? <AppText variant="body">{note}</AppText> : null}
      <AppText variant="meta">{t('Trouvé sur le web par Claude le {day} à {time}.', { day: formatDay(searchedAt, now), time: formatClock(searchedAt) })}</AppText>
    </SheetScroll>
    <SearchFoot failed={false} url={link.url} onSearch={search} />
    </>
  );
}

/** One outlet: its name and day, its title, how it tells the story (meta strong) and what it adds (meta); its article from its end. */
function OutletRow({ outlet, first, slot }: { outlet: CoverageOutlet; first: boolean; slot: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const url = outlet.url;
  return (
    <View style={[styles.outlet, slot ? styles.outletSlot : null, first ? null : styles.outletRule]}>
      <View style={styles.outletText}>
        <View style={styles.outletHead}>
          <AppText variant="bodyStrong" style={styles.outletName}>
            {outlet.outlet}
          </AppText>
          {outlet.date ? <AppText variant="meta">{formatIsoDay(outlet.date)}</AppText> : null}
        </View>
        {outlet.title ? <AppText variant="body">{outlet.title}</AppText> : null}
        <AppText variant="metaStrong">{outlet.angle}</AppText>
        {outlet.adds ? <AppText variant="meta">{outlet.adds}</AppText> : null}
      </View>
      {url ? <IconButton icon="external" label={t('Lire sur {outlet}', { outlet: outlet.outlet })} onPress={() => open(url)} style={styles.page} /> : slot ? <View style={styles.noPage} /> : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { gap: 16, paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
    waiting: { gap: 12, paddingHorizontal: SHEET_INSET, paddingTop: 8, paddingBottom: 24, alignItems: 'flex-start' },
    // The outlets: a well in its own outline, ruled by paper, as the offers are.
    well: { backgroundColor: theme.color.paperHigh, overflow: 'hidden' },
    outlet: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, paddingHorizontal: 16, paddingVertical: 12 },
    outletSlot: { paddingRight: 4 },
    outletRule: { borderTopWidth: 1, borderTopColor: theme.color.paper },
    outletText: { flex: 1, gap: 2 },
    outletHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
    outletName: { flexShrink: 1 },
    // Centred on the row's first line (body strong's 23), the outlet's name.
    page: { marginTop: -8 },
    // An icon button's 48.
    noPage: { width: 48 },
  });
