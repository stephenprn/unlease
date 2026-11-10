/**
 * A formatted note's words on the phone (`notes/services/noteBody`): in its editor (17 on 26, a
 * heading larger on the same 26 line, so a ruled paper stays in step with every line), embedded in
 * a page (16 on 23, the same way) and on its card (15 on 21, as written: a heading is a bold line,
 * never bigger). Bold takes the next family, italic leans, underline underlines.
 */
import React, { memo, useMemo } from 'react';
import type { TextStyle } from 'react-native';

import type { HeadingLevel, NoteLine } from '@unlease/notes/services/noteBody';
import { mentionName } from '@unlease/notes/services/noteMentions';
import { dateShown } from '@unlease/core/services/dates';
import { mentionText } from '@unlease/core/services/richDisplay';
import type { AtomRun, Marks, Run } from '@unlease/core/services/richText';

import { AppText } from '../../components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { fontFamily, type Weight } from '@shared/ui/theme/typography';
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

/** The break after a line of several runs (or a heading's, or a mention's): the plain type with no line height of its own (`LineRuns`). */
function looseBreakStyle(theme: Theme, place: NotePlace, beforeHeading: boolean): TextStyle {
  return cached(theme, `${place}|loose${beforeHeading ? '|heading' : ''}`, () => ({ ...(beforeHeading ? headingBreakStyle(theme, place) : noteRunStyle(theme, place, 0, {})), lineHeight: undefined }));
}

/**
 * The editor's field: the plain type with no line height, so the text nested in it takes only its
 * own (`LineRuns`: a line break with none must not inherit the field's).
 */
export function noteFieldStyle(theme: Theme): TextStyle {
  return cached(theme, 'field', () => {
    const { fontFamily: family, fontSize, color } = noteRunStyle(theme, 'editor', 0, {});
    return { fontFamily: family, fontSize, color };
  });
}

/** A line of text written in one run with no mark: its words, else null. */
function plainWords(line: NoteLine): string | null {
  if (line.heading !== 0 || line.runs.length !== 1) return null;
  const run = line.runs[0]!;
  return run.kind === 'text' && !run.marks.b && !run.marks.i && !run.marks.u ? run.text : null;
}

/**
 * What a mention or a date shows in a note's text: « @Léa Martin » (`mentionName`, named by the app
 * from Contacts' records), a date in words. An editor maps its field's text with the same words
 * (`richDisplay`), so offsets stay right.
 */
export function atomText(run: AtomRun): string {
  return run.kind === 'mention' ? mentionText(mentionName(run.target)) : dateShown(run, Date.now());
}

/** A mention in the link's ink, never a different size: the field's text stays as `richDisplay` counts it. */
function atomStyle(theme: Theme, place: NotePlace, heading: HeadingLevel): TextStyle {
  return cached(theme, `${place}|${heading}|atom`, () => ({ ...noteRunStyle(theme, place, heading, {}), color: theme.color.link }));
}

const runStyle = (theme: Theme, place: NotePlace, heading: HeadingLevel, run: Run): TextStyle =>
  run.kind === 'text' ? noteRunStyle(theme, place, heading, run.marks) : atomStyle(theme, place, heading);

/**
 * One line's runs and the break after it. Android gives each nested text its own line height span,
 * which it expects to start a line: one that starts inside a line and reaches over its break makes
 * the field lay the next line out from there, and the line above swallows the words before it, for
 * as long as the field shows it (the « line n-2 » glitch: a line break, then a word typed). A letter
 * typed at a line's start joins the text before it, the one holding the break, so that text either
 * starts its own line or has no line height:
 * - a line of plain words (the most of them) takes its break in its own run, in its own type;
 * - an empty line is its break alone, in the plain type;
 * - any other line (a heading, marks, a mention) is followed by a break with no line height, in the
 *   plain type (its runs give the line its height; the field has none to lend it, `noteFieldStyle`).
 * Before a heading, the break wears a colour nothing draws (`headingBreakStyle`).
 *
 * `next`: the heading of the line after it, or null for the last line (no break). `names`: bumped when
 * the people mentioned may have been renamed (`mentionsVersion`), so a line with a mention draws again.
 */
const LineRuns = memo(function LineRunsView({ line, place, next }: { line: NoteLine; place: NotePlace; next: HeadingLevel | null; names: number }) {
  const theme = useTheme();
  const words = next === null ? null : plainWords(line);
  if (next !== null && (words !== null || line.runs.length === 0)) {
    return <AppText style={next > 0 ? headingBreakStyle(theme, place) : noteRunStyle(theme, place, 0, {})}>{`${words ?? ''}\n`}</AppText>;
  }
  return (
    <>
      {line.runs.map((run, index) => (
        <AppText key={index} style={runStyle(theme, place, line.heading, run)}>
          {run.kind === 'text' ? run.text : atomText(run)}
        </AppText>
      ))}
      {next === null ? null : <AppText style={looseBreakStyle(theme, place, next > 0)}>{'\n'}</AppText>}
    </>
  );
});

/**
 * The lines as nested text, a line break after each but the last: inside a text field (`noteFieldStyle`)
 * or a text. A break never makes a line taller: it is in the plain type, or in the plain line's own.
 */
export function NoteRuns({ lines, place, names = 0 }: { lines: readonly NoteLine[]; place: NotePlace; names?: number }) {
  return (
    <>
      {lines.map((line, index) => (
        <LineRuns key={index} line={line} place={place} next={index === lines.length - 1 ? null : lines[index + 1]!.heading} names={names} />
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
  /** Bumped when the people mentioned may have been renamed (`mentionsVersion`). */
  readonly names?: number;
}

/** A formatted body on its card: as written, at the card's size, cut to the lines the wall counted; a person mentioned by their name. */
export const CardNoteText = memo(function CardNoteTextView({ lines, cut, query, width, size, names = 0 }: CardNoteTextProps) {
  const theme = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `names` stands for the names the pieces read (`mentionName`).
  const pieces = useMemo(() => cardPieces(lines, query, { lines: cut, width, size }), [lines, cut, query, width, size, names]);
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
