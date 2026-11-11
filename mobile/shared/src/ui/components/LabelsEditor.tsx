/**
 * The labels' own screen, the same in every app (Carnet's labels, Contacts' and Agenda's libellés):
 * the strip that makes one (`NewLabelStrip`), each label's row (`LabelEditRow`: its tag recolours
 * it, its name is renamed in place, its count opens what wears it, the bin deletes it) and the list
 * that holds them (`LabelsList`). A name another label has is said under its field, what was typed
 * kept, never by a slip alone (DESIGN's Forms): said once sent or left, checked again at every
 * keystroke while it shows, quiet the moment the name is free. The words are the app's own.
 */
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { LineColor } from '@unlease/design/colors';
import { SHAPES } from '@unlease/design/shapes';

import { listIn, listMove, listOut, listPressDelay } from '../theme/motion';
import { corners } from '../theme/shape';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { variantStyle } from '../theme/typography';
import { AppText } from './AppText';
import { FormMessage } from './FormMessage';
import { Icon } from './Icon';
import { ICON_PEBBLE, ICON_SLOP, IconButton } from './IconButton';
import { LabelTag } from './LabelMark';
import { Organic } from './Organic';
import { ScrollEdges } from './ScrollEdges';
import { Tappable } from './Tappable';
import { useArrivals } from './useArrivals';

export interface NewLabelStripProps {
  /** The strip's hint: « Créer un libellé ». */
  readonly placeholder: string;
  /** What a screen reader calls it: « Nom du nouveau libellé ». */
  readonly accessibilityLabel: string;
  /** The ✓: « Créer ». */
  readonly submitLabel: string;
  /** Said under it when the name is another label's: « Ce libellé existe déjà : choisissez un autre nom. » */
  readonly takenMessage: string;
  readonly maxLength: number;
  /** Whether a live label has that name already. */
  readonly isTaken: (name: string) => boolean;
  /** Makes the label (called with something typed, a name free). */
  readonly onCreate: (name: string) => void;
}

/** The strip over the list: the tag every label wears in the glyph's slot, the name typed, its ✓ once something is. The keyboard stays for the next one. */
export function NewLabelStrip({ placeholder, accessibilityLabel, submitLabel, takenMessage, maxLength, isTaken, onCreate }: NewLabelStripProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const add = (): void => {
    if (!name.trim()) return;
    if (isTaken(name)) {
      setProblem(takenMessage);
      return;
    }
    onCreate(name);
    setName('');
    setProblem(null);
  };
  return (
    <>
      <Organic frost style={[styles.newRow, problem ? styles.newRowInvalid : null]}>
        <View style={styles.newGlyph}>
          <Icon name="tag" size={24} color={theme.color.ink} />
        </View>
        <TextInput
          value={name}
          onChangeText={text => {
            setName(text);
            // Said, it is weighed again at every keystroke and goes quiet once the name is free.
            if (problem && !(text.trim() && isTaken(text))) setProblem(null);
          }}
          onSubmitEditing={add}
          submitBehavior="submit"
          autoCapitalize="sentences"
          importantForAutofill="no"
          accessibilityLabel={[accessibilityLabel, problem].filter(Boolean).join(', ')}
          placeholder={placeholder}
          placeholderTextColor={theme.color.inkFaint}
          selectionColor={theme.color.highlight}
          selectionHandleColor={theme.color.focus}
          cursorColor={theme.color.focus}
          maxLength={maxLength}
          returnKeyType="done"
          style={[variantStyle(theme, 'body'), styles.input]}
        />
        {name.trim() ? <IconButton icon="check" label={submitLabel} onPress={add} /> : null}
      </Organic>
      {problem ? (
        <View style={styles.newProblem}>
          <FormMessage message={problem} />
        </View>
      ) : null}
    </>
  );
}

/** A row's words, written for its label by the app. */
export interface LabelRowWords {
  /** « Couleur de {name} ». */
  readonly color: string;
  /** « Renommer {name} ». */
  readonly rename: string;
  /** « Supprimer {name} ». */
  readonly remove: string;
  /** Said under the row when the name typed is another label's. */
  readonly taken: string;
}

export interface LabelEditRowProps {
  /** The label's name and pigment as shown now. */
  readonly name: string;
  readonly color: LineColor;
  readonly maxLength: number;
  readonly words: LabelRowWords;
  /** The label's name as stored at the moment a rename is saved, null once it is gone (deleted, here or elsewhere). */
  readonly stored: () => string | null;
  /** Whether another live label has that name. */
  readonly isTaken: (name: string) => boolean;
  readonly onRename: (name: string) => void;
  readonly onColor: () => void;
  readonly onDelete: () => void;
  /** What wears it, at the row's end, opening them: a number (`numeric`, Carnet's notes) or words (« 3 contacts »). */
  readonly count: { readonly text: string; readonly label: string; readonly numeric?: boolean; readonly onPress: () => void };
}

/**
 * A label's row, on the strip's column (its 12 margin, its edge, its 4): the tag under the strip's
 * glyph, the name under its words. What is typed is saved on leaving the field, and on leaving the
 * screen with the field still open; a name another label has is kept as typed and said under it,
 * nothing saved. While it is not typed in (nor refused), the name follows a rename made elsewhere.
 */
export function LabelEditRow({ name, color, maxLength, words, stored, isTaken, onRename, onColor, onDelete, count }: LabelEditRowProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const [draft, setDraft] = useState(name);
  const [focused, setFocused] = useState(false);
  const [refused, setRefused] = useState(false);
  const [shown, setShown] = useState(name);
  if (!focused && !refused && name !== shown) {
    setShown(name);
    setDraft(name);
  }
  const problem = refused ? words.taken : null;
  const typed = useRef<string | null>(null);
  const commit = (): void => {
    const text = typed.current;
    typed.current = null;
    const current = stored();
    if (text === null || current === null) return;
    const next = text.trim();
    if (!next || next === current) {
      setDraft(current);
      setRefused(false);
      return;
    }
    if (isTaken(next)) {
      // Kept as typed, and still to be saved once it is changed or left again.
      typed.current = text;
      setRefused(true);
      return;
    }
    onRename(next);
    setRefused(false);
  };
  const commitOnLeave = useRef(commit);
  commitOnLeave.current = commit;
  useEffect(() => () => commitOnLeave.current(), []);
  return (
    <View>
      <View style={styles.row}>
        <Tappable accessibilityLabel={words.color} onPress={onColor} unstable_pressDelay={listPressDelay} hitSlop={ICON_SLOP} pebble={1} style={ICON_PEBBLE}>
          <LabelTag color={color} size={26} />
        </Tappable>
        <TextInput
          value={draft}
          onChangeText={text => {
            typed.current = text;
            setDraft(text);
            if (refused && !(text.trim() && text.trim() !== stored() && isTaken(text.trim()))) setRefused(false);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          selectionColor={theme.color.highlight}
          selectionHandleColor={theme.color.focus}
          cursorColor={theme.color.focus}
          maxLength={maxLength}
          style={[variantStyle(theme, 'body'), styles.input]}
          accessibilityLabel={[words.rename, problem].filter(Boolean).join(', ')}
        />
        <Tappable
          onPress={count.onPress}
          unstable_pressDelay={listPressDelay}
          hitSlop={ICON_SLOP}
          style={count.numeric ? styles.number : styles.words}
          accessibilityRole="link"
          accessibilityLabel={count.label}
        >
          <AppText variant={count.numeric ? 'metaStrong' : 'meta'} style={count.numeric ? styles.tabular : null}>
            {count.text}
          </AppText>
        </Tappable>
        <IconButton icon="trash" label={words.remove} shape={2} onPress={onDelete} />
      </View>
      {problem ? (
        <View style={styles.rowProblem}>
          <FormMessage message={problem} />
        </View>
      ) : null}
    </View>
  );
}

export interface LabelsListProps {
  /** The live labels' ids, in their order. */
  readonly order: readonly string[];
  readonly renderRow: (id: string) => React.ReactElement | null;
  /** The list's empty state. */
  readonly empty: React.ReactElement;
}

/**
 * The labels under the strip, edge to edge over the keyboard (the lower rows' fields would stay
 * under it), edges softened. A label made or brought back settles in once the others have made
 * room; one deleted fades where it was and the rest close ranks; what is there when it opens and
 * what scrolls into view never move.
 */
export function LabelsList({ order, renderRow, empty }: LabelsListProps) {
  const styles = useThemedStyles(makeStyles);
  const arrived = useArrivals(order);
  return (
    <KeyboardAvoidingView behavior="padding" style={styles.fill}>
      <ScrollEdges>
        <Animated.FlatList
          data={order}
          keyExtractor={id => id}
          keyboardShouldPersistTaps="handled"
          itemLayoutAnimation={listMove}
          skipEnteringExitingAnimations
          renderItem={({ item }) => (
            <Animated.View entering={arrived.has(item) ? listIn : undefined} exiting={listOut}>
              {renderRow(item)}
            </Animated.View>
          )}
          ListEmptyComponent={empty}
        />
      </ScrollEdges>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    fill: { flex: 1 },
    newRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, marginHorizontal: 12, marginBottom: 8, ...corners(SHAPES.search), backgroundColor: theme.color.fieldVeil, borderWidth: 1, borderColor: theme.color.outline },
    // The edge thickens; the padding gives back what it takes, so the text never moves.
    newRowInvalid: { borderWidth: 2, borderColor: theme.color.danger, paddingHorizontal: 3 },
    newGlyph: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    // Its words on the strip's (FormMessage keeps 4 of its own).
    newProblem: { marginHorizontal: 12, marginTop: -2, marginBottom: 8 },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 17, minHeight: 56 },
    input: { flex: 1, height: 52, paddingVertical: 0, color: theme.color.ink },
    // Under the name it concerns: its words start where the name's do (the row's 17, the tag's 48).
    rowProblem: { marginLeft: 17 + 48 - 4, marginRight: 12, marginTop: -2, marginBottom: 8 },
    // A count's target: a number at the end of the name's column, or words on a chip.
    number: { minWidth: 40, height: 48, alignItems: 'center', justifyContent: 'center', ...corners(SHAPES.tab) },
    words: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, ...corners(SHAPES.chip) },
    tabular: { fontVariant: ['tabular-nums'] },
  });
