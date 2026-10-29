/**
 * "Résumé jusqu’ici": where the person stopped in a series (a season, and an episode or the whole
 * season), then Claude's recap up to there from summaries on the web, and who is who, with nothing
 * of what comes next. The last pick is kept per series for the visit. Nothing is written; the server
 * keeps a recap a month. The web's `RecapDialog`.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { MODULE_NAMES } from '@unlease/notes/models/modules';
import { formatDay } from '@unlease/core/services/format';
import { linkShop, workTitle } from '@unlease/notes/services/modules';
import { RECAP_LIMITS, recapStopWords } from '@unlease/notes/services/works';
import { findRecap } from '@app/modules';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText, Button, Organic, Sheet, SheetScroll } from '../../components';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { ReadingTrack } from './ReadingTrack';
import { Stepper } from './Stepper';
import { useModuleSearch } from './useModuleSearch';

/** Where the person stopped: a season, and its last episode watched (null: the whole season). */
interface Stop {
  readonly season: number;
  readonly episode: number | null;
}

const START: Stop = { season: 1, episode: null };
/** The last stop asked per series, for the visit: opened again, the picker starts there. */
const LAST_STOPS = new Map<string, Stop>();

export function RecapSheet({ id, visible, onDismiss }: { id: string; visible: boolean; onDismiss: () => void }) {
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={MODULE_NAMES.recap} tall>
      <RecapBody id={id} />
    </Sheet>
  );
}

/** Mounted with the sheet each time it opens: the picker first, then the question, dropped when the sheet goes. */
function RecapBody({ id }: { id: string }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const link = useLibraryStore(s => s.links[id]);
  const [stop, setStop] = useState<Stop>(() => LAST_STOPS.get(id) ?? START);
  const [picking, setPicking] = useState(true);
  const { phase, search } = useModuleSearch((fresh, signal) => findRecap(id, stop.season, stop.episode, fresh, signal), false);
  if (!link) return null;

  const summarize = () => {
    LAST_STOPS.set(id, stop);
    setPicking(false);
    search(false);
  };
  const change = <Button kind="text" label={t('Changer d’épisode')} onPress={() => setPicking(true)} />;

  if (picking) {
    const { season, episode } = stop;
    return (
      <SheetScroll contentContainerStyle={styles.body}>
        <AppText variant="bodyStrong" accessibilityRole="header">
          {t('Où vous êtes-vous arrêté ?')}
        </AppText>
        <Stepper
          label={t('Saison')}
          value={t('Saison {season}', { season })}
          lessLabel={t('Saison précédente')}
          moreLabel={t('Saison suivante')}
          onLess={season > 1 ? () => setStop({ season: season - 1, episode }) : undefined}
          onMore={season < RECAP_LIMITS.seasons ? () => setStop({ season: season + 1, episode }) : undefined}
        />
        <Stepper
          label={t('Épisode')}
          value={episode === null ? t('Toute la saison') : t('Épisode {episode}', { episode })}
          lessLabel={t('Épisode précédent')}
          moreLabel={t('Épisode suivant')}
          // Below the first episode: the whole season.
          onLess={episode !== null ? () => setStop({ season, episode: episode > 1 ? episode - 1 : null }) : undefined}
          onMore={(episode ?? 0) < RECAP_LIMITS.episodes ? () => setStop({ season, episode: (episode ?? 0) + 1 }) : undefined}
        />
        <AppText variant="meta">{t('Claude s’arrête là : rien de la suite, ni d’indice sur ce qui vient.')}</AppText>
        <Button label={t('Résumer')} icon="rewind" onPress={summarize} style={styles.end} />
      </SheetScroll>
    );
  }

  if (phase.kind === 'asking') {
    return (
      <View style={styles.waiting} accessibilityLiveRegion="polite">
        <ReadingTrack width={120} />
        <AppText variant="body" color={theme.color.inkMuted}>
          {t('Claude résume {series} jusqu’à {stop}…', { series: workTitle(link) || linkShop(link), stop: recapStopWords(stop.season, stop.episode) })}
        </AppText>
        <AppText variant="meta">{t('Une recherche sur le web prend souvent une demi-minute.')}</AppText>
      </View>
    );
  }
  if (phase.kind === 'failed') {
    return (
      <View style={styles.body}>
        <AppText variant="body" color={theme.color.danger} accessibilityLiveRegion="polite">
          {t('Claude n’a pas pu chercher : {reason}', { reason: phase.reason })}
        </AppText>
        <View style={styles.actions}>
          {change}
          <Button label={t('Réessayer')} onPress={() => search(false)} />
        </View>
      </View>
    );
  }
  const { recap, characters, searchedAt } = phase.answer;
  const paragraphs = recap.split(/\n\s*\n/).filter(paragraph => paragraph.trim());
  return (
    <SheetScroll contentContainerStyle={styles.body}>
      {phase.answer.stop ? <AppText variant="bodyStrong">{phase.answer.stop}</AppText> : null}
      <View style={styles.recap}>
        {paragraphs.map((paragraph, index) => (
          <AppText key={index} variant="body" selectable>
            {paragraph}
          </AppText>
        ))}
      </View>
      {characters.length > 0 ? (
        <View style={styles.people}>
          <AppText variant="section" accessibilityRole="header">
            {t('Personnages')}
          </AppText>
          <Organic outline="panel" style={styles.well}>
            {characters.map((person, index) => (
              <View key={`${person.name}-${index}`} style={[styles.person, index === 0 ? null : styles.personRule]}>
                <AppText variant="bodyStrong">{person.name}</AppText>
                {person.note ? <AppText variant="body">{person.note}</AppText> : null}
              </View>
            ))}
          </Organic>
        </View>
      ) : null}
      <AppText variant="meta">{t('Écrit par Claude le {day} d’après des résumés trouvés sur le web, sans rien de la suite.', { day: formatDay(searchedAt, Date.now()) })}</AppText>
      <View style={styles.actions}>
        {change}
        <Button kind="tonal" label={t('Chercher à nouveau')} icon="refresh" onPress={() => search(true)} />
      </View>
    </SheetScroll>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { gap: 16, paddingHorizontal: 8, paddingBottom: 8 },
    waiting: { gap: 12, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 24, alignItems: 'flex-start' },
    actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
    end: { alignSelf: 'flex-end' },
    recap: { gap: 12 },
    people: { gap: 8 },
    // Who is who: a well in its own outline, ruled by paper, as the offers are.
    well: { backgroundColor: theme.color.paperHigh, overflow: 'hidden' },
    person: { gap: 2, paddingHorizontal: 16, paddingVertical: 12 },
    personRule: { borderTopWidth: 1, borderTopColor: theme.color.paper },
  });
