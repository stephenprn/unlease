/**
 * CSS custom properties, generated from the shared design data.
 *
 * The web app never writes a colour or a cut by hand: every value below comes
 * from `packages/design/src/` (palette, shapes), the same data the phone paints
 * with, so the two cannot drift. Stylesheets read roles (`var(--paper)`),
 * gouaches (`var(--line-blue)`, or `--fill`, `--on`, `--tint` under
 * `[data-line]`), lifts (`var(--lift-card)`), cuts (`var(--cut-button)`) and
 * the shared geometry (`var(--card-padding)`).
 *
 * Dark mode follows the system unless `<html data-theme>` pins a theme, which
 * is how the "Clair / Sombre" setting works without a flash at load.
 */
import { noteBackdrop, PAPER_INK, patternBackdrop } from '@unlease/design/backgrounds';
import { DEFAULT_APPEARANCE, groundBackground, groundPaint } from '@unlease/design/appearance';
import { GEOMETRY, LIFTS, LINES, ROLES, mix, type Mode } from '@unlease/design/palette';
import { PEBBLE_TURNS, pebbleShape } from '@unlease/design/pebbles';
import { SHAPES, type Corners } from '@unlease/design/shapes';
import { LINE_COLORS, NOTE_GRADIENTS, NOTE_PATTERNS, isRuledPattern } from '@unlease/design/colors';

const kebab = (name: string): string => name.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`);

/** The paper's tooth: under the content, never stacked, quieter at night (the phone's `Theme.grain`). */
const GRAIN: Record<Mode, number> = { light: 0.16, dark: 0.08 };

/**
 * A role's corners as CSS. A radius from the scale is scaled by `--corner-scale`: 1 where the
 * browser draws plain round corners, more where it draws `corner-shape: squircle` (base.css),
 * whose corner runs less deep than a round one of the same radius. A dot stays a circle.
 */
function cut(corners: Corners): string {
  const css = (value: Corners[number]): string => {
    if (typeof value !== 'number') return value;
    if (value === 0) return '0';
    return `calc(${value}px * var(--corner-scale))`;
  };
  const values = corners.map(css);
  return values.every(value => value === values[0]) ? values[0]! : values.join(' ');
}

/**
 * A lift as `filter` drop shadows, for a container clipped to its organic outline (a clip cuts a
 * box-shadow off): the same offsets and colours, the blur halved (a drop shadow's blur is a
 * standard deviation, a box-shadow's twice one).
 */
function dropShadows(lift: string): string {
  return lift
    .split(/,(?![^(]*\))/)
    .map(shadow => {
      const [x, y, blur, ...color] = shadow.trim().split(/\s+(?![^(]*\))/);
      return `drop-shadow(${x} ${y} ${parseFloat(blur ?? '0') / 2}px ${color.join(' ')})`;
    })
    .join(' ');
}

function modeVariables(mode: Mode): string[] {
  const out: string[] = [];
  for (const [role, value] of Object.entries(ROLES[mode])) out.push(`--${kebab(role)}: ${value};`);
  for (const color of LINE_COLORS) {
    const swatch = LINES[mode][color];
    out.push(`--line-${color}: ${swatch.fill};`, `--line-${color}-on: ${swatch.on};`, `--line-${color}-tint: ${swatch.tint};`, `--line-${color}-text: ${swatch.text};`);
  }
  for (const [name, value] of Object.entries(LIFTS[mode])) out.push(`--lift-${kebab(name)}: ${value};`, `--drop-${kebab(name)}: ${dropShadows(value)};`);
  const dark = mode === 'dark';
  // The stamp is the danger ink by day and the red gouache at night, as on the phone; a little faint by day, full at night to read.
  out.push(`--stamp-ink: ${dark ? LINES.dark.red.fill : ROLES.light.danger};`, `--stamp-opacity: ${dark ? 1 : 0.88};`);
  out.push(`--grain: ${GRAIN[mode]};`);
  // The chosen segment's sheet, lifted out of its sunken track: the paper by day; at night the paper a step lighter, or it would sink below the track.
  out.push(`--segment-sheet: ${dark ? mix(ROLES.dark.paper, ROLES.dark.ink, 0.12) : ROLES.light.paper};`);
  // The ground: Carnet's two tones of the wall, every layer fixed to the window (design/appearance.ts); Réglages may lay another at runtime.
  const ground = groundPaint(DEFAULT_APPEARANCE.ground, mode);
  out.push(`--ground-layers: ${groundBackground(ground)};`, `--ground-top: ${ground.top};`, `--ground-bottom: ${ground.bottom};`);
  // A link's picture on cream paper: by day a product shot's white becomes the paper, at night it glares less (the phone's LinkRow).
  out.push(`--picture-blend: ${dark ? 'normal' : 'multiply'};`, `--picture-opacity: ${dark ? 0.86 : 1};`);
  // Signika's grade axis: light text on a dark ground blooms, so night sets it lower.
  out.push(`--grad: ${dark ? -30 : 0};`, `color-scheme: ${mode};`);
  return out;
}

/** Seyès's inks as core paints them (its rule, the rules between, the squares' sides), read off its layers so the two cannot drift. */
function seyesInks(mode: Mode): [string, string, string] {
  const image = patternBackdrop(mode, 'seyes', { pitch: 32, offset: 31 }).backgroundImage ?? '';
  const inks = [...new Set(image.match(/rgba\([^)]*\)/g) ?? [])].filter(ink => !/,\s*0\)$/.test(ink));
  if (inks.length !== 3) throw new Error(`Seyès paper: expected 3 inks, found ${inks.length}`);
  return inks as [string, string, string];
}

const block = (selector: string, lines: readonly string[], indent = ''): string =>
  `${indent}${selector} {\n${lines.map(line => `${indent}  ${line}`).join('\n')}\n${indent}}`;

/**
 * A note's finishes for one mode, as the phone paints them: a sheet wearing `data-gradient`
 * takes the gradient's base and glows; a paper layer wearing `data-pattern` draws its paper, a
 * ruled one (lines, Seyès) `--pitch` apart (its element sets the pitch and where the first line falls).
 */
function finishRules(mode: Mode, scope: string, indent = ''): string[] {
  const rules: string[] = [];
  for (const gradient of NOTE_GRADIENTS) {
    const { backgroundColor, backgroundImage } = noteBackdrop(mode, gradient, null);
    rules.push(block(`${scope} [data-gradient='${gradient}']`, [`--sheet: ${backgroundColor};`, `background-image: ${backgroundImage};`, 'background-size: 100% 100%;', 'background-repeat: no-repeat;'], indent));
  }
  for (const pattern of NOTE_PATTERNS.filter(key => !isRuledPattern(key))) {
    const paper = patternBackdrop(mode, pattern, { pitch: 21, offset: 0 });
    rules.push(block(`${scope} [data-pattern='${pattern}']`, [`background-image: ${paper.backgroundImage};`, `background-size: ${paper.backgroundSize};`, `background-position: ${paper.backgroundPosition};`, `background-repeat: ${paper.backgroundRepeat};`], indent));
  }
  // Ruled papers follow the text they rule: `--pitch` apart, the element setting where the first rule falls.
  const pitch = 'var(--pitch, 21px)';
  const rule = (ink: string, band: string): string => `linear-gradient(to bottom, transparent calc(${band} - 1px), ${ink} calc(${band} - 1px), ${ink} ${band})`;
  const line = PAPER_INK[mode].line;
  rules.push(block(`${scope} [data-pattern='lines']`, [`background-image: ${rule(line, pitch)};`, `background-size: 100% ${pitch};`, 'background-repeat: repeat;'], indent));
  // Seyès's inks, in core's order: the rule on each line, the three between, the squares' sides.
  const [main, between, side] = seyesInks(mode);
  const quarter = `calc(${pitch} / 4)`;
  rules.push(
    block(
      `${scope} [data-pattern='seyes']`,
      [
        `background-image: ${rule(main, pitch)}, ${rule(between, quarter)}, linear-gradient(to right, ${side} 0px, ${side} 1px, transparent 1px);`,
        `background-size: 100% ${pitch}, 100% ${quarter}, ${pitch} 100%;`,
        'background-repeat: repeat;',
      ],
      indent,
    ),
  );
  return rules;
}

export function tokensCss(): string {
  const geometry = Object.entries(GEOMETRY).map(([name, value]) => `--${kebab(name)}: ${value}px;`);
  const cuts = [
    '--corner-scale: 1;',
    ...Object.entries(SHAPES).map(([name, corners]) => `--cut-${kebab(name)}: ${cut(corners)};`),
    // The brand's pebble, turned four ways (neighbours differ), at rest and pressed: the same commands, so one animates into the other.
    ...Array.from({ length: PEBBLE_TURNS }, (_, turn) => [`--pebble-${turn}: ${pebbleShape(turn)};`, `--pebble-${turn}-pressed: ${pebbleShape(turn, 1)};`]).flat(),
  ];
  const swatchClasses = LINE_COLORS.map(color =>
    block(`[data-line='${color}']`, [`--fill: var(--line-${color});`, `--on: var(--line-${color}-on);`, `--tint: var(--line-${color}-tint);`, `--text: var(--line-${color}-text);`]),
  );
  // The slip is dark in both themes: a pigment drawn on it (the snip's emblem and cut) takes its night lift, and a slip's tone glyph the night signals.
  const slipPigments = block("[data-surface='slip']", [
    ...LINE_COLORS.map(color => `--line-${color}: ${LINES.dark[color].fill};`),
    `--slip-ok: ${ROLES.dark.ok};`,
    `--slip-waiting: ${ROLES.dark.waiting};`,
    `--slip-danger: ${ROLES.dark.danger};`,
  ]);
  return [
    '/* GENERATED from packages/design/src/ by web/notes/build/tokens.ts: do not edit. */',
    block(':root', [...geometry, ...cuts, ...modeVariables('light')]),
    `@media (prefers-color-scheme: dark) {\n${block(":root:not([data-theme='light'])", modeVariables('dark'), '  ')}\n}`,
    block(":root[data-theme='dark']", modeVariables('dark')),
    slipPigments,
    ...swatchClasses,
    ...finishRules('light', ':root'),
    `@media (prefers-color-scheme: dark) {\n${finishRules('dark', ":root:not([data-theme='light'])", '  ').join('\n')}\n}`,
    ...finishRules('dark', ":root[data-theme='dark']"),
    '',
  ].join('\n');
}

/** The browser chrome colour: the top of each theme's ground. */
export function themeColors(): { light: string; dark: string } {
  return { light: groundPaint(DEFAULT_APPEARANCE.ground, 'light').top, dark: groundPaint(DEFAULT_APPEARANCE.ground, 'dark').top };
}
