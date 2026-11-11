/**
 * A name typed to make something, at the foot of a list of them (a new label under the labels in a
 * sheet): the field's paper and outline edge drawn on the list's rows, so its glyph stands in the
 * rows' glyph slot (16 in) and its words start on their words (56), as `ListRow` lays them out; its ✓
 * inside it, at its end, once something is typed, so the action is always the field's own height.
 * Enter does the same. A name refused (one taken) is said under it, what was typed kept.
 */
import React, { memo, useState } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import type { GlyphName } from '@unlease/design/glyphs';
import { GEOMETRY } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';

import { corners } from '../theme/shape';
import { useTheme } from '../theme/ThemeProvider';
import { variantStyle } from '../theme/typography';
import { FormMessage } from './FormMessage';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { Organic } from './Organic';

export interface NewItemFieldProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  /** Makes it from what is typed (only called with something typed). */
  readonly onSubmit: () => void;
  readonly placeholder: string;
  /** What a screen reader calls the field (« Nom du nouveau libellé »). */
  readonly accessibilityLabel: string;
  /** The ✓'s words (« Créer »). */
  readonly submitLabel: string;
  readonly maxLength: number;
  /** The glyph in the rows' slot: what is made. */
  readonly icon?: GlyphName;
  /** Why what is typed cannot be made, under the field. */
  readonly problem?: string | null;
  /** The keyboard stays up for the next one. */
  readonly keepKeyboard?: boolean;
  readonly autoFocus?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

function NewItemFieldComponent({ value, onChangeText, onSubmit, placeholder, accessibilityLabel, submitLabel, maxLength, icon = 'plus', problem = null, keepKeyboard = false, autoFocus, style }: NewItemFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const strong = focused || !!problem;
  const submit = (): void => {
    if (value.trim()) onSubmit();
  };
  return (
    <View style={[styles.wrap, style]}>
      <Organic frost style={[styles.field, strong ? styles.fieldStrong : null, { backgroundColor: theme.color.fieldVeil, borderColor: problem ? theme.color.danger : focused ? theme.color.focus : theme.color.outline }]}>
        <Icon name={icon} size={24} color={theme.color.inkMuted} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={submit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          submitBehavior={keepKeyboard ? 'submit' : 'blurAndSubmit'}
          returnKeyType="done"
          autoCapitalize="sentences"
          importantForAutofill="no"
          autoFocus={autoFocus}
          placeholder={placeholder}
          accessibilityLabel={[accessibilityLabel, problem].filter(Boolean).join(', ')}
          placeholderTextColor={theme.color.inkFaint}
          selectionColor={theme.color.highlight}
          selectionHandleColor={theme.color.focus}
          cursorColor={theme.color.focus}
          maxLength={maxLength}
          style={[variantStyle(theme, 'body'), styles.input]}
        />
        {value.trim() ? <IconButton icon="check" label={submitLabel} onPress={submit} /> : null}
      </Organic>
      {problem ? (
        <View style={styles.problem}>
          <FormMessage message={problem} />
        </View>
      ) : null}
    </View>
  );
}

export const NewItemField = memo(NewItemFieldComponent);

const styles = StyleSheet.create({
  // On the list's rows: inset 6 as a row is, half the rows' gap above and below.
  wrap: { marginHorizontal: 6, marginVertical: GEOMETRY.rowGap / 2, gap: 6 },
  // Its edge (1) and 9 put the glyph where a row's is (10 in), then the rows' 16 to the words; the edge thickened on focus gives its room back.
  field: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 54, paddingLeft: 9, paddingRight: 0, borderWidth: 1, ...corners(SHAPES.search) },
  fieldStrong: { borderWidth: 2, paddingLeft: 8 },
  input: { flex: 1, minHeight: 52, paddingVertical: 0, paddingHorizontal: 0 },
  problem: { paddingLeft: 10 },
});
