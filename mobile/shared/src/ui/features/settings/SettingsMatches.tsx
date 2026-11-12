/**
 * The settings an app's search finds (`core/services/settingsSearch`): typing « grain », « budget »
 * or « S3 » offers the place of Réglages or of the Administration that holds it. Above the search's
 * own results, a small group « Réglages », three at most until « Tout voir » (its words at the
 * group's end, as the drawer's groups say it), each row the place's glyph, its name with the words
 * that found it marked, and where it is (« Réglages › Fond »), opening the screen at its section in
 * one press. Nothing while no setting answers. The web's home searches show the same.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { t } from '@unlease/core/i18n';
import { matchRanges } from '@unlease/core/services/search';
import { findSettings, placesFor, settingsPageOf, settingsWhere, SETTINGS_SHOWN, type SettingsPlace } from '@unlease/core/services/settingsSearch';
import type { GlyphName } from '@unlease/design/glyphs';
import { SHAPES } from '@unlease/design/shapes';
import { ownApp } from '@shared/app/store/library';

import { AppText, Icon, ListRow, Tappable } from '../../components';
import { corners } from '../../theme/shape';
import { useTheme } from '../../theme/ThemeProvider';

export type PhoneSettingsPlace = SettingsPlace<GlyphName>;

/** A 40 high heading action reaches 48: the gap above it is empty, the row under it keeps its own touch. */
const HEADING_SLOP = 8;

export interface SettingsMatchesProps {
  readonly query: string;
  /** The app's own places, from its package (Carnet's board layout, Seerr), after every app's. */
  readonly own: readonly PhoneSettingsPlace[];
  /** Opens the place: the screen `settingsScreenOf` names, with its `section`. */
  readonly onOpen: (place: PhoneSettingsPlace) => void;
  /** Where the screen's own list sits off the 16 every row takes (Contacts' faces, 4 further in). */
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * The screen a place opens: the Administration's, « Apparence »'s page (the look's sections,
 * `settingsPageOf`), the import's or the erase's own screen, or Réglages'. Those of a page take
 * the place's `section` (`settingsParams`); the import's and the erase's take none.
 */
export function settingsScreenOf(place: PhoneSettingsPlace): 'Admin' | 'Appearance' | 'Settings' | 'Import' | 'Erase' {
  if (place.area === 'admin') return 'Admin';
  const page = settingsPageOf(place.section);
  return page === 'appearance' ? 'Appearance' : page === 'import' ? 'Import' : page === 'erase' ? 'Erase' : 'Settings';
}

/** How many settings the words name (the search's summary says « Rien d'autre » under them). */
export function settingsFound(query: string, own: readonly PhoneSettingsPlace[]): number {
  return findSettings(placesFor(ownApp(), 'phone', own), query).length;
}

export function SettingsMatches({ query, own, onOpen, style }: SettingsMatchesProps) {
  const theme = useTheme();
  const places = useMemo(() => placesFor(ownApp(), 'phone', own), [own]);
  const found = useMemo(() => findSettings(places, query), [places, query]);
  // « Tout voir » opens the group whole for what is typed now; typing on, it is short again.
  const [whole, setWhole] = useState<string | null>(null);
  if (found.length === 0) return null;
  const shown = whole === query ? found : found.slice(0, SETTINGS_SHOWN);
  return (
    <View style={style}>
      <View style={styles.heading}>
        <AppText variant="metaStrong" accessibilityRole="header">
          {t('Réglages')}
        </AppText>
        {found.length > shown.length ? (
          <Tappable accessibilityRole="button" accessibilityLabel={t('Tous les réglages trouvés')} onPress={() => setWhole(query)} hitSlop={HEADING_SLOP} style={styles.headingAction}>
            <AppText variant="metaStrong" color={theme.color.link}>
              {t('Tout voir')}
            </AppText>
          </Tappable>
        ) : null}
      </View>
      {shown.map(place => {
        const title = t(place.title);
        return (
          <ListRow
            key={place.id}
            icon={place.glyph}
            title={title}
            highlight={matchRanges(title, query)}
            supporting={settingsWhere(place) || undefined}
            trailing={<Icon name="chevronRight" size={20} color={theme.color.inkMuted} />}
            onPress={() => onOpen(place)}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // The group's name on the rows' glyphs (16 in), its action's words ending where the rows' chevrons do.
  heading: { height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, marginTop: 4 },
  headingAction: { minHeight: 40, minWidth: 48, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'flex-end', ...corners(SHAPES.chip) },
});
