/**
 * How the app looks on one device beyond its theme: a primary colour and an accent (a pair from the
 * palettes, or each picked precisely), and the ground every screen lies on (a preset gradient or
 * colour, a colour of one's own, or a gradient one generates), grainy or not. Kept in the device's
 * settings, never synced; both clients paint from what `resolveAppearance` gives.
 *
 * Nothing picked breaks the palette's contrast rule (`__tests__/appearance`): a colour that already
 * reads where it goes is used exactly; any other keeps its hue and moves in lightness, the least it
 * must, until it reads. So a ground is pale by day and deep at night, and one choice can show two
 * colours, which the pickers say. The default (Carnet's matcha and terracotta on its grainy
 * two-tone ground) gives back the palette's own values, unchanged.
 */
import { APPS } from '@unlease/core/apps';
import { localized, t, tx } from '@unlease/core/i18n';
import { LINE_COLORS } from './colors';
import { isHex, mixOklab, withAlpha } from './color';
import { GROUNDS, LINES, luminance, MARK_COLORS, mix, oklch, ROLES, toOklch, type MarkColors, type Mode, type Roles } from './palette';

// ---------------------------------------------------------------------------------------------
// The colours: a primary and an accent.

/** The roles the primary colour paints: capture, what is chosen, focus, switches, the slip's action. */
export interface PrimaryRoles {
  readonly leaf: string;
  readonly onLeaf: string;
  readonly focus: string;
  readonly actionContainer: string;
  readonly onActionContainer: string;
  readonly slipAction: string;
}

/** The roles the accent paints: filled buttons, links and text buttons, selected words. */
export interface AccentRoles {
  readonly action: string;
  readonly onAction: string;
  readonly link: string;
  readonly highlight: string;
}

/** Pairs that go together; each colour as a person would pick it: the primary is the capture pebble's, the accent a filled button's. */
export const PALETTES = ['carnet', 'sarcelle', 'myrtille', 'glycine', 'pivoine', 'mimosa', 'ardoise', 'mousse'] as const;

export type PaletteKey = (typeof PALETTES)[number];

export const PALETTE_COLORS: Readonly<Record<PaletteKey, { readonly primary: string; readonly accent: string }>> = {
  // Matcha and terracotta: the palette's own leaf and action.
  carnet: { primary: '#9CC15F', accent: '#A75C2A' },
  sarcelle: { primary: '#6DBDB3', accent: '#B5482F' },
  myrtille: { primary: '#93A9EC', accent: '#A8650C' },
  glycine: { primary: '#C7A3E3', accent: '#7A6A12' },
  pivoine: { primary: '#F2A7BC', accent: '#2F6B52' },
  mimosa: { primary: '#E9C84E', accent: '#2F5D8C' },
  ardoise: { primary: '#9FB6CB', accent: '#A3482A' },
  mousse: { primary: '#B7C46E', accent: '#9F2946' },
};

export const PALETTE_NAMES: Readonly<Record<PaletteKey, string>> = localized({
  // Carnet's own colours, named after it.
  carnet: APPS.notes.name,
  sarcelle: tx('Sarcelle'),
  myrtille: tx('Myrtille'),
  glycine: tx('Glycine'),
  pivoine: tx('Pivoine'),
  mimosa: tx('Mimosa'),
  ardoise: tx('Ardoise'),
  mousse: tx('Mousse'),
});

/** The palette two colours come from, or null when they were picked by hand. */
export function paletteOf(primary: string, accent: string): PaletteKey | null {
  return PALETTES.find(key => PALETTE_COLORS[key].primary === primary && PALETTE_COLORS[key].accent === accent) ?? null;
}

export type ColorRole = 'primary' | 'accent';

/** What each colour is called and what it paints, the same words on both clients. */
export const COLOR_ROLE_WORDS: Readonly<Record<ColorRole, { readonly name: string; readonly title: string; readonly hint: string }>> = {
  primary: localized({ name: tx('Principale'), title: tx('Couleur principale'), hint: tx('Le bouton +, la sélection et les interrupteurs') }),
  accent: localized({ name: tx('Accent'), title: tx('Couleur d’accent'), hint: tx('Les boutons d’action, les liens et le texte sélectionné') }),
};

/** The "how it works" of the colours and of the ground, the same words on both clients. */
export const COLORS_INFO = tx('La couleur principale marque ce qui est choisi : le bouton +, la sélection, les interrupteurs. L’accent fait agir : les boutons d’action et les liens. Une couleur choisie à la main est gardée telle quelle quand le texte reste lisible dessus ; sinon elle garde sa teinte et change juste assez de clarté.');
export const GROUND_INFO = tx('Le fond reste clair le jour et sombre la nuit, pour que le texte se lise toujours : chaque fond a sa version de nuit. Une couleur choisie à la main est gardée telle quelle quand elle s’y prête ; sinon elle garde sa teinte et s’éclaircit ou s’assombrit juste ce qu’il faut.');

// ---------------------------------------------------------------------------------------------
// The ground.

/** Gradients first (Carnet's own two tones, then others and soft clouds), then flat colours. */
export const GROUND_GRADIENTS = ['carnet', 'aube', 'lagon', 'brume', 'sauge', 'nacre', 'opale', 'sorbet'] as const;
export const GROUND_COLORS = ['creme', 'lin', 'pierre', 'nuage', 'menthe', 'ciel', 'lilas', 'rose'] as const;

export type GroundPreset = (typeof GROUND_GRADIENTS)[number] | (typeof GROUND_COLORS)[number];

export const GROUND_PRESETS: readonly GroundPreset[] = [...GROUND_GRADIENTS, ...GROUND_COLORS];

export const GROUND_NAMES: Readonly<Record<GroundPreset, string>> = localized({
  carnet: APPS.notes.name,
  aube: tx('Aube'),
  lagon: tx('Lagon'),
  brume: tx('Brume'),
  sauge: tx('Sauge'),
  nacre: tx('Nacre'),
  opale: tx('Opale'),
  sorbet: tx('Sorbet'),
  creme: tx('Crème'),
  lin: tx('Lin'),
  pierre: tx('Pierre'),
  nuage: tx('Nuage'),
  menthe: tx('Menthe'),
  ciel: tx('Ciel'),
  lilas: tx('Lilas'),
  rose: tx('Rose'),
});

/** A generated gradient: top to foot through every colour (`fondu`), or the colours pooled as soft clouds (`nuees`). */
export const GRADIENT_FORMS = ['fondu', 'nuees'] as const;

export type GradientForm = (typeof GRADIENT_FORMS)[number];

export const GRADIENT_FORM_NAMES: Readonly<Record<GradientForm, string>> = localized({ fondu: tx('Fondu'), nuees: tx('Nuées') });

/** A gradient takes two to four colours. */
export const GRADIENT_COLORS = { min: 2, max: 4 } as const;

export interface GradientSpec {
  /** The colours as picked, top first (`fondu`) or the ground's own first (`nuees`). */
  readonly colors: readonly string[];
  readonly form: GradientForm;
  /** Where the clouds lie: the same seed lays them out the same way. */
  readonly seed: number;
}

export type GroundChoice = { readonly kind: 'preset'; readonly key: GroundPreset } | { readonly kind: 'color'; readonly color: string } | ({ readonly kind: 'gradient' } & GradientSpec);

export interface Appearance {
  readonly primary: string;
  readonly accent: string;
  readonly ground: GroundChoice;
  /** The ground's film grain. */
  readonly grain: boolean;
  /** The last colour and gradient made on this device, kept to be chosen again once another ground is. */
  readonly ownColor: string | null;
  readonly ownGradient: GradientSpec | null;
}

export const DEFAULT_APPEARANCE: Appearance = {
  primary: PALETTE_COLORS.carnet.primary,
  accent: PALETTE_COLORS.carnet.accent,
  ground: { kind: 'preset', key: 'carnet' },
  grain: true,
  ownColor: null,
  ownGradient: null,
};

/** The colours and the ground as they come out of the box (what a person has made is not counted). */
export function isDefaultAppearance(appearance: Appearance): boolean {
  return (
    appearance.primary === DEFAULT_APPEARANCE.primary &&
    appearance.accent === DEFAULT_APPEARANCE.accent &&
    sameGround(appearance.ground, DEFAULT_APPEARANCE.ground) &&
    appearance.grain === DEFAULT_APPEARANCE.grain
  );
}

export function sameGradient(a: GradientSpec, b: GradientSpec): boolean {
  return a.form === b.form && a.seed === b.seed && a.colors.length === b.colors.length && a.colors.every((color, index) => color === b.colors[index]);
}

export function sameGround(a: GroundChoice, b: GroundChoice): boolean {
  if (a.kind === 'preset') return b.kind === 'preset' && a.key === b.key;
  if (a.kind === 'color') return b.kind === 'color' && a.color === b.color;
  return b.kind === 'gradient' && sameGradient(a, b);
}

/** A ground's name as a picker heads it. */
export function groundName(ground: GroundChoice): string {
  if (ground.kind === 'preset') return GROUND_NAMES[ground.key];
  return ground.kind === 'color' ? t('Votre couleur') : t('Votre dégradé');
}

// ---------------------------------------------------------------------------------------------
// Reading stored settings.

const isPreset = (value: unknown): value is GroundPreset => typeof value === 'string' && (GROUND_PRESETS as readonly string[]).includes(value);
const isForm = (value: unknown): value is GradientForm => value === 'fondu' || value === 'nuees';

function readGradient(value: unknown): GradientSpec | null {
  if (typeof value !== 'object' || value === null) return null;
  const { colors, form, seed } = value as Record<string, unknown>;
  if (!Array.isArray(colors) || !colors.every(isHex) || colors.length < GRADIENT_COLORS.min || colors.length > GRADIENT_COLORS.max) return null;
  if (!isForm(form) || typeof seed !== 'number' || !Number.isFinite(seed)) return null;
  return { colors: [...colors], form, seed: Math.trunc(seed) >>> 0 };
}

function readGround(value: unknown): GroundChoice | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.kind === 'preset') return isPreset(record.key) ? { kind: 'preset', key: record.key } : null;
  if (record.kind === 'color') return isHex(record.color) ? { kind: 'color', color: record.color } : null;
  if (record.kind === 'gradient') {
    const gradient = readGradient(record);
    return gradient ? { kind: 'gradient', ...gradient } : null;
  }
  return null;
}

/** The stored appearance, every part checked: what is unreadable falls back to the default. `grain` is the ground's grain when none was stored (the old single grain switch). */
export function parseAppearance(value: unknown, grain = DEFAULT_APPEARANCE.grain): Appearance {
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return {
    primary: isHex(record.primary) ? record.primary : DEFAULT_APPEARANCE.primary,
    accent: isHex(record.accent) ? record.accent : DEFAULT_APPEARANCE.accent,
    ground: readGround(record.ground) ?? DEFAULT_APPEARANCE.ground,
    grain: typeof record.grain === 'boolean' ? record.grain : grain,
    ownColor: isHex(record.ownColor) ? record.ownColor : null,
    ownGradient: readGradient(record.ownGradient),
  };
}

// ---------------------------------------------------------------------------------------------
// Readable: what must hold on a ground, and the nearest colour that holds.

/** Luminances are read again and again while a picker is dragged: each colour's is worked out once. */
const luminances = new Map<string, number>();

function lum(color: string): number {
  let known = luminances.get(color);
  if (known === undefined) {
    if (luminances.size > 4096) luminances.clear();
    known = luminance(color);
    luminances.set(color, known);
  }
  return known;
}

/** WCAG's contrast ratio, from the remembered luminances. */
function ratio(a: string, b: string): number {
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

type Reader = readonly [ink: string, ratio: number];

/** Everything written or drawn straight on the ground, at its own ratio (the palette test's list): inks, edges, the default actions, every pigment. */
function readers(mode: Mode): readonly Reader[] {
  const r = ROLES[mode];
  return [
    [r.ink, 7],
    [r.inkMuted, 4.5],
    [r.danger, 4.5],
    [r.link, 4.5],
    [r.edge, 3],
    [r.action, 3],
    [r.focus, 3],
    ...LINE_COLORS.map((color): Reader => [LINES[mode][color].fill, 3]),
  ];
}

const READERS: Readonly<Record<Mode, readonly Reader[]>> = { light: readers('light'), dark: readers('dark') };

/** At night a card stands a step off the ground: at least this much lighter. */
const CARD_STEP = 1.15;

/** Whether everything that lies on a ground reads on `color`, with `margin` to spare on each ratio (the card's step at night included). */
export function groundReads(color: string, mode: Mode, margin = 0): boolean {
  if (!READERS[mode].every(([ink, least]) => ratio(ink, color) >= least + margin)) return false;
  if (mode === 'light') return true;
  const paper = ROLES.dark.paper;
  return lum(color) < lum(paper) && ratio(paper, color) >= CARD_STEP + margin;
}

/** The colour nearest `seed` in lightness, its hue and chroma kept (as far as sRGB holds them), for which `reads` holds; `seed` itself when it does. */
function nearest(seed: string, reads: (color: string) => boolean, fallback: string): string {
  if (reads(seed)) return seed;
  const [lightness, chroma, hue] = toOklch(seed);
  for (let step = 0.004; step < 1; step += 0.004) {
    for (const candidate of [lightness - step, lightness + step]) {
      if (candidate < 0.02 || candidate > 0.995) continue;
      const color = oklch(candidate, chroma, hue);
      if (reads(color)) return color;
    }
  }
  return fallback;
}

/** The same, from a colour of the seed's hue at `lightness` and `chroma` (a role has its own depth). */
function nearestAt(seed: string, lightness: number, chroma: (own: number) => number, reads: (color: string) => boolean, fallback: string): string {
  const [, own, hue] = toOklch(seed);
  return nearest(oklch(lightness, chroma(own), hue), reads, fallback);
}

/** A colour as a ground of `mode`: itself when everything reads on it; otherwise its hue, paler by day or deeper at night. */
export function fitGround(color: string, mode: Mode, margin = 0): string {
  return nearest(color, candidate => groundReads(candidate, mode, margin), GROUNDS[mode].top);
}

// ---------------------------------------------------------------------------------------------
// The roles a primary and an accent paint.

/** Pure results kept by key, the oldest dropped past `size`: swatches and pickers ask the same again and again. */
function remembered<T>(size: number): (key: string, make: () => T) => T {
  const known = new Map<string, T>();
  return (key, make) => {
    const found = known.get(key);
    if (found !== undefined) return found;
    const made = make();
    if (known.size >= size) known.delete(known.keys().next().value!);
    known.set(key, made);
    return made;
  };
}

const primaryMemo = remembered<PrimaryRoles>(96);
const accentMemo = remembered<AccentRoles>(96);

/** Where the roles are drawn besides the ground: the papers and the well. */
const SURFACES = (mode: Mode): readonly string[] => [ROLES[mode].wall, ROLES[mode].paper, ROLES[mode].paperHigh, ROLES[mode].field];

/** The two inks a fill can carry: whichever reads better. */
const FILL_INKS: Readonly<Record<Mode, readonly [string, string]>> = { light: [ROLES.light.ink, ROLES.light.onAction], dark: [ROLES.dark.onLeaf, ROLES.dark.ink] };

function inkOn(fill: string, mode: Mode): string {
  const [dark, light] = FILL_INKS[mode];
  return ratio(dark, fill) >= ratio(light, fill) ? dark : light;
}

const holdsInk = (fill: string, mode: Mode): boolean => ratio(inkOn(fill, mode), fill) >= 4.5;

const PRIMARY_DEFAULT: Readonly<Record<Mode, PrimaryRoles>> = {
  light: pickPrimary(ROLES.light),
  dark: pickPrimary(ROLES.dark),
};

const ACCENT_DEFAULT: Readonly<Record<Mode, AccentRoles>> = {
  light: pickAccent(ROLES.light),
  dark: pickAccent(ROLES.dark),
};

function pickPrimary(r: Roles): PrimaryRoles {
  return { leaf: r.leaf, onLeaf: r.onLeaf, focus: r.focus, actionContainer: r.actionContainer, onActionContainer: r.onActionContainer, slipAction: r.slipAction };
}

function pickAccent(r: Roles): AccentRoles {
  return { action: r.action, onAction: r.onAction, link: r.link, highlight: r.highlight };
}

/**
 * The primary's roles on a ground showing `ground`: the capture pebble is the colour itself when an
 * ink holds 4.5:1 on it; focus, the tonal wash and its ink, and the slip's action take the colour's
 * hue at the depths the palette gives matcha, moved until they read where they are drawn.
 */
export function primaryRoles(seed: string, mode: Mode, ground: readonly string[] = [GROUNDS[mode].top, GROUNDS[mode].bottom]): PrimaryRoles {
  if (seed === PALETTE_COLORS.carnet.primary) return PRIMARY_DEFAULT[mode];
  return primaryMemo(`${seed}|${mode}|${ground.join(',')}`, () => derivePrimary(seed, mode, ground));
}

function derivePrimary(seed: string, mode: Mode, ground: readonly string[]): PrimaryRoles {
  const day = mode === 'light';
  const r = ROLES[mode];
  const surfaces = [...SURFACES(mode), ...ground];
  const leaf = nearest(seed, color => holdsInk(color, mode), r.leaf);
  const focus = nearestAt(seed, day ? 0.476 : 0.831, own => Math.min(own, 0.12), color => surfaces.every(surface => ratio(color, surface) >= 3), r.focus);
  const actionContainer = nearestAt(seed, day ? 0.85 : 0.381, own => Math.min(own * (day ? 0.7 : 0.5), day ? 0.09 : 0.063), color => ratio(r.ink, color) >= 7 && ratio(r.inkMuted, color) >= 4.5, r.actionContainer);
  const onActionContainer = nearestAt(seed, day ? 0.299 : 0.919, own => Math.min(own * 0.55, day ? 0.07 : 0.054), color => ratio(color, actionContainer) >= 7, r.onActionContainer);
  // The slip is dark in both themes.
  const slipAction = nearestAt(seed, 0.863, own => Math.min(own, 0.12), color => ratio(color, ROLES.light.slip) >= 4.5 && ratio(color, ROLES.dark.slip) >= 4.5, r.slipAction);
  return { leaf, onLeaf: inkOn(leaf, mode), focus, actionContainer, onActionContainer, slipAction };
}

/**
 * The accent's roles: a filled button is the colour itself when it holds its label at 4.5:1 and
 * stands 3:1 off every surface; links a step deeper by day (lighter at night) at 4.5:1; selected
 * words on a pale wash of it by day, a deep one at night.
 */
export function accentRoles(seed: string, mode: Mode, ground: readonly string[] = [GROUNDS[mode].top, GROUNDS[mode].bottom]): AccentRoles {
  if (seed === PALETTE_COLORS.carnet.accent) return ACCENT_DEFAULT[mode];
  return accentMemo(`${seed}|${mode}|${ground.join(',')}`, () => deriveAccent(seed, mode, ground));
}

function deriveAccent(seed: string, mode: Mode, ground: readonly string[]): AccentRoles {
  const day = mode === 'light';
  const r = ROLES[mode];
  const surfaces = [...SURFACES(mode), ...ground];
  const action = nearest(seed, color => holdsInk(color, mode) && surfaces.every(surface => ratio(color, surface) >= 3), r.action);
  const [actionLightness] = toOklch(action);
  const link = nearestAt(action, day ? actionLightness - 0.073 : actionLightness + 0.088, own => own, color => surfaces.every(surface => ratio(color, surface) >= 4.5), r.link);
  const highlight = nearestAt(seed, day ? 0.869 : 0.379, own => Math.min(own * 0.7, day ? 0.08 : 0.083), color => ratio(r.ink, color) >= 4.5, r.highlight);
  return { action, onAction: inkOn(action, mode), link, highlight };
}

// ---------------------------------------------------------------------------------------------
// The mark.

/** How far the card stands off the pebble on Carnet's own mark: every primary keeps it. */
const MARK_STEP = ratio(MARK_COLORS.card, MARK_COLORS.tile);

const markMemo = remembered<MarkColors>(32);

/**
 * The mark in a primary, the same by day and night: the beige card stays, the pebble is the colour
 * itself when the card stands off it as far as on Carnet's own mark, else its hue deepened the least
 * it must. Carnet's primary gives back the mark's own colours.
 */
export function markColors(primary: string): MarkColors {
  if (primary === PALETTE_COLORS.carnet.primary) return MARK_COLORS;
  return markMemo(primary, () => ({ tile: nearest(primary, color => ratio(MARK_COLORS.card, color) >= MARK_STEP, MARK_COLORS.tile), card: MARK_COLORS.card }));
}

// ---------------------------------------------------------------------------------------------
// Painting a ground.

/** A stop of a ground's gradient: a colour, how opaque, and where along the gradient (0 to 1). */
export interface GradientStop {
  readonly color: string;
  readonly alpha: number;
  readonly at: number;
}

/** One layer of a ground: from the top of the window to its foot, or a circle of colour around a point (in fractions of the width and height) out to the farthest corner. */
export type GroundGradient = { readonly kind: 'linear'; readonly stops: readonly GradientStop[] } | { readonly kind: 'radial'; readonly x: number; readonly y: number; readonly stops: readonly GradientStop[] };

/** A ground as both clients paint it: CSS layers over a flat colour, fixed to the window. */
export interface GroundPaint {
  /** The flat colour under the layers. */
  readonly base: string;
  /** Its colour at the window's top and at its foot: the browser's chrome, a pinned band. */
  readonly top: string;
  readonly bottom: string;
  /** CSS image layers, the first on top (React Native reads the same syntax); none for a flat colour. */
  readonly layers: readonly string[];
  /** The same layers as data, for what paints them without CSS (a picture for another service, `servicePictures.ts`). */
  readonly gradients: readonly GroundGradient[];
  /** Every colour it shows, blends included: what the contrast test and the roles read against. */
  readonly colors: readonly string[];
}

const percent = (value: number): string => `${Math.round(value * 1000) / 10}%`;

/** A layer as CSS: a tone's stop as its colour, a cloud's as `rgba()`. */
function gradientCss(gradient: GroundGradient): string {
  if (gradient.kind === 'linear') return `linear-gradient(180deg, ${gradient.stops.map(stop => `${stop.alpha === 1 ? stop.color : withAlpha(stop.color, stop.alpha)} ${percent(stop.at)}`).join(', ')})`;
  return `radial-gradient(circle at ${percent(gradient.x)} ${percent(gradient.y)}, ${gradient.stops.map(stop => `${withAlpha(stop.color, stop.alpha)} ${percent(stop.at)}`).join(', ')})`;
}

/** Tones from the top of the window to its foot, evenly apart. */
function tonesPaint(tones: readonly string[], base = tones[0]!): GroundPaint {
  const top = tones[0]!;
  const bottom = tones[tones.length - 1]!;
  if (tones.length === 1) return { base: top, top, bottom, layers: [], gradients: [], colors: [top] };
  const gradient: GroundGradient = { kind: 'linear', stops: tones.map((tone, index) => ({ color: tone, alpha: 1, at: index / (tones.length - 1) })) };
  return { base, top, bottom, layers: [gradientCss(gradient)], gradients: [gradient], colors: [...tones] };
}

/** The seeded random numbers a layout draws from (mulberry32): the same seed, the same layout. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { random as seededRandom };

/** Where a cloud may pool: the corners and the middles of the sides first, then two inner points. */
const ANCHORS: readonly (readonly [number, number])[] = [
  [6, 4],
  [96, 8],
  [4, 96],
  [94, 94],
  [50, 0],
  [0, 50],
  [100, 54],
  [52, 100],
  [28, 30],
  [72, 68],
];

/** A cloud of colour: full at its centre, fading to the same colour at nothing over `reach`% of its ray, softly at both ends. */
function cloud(color: string, x: number, y: number, reach: number): GroundGradient {
  const stops = [0, 0.2, 0.4, 0.6, 0.8, 1].map(t => ({ color, alpha: 1 - t * t * (3 - 2 * t), at: (t * reach) / 100 }));
  return { kind: 'radial', x: x / 100, y: y / 100, stops };
}

/**
 * A generated colour keeps a little room inside the line, so the blends the browser draws between two
 * (in sRGB, which dips between hues) stay readable: darker by day, lighter at night.
 */
const BLEND_ROOM: Readonly<Record<Mode, number>> = { light: 0.3, dark: 0.06 };

/** A generated gradient for `mode`: every colour fitted to the ground's band, the blends between them too. */
export function gradientPaint(spec: GradientSpec, mode: Mode): GroundPaint {
  const fit = (color: string): string => fitGround(color, mode, BLEND_ROOM[mode]);
  const fitted = spec.colors.map(fit);
  if (fitted.length === 0) return tonesPaint([GROUNDS[mode].top]);
  if (spec.form === 'fondu' || fitted.length === 1) {
    // Four steps through OKLab between neighbours, so two hues meet without passing through grey.
    const tones: string[] = [];
    fitted.forEach((color, index) => {
      const next = fitted[index + 1];
      if (!next) {
        tones.push(color);
        return;
      }
      for (let step = 0; step < 4; step += 1) tones.push(step === 0 ? color : fit(mixOklab(color, next, step / 4)));
    });
    return tonesPaint(tones);
  }
  const draw = random(spec.seed);
  const anchors = ANCHORS.map(anchor => ({ anchor, order: draw() }))
    .sort((a, b) => a.order - b.order)
    .map(entry => entry.anchor);
  const [ground, ...others] = fitted as [string, ...string[]];
  // One colour over the ground: a second cloud of their blend keeps it from reading as a spot.
  const pooled = others.length === 1 ? [others[0]!, fit(mixOklab(ground, others[0]!, 0.5))] : others;
  const clouds = pooled.map((color, index) => {
    const [x, y] = anchors[index]!;
    const jitter = (): number => (draw() - 0.5) * 16;
    return cloud(color, Math.min(100, Math.max(0, x + jitter())), Math.min(100, Math.max(0, y + jitter())), 62 + draw() * 26);
  });
  // Lighter at the top, as Carnet's own ground.
  const [lightness, chroma, hue] = toOklch(ground);
  const top = fit(oklch(Math.min(0.985, lightness + (mode === 'light' ? 0.035 : 0.012)), chroma * 0.8, hue));
  // Where two of them overlap the browser blends them: every pair's middle is read too.
  const shown = [ground, top, ...pooled];
  const blends = shown.flatMap((color, index) => shown.slice(index + 1).map(other => mix(color, other, 0.5)));
  const gradients: GroundGradient[] = [
    ...clouds,
    {
      kind: 'linear',
      stops: [
        { color: top, alpha: 1, at: 0 },
        { color: ground, alpha: 1, at: 1 },
      ],
    },
  ];
  return {
    base: ground,
    top: mix(top, pooled[0]!, 0.25),
    bottom: ground,
    layers: gradients.map(gradientCss),
    gradients,
    colors: [...shown, ...blends],
  };
}

type Recipe = { readonly kind: 'tones'; readonly tones: Readonly<Record<Mode, readonly string[]>>; readonly base?: Readonly<Record<Mode, string>> } | { readonly kind: 'gradient'; readonly spec: GradientSpec };

const tones = (light: readonly string[], dark: readonly string[]): Recipe => ({ kind: 'tones', tones: { light, dark } });
const clouds = (colors: readonly string[], seed: number): Recipe => ({ kind: 'gradient', spec: { colors, form: 'nuees', seed } });

/** Each preset by day and at night, every tone holding the ground's ratios (the test reads them all). */
const RECIPES: Readonly<Record<GroundPreset, Recipe>> = {
  // The palette's own ground, on the wall as it always lay.
  carnet: { kind: 'tones', tones: { light: [GROUNDS.light.top, GROUNDS.light.bottom], dark: [GROUNDS.dark.top, GROUNDS.dark.bottom] }, base: { light: ROLES.light.wall, dark: ROLES.dark.wall } },
  aube: tones(['#FEEDDB', '#FCD0CF'], ['#31210E', '#1F0809']),
  lagon: tones(['#DCF7EF', '#BCE4F1'], ['#0C2B23', '#00141A']),
  brume: tones(['#E9F1FA', '#D9DAF3'], ['#1D252E', '#0F0D21']),
  sauge: tones(['#EEF3E1', '#E4DEB8'], ['#222715', '#141100']),
  nacre: clouds(['#F7EFE6', '#F9D9E6', '#D3EBF2', '#E4DCFA'], 7),
  opale: clouds(['#E3F4EE', '#D8D3F6', '#CFE6FB'], 3),
  sorbet: clouds(['#FDEBD8', '#FCD3DC', '#FBE7B8'], 11),
  creme: tones(['#EEE8D1'], ['#201E1C']),
  lin: tones(['#EEE7DB'], ['#251E13']),
  pierre: tones(['#E7E2DE'], ['#231E1B']),
  nuage: tones(['#E4E8EC'], ['#1C1F22']),
  menthe: tones(['#D8EEE1'], ['#0E2419']),
  ciel: tones(['#D5ECF8'], ['#0A222D']),
  lilas: tones(['#ECE3F8'], ['#231B2D']),
  rose: tones(['#FBE0E3'], ['#2E181B']),
};

const paintMemo = remembered<GroundPaint>(96);

/** A ground choice painted for `mode` (worked out once per choice and mode). */
export function groundPaint(ground: GroundChoice, mode: Mode): GroundPaint {
  return paintMemo(`${mode}|${groundKey(ground)}`, () => paintGround(ground, mode));
}

function paintGround(ground: GroundChoice, mode: Mode): GroundPaint {
  if (ground.kind === 'color') return tonesPaint([fitGround(ground.color, mode)]);
  if (ground.kind === 'gradient') return gradientPaint(ground, mode);
  const recipe = RECIPES[ground.key];
  if (recipe.kind === 'gradient') return gradientPaint(recipe.spec, mode);
  return tonesPaint(recipe.tones[mode], recipe.base?.[mode]);
}

/** The ground as a CSS `background` value: every layer fixed to the window, over its flat colour (the web's `--ground-layers`). */
export function groundBackground(paint: GroundPaint): string {
  if (paint.layers.length === 0) return paint.base;
  return paint.layers.map((layer, index) => (index === paint.layers.length - 1 ? `${layer} fixed ${paint.base}` : `${layer} fixed`)).join(', ');
}

/** A preset's own gradient spec, when it is a generated one (a starting point for the generator). */
export function presetGradient(key: GroundPreset): GradientSpec | null {
  const recipe = RECIPES[key];
  return recipe.kind === 'gradient' ? recipe.spec : null;
}

// ---------------------------------------------------------------------------------------------
// Everything at once.

export interface ResolvedAppearance {
  /** The palette's roles for the mode, with the primary's and the accent's. */
  readonly roles: Roles;
  readonly ground: GroundPaint;
}

const resolved = new Map<string, ResolvedAppearance>();

const groundKey = (ground: GroundChoice): string => (ground.kind === 'preset' ? ground.key : ground.kind === 'color' ? ground.color : `${ground.form}:${ground.seed}:${ground.colors.join(',')}`);

/** A stable key for what an appearance paints (its grain aside): equal keys paint alike. */
export function appearanceKey(appearance: Pick<Appearance, 'primary' | 'accent' | 'ground'>): string {
  return `${appearance.primary}|${appearance.accent}|${groundKey(appearance.ground)}`;
}

/** The roles and the ground an appearance paints in `mode`, worked out once. */
export function resolveAppearance(appearance: Pick<Appearance, 'primary' | 'accent' | 'ground'>, mode: Mode): ResolvedAppearance {
  const key = `${mode}|${appearanceKey(appearance)}`;
  const known = resolved.get(key);
  if (known) return known;
  const ground = groundPaint(appearance.ground, mode);
  const made: ResolvedAppearance = {
    roles: { ...ROLES[mode], ...primaryRoles(appearance.primary, mode, ground.colors), ...accentRoles(appearance.accent, mode, ground.colors) },
    ground,
  };
  // A picker dragged across the square resolves many: keep the latest few.
  if (resolved.size > 48) resolved.delete(resolved.keys().next().value!);
  resolved.set(key, made);
  return made;
}

// ---------------------------------------------------------------------------------------------
// Generating.

/** A new seed for the same colours: the clouds lie elsewhere. */
export function shuffleSeed(seed: number): number {
  return Math.floor(random(seed ^ 0x9e3779b9)() * 0x7fffffff);
}

/** Hue steps that go together: neighbours, a soft opposite, three apart. */
const HARMONIES: readonly (readonly number[])[] = [
  [0, 32, -28, 64],
  [0, 26, 180, 206],
  [0, 150, 210, 30],
  [0, 120, 240, 60],
];

/** A gradient drawn at random from `seed`: two to four colours in harmony, pale and clear as a person would pick them, as clouds or a blend. */
export function randomGradient(seed: number): GradientSpec {
  const draw = random(seed);
  const hue = draw() * 360;
  const harmony = HARMONIES[Math.floor(draw() * HARMONIES.length)]!;
  const count = GRADIENT_COLORS.min + Math.min(GRADIENT_COLORS.max - GRADIENT_COLORS.min, Math.floor(draw() * 2.6));
  const colors = harmony.slice(0, count).map(step => oklch(0.86 + draw() * 0.08, 0.05 + draw() * 0.06, (hue + step + (draw() - 0.5) * 12 + 360) % 360));
  return { colors, form: draw() < 0.55 ? 'nuees' : 'fondu', seed: Math.floor(draw() * 0x7fffffff) };
}

// ---------------------------------------------------------------------------------------------
// Saying what a picker did.

export type PickTarget = ColorRole | 'ground';

/** Whether a colour picked for `target` shows as something else in `mode` (moved to read), on a ground showing `ground`. */
export function pickAdjusted(target: PickTarget, color: string, mode: Mode, ground?: readonly string[]): boolean {
  if (target === 'ground') return fitGround(color, mode) !== color;
  if (target === 'primary') return primaryRoles(color, mode, ground).leaf !== color;
  return accentRoles(color, mode, ground).action !== color;
}

/** A colour to start from in a picker, with the name it is announced by. */
export interface PickSuggestion {
  readonly name: string;
  readonly color: string;
}

/** Carnet's own colours for what is picked, to start from: each palette's primary or accent, or the plain grounds as they are by day. */
export function pickSuggestions(target: PickTarget): readonly PickSuggestion[] {
  if (target === 'ground') return GROUND_COLORS.map(key => ({ name: GROUND_NAMES[key], color: groundPaint({ kind: 'preset', key }, 'light').base }));
  return PALETTES.map(key => ({
    name: target === 'primary' ? t('Principale de {palette}', { palette: PALETTE_NAMES[key] }) : t('Accent de {palette}', { palette: PALETTE_NAMES[key] }),
    color: PALETTE_COLORS[key][target],
  }));
}

/** What a picker says of the colour under its preview: kept as picked by day and at night, or where it moved to stay readable. */
export interface PickNote {
  readonly text: string;
  readonly adjusted: boolean;
}

/** The line under a picker's preview: it always says something, so the picker never changes height as a drag crosses into a colour that moves. */
export function pickNote(day: boolean, night: boolean): PickNote {
  if (day && night) return { text: t('Ajustée le jour et la nuit pour rester lisible.'), adjusted: true };
  if (day) return { text: t('Ajustée le jour pour rester lisible.'), adjusted: true };
  if (night) return { text: t('Ajustée la nuit pour rester lisible.'), adjusted: true };
  return { text: t('Gardée telle quelle le jour et la nuit.'), adjusted: false };
}

/** The longest line `pickNote` can say in this language: the room a picker keeps for it, whatever it says. */
export function longestPickNote(): string {
  const all = [pickNote(true, true), pickNote(true, false), pickNote(false, true), pickNote(false, false)].map(note => note.text);
  return all.reduce((longest, text) => (text.length > longest.length ? text : longest));
}
