/**
 * A glyph from `design/glyphs`: Onde, Carnet's own set, one even line in one ink with its
 * small filled parts, nothing behind it, so it sits cleanly on any paper, wash or gradient. `solid`
 * draws the glyph filled where it has a filled form: a selected control's glyph (a drawer
 * destination, a toggle that is on).
 */
import React, { memo } from 'react';
import Svg, { Path } from 'react-native-svg';

import { GLYPH_GRID, GLYPH_STROKE, GLYPHS, type Glyph, type GlyphName } from '@unlease/design/glyphs';

export interface IconProps {
  readonly name: GlyphName;
  readonly size?: number;
  readonly color: string;
  readonly solid?: boolean;
}

const VIEWBOX = `0 0 ${GLYPH_GRID} ${GLYPH_GRID}`;

function IconComponent({ name, size = 24, color, solid }: IconProps) {
  const glyph: Glyph = GLYPHS[name];
  const form = (solid ? glyph.solid : null) ?? glyph.line;
  return (
    <Svg width={size} height={size} viewBox={VIEWBOX} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {form.stroke ? <Path d={form.stroke} fill="none" stroke={color} strokeWidth={GLYPH_STROKE} strokeLinecap="round" strokeLinejoin="round" /> : null}
      {form.fill ? <Path d={form.fill} fill={color} fillRule="evenodd" /> : null}
    </Svg>
  );
}

export const Icon = memo(IconComponent);
