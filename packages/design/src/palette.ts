/**
 * Every colour the app paints with, for both modes, as data (the web app reads it too).
 * habits-garden's colours (its paper, cards, inks, terracotta and pigments), with matcha for
 * selection, focus and capture and nowhere else: the night ground is a warm black-grey from
 * habits-garden's ink, not its moss. The contrast test in `__tests__/palette.test.ts` is the authority.
 */
import { LINE_COLORS, type LineColor } from './colors';

export type Mode = 'light' | 'dark';

export interface Roles {
  /** The ground everything sits on: habits-garden's paper. */
  readonly wall: string;
  /** A sheet: cards, menus, bars. */
  readonly paper: string;
  /** Text fields: a step lighter than a card by day. */
  readonly field: string;
  /** An image well: a link's placeholder, a photo still loading. Pressed below the ground by day, raised at night. */
  readonly paperHigh: string;
  /** The slip system messages are written on: snackbar, transfer. Dark in both modes. */
  readonly slip: string;
  /** A control drawn on the slip. */
  readonly slipHigh: string;
  readonly onSlip: string;
  readonly onSlipMuted: string;
  /** Action text on the slip (the snackbar's "Annuler"): matcha. */
  readonly slipAction: string;
  readonly ink: string;
  readonly inkMuted: string;
  /** Placeholder and disabled text: habits-garden has two inks, so this is the second one. */
  readonly inkFaint: string;
  readonly hairline: string;
  readonly outline: string;
  /** The boundary of a control drawn by its edge alone (a text field, the empty swatch, a switch that is off): 3:1 on every ground. */
  readonly edge: string;
  /** A sunken track: the segmented control's. */
  readonly track: string;
  /** The edge of a dashed "add" affordance. */
  readonly dashed: string;
  /** Filled buttons: terracotta. */
  readonly action: string;
  readonly onAction: string;
  /** Links and text buttons: the deep terracotta, readable on every ground. */
  readonly link: string;
  /** Selected states and tonal buttons: matcha, a clear step off the ground. */
  readonly actionContainer: string;
  readonly onActionContainer: string;
  /** Neutral selection where matcha would clash: a control on a note's own colour. */
  readonly veil: string;
  /** Focus edges, carets, the selected edge, switches: deep matcha. */
  readonly focus: string;
  /** The matcha pebble: the capture button. */
  readonly leaf: string;
  readonly onLeaf: string;
  readonly danger: string;
  readonly onDanger: string;
  /** Sync dot: everything is in. Deep matcha, the one green. */
  readonly ok: string;
  /** Sync dot: changes wait for the network. */
  readonly waiting: string;
  /** Under sheets, the drawer and every phone overlay: warm ink, as light as Material's 32 % by day; deeper at night, where a dialog's paper is the darkest sheet. */
  readonly scrim: string;
  /** Under a centred dialog on the web, over a soft blur that does part of the dimming. */
  readonly scrimSoft: string;
  readonly highlight: string;
  /** Behind a full-screen photo. */
  readonly viewer: string;
  /** The dark of a lifted bar's edge (the web's bottom bar). */
  readonly shadow: string;
}

export const ROLES: Record<Mode, Roles> = {
  light: {
    wall: '#EDE8D0',
    paper: '#F8F5E6',
    field: '#FBF9EE',
    // A step below the ground, so a well reads on the wall as well as on a card.
    paperHigh: '#DFD7C1',
    slip: '#2E2B25',
    slipHigh: '#474238',
    onSlip: '#F9F4ED',
    onSlipMuted: '#C0B6A5',
    slipAction: '#BFE08A',
    ink: '#201E1D',
    // habits-garden's secondary ink, firmed: 5.9:1 on the ground, 5:1 in a well, 4.7:1 on the matcha wash.
    inkMuted: '#5A574E',
    inkFaint: '#5A574E',
    hairline: 'rgba(32, 30, 29, 0.14)',
    outline: 'rgba(32, 30, 29, 0.22)',
    edge: '#7B7665',
    track: 'rgba(32, 30, 29, 0.07)',
    dashed: 'rgba(32, 30, 29, 0.3)',
    action: '#A75C2A',
    onAction: '#F9F4ED',
    link: '#8C491A',
    // OKLCH 0.85 0.09 127: a wash as pale as the paper read as a stain on it.
    actionContainer: '#BED999',
    onActionContainer: '#223409',
    veil: 'rgba(32, 30, 29, 0.1)',
    focus: '#47681F',
    leaf: '#9CC15F',
    onLeaf: '#201E1D',
    danger: '#9E2B25',
    onDanger: '#F9F4ED',
    ok: '#47681F',
    // Safran, deep enough to hold 3:1 under a hover veil and in a well.
    waiting: '#A86A12',
    scrim: 'rgba(46, 43, 37, 0.32)',
    scrimSoft: 'rgba(46, 43, 37, 0.2)',
    highlight: '#FFC6A5',
    viewer: '#000000',
    shadow: 'rgba(46, 43, 37, 0.16)',
  },
  dark: {
    // A warm black-grey (OKLCH chroma under 0.01, hues 48 to 68), stepped up for cards, fields and the slip:
    // a card stands a clear step off both tones of the ground (1.15:1 at its top, 1.5:1 at its foot).
    wall: '#1A1817',
    paper: '#34312E',
    field: '#3D3A37',
    paperHigh: '#45423F',
    slip: '#44403D',
    slipHigh: '#595653',
    onSlip: '#F9F4ED',
    onSlipMuted: '#B0ABA6',
    slipAction: '#BFE08A',
    ink: '#F9F4ED',
    // Cream at 70%: 4.5:1 on every night paper, well, wash and gradient glow.
    inkMuted: '#B4B0AC',
    inkFaint: '#B4B0AC',
    hairline: 'rgba(249, 244, 237, 0.13)',
    outline: 'rgba(249, 244, 237, 0.19)',
    edge: '#94908B',
    track: 'rgba(249, 244, 237, 0.08)',
    dashed: 'rgba(249, 244, 237, 0.24)',
    action: '#F6A06B',
    onAction: '#1A1817',
    link: '#FFC6A5',
    actionContainer: '#394923',
    onActionContainer: '#DCEBC4',
    veil: 'rgba(249, 244, 237, 0.12)',
    focus: '#B4D67E',
    leaf: '#A3C76A',
    onLeaf: '#1A1817',
    danger: '#FFB4A2',
    onDanger: '#5A1306',
    ok: '#A3C76A',
    waiting: '#E6A447',
    scrim: 'rgba(10, 9, 8, 0.56)',
    scrimSoft: 'rgba(10, 9, 8, 0.48)',
    highlight: '#643312',
    viewer: '#000000',
    shadow: 'rgba(0, 0, 0, 0.4)',
  },
};

export interface LineSwatch {
  /** The pigment: an emblem, a label's tag, a colour chip. */
  readonly fill: string;
  /** Ink written on the fill. */
  readonly on: string;
  /** A note sheet washed in this colour. */
  readonly tint: string;
  /** The pigment as text on a page (coloured words, code): 4.5:1 on every paper, well and wash. */
  readonly text: string;
}

/**
 * habits-garden's earth pigments (`HABIT_PALETTE`), one per stored key; the keys keep their
 * old names because they sync. At night each takes its habits-garden lift (`HABIT_PALETTE_NIGHT`).
 */
const LINE_FILLS: Record<Mode, Record<LineColor, string>> = {
  light: {
    // Safran and Sauge sit a step deeper than habits-garden's, so a tag holds 3:1 under a hover veil.
    yellow: '#A86A12',
    orange: '#C2410C',
    red: '#BD332C',
    pink: '#9F2946',
    magenta: '#7B2036',
    lilac: '#8A65AE',
    violet: '#6B4A8C',
    blue: '#2F5D8C',
    sky: '#2F8787',
    green: '#2F6B52',
    olive: '#8A7514',
    ochre: '#956014',
    brown: '#8C491A',
    grey: '#6E7E52',
  },
  dark: {
    yellow: '#E6A447',
    orange: '#F3723E',
    red: '#DD716C',
    pink: '#DA6F8A',
    magenta: '#D25371',
    lilac: '#B097C9',
    violet: '#9676B7',
    blue: '#538CC5',
    sky: '#40B7B7',
    green: '#449B76',
    olive: '#BDA01B',
    ochre: '#D1871C',
    brown: '#CD6B26',
    grey: '#A9B593',
  },
};

/** habits-garden's two inks for a pigment: whichever the fill contrasts with. */
const FILL_INKS: Record<Mode, readonly [string, string]> = {
  light: ['#201E1D', '#F9F4ED'],
  dark: ['#1A1817', '#F9F4ED'],
};

export function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

export function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** `amount` of `top` over `base`, in sRGB (fine for pale tints). */
export function mix(base: string, top: string, amount: number): string {
  const a = parseHex(base);
  const b = parseHex(top);
  return toHex([0, 1, 2].map(i => a[i]! + (b[i]! - a[i]!) * amount) as [number, number, number]);
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const fromLinear = (c: number): number => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function fromOklab(lightness: number, a: number, b: number): [number, number, number] {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}

/** A colour in OKLCH (lightness, chroma, hue in degrees), its chroma reduced until it fits in sRGB. */
export function oklch(lightness: number, chroma: number, hueDegrees: number): string {
  const hue = (hueDegrees * Math.PI) / 180;
  let c = chroma;
  for (let step = 0; step < 60; step += 1) {
    const rgb = fromOklab(lightness, c * Math.cos(hue), c * Math.sin(hue));
    if (rgb.every(v => v >= -1e-4 && v <= 1 + 1e-4)) return toHex(rgb.map(v => fromLinear(Math.min(1, Math.max(0, v)))) as [number, number, number]);
    c *= 0.93;
  }
  return toHex(fromOklab(lightness, 0, 0).map(v => fromLinear(Math.min(1, Math.max(0, v)))) as [number, number, number]);
}

/**
 * A note's wash, per pigment: hue and chroma in OKLCH. Several habits-garden pigments differ
 * only in depth (raspberry and wine, lavender and violet), which a pale wash erases, so each
 * wash takes its own hue near its pigment's and stays apart from its neighbours.
 */
const WASHES: Record<LineColor, { readonly hue: number; readonly chroma: number }> = {
  yellow: { hue: 92, chroma: 0.065 },
  orange: { hue: 48, chroma: 0.058 },
  red: { hue: 28, chroma: 0.055 },
  pink: { hue: 2, chroma: 0.05 },
  magenta: { hue: 338, chroma: 0.045 },
  lilac: { hue: 306, chroma: 0.045 },
  violet: { hue: 278, chroma: 0.05 },
  blue: { hue: 248, chroma: 0.042 },
  sky: { hue: 198, chroma: 0.04 },
  green: { hue: 160, chroma: 0.04 },
  olive: { hue: 112, chroma: 0.05 },
  ochre: { hue: 72, chroma: 0.055 },
  brown: { hue: 58, chroma: 0.03 },
  grey: { hue: 128, chroma: 0.022 },
};

/**
 * Pale by day under dark ink; at night a dusty tint a step above the black-grey card, under cream,
 * so a coloured note reads as paper and never as a block of colour. Night yellow sits a little
 * lighter, at a warmer hue, so it reads honey.
 */
function noteTint(color: LineColor, mode: Mode): string {
  const { hue, chroma } = WASHES[color];
  if (mode === 'light') return oklch(0.936, chroma, hue);
  return color === 'yellow' ? oklch(0.352, 0.05, 84) : oklch(0.345, Math.min(0.045, chroma * 0.82), hue);
}

const toLinear = (value: number): number => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** OKLCH (lightness, chroma, hue in degrees) of an sRGB colour. */
export function toOklch(hex: string): [number, number, number] {
  const [r, g, b] = parseHex(hex).map(toLinear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [lightness, Math.hypot(a, bb), ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360];
}

/** What a page's coloured words must read on: the papers, the well, and every wash of the mode. */
const TEXT_GROUNDS = (mode: Mode): string[] => [ROLES[mode].wall, ROLES[mode].paper, ROLES[mode].field, ROLES[mode].paperHigh, ...LINE_COLORS.map(color => noteTint(color, mode))];

/** The pigment's hue, darkened by day (lightened at night) a step at a time until it holds 4.6:1 on every ground. */
function textInk(color: LineColor, mode: Mode): string {
  const [lightness, chroma, hue] = toOklch(LINE_FILLS[mode][color]);
  const grounds = TEXT_GROUNDS(mode);
  const step = mode === 'light' ? -0.005 : 0.005;
  for (let l = lightness; l > 0.15 && l < 0.97; l += step) {
    const ink = oklch(l, chroma, hue);
    if (grounds.every(ground => contrast(ink, ground) >= 4.6)) return ink;
  }
  return ROLES[mode].ink;
}

function buildSwatches(mode: Mode): Record<LineColor, LineSwatch> {
  const swatches = {} as Record<LineColor, LineSwatch>;
  const [darkInk, lightInk] = FILL_INKS[mode];
  for (const color of LINE_COLORS) {
    const fill = LINE_FILLS[mode][color];
    swatches[color] = {
      fill,
      on: contrast(fill, darkInk) >= contrast(fill, lightInk) ? darkInk : lightInk,
      tint: noteTint(color, mode),
      text: textInk(color, mode),
    };
  }
  return swatches;
}

export const LINES: Record<Mode, Record<LineColor, LineSwatch>> = {
  light: buildSwatches('light'),
  dark: buildSwatches('dark'),
};

/**
 * The ground every screen lies on: two tones of the wall, lighter at the top and darker at the foot,
 * fixed to the window while the content scrolls over it, under the grain. Every ink, edge and
 * pigment that sits on the wall holds its contrast on both tones (`__tests__/palette`).
 */
export const GROUNDS: Record<Mode, { readonly top: string; readonly bottom: string }> = {
  // Cream to a warmer sand: the foot as deep as the pigments allow (Sarcelle, Safran and Sauge keep 3:1 there).
  light: { top: '#F4F0E2', bottom: '#E8D9B5' },
  dark: { top: '#292725', bottom: '#11100F' },
};

/** The ground as a CSS background layer (React Native reads the same syntax). */
export function groundGradient(mode: Mode): string {
  return `linear-gradient(180deg, ${GROUNDS[mode].top} 0%, ${GROUNDS[mode].bottom} 100%)`;
}

/** The ground's colour `at` (0 the top, 1 the foot) of the window: where a pinned bar meets it. */
export function groundAt(mode: Mode, at: number): string {
  return mix(GROUNDS[mode].top, GROUNDS[mode].bottom, Math.max(0, Math.min(1, at)));
}

/** Paper lifted off the ground, as CSS `box-shadow` (React Native reads the same syntax). */
export const LIFTS: Record<Mode, { readonly card: string; readonly raised: string; readonly float: string }> = {
  light: {
    card: '0 1px 1px rgba(46, 43, 37, 0.05), 0 2px 6px rgba(46, 43, 37, 0.05)',
    raised: '0 2px 3px rgba(46, 43, 37, 0.08), 0 6px 14px rgba(46, 43, 37, 0.09)',
    float: '0 4px 10px rgba(46, 43, 37, 0.12), 0 14px 30px rgba(46, 43, 37, 0.14)',
  },
  dark: {
    card: '0 1px 2px rgba(0, 0, 0, 0.35)',
    raised: '0 2px 6px rgba(0, 0, 0, 0.45)',
    float: '0 6px 20px rgba(0, 0, 0, 0.6)',
  },
};

/** The mark's two colours: its pebble (the tile) and the card the leaf is cut from. */
export interface MarkColors {
  readonly tile: string;
  readonly card: string;
}

/** The mark's two colours, the same by day and night: a deep matcha tile, and the beige card the leaf is cut from. Another primary deepens the tile its own way (`markColors`). */
export const MARK_COLORS = {
  tile: '#5B8A32',
  card: '#F2EAD5',
} as const;

/** Shared by both clients, in their own unit (dp on the phone, px on the web). */
export const GEOMETRY = {
  gap: 8,
  /** Inside a card: room for habits-garden's rounder corners. */
  cardPadding: 14,
  /** Minimum touch target on Android. */
  hit: 48,
} as const;
