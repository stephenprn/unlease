/**
 * « Dans l’agenda »: the events that mention this note or this page (`GET /api/calendar/mentions`,
 * Agenda's server module), each with its day, opening in Agenda (its app when installed, else its
 * web app), the coming ones first. Asked when the screen opens; nothing without a server, nor when
 * the server does not run Agenda, nor when nothing mentions it. A leaf (the shared code and the
 * packages): Pages borrows it.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { mentionsPath, parseMentionsResponse, type MentionPlace } from '@unlease/core/sync/mentions';
import { authHeader } from '@unlease/core/sync/protocol';
import { GEOMETRY } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import { weekdayDay } from '@unlease/calendar/services/eventText';
import { instantToDay } from '@unlease/calendar/services/time';
import { eventPlace, openInApp } from '@shared/app/openApp';
import { selectServer, selectServerApps, useSettingsStore } from '@shared/app/store/settingsStore';

import { AppText, Icon, Organic, Tappable } from '@shared/ui/components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

/** Agenda's events that mention `type`/`ids`; none while asked or when it cannot be asked. */
export function useEventsMentioning(type: 'note' | 'page' | 'contact', ids: readonly string[]): readonly MentionPlace[] {
  const server = useSettingsStore(selectServer);
  const runs = useSettingsStore(s => selectServerApps(s)?.includes('calendar') === true);
  const key = ids.join(',');
  const [places, setPlaces] = useState<readonly MentionPlace[]>([]);
  useEffect(() => {
    if (!server || !runs || !key) {
      setPlaces([]);
      return undefined;
    }
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 15_000);
    fetch(`${server.url}${mentionsPath('calendar', type, key.split(','))}`, { method: 'GET', headers: authHeader(server.token), signal: abort.signal })
      .then(response => (response.ok ? response.json() : null))
      .then(body => {
        if (!abort.signal.aborted) setPlaces(parseMentionsResponse(body).places.filter(place => place.app === 'calendar'));
      })
      .catch(() => undefined)
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [server, runs, type, key]);
  return places;
}

/** The coming events first (the nearest first), then those past (the latest first). */
export function byWhen(places: readonly MentionPlace[], today: string): MentionPlace[] {
  const coming = places.filter(place => (place.when ?? '').slice(0, 10) >= today).sort((a, b) => ((a.when ?? '') < (b.when ?? '') ? -1 : 1));
  const past = places.filter(place => (place.when ?? '').slice(0, 10) < today).sort((a, b) => ((a.when ?? '') < (b.when ?? '') ? 1 : -1));
  return [...coming, ...past];
}

/** « lun. 4 nov. · 14:30 ». */
export function placeWhen(place: MentionPlace, year: number): string {
  if (!place.when) return '';
  const day = weekdayDay(place.when.slice(0, 10), year);
  return place.when.length > 10 ? `${day} · ${place.when.slice(11, 16)}` : day;
}

export function EventsPanel({ places, title }: { places: readonly MentionPlace[]; title: string }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  if (places.length === 0) return null;
  const today = instantToDay(Date.now());
  const year = Number(today.slice(0, 4));
  return (
    <Organic outline="card" style={styles.panel}>
      <AppText variant="section" style={styles.head} accessibilityRole="header">
        {title}
      </AppText>
      {byWhen(places, today).map(place => {
        const name = place.title.trim() || t('Sans titre');
        const when = placeWhen(place, year);
        return (
          <Tappable key={place.id} onPress={() => void openInApp('calendar', eventPlace(place.id))} style={styles.row} accessibilityRole="link" accessibilityLabel={when ? `${name}, ${when}` : name}>
            <View style={styles.mark}>
              <Icon name="calendar" size={22} color={theme.color.inkMuted} />
            </View>
            <View style={styles.fill}>
              <AppText variant="body" numberOfLines={1}>
                {name}
              </AppText>
              {when ? (
                <AppText variant="meta" numberOfLines={1}>
                  {when}
                </AppText>
              ) : null}
            </View>
            <Icon name="external" size={18} color={theme.color.inkMuted} />
          </Tappable>
        );
      })}
    </Organic>
  );
}

/** The events that mention a note or a page, under « Dans l’agenda ». */
export function EventsMentioning({ type, id }: { type: 'note' | 'page'; id: string }) {
  const places = useEventsMentioning(type, [id]);
  return <EventsPanel places={places} title={t('Dans l’agenda')} />;
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    panel: { marginHorizontal: 12, marginTop: 16, paddingVertical: 8, backgroundColor: theme.color.paper },
    head: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 },
    // A list row's numbers (`ListRow`): the glyph 16 in from the panel's edge, under its head's words, the words at 56.
    row: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 56, marginHorizontal: 6, paddingHorizontal: 10, paddingVertical: 8, marginVertical: GEOMETRY.rowGap / 2, ...corners(SHAPES.tab) },
    mark: { width: 24, alignItems: 'center' },
    fill: { flex: 1 },
  });
