/**
 * habits-garden's field with a fixed label above, drawn by its edge (3:1 on any ground); focus
 * thickens the edge in matcha. Its paper and edge are an `Organic` around the input (an input
 * cannot draw the continuous corner itself).
 */
import React, { forwardRef, memo, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';

import { corners } from '../theme/shape';
import { useTheme } from '../theme/ThemeProvider';
import { variantStyle } from '../theme/typography';
import { AppText } from './AppText';
import { Organic } from './Organic';

export interface TextFieldProps extends TextInputProps {
  readonly label?: string;
  readonly help?: string;
  readonly error?: string | null;
}

const TextFieldComponent = forwardRef<React.ComponentRef<typeof TextInput>, TextFieldProps>(function TextField({ label, help, error, style, onFocus, onBlur, accessibilityLabel, ...rest }, ref) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const border = error ? theme.color.danger : focused ? theme.color.focus : theme.color.edge;
  const strong = focused || !!error;
  return (
    <View style={styles.wrap}>
      {label ? (
        <AppText variant="metaStrong" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <Organic style={[styles.field, strong ? styles.fieldStrong : styles.fieldIdle, { borderColor: border, backgroundColor: theme.color.field }]}>
        <TextInput
          ref={ref}
          placeholderTextColor={theme.color.inkFaint}
          selectionColor={theme.color.highlight}
          selectionHandleColor={theme.color.focus}
          cursorColor={theme.color.focus}
          onFocus={event => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={event => {
            setFocused(false);
            onBlur?.(event);
          }}
          underlineColorAndroid="transparent"
          style={[variantStyle(theme, 'body'), styles.input, strong ? styles.inputStrong : styles.inputIdle, style]}
          // TalkBack names the input by its label above, unless the caller says more.
          accessibilityLabel={accessibilityLabel ?? label}
          {...rest}
        />
      </Organic>
      {error || help ? (
        <AppText variant="meta" color={error ? theme.color.danger : undefined} style={styles.help}>
          {error ?? help}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { marginLeft: 4 },
  field: { minHeight: 52, ...corners(SHAPES.field) },
  // The edge thickens on focus; the input gives back what it takes, so text never moves.
  fieldIdle: { borderWidth: 1 },
  fieldStrong: { borderWidth: 2 },
  input: { paddingVertical: 12, backgroundColor: 'transparent' },
  inputIdle: { minHeight: 50, paddingHorizontal: 18 },
  inputStrong: { minHeight: 48, paddingHorizontal: 17 },
  help: { marginLeft: 4 },
});

export const TextField = memo(TextFieldComponent);
