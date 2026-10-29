/**
 * The drawing tools, docked at the foot of the drawing where a thumb reaches, still while a tall
 * drawing scrolls under them; two rows of 48 targets, as the web lays them under a finger. First the
 * pen, the marker, the highlighter and the eraser (the one in hand on its filled pebble: the ink
 * veil on a note's own colour, matcha on the ground), then undo and redo where the screen has no top
 * bar for them (a note), and « Tout effacer », one step undo takes back. Under them, scrolling
 * sideways, the three sizes as dots of the tool's widths, then the inks as pebbles of the ink
 * itself, the chosen one ringed in ink a little way out. Where the inks run past the screen, the row
 * ends halfway through one, which says more lie further.
 */
import React, { memo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useAnimatedStyle } from 'react-native-reanimated';

import type { GlyphName } from '@unlease/design/glyphs';
import { pebbleTurn } from '@unlease/design/pebbles';
import { t, tc } from '@unlease/core/i18n';
import { DRAWING_INKS, DRAWING_SIZES, DRAWING_SIZE_NAMES, DRAWING_TOOL_NAMES, drawingInkName, type DrawingInk, type DrawingSize, type DrawingTool } from '@unlease/notes/models/drawing';

import { AnimatedOrganic, IconButton, PressSurface, Tappable } from '../../components';
import { useChosen } from '../../components/useChosen';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { inkPalette, sizeDot } from './drawingModel';
import type { DrawingEditor } from './useDrawingEditor';

const TOOLS: readonly (DrawingTool | 'eraser')[] = ['pen', 'marker', 'highlighter', 'eraser'];
const GLYPHS: Readonly<Record<DrawingTool | 'eraser', GlyphName>> = { pen: 'pen', marker: 'marker', highlighter: 'highlight', eraser: 'eraser' };
/** An ink's paint and the ring round the chosen one: the web's numbers. */
const PAINT = 22;
const RING = 30;
const INK_CELL = { width: 44, height: 48 } as const;
/** The room after the last ink, the row's own padding. */
const ROW_END = 4;

/** An ink's cell: 44 wide, or a little wider where the inks run past `room`, so the row it shows ends halfway through one. */
function inkCellWidth(room: number): number {
  if (room <= 0 || room >= DRAWING_INKS.length * INK_CELL.width + ROW_END) return INK_CELL.width;
  const whole = Math.max(1, Math.floor(room / INK_CELL.width - 0.5));
  return room / (whole + 0.5);
}

export interface DrawingToolsProps {
  readonly editor: DrawingEditor;
  /** A chosen tool or size: the ink veil on a note's own colour, matcha on the ground. */
  readonly tone: 'ink' | 'accent';
  /** Undo and redo here: the screen has no top bar for them. */
  readonly history: boolean;
  /** A hairline along the top, where the tools meet the sheet they draw on. */
  readonly edge?: boolean;
  /** Room under the tools: the gesture bar's, when they are the screen's foot. */
  readonly inset?: number;
}

/** A size: a dot of the tool's width in the writing ink, on a pebble filled while chosen, as a chosen tool's is. */
function SizeChoice({ size, dot, turn, selected, fill, onPress }: { size: DrawingSize; dot: number; turn: number; selected: boolean; fill: string; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Tappable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={t(DRAWING_SIZE_NAMES[size])}
      onPress={onPress}
      hitSlop={2}
      pebble={turn}
      style={[styles.size, selected ? { backgroundColor: fill } : null]}
    >
      <View style={[styles.dot, { width: dot, height: dot, borderRadius: dot / 2 }]} />
    </Tappable>
  );
}

/** An ink: a pebble of the ink itself, edged faintly so a pale pigment reads on a pale wash; chosen, the ring fades in round it. */
function InkChoice({ ink, turn, selected, color, width, onPress }: { ink: DrawingInk; turn: number; selected: boolean; color: string; width: number; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const progress = useChosen(selected);
  const ring = useAnimatedStyle(() => ({ opacity: progress.value }));
  return (
    <Tappable accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={drawingInkName(ink)} onPress={onPress} noTint style={[styles.ink, { width }]}>
      <AnimatedOrganic pointerEvents="none" pebble={turn} style={[styles.ring, { left: (width - RING) / 2 }, ring]} />
      <PressSurface pebble={turn} style={[styles.paint, { backgroundColor: color }]} />
    </Tappable>
  );
}

function DrawingToolsComponent({ editor, tone, history, edge = false, inset = 0 }: DrawingToolsProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const palette = inkPalette(theme);
  const { tool, pen, sizes, ink } = editor.choice;
  const fill = tone === 'ink' ? theme.color.veil : theme.color.actionContainer;
  const [paletteWidth, setPaletteWidth] = useState(0);
  const [inksAt, setInksAt] = useState(0);
  const inkWidth = inkCellWidth(paletteWidth - inksAt);
  return (
    <View style={[styles.tools, edge ? styles.edge : null, { paddingBottom: inset }]} accessibilityRole="toolbar" accessibilityLabel={t('Outils de dessin')}>
      <View style={styles.row}>
        {TOOLS.map((each, index) => (
          <IconButton key={each} icon={GLYPHS[each]} label={DRAWING_TOOL_NAMES[each]} selected={tool === each} tone={tone} shape={index} onPress={() => editor.chooseTool(each)} />
        ))}
        <View style={styles.spring} />
        {history ? (
          <>
            <IconButton icon="undo" label={tc('undo', 'Annuler')} shape={1} disabled={!editor.canUndo} onPress={editor.undo} />
            <IconButton icon="undo" label={t('Rétablir')} shape={2} disabled={!editor.canRedo} onPress={editor.redo} style={styles.mirrored} />
          </>
        ) : null}
        <IconButton icon="trash" label={t('Tout effacer')} shape={3} disabled={editor.strokes.length === 0} onPress={editor.clear} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.palette} contentContainerStyle={styles.row} onLayout={event => setPaletteWidth(event.nativeEvent.layout.width)}>
        <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={t('Épaisseur')}>
          {DRAWING_SIZES.map(size => (
            <SizeChoice key={size} size={size} dot={sizeDot(pen, size)} turn={pebbleTurn(size)} selected={size === sizes[pen]} fill={fill} onPress={() => editor.chooseSize(size)} />
          ))}
        </View>
        <View style={styles.divider} />
        <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={t('Couleur du trait')} onLayout={event => setInksAt(event.nativeEvent.layout.x)}>
          {DRAWING_INKS.map((key, index) => (
            <InkChoice key={key} ink={key} turn={pebbleTurn(index)} selected={key === ink} color={palette[key]} width={inkWidth} onPress={() => editor.chooseInk(key)} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export const DrawingTools = memo(DrawingToolsComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    tools: { paddingTop: 2 },
    edge: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.color.hairline },
    row: { height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: ROW_END },
    spring: { flex: 1, minWidth: 8 },
    mirrored: { transform: [{ scaleX: -1 }] },
    palette: { flexGrow: 0 },
    group: { flexDirection: 'row', alignItems: 'center' },
    divider: { width: StyleSheet.hairlineWidth, height: 24, marginHorizontal: 6, backgroundColor: theme.color.hairline },
    // An icon button's own box: 44 inside a 48 slot.
    size: { width: 44, height: 44, margin: 2, alignItems: 'center', justifyContent: 'center' },
    dot: { backgroundColor: theme.color.ink },
    ink: { ...INK_CELL, alignItems: 'center', justifyContent: 'center' },
    ring: { position: 'absolute', top: (INK_CELL.height - RING) / 2, width: RING, height: RING, borderWidth: 2, borderColor: theme.color.ink },
    paint: { width: PAINT, height: PAINT, borderWidth: 1, borderColor: theme.color.hairline },
  });
