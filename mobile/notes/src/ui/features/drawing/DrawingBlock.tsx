/**
 * A page's drawing: the strokes at the column's width and in the sheet's proportions, on paper in a
 * frame as the page's other media are; a press opens it on the whole screen to draw (not in the
 * bin). An empty one is a quiet invitation to draw.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import Svg from 'react-native-svg';

import { t } from '@unlease/core/i18n';
import type { Block } from '@unlease/notes/models/blocks';
import { DRAWING_WIDTH } from '@unlease/notes/models/drawing';
import { drawingRatio } from '@unlease/notes/services/drawing';

import { AppText, Grain, Icon, Organic, Tappable } from '../../components';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { flushAll } from '../pages/editorStore';
import { usePageContext } from '../pages/PageContext';
import { inkPalette, strokesOf } from './drawingModel';
import { openDrawing } from './openDrawing';
import { StrokePath } from './StrokePath';

export function DrawingBlock({ block }: { block: Block }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { page, readOnly } = usePageContext();
  const strokes = strokesOf(block.drawing);
  const open = () => {
    // What is typed in the page is saved before the page goes under the drawing.
    flushAll();
    openDrawing({ kind: 'block', page, block: block.id });
  };

  if (strokes.length === 0) {
    const words = readOnly ? t('Dessin vide') : t('Touchez pour dessiner');
    return (
      <Tappable onPress={open} disabled={readOnly} ownDisabled outline="frame" style={styles.empty} accessibilityLabel={words}>
        <Icon name="draw" size={24} color={theme.color.inkMuted} />
        <AppText variant="body" color={theme.color.inkMuted}>
          {words}
        </AppText>
      </Tappable>
    );
  }

  const ratio = drawingRatio(strokes);
  const palette = inkPalette(theme);
  return (
    // As wide as the column, as tall as the sheet's proportions make it: nothing to measure.
    <Organic outline="frame" style={[styles.frame, { aspectRatio: 1 / ratio }]}>
      <Grain />
      <Tappable
        onPress={open}
        disabled={readOnly}
        ownDisabled
        accessibilityRole={readOnly ? 'image' : 'button'}
        accessibilityLabel={readOnly ? t('Dessin') : t('Modifier le dessin')}
        style={StyleSheet.absoluteFill}
      >
        <Svg width="100%" height="100%" viewBox={`0 0 ${DRAWING_WIDTH} ${DRAWING_WIDTH * ratio}`} pointerEvents="none">
          {strokes.map(stroke => (
            <StrokePath key={stroke.id} stroke={stroke} palette={palette} />
          ))}
        </Svg>
      </Tappable>
    </Organic>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    frame: { overflow: 'hidden', backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.hairline },
    empty: { minHeight: 88, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 16, backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.hairline },
  });
