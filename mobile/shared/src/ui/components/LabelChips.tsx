/**
 * The labels a record wears, chosen in its form (a contact, an event): every label a chip one tap
 * puts on or takes off (its tag is the checkbox, `LabelCheck`: off, its edge and eyelet in the
 * label's pigment; on, filled, the chip lying on the label's wash with its pigment as the edge),
 * then « Nouveau libellé » in link ink, which becomes a field in place: its × where the plus was,
 * the name, ✓ once something is typed. Enter or ✓ makes the label, already worn; ×, Back, or leaving
 * the field empty puts the chip back. A name the app refuses (one taken) is said under the field,
 * what was typed kept. As the field opens, the labels and the field are brought up into view, above
 * the keyboard (`useReveal`, inside a `RevealScrollView`). A label made here settles in.
 */
import React, { memo, useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, TextInput, View } from 'react-native';
import Animated, { Keyframe, LayoutAnimationConfig, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { t } from '@unlease/core/i18n';
import type { LineColor } from '@unlease/design/colors';
import { SHAPES } from '@unlease/design/shapes';

import { decelerate, duration, listMove, standard } from '../theme/motion';
import { corners } from '../theme/shape';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { variantStyle } from '../theme/typography';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { LabelCheck } from './LabelMark';
import { AnimatedOrganic, Organic } from './Organic';
import { useReveal } from './RevealScroll';
import { Tappable } from './Tappable';

/** A chip's height: a finger's target with its slop, a little under a field. */
export const LABEL_CHIP = 40;
/** The field a new label is named in: a form field's height. */
export const LABEL_FIELD = 52;
/** A chip is 40 high; its touch reaches 48. */
const SLOP = 4;
/** A label made here, or the field to name one, settles in. */
const SETTLE = new Keyframe({ 0: { opacity: 0, transform: [{ scale: 0.92 }] }, 100: { opacity: 1, transform: [{ scale: 1 }], easing: decelerate } }).duration(duration.medium);
const REFLOW = listMove;

export interface LabelChipItem {
  readonly id: string;
  readonly name: string;
  readonly color: LineColor;
}

/** The app's own words for its labels (« libellé » in Contacts and Agenda). */
export interface LabelChipsWords {
  /** The chip that opens the field: « Nouveau libellé ». */
  readonly add: string;
  /** The field's hint: « Nom du libellé ». */
  readonly placeholder: string;
  /** What a screen reader calls the field: « Nom du nouveau libellé ». */
  readonly field: string;
  /** The ✓: « Créer le libellé ». */
  readonly create: string;
}

export interface LabelChipsProps {
  /** The live labels, in their order. */
  readonly labels: readonly LabelChipItem[];
  readonly chosen: readonly string[];
  readonly onToggle: (id: string) => void;
  /** Makes a label of that name, worn at once by the record: its id, or why it cannot be made (a name taken). */
  readonly onCreate: (name: string) => { readonly id: string } | { readonly problem: string };
  readonly maxLength: number;
  readonly words: LabelChipsWords;
  /** Told as the field opens and closes (a row's glyph centres on the field leading it, `LABEL_FIELD`). */
  readonly onNaming?: (naming: boolean) => void;
}

const LabelChip = memo(function LabelChip({ name, color, checked, onToggle }: { name: string; color: LineColor; checked: boolean; onToggle: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const on = useSharedValue(checked ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(checked ? 1 : 0, { duration: duration.short, easing: standard });
  }, [checked, on]);
  const wash = useAnimatedStyle(() => ({ opacity: on.value }));
  return (
    <Tappable
      onPress={onToggle}
      hitSlop={SLOP}
      pressScale={0.97}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={name}
      style={[styles.chip, { borderColor: checked ? theme.line[color].fill : theme.color.outline }]}
    >
      {/* The label's wash comes and goes under the tag as it is worn. */}
      <AnimatedOrganic pointerEvents="none" inset={1} style={[styles.wash, { backgroundColor: theme.line[color].tint }, wash]} />
      <LabelCheck color={color} checked={checked} size={22} />
      <AppText variant={checked ? 'labelStrong' : 'label'} numberOfLines={1} style={styles.name}>
        {name}
      </AppText>
    </Tappable>
  );
});

function LabelChipsComponent({ labels, chosen, onToggle, onCreate, maxLength, words, onNaming }: LabelChipsProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const reveal = useReveal();
  const box = useRef<React.ComponentRef<typeof View>>(null);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  // The field takes the caret once laid out where it stands: taken as it is made (autoFocus), Android
  // scrolls the form to where the field is not yet, its top.
  const focused = useRef(false);

  const close = (): void => {
    // Let go of the caret first, so Android hands it to no other field of the form as this one goes.
    input.current?.blur();
    focused.current = false;
    setNaming(false);
    setName('');
    setProblem(null);
  };
  const make = (): void => {
    const clean = name.trim();
    if (!clean) {
      close();
      return;
    }
    const made = onCreate(clean);
    if ('problem' in made) {
      setProblem(made.problem);
      return;
    }
    close();
  };

  // The labels and the field come up into view; again once the keyboard has risen under them.
  useEffect(() => {
    if (naming) reveal?.(box.current);
  }, [naming, reveal]);
  useEffect(() => {
    onNaming?.(naming);
  }, [naming, onNaming]);
  // Back puts the chip back before it leaves the form.
  const closing = useRef(close);
  closing.current = close;
  useEffect(() => {
    if (!naming) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closing.current();
      return true;
    });
    return () => subscription.remove();
  }, [naming]);

  return (
    // The labels there when the form opened lie still; one made here settles in.
    <LayoutAnimationConfig skipEntering>
      <View ref={box} collapsable={false} style={styles.wrap}>
        {labels.map(label => (
          <Animated.View key={label.id} entering={SETTLE} layout={REFLOW}>
            <LabelChip name={label.name} color={label.color} checked={chosen.includes(label.id)} onToggle={() => onToggle(label.id)} />
          </Animated.View>
        ))}
        {naming ? (
          <Animated.View key="naming" entering={SETTLE} layout={REFLOW} style={styles.namingBox}>
            <Organic frost style={[styles.naming, { borderColor: problem ? theme.color.danger : theme.color.focus, backgroundColor: theme.color.fieldVeil }]}>
              {/* The chip's plus becomes the way back. */}
              <IconButton icon="close" label={t('Annuler')} onPress={close} />
              <TextInput
                ref={input}
                value={name}
                onChangeText={text => {
                  setName(text);
                  if (problem) setProblem(null);
                }}
                onSubmitEditing={make}
                onBlur={() => {
                  if (!name.trim()) close();
                }}
                onLayout={() => {
                  if (focused.current) return;
                  focused.current = true;
                  requestAnimationFrame(() => input.current?.focus());
                }}
                placeholder={words.placeholder}
                accessibilityLabel={[words.field, problem].filter(Boolean).join(', ')}
                autoCapitalize="sentences"
                importantForAutofill="no"
                submitBehavior="blurAndSubmit"
                returnKeyType="done"
                placeholderTextColor={theme.color.inkFaint}
                selectionColor={theme.color.highlight}
                selectionHandleColor={theme.color.focus}
                cursorColor={theme.color.focus}
                maxLength={maxLength}
                style={[variantStyle(theme, 'body'), styles.input]}
              />
              {name.trim() ? <IconButton icon="check" label={words.create} onPress={make} /> : null}
            </Organic>
            {problem ? (
              <View style={styles.problem} accessibilityLiveRegion="polite">
                <View style={styles.problemGlyph}>
                  <Icon name="error" size={16} color={theme.color.danger} />
                </View>
                <AppText variant="meta" color={theme.color.danger} style={styles.grow}>
                  {problem}
                </AppText>
              </View>
            ) : null}
          </Animated.View>
        ) : (
          <Animated.View key="new" layout={REFLOW}>
            <Tappable onPress={() => setNaming(true)} hitSlop={SLOP} accessibilityRole="button" accessibilityLabel={words.add} style={[styles.chip, styles.add, labels.length === 0 ? styles.addFirst : null]}>
              <Icon name="plus" size={20} color={theme.color.link} />
              <AppText variant="label" color={theme.color.link} numberOfLines={1}>
                {words.add}
              </AppText>
            </Tappable>
          </Animated.View>
        )}
      </View>
    </LayoutAnimationConfig>
  );
}

export const LabelChips = memo(LabelChipsComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 8, height: LABEL_CHIP, maxWidth: 260, paddingLeft: 10, paddingRight: 14, borderWidth: 1, ...corners(SHAPES.chip) },
    wash: { ...StyleSheet.absoluteFill, ...corners(SHAPES.chip) },
    name: { flexShrink: 1 },
    // « Nouveau libellé » is an action, not a label: no edge, the link's ink, its plus where a tag would be.
    add: { borderColor: 'transparent', gap: 6, paddingLeft: 8 },
    // Leading the row (no label yet), its plus stands on the column the words above start on, as an action's would.
    addFirst: { marginLeft: -9 },
    namingBox: { flexBasis: '100%', gap: 6 },
    // Naming a label, the chip becomes a field: the field's height, paper and focused edge, its × and ✓ inside it.
    naming: { flexDirection: 'row', alignItems: 'center', height: LABEL_FIELD, paddingHorizontal: 0, borderWidth: 2, ...corners(SHAPES.field) },
    input: { flex: 1, height: '100%', paddingVertical: 0, paddingHorizontal: 0, color: theme.color.ink },
    problem: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginHorizontal: 4 },
    problemGlyph: { marginTop: 1 },
    grow: { flex: 1 },
  });
