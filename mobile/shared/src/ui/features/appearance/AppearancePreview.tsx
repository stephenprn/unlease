/**
 * An appearance by day and at night, side by side: two small screens on their ground (under its film
 * grain when the ground is grainy), with what lies on it drawn in that mode's colours: the search
 * strip, a chosen chip on the tonal wash, two cards (the first picked, ringed in focus with its leaf
 * tick; the second holding a link), a filled button and the capture pebble. Bars stand for words: it
 * is a picture, read as one. A colour that had to move to stay readable shows where it moved.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { resolveAppearance, type Appearance } from '@unlease/design/appearance';
import type { Mode } from '@unlease/design/palette';
import { RADII } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';

import { AppText, Grain, Icon, Organic, groundStyle } from '../../components';
import { corners } from '../../theme/shape';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';

const MODES: readonly Mode[] = ['light', 'dark'];

/** A screen drawn at about two fifths of its size: its radii follow, so every shape keeps its role. */
const SCALE = 0.42;
function scaled(radius: number) {
  const small = Math.round(radius * SCALE * 10) / 10;
  return corners([small, small, small, small]);
}

/** A line of words, as a bar in its ink. */
function Bar({ color, width }: { color: string; width: `${number}%` | number }) {
  return <View style={[shapes.bar, { backgroundColor: color, width }]} />;
}

function Mini({ appearance, mode }: { appearance: Appearance; mode: Mode }) {
  const styles = useThemedStyles(makeStyles);
  const { roles: c, ground } = resolveAppearance(appearance, mode);
  return (
    <Organic outline="frame" style={styles.frame}>
      <View style={[StyleSheet.absoluteFill, groundStyle(ground)]} />
      <Grain ground on={appearance.grain} />
      <View style={shapes.screen}>
        <Organic style={[shapes.strip, { backgroundColor: c.field, borderColor: c.outline }]} />
        <View style={shapes.chips}>
          <Organic style={[shapes.chip, { backgroundColor: c.actionContainer }]}>
            <Bar color={c.onActionContainer} width="56%" />
          </Organic>
          <Organic style={[shapes.chip, shapes.chipPaper, { backgroundColor: c.paper, borderColor: c.hairline }]}>
            <Bar color={c.inkMuted} width="48%" />
          </Organic>
        </View>
        <View style={shapes.cards}>
          <View style={shapes.cardSlot}>
            <Organic style={[shapes.card, shapes.picked, { backgroundColor: c.paper, borderColor: c.focus }]}>
              <Bar color={c.ink} width="78%" />
              <Bar color={c.inkMuted} width="100%" />
              <Bar color={c.inkMuted} width="62%" />
            </Organic>
            <Organic pebble={2} style={[shapes.tick, { backgroundColor: c.leaf, borderColor: ground.base }]} />
          </View>
          <View style={shapes.cardSlot}>
            <Organic style={[shapes.card, shapes.edged, { backgroundColor: c.paper, borderColor: c.hairline }]}>
              <Bar color={c.ink} width="64%" />
              <Bar color={c.link} width="88%" />
              <Bar color={c.inkMuted} width="50%" />
            </Organic>
          </View>
        </View>
        <Organic style={[shapes.wide, { backgroundColor: c.paper, borderColor: c.hairline }]}>
          <Bar color={c.ink} width="40%" />
          <Bar color={c.inkMuted} width="72%" />
        </Organic>
        <View style={shapes.foot}>
          <Organic style={[shapes.button, { backgroundColor: c.action }]}>
            <Bar color={c.onAction} width={20} />
          </Organic>
          <Organic pebble={1} style={[shapes.fab, { backgroundColor: c.leaf }]}>
            <Icon name="plus" size={12} color={c.onLeaf} />
          </Organic>
        </View>
      </View>
    </Organic>
  );
}

/** `compact`: in an editor, where the picker is the tool, the two screens stay small above it. */
function AppearancePreviewComponent({ appearance, compact = false }: { appearance: Appearance; compact?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    // One picture for assistive tech: what it shows is said by the choices around it.
    <View accessible accessibilityRole="image" accessibilityLabel={t('Aperçu de jour et de nuit')} style={[styles.row, compact ? styles.compactRow : null]}>
      {MODES.map(mode => (
        <View key={mode} style={[styles.column, compact ? styles.compactColumn : null]} importantForAccessibility="no-hide-descendants">
          <Mini appearance={appearance} mode={mode} />
          <AppText variant="labelSmall" color={mode === theme.mode ? theme.color.ink : theme.color.inkMuted} style={styles.caption}>
            {mode === 'light' ? t('Jour') : t('Nuit')}
          </AppText>
        </View>
      ))}
    </View>
  );
}

export const AppearancePreview = memo(AppearancePreviewComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: 12 },
    column: { flex: 1, gap: 6 },
    compactRow: { justifyContent: 'center' },
    compactColumn: { maxWidth: 124 },
    // A small screen: a frame, edged by the paper it lies on.
    frame: { aspectRatio: 0.8, overflow: 'hidden', borderWidth: 1, borderColor: theme.color.outline },
    caption: { textAlign: 'center' },
  });

/** The miniature's shapes: the real ones' roles at the miniature's scale. */
const shapes = StyleSheet.create({
  screen: { flex: 1, padding: 8, gap: 6 },
  bar: { height: 3.5, borderRadius: 1, marginVertical: 1.5 },
  strip: { height: 14, borderWidth: 1, ...scaled(RADII.bar) },
  chips: { flexDirection: 'row', gap: 4 },
  chip: { width: 38, height: 13, justifyContent: 'center', paddingHorizontal: 5, ...scaled(RADII.chip) },
  chipPaper: { width: 30, borderWidth: 1 },
  cards: { flexDirection: 'row', gap: 5 },
  cardSlot: { flex: 1 },
  card: { height: 46, paddingHorizontal: 6, paddingVertical: 5, ...scaled(RADII.card) },
  // The picked card's ring, a little thicker than the other's hairline.
  picked: { borderWidth: 1.5 },
  edged: { borderWidth: 1 },
  // The picked card's tick: a leaf pebble half outside its corner, ringed in the ground.
  tick: { position: 'absolute', top: -4, right: -4, width: 12, height: 12, borderWidth: 1.5 },
  wide: { height: 26, paddingHorizontal: 6, paddingVertical: 4, borderWidth: 1, ...scaled(RADII.card) },
  foot: { position: 'absolute', left: 8, right: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  button: { width: 44, height: 16, alignItems: 'center', justifyContent: 'center', ...scaled(RADII.control) },
  fab: { width: 27, height: 25, alignItems: 'center', justifyContent: 'center' },
});
