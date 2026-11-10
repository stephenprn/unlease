/** « Mentionné dans »: the pages and notes that mention this event, each opening in its app (installed, else on the web). */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { GEOMETRY } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import type { MentionPlace } from '@unlease/core/sync/mentions';
import { useMentions } from '@app/hooks/useMentions';
import { later } from '@app/later';
import { notesPlace, openInApp, pagePlace } from '@shared/app/openApp';

import { AppText, Icon, Organic, Tappable } from '@shared/ui/components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

function open(place: MentionPlace): void {
  if (place.app === 'pages') later(openInApp('pages', pagePlace(place.id)));
  else if (place.app === 'notes') later(openInApp('notes', notesPlace('note', place.id)));
}

export function MentionedIn({ id }: { id: string }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const places = useMentions('event', id);
  if (places.length === 0) return null;
  return (
    <Organic outline="card" style={styles.panel}>
      <AppText variant="section" style={styles.head} accessibilityRole="header">
        {t('Mentionné dans')}
      </AppText>
      {places.map(place => {
        const title = place.title.trim() || t('Sans titre');
        return (
          <Tappable key={`${place.app}:${place.id}`} onPress={() => open(place)} style={styles.row} accessibilityRole="link" accessibilityLabel={title}>
            <View style={styles.mark}>{place.icon ? <AppText style={styles.emoji}>{place.icon}</AppText> : <Icon name={place.app === 'pages' ? 'page' : 'note'} size={22} color={theme.color.inkMuted} />}</View>
            <View style={styles.fill}>
              <AppText variant="body" numberOfLines={1}>
                {title}
              </AppText>
              {place.within ? (
                <AppText variant="meta" numberOfLines={1}>
                  {place.within}
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

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    panel: { marginHorizontal: 12, paddingVertical: 8, backgroundColor: theme.color.paper },
    head: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 },
    // A list row's geometry (6 in, 10, a 24 slot, 16), as the event's rows above.
    row: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 56, marginHorizontal: 6, paddingHorizontal: 10, paddingVertical: 8, marginVertical: GEOMETRY.rowGap / 2, ...corners(SHAPES.tab) },
    mark: { width: 24, alignItems: 'center' },
    emoji: { fontSize: 20, lineHeight: 26 },
    fill: { flex: 1 },
  });
