/**
 * A drawing as a card or an embed shows it: its strokes at `width`, its top when it is taller than
 * `height`. No paper of its own (the card's shows through) and no touch of its own (the card's
 * press is under it); drawn again only when the drawing or the size changes.
 */
import React, { memo } from 'react';
import { View } from 'react-native';
import Svg from 'react-native-svg';

import { DRAWING_WIDTH } from '@unlease/notes/models/drawing';

import { useTheme } from '../../theme/ThemeProvider';
import { inkPalette, strokesOf } from './drawingModel';
import { StrokePath } from './StrokePath';

function DrawingPreviewComponent({ data, width, height }: { data: string; width: number; height: number }): React.ReactElement | null {
  const theme = useTheme();
  const strokes = strokesOf(data);
  if (strokes.length === 0 || width <= 0 || height <= 0) return null;
  const palette = inkPalette(theme);
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width, height }}>
      {/* The view holds the size: the SVG library would cut it to whole dp. */}
      <Svg width="100%" height="100%" viewBox={`0 0 ${DRAWING_WIDTH} ${(height * DRAWING_WIDTH) / width}`}>
        {strokes.map(stroke => (
          <StrokePath key={stroke.id} stroke={stroke} palette={palette} />
        ))}
      </Svg>
    </View>
  );
}

export const DrawingPreview = memo(DrawingPreviewComponent);
