/**
 * « Vus ensemble »: the events (Agenda) this person is with or that mention them, by their day, the
 * coming ones first; and « Mentionné dans »: the pages and notes that mention them. Each opens in its
 * app (installed, else on the web).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import type { MentionPlace } from '@unlease/core/sync/mentions';
import { useMentions } from '@app/hooks/useMentions';
import { later } from '@app/later';
import { eventPlace, notesPlace, openInApp, pagePlace } from '@shared/app/openApp';
import { weekdayDay } from '@unlease/calendar/services/eventText';
import { instantToDay } from '@unlease/calendar/services/time';
import { GEOMETRY } from '@unlease/design/palette';

import { AppText, Icon, Organic, Tappable } from '@shared/ui/components';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { ROW_INSET, rowCorners } from './rows';

function open(place: MentionPlace): void {
  if (place.app === 'pages') later(openInApp('pages', pagePlace(place.id)));
  else if (place.app === 'notes') later(openInApp('notes', notesPlace('note', place.id)));
  else if (place.app === 'calendar') later(openInApp('calendar', eventPlace(place.id)));
}

/** An event's day as its row says it: « lun. 4 nov. · 14:30 ». */
function placeWhen(place: MentionPlace, year: number): string {
  if (!place.when) return '';
  const day = weekdayDay(place.when.slice(0, 10), year);
  return place.when.length > 10 ? `${day} · ${place.when.slice(11, 16)}` : day;
}

/** The coming events first (the nearest first), then those past (the latest first). */
function byWhen(places: readonly MentionPlace[], today: string): MentionPlace[] {
  const coming = places.filter(place => (place.when ?? '').slice(0, 10) >= today).sort((a, b) => ((a.when ?? '') < (b.when ?? '') ? -1 : 1));
  const past = places.filter(place => (place.when ?? '').slice(0, 10) < today).sort((a, b) => ((a.when ?? '') < (b.when ?? '') ? 1 : -1));
  return [...coming, ...past];
}

export function MentionedIn({ id }: { id: string }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const all = useMentions(id);
  const today = instantToDay(Date.now());
  const events = byWhen(all.filter(place => place.app === 'calendar'), today);
  const places = all.filter(place => place.app !== 'calendar');
  if (all.length === 0) return null;
  return (
    <>
      {events.length > 0 ? (
        <View style={styles.block}>
          <AppText variant="section" style={styles.head} accessibilityRole="header">
            {t('Vus ensemble')}
          </AppText>
          <Organic outline="card" style={styles.panel}>
            {events.map((place, index) => {
              const title = place.title.trim() || t('Sans titre');
              const when = placeWhen(place, Number(today.slice(0, 4)));
              return (
                <Tappable key={place.id} onPress={() => open(place)} style={[styles.row, rowCorners(index, events.length)]} accessibilityRole="link" accessibilityLabel={when ? `${title}, ${when}` : title}>
                  <View style={styles.mark}>
                    <Icon name="calendar" size={22} color={theme.color.inkMuted} />
                  </View>
                  <View style={styles.fill}>
                    <AppText variant="body" numberOfLines={1}>
                      {title}
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
        </View>
      ) : null}
      {places.length > 0 ? <Mentions places={places} /> : null}
    </>
  );
}

function Mentions({ places }: { places: readonly MentionPlace[] }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <View style={styles.block}>
      <AppText variant="section" style={styles.head} accessibilityRole="header">
        {t('Mentionné dans')}
      </AppText>
      <Organic outline="card" style={styles.panel}>
        {places.map((place, index) => {
          const title = place.title.trim() || (place.type === 'link' ? t('Lien sans titre') : t('Sans titre'));
          // A note or a link naming the person among its people (a gift idea) says so before where it sits.
          const where = [place.linked ? t('Associé') : '', place.within].filter(Boolean).join(' · ');
          return (
            <Tappable key={`${place.app}:${place.id}`} onPress={() => open(place)} style={[styles.row, rowCorners(index, places.length)]} accessibilityRole="link" accessibilityLabel={title}>
              <View style={styles.mark}>{place.icon ? <AppText style={styles.emoji}>{place.icon}</AppText> : <Icon name={place.type === 'page' ? 'page' : place.type === 'link' ? 'link' : 'note'} size={22} color={theme.color.inkMuted} />}</View>
              <View style={styles.fill}>
                <AppText variant="body" numberOfLines={1}>
                  {title}
                </AppText>
                {where ? (
                  <AppText variant="meta" numberOfLines={1}>
                    {where}
                  </AppText>
                ) : null}
              </View>
              <Icon name="external" size={18} color={theme.color.inkMuted} />
            </Tappable>
          );
        })}
      </Organic>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    block: { gap: 8 },
    panel: { marginHorizontal: 12, padding: ROW_INSET, gap: GEOMETRY.rowGap, backgroundColor: theme.color.paper },
    // As the contact's other cards: the head in line with what the card holds, each row's mark 16 in from its edge, its words at 56.
    head: { paddingHorizontal: 28 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 56, paddingHorizontal: 10, paddingVertical: 8 },
    mark: { width: 24, alignItems: 'center' },
    emoji: { fontSize: 20, lineHeight: 26 },
    fill: { flex: 1, gap: 1 },
  });
