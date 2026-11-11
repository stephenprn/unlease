/**
 * A value chosen elsewhere (a sheet of choices, a day, a time), drawn as a text field is: its label
 * above, the field's paper and edge, the value (or what to choose, in the faint ink), a chevron at its
 * end, its help or problem under it. Pressed, it opens what the screen mounts at its root (a sheet
 * cannot live inside a scroll).
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import type { GlyphName } from '@unlease/design/glyphs';
import { SHAPES } from '@unlease/design/shapes';

import { corners } from '../theme/shape';
import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { Tappable } from './Tappable';

export interface PickerFieldProps {
  readonly label?: string;
  /** What is chosen, or null: then `placeholder` in the faint ink. */
  readonly value: string | null;
  readonly placeholder?: string;
  readonly onPress: () => void;
  readonly icon?: GlyphName;
  readonly help?: React.ReactNode;
  readonly error?: string | null;
  readonly optional?: boolean;
  readonly disabled?: boolean;
  /** Its name for TalkBack when no label is shown. */
  readonly accessibilityLabel?: string;
}

function PickerFieldComponent({ label, value, placeholder, onPress, icon, help, error, optional, disabled, accessibilityLabel }: PickerFieldProps) {
  const theme = useTheme();
  const name = accessibilityLabel ?? label;
  return (
    <View style={styles.wrap}>
      {label ? (
        <AppText variant="metaStrong" style={styles.label}>
          {label}
          {optional ? <AppText variant="meta" color={theme.color.inkMuted}>{` ${t('(facultatif)')}`}</AppText> : null}
        </AppText>
      ) : null}
      <Tappable
        frost
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={[name, error].filter(Boolean).join(', ') || undefined}
        accessibilityValue={{ text: value ?? placeholder ?? '' }}
        style={[styles.field, { backgroundColor: theme.color.fieldVeil, borderColor: error ? theme.color.danger : theme.color.edge, borderWidth: error ? 2 : 1 }]}
      >
        {icon ? <Icon name={icon} size={20} color={theme.color.inkMuted} /> : null}
        <AppText variant="body" color={value ? (disabled ? theme.color.inkMuted : theme.color.ink) : theme.color.inkFaint} numberOfLines={1} style={styles.value}>
          {value ?? placeholder ?? ''}
        </AppText>
        <Icon name="chevronDown" size={20} color={theme.color.inkMuted} />
      </Tappable>
      {error || help ? (
        <View style={styles.note}>
          {error ? (
            <View style={styles.glyph}>
              <Icon name="error" size={16} color={theme.color.danger} />
            </View>
          ) : null}
          <AppText variant="meta" color={error ? theme.color.danger : undefined} style={styles.fill}>
            {error ?? help}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

export const PickerField = memo(PickerFieldComponent);

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { marginLeft: 4 },
  field: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 18, paddingRight: 14, ...corners(SHAPES.field) },
  value: { flex: 1 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginHorizontal: 4 },
  glyph: { marginTop: 1 },
  fill: { flex: 1 },
});
