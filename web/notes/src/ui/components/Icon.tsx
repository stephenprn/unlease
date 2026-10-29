/**
 * A glyph from `design/glyphs` (Onde, Carnet's own set, 24 grid): one even line in the
 * current text colour with its small filled parts, nothing behind it, so it sits cleanly on any
 * paper, wash or gradient. A selected control's stylesheet sets `--icon-solid: 1` and a glyph with
 * a filled form crossfades to it (a drawer destination, a toggle that is on). The phone draws the
 * same data, so an icon cannot drift between the two.
 */
import { memo, type CSSProperties } from 'react';

import { GLYPH_GRID, GLYPH_STROKE, GLYPHS, type Glyph, type GlyphForm, type GlyphName } from '@unlease/design/glyphs';

export interface IconProps {
  readonly name: GlyphName;
  readonly size?: number;
  readonly className?: string;
}

const VIEWBOX = `0 0 ${GLYPH_GRID} ${GLYPH_GRID}`;
const FADE = 'opacity var(--duration-short) var(--ease-standard)';
const LINE: CSSProperties = { opacity: 'calc(1 - var(--icon-solid, 0))', transition: FADE };
const SOLID: CSSProperties = { opacity: 'var(--icon-solid, 0)', transition: FADE };

/** A form: its line stroked with round ends, its filled parts even-odd. */
function Form({ form, style }: { form: GlyphForm; style?: CSSProperties }) {
  return (
    <g style={style}>
      {form.stroke ? <path d={form.stroke} fill="none" stroke="currentColor" strokeWidth={GLYPH_STROKE} strokeLinecap="round" strokeLinejoin="round" /> : null}
      {form.fill ? <path d={form.fill} fillRule="evenodd" /> : null}
    </g>
  );
}

function IconComponent({ name, size = 24, className }: IconProps) {
  const glyph: Glyph = GLYPHS[name];
  return (
    <svg className={className} width={size} height={size} viewBox={VIEWBOX} fill="currentColor" aria-hidden="true" focusable="false">
      {glyph.solid ? (
        <>
          <Form form={glyph.line} style={LINE} />
          <Form form={glyph.solid} style={SOLID} />
        </>
      ) : (
        <Form form={glyph.line} />
      )}
    </svg>
  );
}

export const Icon = memo(IconComponent);
