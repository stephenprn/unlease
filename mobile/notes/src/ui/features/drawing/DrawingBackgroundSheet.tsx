/**
 * « Fond »: what a page's drawing lies on, as the web's picker lays it out (a drawing note's is the
 * note's colour). « Sans fond » struck through, the plain paper (the default), then the fourteen washes, each
 * edged in its pigment, in fours. The chosen one takes the ring of ink and the leaf check. Mount it
 * at the root of its screen, as every sheet.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { isLineColor } from '@unlease/design/colors';
import { DRAWING_BACKGROUNDS, DRAWING_NONE, drawingBackgroundName, type DrawingBackground } from '@unlease/notes/models/drawing';

import { Sheet, SHEET_INSET } from '../../components';
import { Swatch, swatchCells, swatchTurn } from '@shared/ui/components/Swatch';
import { useTheme } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

export interface DrawingBackgroundSheetProps {
  readonly visible: boolean;
  /** The background worn (the paper until another is chosen, `drawingBackgroundOf`). */
  readonly value: DrawingBackground;
  readonly onDismiss: () => void;
  readonly onChange: (background: DrawingBackground) => void;
}

/** A background's pebble, painted as the drawing will lie on it (none: the sheet's own paper, struck). */
export function backgroundPaint(theme: Theme, background: DrawingBackground) {
  if (background === DRAWING_NONE) return { backgroundColor: 'transparent', borderWidth: 2, borderColor: theme.color.edge };
  if (isLineColor(background)) return { backgroundColor: theme.line[background].tint, borderWidth: 2, borderColor: theme.line[background].fill };
  return { backgroundColor: theme.color.paper, borderWidth: 2, borderColor: theme.color.edge };
}

/** What a sheet holding the drawing is painted with: the paper or a pigment's wash; none for no background. */
export function backgroundColorOf(theme: Theme, background: DrawingBackground): string | undefined {
  if (background === DRAWING_NONE) return undefined;
  return isLineColor(background) ? theme.line[background].tint : theme.color.paper;
}

/** Sixteen in fours. */
const COLUMNS = 4;

function DrawingBackgroundSheetComponent({ visible, value, onDismiss, onChange }: DrawingBackgroundSheetProps) {
  const theme = useTheme();
  const options = DRAWING_BACKGROUNDS;
  const columns = COLUMNS;
  const cell = swatchCells.quarter;
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('Fond du dessin')}>
      {/* One group under the sheet's title: no head of its own saying « Fond » again. The chosen one is ringed, and named to TalkBack. */}
      <View style={styles.body}>
        <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel={t('Fond du dessin')}>
          {options.map((option, index) => (
            <Swatch
              key={option}
              label={drawingBackgroundName(option)}
              selected={option === value}
              turn={swatchTurn(index, columns)}
              paint={backgroundPaint(theme, option)}
              ring="ink"
              struck={option === DRAWING_NONE}
              cell={cell}
              onPress={() => onChange(option)}
            />
          ))}
        </View>
      </View>
    </Sheet>
  );
}

export const DrawingBackgroundSheet = memo(DrawingBackgroundSheetComponent);

const styles = StyleSheet.create({
  // The grid on the sheet's column, under its title.
  body: { paddingHorizontal: SHEET_INSET, paddingBottom: 16 },
  // `SwatchGroup`'s grid, in full rows of four.
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
});
