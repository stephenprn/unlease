/**
 * What the contact list draws around its rows (`sheetLayout.ts`): one sheet of paper behind everyone,
 * and the letters' bands over it.
 *
 * The paper lies behind the list, not in it: a virtualised list drops its rows as it scrolls, and a
 * sheet drawn row by row would tile its grain row by row. So one panel (its outline, its hairline
 * edge, its lift and its grain, as every paper panel) follows the scroll on the UI thread, a frame's
 * worth of it (`paperAt`), its grain shifted with it so the paper's tooth travels with the rows.
 *
 * The letters' bands lie over the list, out of TalkBack's way (each letter's first row announces it
 * as a heading): each across the sheet over its first person, held at the top while its people go
 * under the head's line, then pushed up by the next letter's (`pinnedAt`), its line drawn once
 * something lies under it. When someone arrives or leaves while the list is shown, the paper and the
 * bands glide with the rows (`listMove`'s time); another list (a search, a label) is shown at once.
 */
import React, { memo, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { AnimatedOrganic, AppText, Grain, Organic, PAPER_TILE } from '@shared/ui/components';
import { duration, standard } from '@shared/ui/theme/motion';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { BAND, FACES_AT, PAPER_MARGIN, paperAt, PIN, pinnedAt, SHEET_EDGE, sheetRight, type LetterSpan } from './sheetLayout';

/** As the rows move when someone arrives or leaves (`listMove`). */
const MOVE = { duration: duration.medium, easing: standard } as const;
/** The head's line over the list: a band pushed up goes under it, never over it. */
const HEAD_LINE = 1;

/** A value that glides to where the rows go while the same list is shown, and jumps for another list (or under Reduce Motion). */
function useGliding(target: number, list: string): SharedValue<number> {
  const reduced = useReducedMotion();
  const value = useSharedValue(target);
  const shown = useRef(list);
  useEffect(() => {
    const same = shown.current === list;
    shown.current = list;
    value.value = same && !reduced ? withTiming(target, MOVE) : target;
  }, [target, list, reduced, value]);
  return value;
}

export interface SheetPaperProps {
  /** The list's scroll, and where the sheet's top lies in its content (under the list's header; below 0 until measured). */
  readonly scroll: SharedValue<number>;
  readonly origin: SharedValue<number>;
  /** The list's frame's height (0 until measured). */
  readonly frame: SharedValue<number>;
  readonly frameHeight: number;
  readonly length: number;
  readonly railed: boolean;
  /** Which list is shown: a change of it is not someone arriving. */
  readonly list: string;
}

/** The sheet under the rows: one panel of paper, as long as the list. */
export const SheetPaper = memo(function SheetPaperLayer({ scroll, origin, frame, frameHeight, length, railed, list }: SheetPaperProps) {
  const styles = useThemedStyles(makeStyles);
  const long = useGliding(length, list);
  const paper = useAnimatedStyle(() => {
    if (origin.value < 0 || frame.value <= 0) return { opacity: 0, height: 0, transform: [{ translateY: 0 }] };
    const at = paperAt(origin.value - scroll.value, long.value, frame.value);
    return { opacity: 1, height: at.height, transform: [{ translateY: at.y }] };
  });
  // The grain stays on the paper: shifted by however far the drawn piece stands from the sheet's top, a tile at most.
  const grain = useAnimatedStyle(() => {
    const top = origin.value - scroll.value;
    const past = paperAt(top, long.value, frame.value).y - top;
    return { transform: [{ translateY: -(((past % PAPER_TILE) + PAPER_TILE) % PAPER_TILE) }] };
  });
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.frame}>
      <AnimatedOrganic outline="panel" style={[styles.paper, { right: sheetRight(railed) }, paper]}>
        <Organic outline="panel" inset={1} style={styles.clip}>
          <Animated.View style={[styles.grain, { height: frameHeight + 2 * PAPER_MARGIN + PAPER_TILE }, grain]}>
            <Grain />
          </Animated.View>
        </Organic>
      </AnimatedOrganic>
    </View>
  );
});

export interface LetterBandsProps {
  readonly letters: readonly LetterSpan[];
  readonly scroll: SharedValue<number>;
  readonly origin: SharedValue<number>;
  readonly frame: SharedValue<number>;
  readonly length: number;
  readonly railed: boolean;
  readonly list: string;
}

/**
 * The letters' bands, over the list: each across the sheet over its first person, held under the
 * head's line while its people go under it, then pushed up by the next letter's. Opaque paper (its
 * grain lined up with the sheet's), so what scrolls goes under it; cut by the sheet's corners, as the
 * paper's piece on screen is (`paperAt`), so a band at the sheet's top never stands past its curve.
 */
export const LetterBands = memo(function LetterBandsLayer({ letters, scroll, origin, frame, length, railed, list }: LetterBandsProps) {
  const styles = useThemedStyles(makeStyles);
  const long = useGliding(length, list);
  // The sheet's piece on screen, inside its hairline edge: the bands' clip.
  const piece = useAnimatedStyle(() => {
    if (origin.value < 0 || frame.value <= 0) return { opacity: 0, height: 0, transform: [{ translateY: 0 }] };
    const at = paperAt(origin.value - scroll.value, long.value, frame.value);
    return { opacity: 1, height: Math.max(0, at.height - 2), transform: [{ translateY: at.y + 1 - HEAD_LINE }] };
  });
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.bands}>
      <AnimatedOrganic outline="panel" inset={1} style={[styles.piece, { right: sheetRight(railed) + 1 }, piece]}>
        {letters.map(span => (
          <LetterBand key={span.letter} span={span} scroll={scroll} origin={origin} frame={frame} long={long} list={list} />
        ))}
      </AnimatedOrganic>
    </View>
  );
});

/** The band's line rises over the first 8 of what goes under it, as the head's. */
const LINE_RISE = 8;

const LetterBand = memo(function LetterBandBox({ span, scroll, origin, frame, long, list }: { span: LetterSpan; scroll: SharedValue<number>; origin: SharedValue<number>; frame: SharedValue<number>; long: SharedValue<number>; list: string }) {
  const styles = useThemedStyles(makeStyles);
  const top = useGliding(span.top, list);
  const end = useGliding(span.end, list);
  // Where it stands in the sheet's piece (its frame place, less the piece's), out of sight past the frame's ends.
  const place = useAnimatedStyle(() => {
    if (origin.value < 0 || frame.value <= 0) return { opacity: 0, transform: [{ translateY: -BAND }] };
    const at = pinnedAt(top.value, end.value, scroll.value - origin.value);
    const y = Math.min(Math.max(at, -BAND), frame.value + BAND);
    const pieceTop = paperAt(origin.value - scroll.value, long.value, frame.value).y + 1;
    return { opacity: 1, transform: [{ translateY: y - pieceTop }] };
  });
  // Its grain on the sheet's: the tiles start where the paper's do (1 under the sheet's top, then every tile).
  const grain = useAnimatedStyle(() => {
    const at = pinnedAt(top.value, end.value, scroll.value - origin.value);
    const past = at - (origin.value - scroll.value) - 1;
    return { transform: [{ translateY: -(((past % PAPER_TILE) + PAPER_TILE) % PAPER_TILE) }] };
  });
  // Its line once its people go under it: none while it lies over its first person.
  const line = useAnimatedStyle(() => {
    const under = scroll.value - origin.value - (top.value - PIN);
    return { opacity: Math.min(Math.max(under / LINE_RISE, 0), 1) };
  });
  return (
    <Animated.View style={[styles.band, place]}>
      <Animated.View style={[styles.bandGrain, grain]}>
        <Grain />
      </Animated.View>
      <AppText variant="section" style={styles.letter}>
        {span.letter}
      </AppText>
      <Animated.View style={[styles.bandLine, line]} />
    </Animated.View>
  );
});

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // The list's frame: what is drawn past it (the paper's made-up ends) stays out of sight, the search strip above it whole.
    frame: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
    // A paper panel's: its hairline edge and its lift; laid by the list's scroll.
    paper: { position: 'absolute', top: 0, left: SHEET_EDGE, backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.hairline, boxShadow: theme.lift.card },
    clip: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
    grain: { position: 'absolute', top: 0, left: 0, right: 0 },
    // The bands over the list, under the head's line: a band pushed up goes under it, never over it.
    bands: { position: 'absolute', top: HEAD_LINE, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
    // The sheet's piece inside its hairline edge, cut by its corners.
    piece: { position: 'absolute', top: 0, left: SHEET_EDGE + 1, overflow: 'hidden' },
    // A band across the sheet: paper, the letter on the faces' column (nearer its people than the row above: 4 more over it), its line along its foot.
    band: { position: 'absolute', top: 0, left: 0, right: 0, height: BAND, justifyContent: 'center', paddingTop: 4, paddingLeft: FACES_AT - SHEET_EDGE - 1, overflow: 'hidden', backgroundColor: theme.color.paper },
    bandGrain: { position: 'absolute', top: 0, left: 0, right: 0, height: BAND + PAPER_TILE },
    letter: { includeFontPadding: false },
    bandLine: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: theme.color.hairline },
  });
