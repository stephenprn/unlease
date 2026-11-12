/**
 * The letters of Contacts' list, in a column of their own at its left (Android's own Contacts): each
 * stands beside its first person, stays at the column's top while its people scroll by, then rides up
 * with its last row as the next letter's panel arrives. Nothing ever passes under a letter, so none
 * needs a band of ground, a fade or a cut. They are drawn over the list, outside its scroll, from where
 * it stands on the UI thread: never a frame behind the rows, never dropped with a row the list let go.
 * A letter leaving the top fades as the rows beside it do (the scroll edge's eased curve over 24).
 */
import React, { memo, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { AppText, EDGE_FADE } from '@shared/ui/components';
import { duration, standard } from '@shared/ui/theme/motion';
import { useTheme } from '@shared/ui/theme/ThemeProvider';
import { LETTERS_WIDTH, PANEL_EDGE } from './ContactRow';

/** A letter's line (`title`): centred on its face's centre. */
export const LETTER_HEIGHT = 26;
/** Where a letter holds while its people scroll, under the list's top. */
export const LETTER_PIN = 12;

export interface ColumnMark {
  readonly letter: string;
  /** The letter's top beside its first row, and beside its last, in the list's content (under its header). */
  readonly first: number;
  readonly last: number;
}

export interface LetterColumnProps {
  readonly marks: readonly ColumnMark[];
  /** How far the list is scrolled, and its header's height (negative until it is measured): the marks start under it. */
  readonly scroll: SharedValue<number>;
  readonly header: SharedValue<number>;
}

/** Where a letter stands in the column now: beside its first row, held at the pin, or riding up with its last. */
export function letterTop(first: number, last: number, header: number, scroll: number): number {
  'worklet';
  const shift = header - scroll;
  return Math.min(Math.max(first + shift, LETTER_PIN), last + shift);
}

function ColumnLetter({ mark, scroll, header }: { mark: ColumnMark; scroll: SharedValue<number>; header: SharedValue<number> }) {
  const theme = useTheme();
  const first = useSharedValue(mark.first);
  const last = useSharedValue(mark.last);
  // A contact arriving or leaving moves the rows (`listMove`): the letters move with them, never ahead.
  const placed = useRef(false);
  useEffect(() => {
    if (!placed.current) {
      placed.current = true;
      return;
    }
    first.value = withTiming(mark.first, { duration: duration.medium, easing: standard });
    last.value = withTiming(mark.last, { duration: duration.medium, easing: standard });
  }, [mark.first, mark.last, first, last]);

  const style = useAnimatedStyle(() => {
    // Until the header is measured, where the letters stand is not known yet.
    if (header.value < 0) return { opacity: 0 };
    const top = letterTop(first.value, last.value, header.value, scroll.value);
    const shown = Math.min(1, Math.max(0, (top + LETTER_HEIGHT / 2) / EDGE_FADE));
    return { opacity: 0.5 - 0.5 * Math.cos(Math.PI * shown), transform: [{ translateY: top }] };
  });

  return (
    <Animated.View style={[styles.letter, style]}>
      <AppText variant="title" color={theme.color.action}>
        {mark.letter}
      </AppText>
    </Animated.View>
  );
}

function LetterColumnComponent({ marks, scroll, header }: LetterColumnProps) {
  if (marks.length === 0) return null;
  return (
    // The rows' headings carry the letters for TalkBack; these only show them.
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.column}>
      {marks.map(mark => (
        <ColumnLetter key={mark.letter} mark={mark} scroll={scroll} header={header} />
      ))}
    </View>
  );
}

export const LetterColumn = memo(LetterColumnComponent);

const styles = StyleSheet.create({
  column: { position: 'absolute', top: 0, bottom: 0, left: PANEL_EDGE, width: LETTERS_WIDTH, overflow: 'hidden' },
  letter: { position: 'absolute', top: 0, left: 0, right: 0, height: LETTER_HEIGHT, alignItems: 'center', justifyContent: 'center' },
});
