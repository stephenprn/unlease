/**
 * habits-garden's field with a fixed label above, drawn by its edge (3:1 on any ground); focus
 * thickens the edge in matcha. Its paper and edge are an `Organic` around the input (an input
 * cannot draw the continuous corner itself).
 *
 * What it holds (`kind`, `design/fields.ts`) sets its keyboard, capitals, corrections and whether
 * Android's autofill may fill it; a hidden one (a key, a token) has its own eye. Bound to a form
 * (`field`, from `useForm`), it says what is wrong when the form's timing says so, its keyboard's
 * action moves on to the next field (the keyboard staying up) or closes it on the last, and it takes
 * the focus when it holds the first problem. A problem says itself by its glyph as well as its colour;
 * near its limit the field counts what it holds.
 */
import React, { forwardRef, memo, useCallback, useContext, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { t } from '@unlease/core/i18n';
import { fieldInput, roomLeft, type FieldKind } from '@unlease/design/fields';
import { SHAPES } from '@unlease/design/shapes';

import { corners } from '../theme/shape';
import { useTheme } from '../theme/ThemeProvider';
import { variantStyle } from '../theme/typography';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { Organic } from './Organic';
import type { FieldBinding } from './useForm';
import { useGrowingInput } from './useGrowingInput';
import { OverlayFocus } from './useKeyboardVisible';

export interface TextFieldProps extends TextInputProps {
  readonly label?: string;
  /** Under the field; may hold a link (an `AppText` with its own `onPress`). */
  readonly help?: React.ReactNode;
  readonly error?: string | null;
  /** What it holds: its keyboard, capitals, autofill and corrections (explicit props win). */
  readonly kind?: FieldKind;
  /** Its place in a form (`useForm`): the problem it shows and when, and its keyboard's action. */
  readonly field?: FieldBinding;
  /** « (facultatif) » after the label, in a form where most fields must be filled. */
  readonly optional?: boolean;
  /** For a hidden kind: the eye's words (« Afficher le jeton »), when « Afficher » is short of them. */
  readonly revealLabels?: { readonly show: string; readonly hide: string };
}

type Input = React.ComponentRef<typeof TextInput>;

function assign<T>(ref: React.Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as React.RefObject<T | null>).current = value;
}

const AT_START = { start: 0, end: 0 } as const;

/**
 * A multiline field grows with its words to eight lines (its 12 above and below, eight of body's 23),
 * then scrolls them inside: the form around it, and its actions, stay in reach above the keyboard. A
 * field may set its own `maxHeight`. The web's grows to 320, on a taller window.
 */
const GROWS_TO = 12 * 2 + 8 * 23;

const TextFieldComponent = forwardRef<Input, TextFieldProps>(function TextField(
  { label, help, error, kind, field, optional, revealLabels, style, onFocus, onBlur, onChangeText, onSubmitEditing, onContentSizeChange, onLayout, accessibilityLabel, multiline, maxLength, value, secureTextEntry, ...rest },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  // In a sheet or a dialog opening, a field taking the caret keeps the keyboard up.
  const overlay = useContext(OverlayFocus);
  if (rest.autoFocus) overlay?.claim();
  const input = kind ? fieldInput(kind).phone : null;
  const hidden = secureTextEntry ?? input?.secure ?? false;
  const problem = error ?? field?.error ?? null;
  const border = problem ? theme.color.danger : focused ? theme.color.focus : theme.color.edge;
  const strong = focused || !!problem;
  const room = roomLeft(value?.length ?? 0, maxLength);
  const register = field?.register;
  // A multiline field grows with its words, which stay still as lines come, to its cap; there they scroll.
  const own = multiline ? StyleSheet.flatten(style)?.maxHeight : undefined;
  const cap = multiline ? (typeof own === 'number' ? own : GROWS_TO) : undefined;
  const { attach: hold, onContentSizeChange: grown, onLayout: laidOut } = useGrowingInput(cap);
  const attach = useCallback(
    (node: Input | null) => {
      assign(ref, node);
      register?.(node, !!multiline);
      if (multiline) hold(node);
    },
    [ref, register, multiline, hold],
  );
  // Android lays a one-line field's caret, and so its view, at the end of the words it is given: at
  // rest the field shows their start (« Auvergne-Rhône-… », never « …uvergne-Rhône-Alpes »). A tap
  // still puts the caret where it lands; a field opening with the caret keeps it at the end.
  const atRest = !multiline && !focused && !rest.autoFocus ? AT_START : undefined;
  // The form's chain first (next field, or done), then what the caller adds.
  const chained = field && !multiline ? { returnKeyType: field.returnKeyType, submitBehavior: field.submitBehavior } : {};
  const spoken = [accessibilityLabel ?? label, optional ? t('optional') : null, problem].filter(Boolean).join(', ');
  return (
    <View style={styles.wrap}>
      {label ? (
        <AppText variant="metaStrong" style={styles.label}>
          {label}
          {optional ? <AppText variant="meta" color={theme.color.inkMuted}>{` ${t('(optional)')}`}</AppText> : null}
        </AppText>
      ) : null}
      <Organic frost style={[styles.field, strong ? styles.fieldStrong : styles.fieldIdle, { borderColor: border, backgroundColor: theme.color.fieldVeil }]}>
        <TextInput
          ref={attach}
          placeholderTextColor={theme.color.inkFaint}
          selectionColor={theme.color.highlight}
          selectionHandleColor={theme.color.focus}
          cursorColor={theme.color.focus}
          keyboardType={input && !(hidden && shown) ? input.keyboardType : hidden && shown ? 'visible-password' : undefined}
          autoCapitalize={input?.autoCapitalize}
          autoCorrect={input?.autoCorrect}
          autoComplete={input?.autoComplete}
          importantForAutofill={input?.importantForAutofill}
          {...chained}
          onFocus={event => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={event => {
            setFocused(false);
            field?.left(value ?? '');
            onBlur?.(event);
          }}
          onChangeText={text => {
            onChangeText?.(text);
            field?.edited();
          }}
          onSubmitEditing={event => {
            if (field && !multiline) field.onSubmitEditing();
            onSubmitEditing?.(event);
          }}
          onContentSizeChange={event => {
            if (multiline) grown(event);
            onContentSizeChange?.(event);
          }}
          onLayout={event => {
            if (multiline) laidOut(event);
            onLayout?.(event);
          }}
          underlineColorAndroid="transparent"
          style={[variantStyle(theme, 'body'), styles.input, strong ? styles.inputStrong : styles.inputIdle, hidden ? styles.inputRevealable : null, multiline ? { maxHeight: cap } : null, style]}
          // TalkBack names the input by its label above, then what is wrong with it.
          accessibilityLabel={spoken || undefined}
          multiline={multiline}
          maxLength={maxLength}
          value={value}
          selection={atRest}
          secureTextEntry={hidden && !shown}
          {...rest}
        />
        {hidden ? (
          <IconButton
            icon={shown ? 'eyeOff' : 'eye'}
            label={shown ? (revealLabels?.hide ?? t('Hide')) : (revealLabels?.show ?? t('Show'))}
            onPress={() => setShown(current => !current)}
            style={styles.reveal}
          />
        ) : null}
      </Organic>
      {problem || help || room !== null ? (
        <View style={styles.note}>
          {problem ? (
            <View style={styles.problem}>
              <View style={styles.problemGlyph}>
                <Icon name="error" size={16} color={theme.color.danger} />
              </View>
              <AppText variant="meta" color={theme.color.danger} style={styles.fill}>
                {problem}
              </AppText>
            </View>
          ) : help ? (
            <AppText variant="meta" style={styles.fill}>
              {help}
            </AppText>
          ) : (
            <View style={styles.fill} />
          )}
          {room !== null ? (
            <AppText variant="meta" color={room < 0 ? theme.color.danger : theme.color.inkMuted} style={styles.room}>
              {`${value?.length ?? 0} / ${maxLength}`}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { marginLeft: 4 },
  field: { minHeight: 52, justifyContent: 'center', ...corners(SHAPES.field) },
  // The edge thickens on focus; the input gives back what it takes, so text never moves.
  fieldIdle: { borderWidth: 1 },
  fieldStrong: { borderWidth: 2 },
  input: { paddingVertical: 12, backgroundColor: 'transparent' },
  inputIdle: { minHeight: 50, paddingHorizontal: 18 },
  inputStrong: { minHeight: 48, paddingHorizontal: 17 },
  inputRevealable: { paddingRight: 56 },
  reveal: { position: 'absolute', right: 2, top: 0, bottom: 0, justifyContent: 'center' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginHorizontal: 4 },
  problem: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  problemGlyph: { marginTop: 1 },
  fill: { flex: 1 },
  room: { fontVariant: ['tabular-nums'] },
});

export const TextField = memo(TextFieldComponent);
