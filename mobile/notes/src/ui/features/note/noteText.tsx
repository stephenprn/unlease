/**
 * A formatted note's words on the phone (`notes/services/noteBody`): in its editor (17 on 26, a
 * heading larger on the same 26 line, so a ruled paper stays in step with every line), embedded in
 * a page (16 on 23, the same way) and on its card (15 on 21, as written: a heading is a bold line,
 * never bigger). Bold takes the next family, italic leans, underline underlines.
 */
import React, { memo, useMemo } from 'react';
import type { TextStyle } from 'react-native';

import type { HeadingLevel, NoteLine } from '@unlease/notes/services/noteBody';
import { MENTION_CHAR, type Marks } from '@unlease/core/services/richText';

import { AppText } from '../../components';
import { useTheme } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { fontFamily, type Weight } from '../../theme/typography';
import { cardPieces, type CardPiece } from './cardPieces';

/** Where the words are read: the note's own editor, or a page the note is embedded in. */
export type NotePlace = 'editor' | 'embed';

interface LevelType {
  readonly weight: Weight;
  readonly bold: Weight;
  readonly size: number;
  readonly letterSpacing?: number;
}

/** Every line of a place takes its height, headings included. */
const PLACES: Readonly<Record<NotePlace, { readonly line: number; readonly levels: Readonly<Record<HeadingLevel, LevelType>> }>> = {
  editor: {
    line: 26,
    levels: {
      0: { weight: 'Regular', bold: 'SemiBold', size: 17 },
      1: { weight: 'Bold', bold: 'Bold', size: 24, letterSpacing: -0.3 },
      2: { weight: 'SemiBold', bold: 'Bold', size: 20, letterSpacing: -0.1 },
      3: { weight: 'Bold', bold: 'Bold', size: 17 },
    },
  },
  embed: {
    line: 23,
    levels: {
      0: { weight: 'Regular', bold: 'SemiBold', size: 16 },
      1: { weight: 'Bold', bold: 'Bold', size: 21, letterSpacing: -0.3 },
      2: { weight: 'SemiBold', bold: 'Bold', size: 18, letterSpacing: -0.1 },
      3: { weight: 'Bold', bold: 'Bold', size: 16 },
    },
  },
};

/** Styles made once per theme and look, so the runs' text keeps the same style objects from one keystroke to the next. */
const made = new WeakMap<Theme, Map<string, TextStyle>>();

function cached(theme: Theme, key: string, make: () => TextStyle): TextStyle {
  let styles = made.get(theme);
  if (!styles) {
    styles = new Map();
    made.set(theme, styles);
  }
  let style = styles.get(key);
  if (!style) {
    style = make();
    styles.set(key, style);
  }
  return style;
}

/** A run's look in a line of `heading`, at `place`. */
export function noteRunStyle(theme: Theme, place: NotePlace, heading: HeadingLevel, marks: Marks): TextStyle {
  return cached(theme, `${place}|${heading}|${marks.b ? 'b' : ''}${marks.i ? 'i' : ''}${marks.u ? 'u' : ''}`, () => {
    const type = PLACES[place].levels[heading];
    return {
      fontFamily: fontFamily(theme, marks.b ? type.bold : type.weight),
      fontSize: type.size,
      lineHeight: PLACES[place].line,
      ...(type.letterSpacing !== undefined ? { letterSpacing: type.letterSpacing } : {}),
      color: theme.color.ink,
      ...(marks.i ? { fontStyle: 'italic' as const } : {}),
      ...(marks.u ? { textDecorationLine: 'underline' as const } : {}),
    };
  });
}

/**
 * A line break before a heading, in the plain type with a decoration colour nothing draws (there is
 * no decoration): a heading turned back into text, even an empty one, then changes what a field is
 * given, so a field that took the break away gets it back.
 */
function headingBreakStyle(theme: Theme, place: NotePlace): TextStyle {
  return cached(theme, `${place}|break`, () => ({ ...noteRunStyle(theme, place, 0, {}), textDecorationColor: theme.color.ink }));
}

/** `next`: the heading of the line after it, or null for the last line (no break). */
const LineRuns = memo(function LineRunsView({ line, place, next }: { line: NoteLine; place: NotePlace; next: HeadingLevel | null }) {
  const theme = useTheme();
  return (
    <>
      {line.runs.map((run, index) => (
        <AppText key={index} style={noteRunStyle(theme, place, line.heading, run.kind === 'text' ? run.marks : {})}>
          {run.kind === 'text' ? run.text : MENTION_CHAR}
        </AppText>
      ))}
      {next === null ? null : next > 0 ? <AppText style={headingBreakStyle(theme, place)}>{'\n'}</AppText> : '\n'}
    </>
  );
});

/**
 * The lines as nested text, a line break after each but the last: inside a text field or a text.
 * The break lies outside the runs, in the field's own type, so it never makes a line taller.
 */
export function NoteRuns({ lines, place }: { lines: readonly NoteLine[]; place: NotePlace }) {
  return (
    <>
      {lines.map((line, index) => (
        <LineRuns key={index} line={line} place={place} next={index === lines.length - 1 ? null : lines[index + 1]!.heading} />
      ))}
    </>
  );
}

function cardPieceStyle(theme: Theme, piece: CardPiece): TextStyle {
  return cached(theme, `card|${piece.bold ? 'b' : ''}${piece.italic ? 'i' : ''}${piece.underline ? 'u' : ''}${piece.match ? 'm' : ''}`, () => ({
    ...(piece.bold ? { fontFamily: fontFamily(theme, 'Bold') } : {}),
    ...(piece.italic ? { fontStyle: 'italic' as const } : {}),
    ...(piece.underline ? { textDecorationLine: 'underline' as const } : {}),
    // The peach alone marks a match: no underline (`cardPieces`).
    ...(piece.match ? { backgroundColor: theme.color.highlight } : {}),
  }));
}

export interface CardNoteTextProps {
  /** What the card shows of the body (`noteCardLines`), as the wall sized it. */
  readonly lines: readonly NoteLine[];
  /** The lines the wall gave the body: the text is cut to exactly those. */
  readonly cut: number;
  readonly query: string;
  /** The card's text box and type size, as the wall measured them (`cardInnerWidth`, `fontSize`). */
  readonly width: number;
  readonly size: number;
}

/** A formatted body on its card: as written, at the card's size, cut to the lines the wall counted. */
export const CardNoteText = memo(function CardNoteTextView({ lines, cut, query, width, size }: CardNoteTextProps) {
  const theme = useTheme();
  const pieces = useMemo(() => cardPieces(lines, query, { lines: cut, width, size }), [lines, cut, query, width, size]);
  return (
    <AppText variant="cardBody" numberOfLines={cut} textBreakStrategy="simple">
      {pieces.map((piece, index) =>
        typeof piece === 'string' ? (
          piece
        ) : (
          <AppText key={index} variant="cardBody" style={cardPieceStyle(theme, piece)}>
            {piece.text}
          </AppText>
        ),
      )}
    </AppText>
  );
});
