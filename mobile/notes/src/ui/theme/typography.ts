/**
 * Type: Signika in four weights and two grades, each weight its own family.
 * Set `fontFamily`, never `fontWeight`: Android maps only four weights per family.
 */
import type { TextStyle } from 'react-native';

import type { Theme } from './theme';

export type Weight = 'Regular' | 'Medium' | 'SemiBold' | 'Bold';

export function fontFamily(theme: Theme, weight: Weight): string {
  return `${theme.family}-${weight}`;
}

interface Variant {
  readonly weight: Weight;
  readonly size: number;
  readonly lineHeight: number;
  readonly letterSpacing?: number;
  readonly ink: 'ink' | 'inkMuted' | 'inkFaint' | 'onSlip' | 'onSlipMuted' | 'action' | null;
  readonly uppercase?: boolean;
}

export const VARIANTS = {
  /** A collection's name on its own page, the welcome. */
  display: { weight: 'Bold', size: 30, lineHeight: 35, letterSpacing: -0.5, ink: 'ink' },
  title: { weight: 'SemiBold', size: 20, lineHeight: 26, letterSpacing: -0.1, ink: 'ink' },
  editorTitle: { weight: 'SemiBold', size: 22, lineHeight: 28, letterSpacing: -0.15, ink: 'ink' },
  editorBody: { weight: 'Regular', size: 17, lineHeight: 26, ink: 'ink' },
  section: { weight: 'SemiBold', size: 14, lineHeight: 20, letterSpacing: 0.1, ink: 'inkMuted' },
  /** Same size as `cardBody`: weight carries the rank. */
  cardTitle: { weight: 'Bold', size: 15, lineHeight: 21, ink: 'ink' },
  cardBody: { weight: 'Regular', size: 15, lineHeight: 21, ink: 'ink' },
  body: { weight: 'Regular', size: 16, lineHeight: 23, ink: 'ink' },
  bodyStrong: { weight: 'SemiBold', size: 16, lineHeight: 23, ink: 'ink' },
  meta: { weight: 'Regular', size: 13, lineHeight: 18, ink: 'inkMuted' },
  metaStrong: { weight: 'SemiBold', size: 13, lineHeight: 18, ink: 'inkMuted' },
  /** Badges, chips, buttons. */
  label: { weight: 'Medium', size: 14, lineHeight: 18, letterSpacing: 0.1, ink: 'ink' },
  /** A chosen navigation place's name. */
  labelStrong: { weight: 'SemiBold', size: 14, lineHeight: 18, letterSpacing: 0.1, ink: 'ink' },
  labelSmall: { weight: 'SemiBold', size: 12, lineHeight: 16, letterSpacing: 0.2, ink: 'ink' },
  /** Signika's figures are tabular by default. */
  price: { weight: 'SemiBold', size: 15, lineHeight: 20, ink: 'ink' },
} as const satisfies Record<string, Variant>;

export type TextVariant = keyof typeof VARIANTS;

export function variantStyle(theme: Theme, variant: TextVariant): TextStyle {
  const v: Variant = VARIANTS[variant];
  return {
    fontFamily: fontFamily(theme, v.weight),
    fontSize: v.size,
    lineHeight: v.lineHeight,
    ...(v.letterSpacing !== undefined ? { letterSpacing: v.letterSpacing } : {}),
    ...(v.ink ? { color: theme.color[v.ink] } : {}),
    ...(v.uppercase ? { textTransform: 'uppercase' as const } : {}),
  };
}
