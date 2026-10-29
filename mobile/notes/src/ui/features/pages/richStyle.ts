/**
 * How a page's words look on the phone, the web's sizes number for number: a block's type by its
 * kind, then each run's marks over it (bold one weight up, italic leant, code in the monospace on
 * the well, keys a weight up on paper, a colour as its text ink, a highlight as its wash, a link
 * in link ink, underlined). A mention and a date lie on the veil, whole words that are one thing.
 */
import type { TextStyle } from 'react-native';

import type { BlockKind } from '@unlease/notes/models/blocks';
import { isLineColor } from '@unlease/design/colors';
import type { Marks } from '@unlease/core/services/richText';

import type { Theme } from '../../theme/theme';
import { fontFamily, type Weight } from '../../theme/typography';

interface KindType {
  readonly weight: Weight;
  readonly bold: Weight;
  readonly size: number;
  readonly lineHeight: number;
  readonly letterSpacing?: number;
}

const BODY: KindType = { weight: 'Regular', bold: 'SemiBold', size: 17, lineHeight: 26 };

const KIND_TYPES: Partial<Record<BlockKind, KindType>> = {
  h1: { weight: 'Bold', bold: 'Bold', size: 30, lineHeight: 38, letterSpacing: -0.5 },
  h2: { weight: 'SemiBold', bold: 'Bold', size: 24, lineHeight: 32, letterSpacing: -0.3 },
  h3: { weight: 'SemiBold', bold: 'Bold', size: 20, lineHeight: 28, letterSpacing: -0.1 },
  h4: { weight: 'SemiBold', bold: 'Bold', size: 17, lineHeight: 26 },
};

export const kindType = (kind: BlockKind): KindType => KIND_TYPES[kind] ?? BODY;

/** A weight up from a paragraph's, a heading's own: what keys and dates are set in. */
const firmer = (type: KindType): Weight => (type.weight === 'Regular' ? 'Medium' : type.weight);

export function lineHeightOf(kind: BlockKind): number {
  return kindType(kind).lineHeight;
}

/** The block's own type, as its field and every run in it start from. */
export function blockTextStyle(theme: Theme, kind: BlockKind): TextStyle {
  const type = kindType(kind);
  return {
    fontFamily: fontFamily(theme, type.weight),
    fontSize: type.size,
    lineHeight: type.lineHeight,
    ...(type.letterSpacing !== undefined ? { letterSpacing: type.letterSpacing } : {}),
    color: theme.color.ink,
  };
}

/** A run's marks over its block's type. */
export function markStyle(theme: Theme, kind: BlockKind, marks: Marks): TextStyle | null {
  const type = kindType(kind);
  const style: { -readonly [K in keyof TextStyle]: TextStyle[K] } = {};
  // Keys: Signika a weight up and a little smaller, on paper as the web's keys (a field draws no border round a span).
  if (marks.k) {
    style.fontFamily = fontFamily(theme, firmer(type));
    style.fontSize = Math.round(type.size * 0.88);
    style.letterSpacing = 0.3;
    style.backgroundColor = theme.color.paper;
  }
  if (marks.b) style.fontFamily = fontFamily(theme, type.bold);
  if (marks.i) style.fontStyle = 'italic';
  const lines = [marks.u || marks.a ? 'underline' : null, marks.s ? 'line-through' : null].filter(Boolean).join(' ');
  if (lines) style.textDecorationLine = lines as TextStyle['textDecorationLine'];
  if (marks.c) {
    style.fontFamily = 'monospace';
    style.fontSize = Math.round(type.size * 0.86);
    style.backgroundColor = theme.color.paperHigh;
  }
  if (marks.fg && isLineColor(marks.fg)) style.color = theme.line[marks.fg].text;
  if (marks.bg && isLineColor(marks.bg)) style.backgroundColor = theme.line[marks.bg].tint;
  if (marks.a) {
    style.color = theme.color.link;
    style.textDecorationColor = theme.color.link;
  }
  return Object.keys(style).length > 0 ? style : null;
}

/** A mention: its name in link ink on a faint veil; once its subject is gone, muted and leant. */
export function mentionStyle(theme: Theme, gone: boolean): TextStyle {
  return gone ? { color: theme.color.inkMuted, fontStyle: 'italic' } : { color: theme.color.link, backgroundColor: theme.color.veil };
}

/** A date: a mention's veil, in the text's own ink a weight up, for it is a day and leads nowhere. */
export function dateStyle(theme: Theme, kind: BlockKind): TextStyle {
  return { color: theme.color.ink, backgroundColor: theme.color.veil, fontFamily: fontFamily(theme, firmer(kindType(kind))) };
}
