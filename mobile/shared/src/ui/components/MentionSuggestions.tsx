/**
 * « @ » on the phone, in every app: while « @word » is typed, what it may mention rides on the
 * keyboard (a small sheet of the menu's paper rising from it, or a menu's sheet dropping right under
 * the field), the best answers first, filtered as the word grows: a row each, its mark (a glyph, a
 * page's emoji, a collection's stone), its name, what tells it apart in meta. A tap puts it in place
 * of « @word » and the keyboard stays (taps reach the rows without taking the caret from the field);
 * typing on, or a space after words nothing answers, leaves it. The ranking is the suite's
 * (`core/services/mentionSearch`); each app gives its kinds.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { EdgeScrollView } from './ScrollEdges';
import { Keyframe } from 'react-native-reanimated';

import type { GlyphName } from '@unlease/design/glyphs';
import { GEOMETRY } from '@unlease/design/palette';
import { RADII, SHAPES, type Corners } from '@unlease/design/shapes';

import { accelerate, decelerate, duration } from '../theme/motion';
import { corners } from '../theme/shape';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { AppText } from './AppText';
import { EmptyLine } from './EmptyLine';
import { Grain } from './Grain';
import { Icon } from './Icon';
import { AnimatedOrganic, Organic } from './Organic';
import { Tappable } from './Tappable';

export interface SuggestionRow {
  readonly key: string;
  readonly title: string;
  readonly detail?: string;
  /** Its glyph, unless it draws its own mark. */
  readonly icon?: GlyphName;
  /** Drawn in the glyph's place: a page's emoji, a collection's stone. */
  readonly mark?: React.ReactNode;
  readonly onPress: () => void;
}

/** A row's height: a name over its detail, under a finger. */
export const SUGGESTION_ROW = 52;
/** At most this many rows show at once (the half row says more lie further); the rest scroll. */
const ROWS_SHOWN = 3.5;
/** The sheet's rows sit this far in, concentric with its corners. */
const INSET = 6;

/** Under a field: it drops from the field, settling in from just above. Docked: it rises from the keyboard. */
const DROP_IN = new Keyframe({ 0: { opacity: 0, transform: [{ translateY: -6 }, { scale: 0.97 }] }, 100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }], easing: decelerate } }).duration(duration.medium);
const RISE_IN = new Keyframe({ 0: { opacity: 0, transform: [{ translateY: 10 }] }, 100: { opacity: 1, transform: [{ translateY: 0 }], easing: decelerate } }).duration(duration.medium);
const OUT = new Keyframe({ 0: { opacity: 1 }, 100: { opacity: 0, easing: accelerate } }).duration(duration.short);

/** Docked on the keyboard: a sheet of the menu's paper whose top corners alone are rounded. */
const DOCKED_SHAPE: Corners = [RADII.menu, RADII.menu, 0, 0];

export interface MentionSuggestionsProps {
  readonly rows: readonly SuggestionRow[];
  /** What the panel is, for TalkBack (« Mentionner »). */
  readonly label: string;
  /** Said when nothing answers (null: no panel at all then). */
  readonly empty?: string | null;
  /** Docked on the keyboard (a small sheet rising from it), or in the flow under a field (a menu's sheet). */
  readonly docked?: boolean;
  /** A quiet line under the rows (where they come from). */
  readonly foot?: string | null;
}

function MentionSuggestionsComponent({ rows, label, empty = null, docked = true, foot = null }: MentionSuggestionsProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  if (rows.length === 0 && !empty) return null;
  const body =
    rows.length === 0 ? (
      <EmptyLine text={empty ?? ''} glyph="info" style={styles.empty} />
    ) : (
      // A small card of its own: its ends are its own, nothing slides under anything.
      <EdgeScrollView top={false} bottom={false} keyboardShouldPersistTaps="always" nestedScrollEnabled style={{ maxHeight: (SUGGESTION_ROW + GEOMETRY.rowGap) * ROWS_SHOWN + INSET * 2 }} contentContainerStyle={styles.list}>
        {rows.map(row => (
          <Tappable key={row.key} onPress={row.onPress} accessibilityLabel={row.title} accessibilityValue={row.detail ? { text: row.detail } : undefined} style={styles.row}>
            <View style={styles.mark}>{row.mark ?? (row.icon ? <Icon name={row.icon} size={22} color={theme.color.inkMuted} /> : null)}</View>
            <View style={styles.text}>
              <AppText variant="body" numberOfLines={1}>
                {row.title}
              </AppText>
              {row.detail ? (
                <AppText variant="meta" color={theme.color.inkMuted} numberOfLines={1}>
                  {row.detail}
                </AppText>
              ) : null}
            </View>
          </Tappable>
        ))}
        {foot ? (
          <AppText variant="labelSmall" color={theme.color.inkMuted} style={styles.foot}>
            {foot}
          </AppText>
        ) : null}
      </EdgeScrollView>
    );
  // A menu's sheet of paper, its edge in the outline ink, lifted as a menu is: under a field, whole;
  // on the keyboard, its top corners rounded and its foot flush with the keys.
  const shape = docked ? DOCKED_SHAPE : null;
  return (
    <View style={docked ? styles.docked : styles.inline}>
      <AnimatedOrganic
        entering={docked ? RISE_IN : DROP_IN}
        exiting={OUT}
        outline={docked ? null : 'menu'}
        shape={shape}
        style={[styles.sheet, docked ? styles.dockedSheet : null]}
        accessibilityLabel={label}
        accessibilityLiveRegion="polite"
      >
        <Organic outline={docked ? null : 'menu'} shape={shape} style={styles.clip}>
          <Grain />
          {body}
        </Organic>
      </AnimatedOrganic>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    docked: { paddingHorizontal: 8 },
    inline: { marginTop: 6 },
    sheet: { backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.outline, boxShadow: theme.lift.float, transformOrigin: 'top' },
    dockedSheet: { borderBottomWidth: 0, transformOrigin: 'bottom' },
    clip: { overflow: 'hidden' },
    // Its rows a little apart, so the one pressed never runs into the next, and inset so their press stays inside the sheet.
    list: { padding: INSET, gap: GEOMETRY.rowGap },
    // Its words on a list's column (10, the 32 mark slot, 14: 56), as a list row's.
    row: { minHeight: SUGGESTION_ROW, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 10, paddingVertical: 6, ...corners(SHAPES.tab) },
    mark: { width: 32, alignItems: 'center', justifyContent: 'center' },
    text: { flex: 1, minWidth: 0, gap: 1 },
    empty: { paddingHorizontal: 16, paddingVertical: 14 },
    foot: { paddingHorizontal: 10, paddingTop: 2, paddingBottom: 2 },
  });

export const MentionSuggestions = memo(MentionSuggestionsComponent);
