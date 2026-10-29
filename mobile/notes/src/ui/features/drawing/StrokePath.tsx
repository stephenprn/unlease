/** One kept stroke, in drawing units: its path made once, its ink in the theme's colours, round ends and joins. */
import React, { memo } from 'react';
import { Path } from 'react-native-svg';

import type { Stroke } from '@unlease/notes/models/drawing';
import { strokeWidth } from '@unlease/notes/services/drawing';

import { pathOf, strokeOpacity, type InkPalette } from './drawingModel';

export const StrokePath = memo(function KeptStroke({ stroke, palette }: { stroke: Stroke; palette: InkPalette }) {
  return (
    <Path
      d={pathOf(stroke)}
      fill="none"
      stroke={palette[stroke.ink]}
      strokeWidth={strokeWidth(stroke)}
      strokeOpacity={strokeOpacity(stroke.tool)}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
});
