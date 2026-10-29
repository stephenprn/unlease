/**
 * What a note's sheet is painted with: a pigment's wash or a gradient, and a paper (dots, grid,
 * lines, Seyès, millimetre, isometric dots, flecks) over it. Written as CSS background layers, which React Native reads too, so the phone
 * and the web paint the same string. Ink holds 7:1 on every colour here (`__tests__/backgrounds`).
 */
import { isLineColor, isNoteGradient, type LineColor, type NoteColor, type NoteGradient, type NotePattern } from './colors';
import { LINES, ROLES, parseHex, type Mode } from './palette';

/** A soft light from one side of the sheet: its colour fades out over `reach` percent. */
interface Glow {
  readonly color: string;
  readonly x: number;
  readonly y: number;
  readonly reach: number;
}

interface GradientRecipe {
  readonly base: string;
  readonly glows: readonly Glow[];
}

const glow = (color: string, x: number, y: number, reach: number): Glow => ({ color, x, y, reach });

/** Lights pooled on a base, mesh-like: pale by day under dark ink, deep at night under cream (a step above the night card). */
export const GRADIENTS: Record<Mode, Record<NoteGradient, GradientRecipe>> = {
  light: {
    aube: { base: '#F7E8DF', glows: [glow('#FFE3CC', 8, 6, 62), glow('#FFE0F0', 96, 24, 58), glow('#EDE5FF', 62, 104, 66)] },
    lagon: { base: '#E3F1ED', glows: [glow('#CCF1E0', 4, 92, 64), glow('#D2ECFB', 92, 10, 60), glow('#E2E7FF', 100, 100, 54)] },
    matcha: { base: '#F4F0DE', glows: [glow('#DBEFBB', 14, 10, 70), glow('#F6E8D0', 92, 96, 60)] },
    abricot: { base: '#FCECD8', glows: [glow('#FFE5BF', 0, 0, 72), glow('#FAEEBF', 100, 100, 66)] },
    lavande: { base: '#EFE9F7', glows: [glow('#EFE3FF', 12, 16, 66), glow('#DBE9FF', 92, 88, 62)] },
    nacre: { base: '#F7F3EB', glows: [glow('#FFE0EC', 6, 8, 52), glow('#D6EEF0', 98, 20, 50), glow('#EBE5FF', 24, 98, 52), glow('#F7EBC9', 96, 98, 48)] },
    sousbois: { base: '#ECEEDF', glows: [glow('#DEEECE', 0, 100, 70), glow('#EFEACE', 100, 0, 58), glow('#D8EDE0', 86, 92, 46)] },
    terre: { base: '#F7E9DE', glows: [glow('#FFE3CA', 12, 6, 66), glow('#F5E7C7', 92, 96, 64)] },
  },
  dark: {
    aube: { base: '#392F36', glows: [glow('#5D3827', 8, 6, 62), glow('#5A364F', 96, 24, 58), glow('#413C6B', 62, 104, 66)] },
    lagon: { base: '#233738', glows: [glow('#18493D', 4, 92, 64), glow('#1F455B', 92, 10, 60), glow('#323C63', 100, 100, 54)] },
    matcha: { base: '#303627', glows: [glow('#34471B', 14, 10, 70), glow('#494130', 92, 96, 60)] },
    abricot: { base: '#3D3126', glows: [glow('#5E391B', 0, 0, 72), glow('#4D411A', 100, 100, 66)] },
    lavande: { base: '#323042', glows: [glow('#473966', 12, 16, 66), glow('#2E4263', 92, 88, 62)] },
    nacre: { base: '#343437', glows: [glow('#563949', 6, 8, 52), glow('#22474A', 98, 20, 50), glow('#413B6C', 24, 98, 52), glow('#4B4123', 96, 98, 48)] },
    sousbois: { base: '#2B3227', glows: [glow('#304727', 0, 100, 70), glow('#43432D', 100, 0, 58), glow('#28473D', 86, 92, 46)] },
    terre: { base: '#392C26', glows: [glow('#633526', 12, 6, 66), glow('#503F26', 92, 96, 64)] },
  },
};

const transparent = (hex: string): string => `rgba(${parseHex(hex).join(', ')}, 0)`;

/** The glows as CSS layers, first on top; each fades to its own colour at zero alpha, never to grey. */
function gradientLayers(recipe: GradientRecipe): string[] {
  return recipe.glows.map(({ color, x, y, reach }) => `radial-gradient(circle at ${x}% ${y}%, ${color} 0%, ${transparent(color)} ${reach}%)`);
}

/** Every colour a gradient shows, for the contrast test and a picker's swatch. */
export function gradientColors(mode: Mode, gradient: NoteGradient): readonly string[] {
  const recipe = GRADIENTS[mode][gradient];
  return [recipe.base, ...recipe.glows.map(g => g.color)];
}

/** The paper's ink: the writing ink, faint enough to sit under it. */
export const PAPER_INK: Record<Mode, { readonly line: string; readonly dot: string }> = {
  light: { line: 'rgba(32, 30, 29, 0.11)', dot: 'rgba(32, 30, 29, 0.24)' },
  dark: { line: 'rgba(249, 244, 237, 0.09)', dot: 'rgba(249, 244, 237, 0.2)' },
};

/** A pigment laid as a paper's ink, at `alpha` by day; at night its lift a little fainter, so it stays under cream text. */
function pigmentInk(mode: Mode, color: LineColor, alpha: number): string {
  return `rgba(${parseHex(LINES[mode][color].fill).join(', ')}, ${mode === 'light' ? alpha : alpha * 0.85})`;
}

interface Layer {
  readonly image: string;
  readonly size: string;
  readonly position: string;
  readonly repeat: string;
}

/** Ruled lines sit `pitch` apart, the first one `offset` from the top: callers align them on their text. */
export interface PaperRule {
  readonly pitch: number;
  readonly offset: number;
}

const DOT_STEP = 18;
const GRID_STEP = 20;
/** Millimetre paper: a fine square, every fifth line stronger. */
const MILLI_STEP = 5;
const MILLI_MAJOR = MILLI_STEP * 5;
/** Isometric dots: rows `ISO_STEP` apart on a triangle's height, every other row shifted half a step. */
const ISO_STEP = 18;
const ISO_ROW = Math.round(ISO_STEP * Math.sin(Math.PI / 3));

/** Flecks of coloured fibre: tiles of unrelated sizes, so the paper never shows its repeat. */
const FLECKS: readonly { readonly color: LineColor; readonly alpha: number; readonly radius: number; readonly at: readonly [number, number]; readonly tile: readonly [number, number] }[] = [
  { color: 'red', alpha: 0.42, radius: 1.1, at: [32, 41], tile: [47, 53] },
  { color: 'blue', alpha: 0.4, radius: 0.9, at: [71, 22], tile: [61, 43] },
  { color: 'ochre', alpha: 0.48, radius: 1.3, at: [18, 77], tile: [71, 67] },
  { color: 'green', alpha: 0.36, radius: 0.9, at: [63, 58], tile: [37, 89] },
  { color: 'violet', alpha: 0.34, radius: 0.8, at: [44, 12], tile: [83, 59] },
];

const hairline = (direction: 'right' | 'bottom', ink: string, width = 1): string => `linear-gradient(to ${direction}, ${ink} 0px, ${ink} ${width}px, ${transparent('#000000')} ${width}px)`;

/** A rule at the foot of each band `pitch` high, the first one `offset` from the top. */
function ruleLayer(ink: string, pitch: number, offset: number): Layer {
  // The rule is drawn at the foot of each band, so the band's top is one pitch above the line.
  const top = ((offset - pitch + 1) % pitch + pitch) % pitch;
  return {
    image: `linear-gradient(to bottom, ${transparent('#000000')} 0px, ${transparent('#000000')} ${pitch - 1}px, ${ink} ${pitch - 1}px, ${ink} ${pitch}px)`,
    size: `100% ${pitch}px`,
    position: `0px ${top}px`,
    repeat: 'repeat',
  };
}

const dotLayer = (ink: string, radius: number, size: string, position: string, at = '50% 50%'): Layer => ({
  image: `radial-gradient(circle at ${at}, ${ink} 0px, ${ink} ${radius}px, ${transparent('#000000')} ${radius + 0.6}px)`,
  size,
  position,
  repeat: 'repeat',
});

function patternLayers(mode: Mode, pattern: NotePattern, rule: PaperRule): Layer[] {
  const { line, dot } = PAPER_INK[mode];
  switch (pattern) {
    case 'dots':
      return [dotLayer(dot, 1.1, `${DOT_STEP}px ${DOT_STEP}px`, '0px 0px')];
    case 'grid':
      return [
        { image: hairline('right', line), size: `${GRID_STEP}px ${GRID_STEP}px`, position: '0px 0px', repeat: 'repeat' },
        { image: hairline('bottom', line), size: `${GRID_STEP}px ${GRID_STEP}px`, position: '0px 0px', repeat: 'repeat' },
      ];
    case 'lines':
      return [ruleLayer(line, rule.pitch, rule.offset)];
    case 'seyes': {
      // The French school's grands carreaux: a violet rule on each line of text, three faint blue ones between, squares as wide as a line.
      const quarter = rule.pitch / 4;
      return [
        ruleLayer(pigmentInk(mode, 'violet', 0.34), rule.pitch, rule.offset),
        ruleLayer(pigmentInk(mode, 'blue', 0.15), quarter, rule.offset),
        { image: hairline('right', pigmentInk(mode, 'violet', 0.2)), size: `${rule.pitch}px 100%`, position: '0px 0px', repeat: 'repeat' },
      ];
    }
    case 'millimetre': {
      const fine = pigmentInk(mode, 'orange', 0.1);
      const major = pigmentInk(mode, 'orange', 0.26);
      return [
        { image: hairline('right', major), size: `${MILLI_MAJOR}px ${MILLI_MAJOR}px`, position: '0px 0px', repeat: 'repeat' },
        { image: hairline('bottom', major), size: `${MILLI_MAJOR}px ${MILLI_MAJOR}px`, position: '0px 0px', repeat: 'repeat' },
        { image: hairline('right', fine), size: `${MILLI_STEP}px ${MILLI_STEP}px`, position: '0px 0px', repeat: 'repeat' },
        { image: hairline('bottom', fine), size: `${MILLI_STEP}px ${MILLI_STEP}px`, position: '0px 0px', repeat: 'repeat' },
      ];
    }
    case 'iso': {
      const ink = pigmentInk(mode, 'sky', 0.55);
      const tile = `${ISO_STEP}px ${ISO_ROW * 2}px`;
      // Each dot whole at its tile's centre; the second layer shifted half a step and a row, so rows alternate.
      return [dotLayer(ink, 1, tile, '0px 0px'), dotLayer(ink, 1, tile, `${ISO_STEP / 2}px ${ISO_ROW}px`)];
    }
    case 'speckle':
      return FLECKS.map(fleck => dotLayer(pigmentInk(mode, fleck.color, fleck.alpha), fleck.radius, `${fleck.tile[0]}px ${fleck.tile[1]}px`, '0px 0px', `${fleck.at[0]}% ${fleck.at[1]}%`));
  }
}

/** A sheet's paint, as React Native style props and CSS properties alike. */
export interface Backdrop {
  readonly backgroundColor: string;
  readonly backgroundImage?: string;
  readonly backgroundSize?: string;
  readonly backgroundPosition?: string;
  readonly backgroundRepeat?: string;
}

/**
 * The note's colour (a wash, a gradient, or plain paper) under its pattern. `paper` is what an
 * uncoloured note shows: the card's paper on the board, the same in the editor.
 */
export function noteBackdrop(mode: Mode, color: NoteColor | null, pattern: NotePattern | null, rule: PaperRule = { pitch: 21, offset: 32 }): Backdrop {
  const backgroundColor = isLineColor(color) ? LINES[mode][color].tint : isNoteGradient(color) ? GRADIENTS[mode][color].base : ROLES[mode].paper;
  const layers: Layer[] = [
    ...(pattern ? patternLayers(mode, pattern, rule) : []),
    ...(isNoteGradient(color) ? gradientLayers(GRADIENTS[mode][color]).map(image => ({ image, size: '100% 100%', position: '0px 0px', repeat: 'no-repeat' })) : []),
  ];
  if (layers.length === 0) return { backgroundColor };
  return {
    backgroundColor,
    backgroundImage: layers.map(layer => layer.image).join(', '),
    backgroundSize: layers.map(layer => layer.size).join(', '),
    backgroundPosition: layers.map(layer => layer.position).join(', '),
    backgroundRepeat: layers.map(layer => layer.repeat).join(', '),
  };
}

/** A pattern alone, over whatever is under it: ruled lines laid on one block of text. */
export function patternBackdrop(mode: Mode, pattern: NotePattern | null, rule: PaperRule): Omit<Backdrop, 'backgroundColor'> {
  if (!pattern) return {};
  const layers = patternLayers(mode, pattern, rule);
  return {
    backgroundImage: layers.map(layer => layer.image).join(', '),
    backgroundSize: layers.map(layer => layer.size).join(', '),
    backgroundPosition: layers.map(layer => layer.position).join(', '),
    backgroundRepeat: layers.map(layer => layer.repeat).join(', '),
  };
}

/** A swatch for the picker: the gradient's own paint, without a pattern. */
export function gradientSwatch(mode: Mode, gradient: NoteGradient): Backdrop {
  return noteBackdrop(mode, gradient, null);
}
