/**
 * A colour as a person picks it: a hex code typed or pasted, a point on a picker (hue, saturation,
 * value), a blend between two colours. Pure, shared by both clients' pickers and by the appearance
 * (`appearance.ts`).
 */
import { oklch, parseHex, toHex, toOklch } from './palette';

/** `#RRGGBB` in capitals, from what a person types: `#abc`, `abc`, `#aabbcc` or `aabbcc`; null when it is none of them. */
export function normalizeHex(input: string): string | null {
  const clean = input.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(clean)) return `#${[...clean].map(digit => digit + digit).join('')}`.toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(clean)) return `#${clean}`.toUpperCase();
  return null;
}

/** A stored colour: `#RRGGBB` in capitals, as `normalizeHex` writes it. */
export function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9A-F]{6}$/.test(value);
}

/** A point on a picker: the hue in degrees (0 to 360), saturation and value from 0 to 1. */
export interface Hsv {
  readonly h: number;
  readonly s: number;
  readonly v: number;
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const hue = (((h % 360) + 360) % 360) / 60;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs((hue % 2) - 1));
  const [r, g, b] = hue < 1 ? [chroma, x, 0] : hue < 2 ? [x, chroma, 0] : hue < 3 ? [0, chroma, x] : hue < 4 ? [0, x, chroma] : hue < 5 ? [x, 0, chroma] : [chroma, 0, x];
  const m = v - chroma;
  return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

/** The picker's point for a colour. A grey has no hue of its own: it keeps `hue` (where the picker's hue stood), so the thumb does not jump. */
export function hexToHsv(hex: string, hue = 0): Hsv {
  const [r, g, b] = parseHex(hex).map(value => value / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = hue;
  if (delta > 0) {
    if (max === r) h = 60 * (((g - b) / delta + 6) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

/** The hue strip under a picker's square: the six primaries and back, left to right. */
export const HUE_SPECTRUM = 'linear-gradient(to right, #FF0000 0%, #FFFF00 16.67%, #00FF00 33.33%, #00FFFF 50%, #0000FF 66.67%, #FF00FF 83.33%, #FF0000 100%)';

/** The picker's square for a hue: white to the hue left to right, to black downwards (CSS layers, which React Native reads too). */
export function saturationValuePaint(hue: number): { readonly backgroundColor: string; readonly backgroundImage: string } {
  return {
    backgroundColor: hsvToHex({ h: hue, s: 1, v: 1 }),
    backgroundImage: 'linear-gradient(to top, #000000 0%, rgba(0, 0, 0, 0) 100%), linear-gradient(to right, #FFFFFF 0%, rgba(255, 255, 255, 0) 100%)',
  };
}

function toLab(hex: string): [number, number, number] {
  const [lightness, chroma, hue] = toOklch(hex);
  const radians = (hue * Math.PI) / 180;
  return [lightness, chroma * Math.cos(radians), chroma * Math.sin(radians)];
}

/** `amount` of the way from `from` to `to`, through OKLab: two hues meet without the grey an sRGB blend passes through. */
export function mixOklab(from: string, to: string, amount: number): string {
  const a = toLab(from);
  const b = toLab(to);
  const [lightness, x, y] = a.map((value, index) => value + (b[index]! - value) * amount) as [number, number, number];
  return oklch(lightness, Math.hypot(x, y), ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

/** A colour as `rgba()` at `alpha`: a glow fades to its own colour, never towards black. */
export function withAlpha(hex: string, alpha: number): string {
  return `rgba(${parseHex(hex).join(', ')}, ${Math.round(alpha * 1000) / 1000})`;
}
