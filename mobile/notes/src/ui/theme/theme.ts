/**
 * The themes: day and night, each painted with the device's appearance (its primary colour, its
 * accent and its ground, `design/appearance`). Colour is carried by the tree, never a module
 * constant: `const makeStyles = (t: Theme) => StyleSheet.create(…)` read through `useThemedStyles`.
 */
import { appearanceKey, DEFAULT_APPEARANCE, isDefaultAppearance, resolveAppearance, type Appearance, type GroundPaint } from '@unlease/design/appearance';
import { LIFTS, LINES, type LineSwatch, type Mode, type Roles } from '@unlease/design/palette';
import type { LineColor } from '@unlease/design/colors';

export type ThemeMode = Mode;

export interface Theme {
  readonly mode: ThemeMode;
  readonly color: Roles;
  readonly line: Readonly<Record<LineColor, LineSwatch>>;
  /** Pigments drawn on the slip, which is dark in both themes: the night lifts. */
  readonly slipLine: Readonly<Record<LineColor, LineSwatch>>;
  readonly barStyle: 'dark-content' | 'light-content';
  /** The night theme uses Signika's −30 grade: light-on-dark would read a weight heavier. */
  readonly family: 'Signika' | 'SignikaNight';
  /** The paper's tooth: felt by day, quieter at night, where full strength reads as dust. */
  readonly grain: number;
  /** `boxShadow` for paper off the ground: a card, a raised control, a floating sheet. */
  readonly lift: (typeof LIFTS)[Mode];
  /** habits-garden's press: the ground's own ink laid inside the control's shape; `onDark` for a dark fill. */
  readonly press: { readonly tint: string; readonly onFill: string; readonly onDark: string };
  /** The ground every screen lies on, as the appearance paints it in this mode (CSS layers over a flat colour). */
  readonly ground: GroundPaint;
  /** The ground's film grain (Réglages > Fond); the paper's grain on sheets is a setting of its own. */
  readonly groundGrain: boolean;
}

type Base = Omit<Theme, 'color' | 'ground' | 'groundGrain'>;

const BASES: Readonly<Record<ThemeMode, Base>> = {
  light: {
    mode: 'light',
    line: LINES.light,
    slipLine: LINES.dark,
    barStyle: 'dark-content',
    family: 'Signika',
    grain: 0.16,
    lift: LIFTS.light,
    press: { tint: 'rgba(32, 30, 29, 0.08)', onFill: 'rgba(32, 30, 29, 0.16)', onDark: 'rgba(249, 244, 237, 0.18)' },
  },
  dark: {
    mode: 'dark',
    line: LINES.dark,
    slipLine: LINES.dark,
    barStyle: 'light-content',
    family: 'SignikaNight',
    grain: 0.08,
    lift: LIFTS.dark,
    press: { tint: 'rgba(249, 244, 237, 0.08)', onFill: 'rgba(26, 24, 23, 0.16)', onDark: 'rgba(249, 244, 237, 0.18)' },
  },
};

function build(mode: ThemeMode, appearance: Appearance): Theme {
  const { roles, ground } = resolveAppearance(appearance, mode);
  return { ...BASES[mode], color: roles, ground, groundGrain: appearance.grain };
}

/** Carnet's own: matcha and terracotta on its grainy two-tone ground. */
export const lightTheme: Theme = build('light', DEFAULT_APPEARANCE);
export const darkTheme: Theme = build('dark', DEFAULT_APPEARANCE);

/** The latest few themes made, so the same choice gives the same object (styles are cached per theme). */
const made = new Map<string, Theme>();

export function themeFor(mode: ThemeMode, appearance: Appearance = DEFAULT_APPEARANCE): Theme {
  if (isDefaultAppearance(appearance)) return mode === 'dark' ? darkTheme : lightTheme;
  const key = `${mode}|${appearanceKey(appearance)}|${appearance.grain ? 'grain' : 'flat'}`;
  let theme = made.get(key);
  if (!theme) {
    theme = build(mode, appearance);
    // A choice and its other mode, and the one before them: enough to go back and forth without remaking.
    if (made.size >= 6) made.delete(made.keys().next().value!);
    made.set(key, theme);
  }
  return theme;
}
