/**
 * The calendar's bar, past its title: « Aujourd'hui », today's date on a page (as Google's), so it
 * never reads as the month's glyph; and the views' switcher, naming the view it is on with a chevron
 * where the bar has room, else the view's own glyph with the chevron.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { VIEW_NAMES, type CalendarView } from '@unlease/calendar/services/eventText';
import type { GlyphName } from '@unlease/design/glyphs';
import { SHAPES } from '@unlease/design/shapes';

import { AppText, ICON_PEBBLE, ICON_SLOP, Icon, Tappable } from '@shared/ui/components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

/** « Aujourd'hui »: the day's number on Onde's day page (`datePage`: a band across its top, the body left for the date), on the bar's pebble. */
function TodayButtonComponent({ day, onPress }: { readonly day: string; readonly onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <Tappable accessibilityRole="button" accessibilityLabel={t('Today')} onPress={onPress} hitSlop={ICON_SLOP} pebble={1} style={ICON_PEBBLE}>
      <Icon name="datePage" size={24} color={theme.color.ink} />
      <View pointerEvents="none" style={styles.date}>
        <AppText variant="labelSmall" color={theme.color.ink} style={styles.number} allowFontScaling={false}>
          {String(Number(day.slice(8, 10)))}
        </AppText>
      </View>
    </Tappable>
  );
}

export const TodayButton = memo(TodayButtonComponent);

/**
 * « Changer de vue »: the view's name and a chevron (« Semaine ⌄ ») when `named`, else its glyph and
 * the chevron in the icon buttons' slot, so it says which view it is on either way.
 */
function ViewSwitchComponent({ view, glyph, named, onPress }: { readonly view: CalendarView; readonly glyph: GlyphName; readonly named: boolean; readonly onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <Tappable
      accessibilityRole="button"
      accessibilityLabel={t('Change view')}
      accessibilityValue={{ text: VIEW_NAMES[view] }}
      onPress={onPress}
      hitSlop={ICON_SLOP}
      style={named ? styles.named : styles.glyph}
    >
      {named ? (
        <AppText variant="label" numberOfLines={1}>
          {VIEW_NAMES[view]}
        </AppText>
      ) : (
        <Icon name={glyph} size={22} color={theme.color.ink} />
      )}
      <Icon name="chevronDown" size={named ? 16 : 12} color={theme.color.inkMuted} />
    </Tappable>
  );
}

export const ViewSwitch = memo(ViewSwitchComponent);

const makeStyles = (_theme: Theme) =>
  StyleSheet.create({
    // The number on the page's middle (its cushion runs 4 to 20 of the 24), in the line's weight.
    date: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingTop: 5 },
    number: { fontSize: 11, lineHeight: 13, includeFontPadding: false, textAlign: 'center' },
    // In the icon buttons' 48 slot (40 and its 4 all round), its press inside its own corners.
    glyph: { height: 40, minWidth: 40, margin: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 1, paddingHorizontal: 4, ...corners(SHAPES.small) },
    named: { height: 40, margin: 4, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 10, paddingRight: 6, ...corners(SHAPES.small) },
  });
