/**
 * A place, as a field: its label above, what it holds (or what it asks for, in the faint ink) on the
 * field's paper, a magnifier at its end. A press opens the place search over the whole screen
 * (`PlaceSearch`, shown by the screen's `PlaceSearchHost`): the places this device knows, then the
 * server's as words are typed, or the words kept as written. A place picked fills the line, and its
 * parts for who wants them (`onPick`: Contacts' address fields). Nothing drops under the field and
 * the form never moves while a place is looked for.
 */
import React, { memo, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import type { Place } from '@unlease/core/sync/places';
import { SHAPES } from '@unlease/design/shapes';

import { corners } from '../theme/shape';
import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { openPlaceSearch } from './PlaceSearch';
import { Tappable } from './Tappable';
import type { FieldBinding } from './useForm';

export interface PlaceFieldProps {
  readonly label?: string;
  readonly accessibilityLabel?: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  /** A suggestion chosen: the line is already its label. */
  readonly onPick?: (place: Place) => void;
  /** The places this device knows, offered first (filtered by what is typed). */
  readonly known?: readonly Place[];
  readonly placeholder?: string;
  readonly help?: React.ReactNode;
  /** Opens the search at once (an address just added). */
  readonly autoFocus?: boolean;
  /** Its place in a form (`useForm`): the problem it shows. */
  readonly field?: FieldBinding;
}

/** Opens the place search for a value, and hands back what was chosen. */
export function searchPlace(request: { value: string; known?: readonly Place[]; label: string; onChangeText: (value: string) => void; onPick?: (place: Place) => void }): void {
  openPlaceSearch({
    value: request.value,
    known: request.known ?? [],
    label: request.label,
    onDone: (text, place) => {
      request.onChangeText(text);
      if (place) request.onPick?.(place);
    },
  });
}

function PlaceFieldComponent({ label, accessibilityLabel, value, onChangeText, onPick, known = [], placeholder, help, autoFocus, field }: PlaceFieldProps) {
  const theme = useTheme();
  const problem = field?.error ?? null;
  const name = accessibilityLabel ?? label ?? t('Lieu');
  const latest = useRef({ value, known, onChangeText, onPick });
  latest.current = { value, known, onChangeText, onPick };
  const open = (): void => searchPlace({ ...latest.current, label: name });

  // An address just added opens its search straight away.
  useEffect(() => {
    if (autoFocus) searchPlace({ ...latest.current, label: name });
    // Once, as it appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.wrap}>
      {label ? (
        <AppText variant="metaStrong" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <Tappable
        onPress={open}
        style={[styles.field, { borderColor: problem ? theme.color.danger : theme.color.edge, borderWidth: problem ? 2 : 1, backgroundColor: theme.color.fieldVeil }]}
        accessibilityRole="button"
        accessibilityLabel={[name, value.trim() || placeholder, problem].filter(Boolean).join(', ')}
        accessibilityHint={t('Ouvre la recherche de lieux.')}
      >
        <AppText variant="body" color={value.trim() ? theme.color.ink : theme.color.inkFaint} numberOfLines={2} style={styles.text}>
          {value.trim() || placeholder || t('Rechercher un lieu ou une adresse')}
        </AppText>
        <Icon name="search" size={20} color={theme.color.inkMuted} />
      </Tappable>
      {problem ? (
        <View style={styles.note}>
          <View style={styles.glyph}>
            <Icon name="error" size={16} color={theme.color.danger} />
          </View>
          <AppText variant="meta" color={theme.color.danger} style={styles.text}>
            {problem}
          </AppText>
        </View>
      ) : help ? (
        <AppText variant="meta" style={styles.help}>
          {help}
        </AppText>
      ) : null}
    </View>
  );
}

export const PlaceField = memo(PlaceFieldComponent);

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { marginLeft: 4 },
  // The text field's own geometry: its height, its corners, its paddings; its glyph where a picker field's chevron ends.
  field: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 18, paddingRight: 14, paddingVertical: 12, ...corners(SHAPES.field) },
  text: { flex: 1 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginHorizontal: 4 },
  // Centred on meta's 18 line, as the text field's.
  glyph: { marginTop: 1 },
  help: { marginHorizontal: 4 },
});
