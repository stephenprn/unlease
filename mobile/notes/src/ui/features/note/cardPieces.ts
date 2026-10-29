/**
 * A formatted body as its card draws it (`CardNoteText`): pieces of text in one look each, a
 * heading's words and bold ones bold, search matches marked, and an underline only where the card
 * surely lays its line out: React Native 0.88 draws decorations by hand and crashes on one past a
 * cut text's last laid-out line, so none goes beyond the lines before the last one shown.
 */
import { cardParagraphs, linesText, type NoteLine } from '@unlease/notes/services/noteBody';
import { MENTION_CHAR, type Marks } from '@unlease/core/services/richText';
import { matchRanges } from '@unlease/core/services/search';
import { textReach } from '@unlease/design/textWrap';

export interface CardPiece {
  readonly text: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly match: boolean;
}

export interface CardCut {
  /** The lines the wall gave the body. */
  readonly lines: number;
  /** The card's text box and type size, as the wall measured them. */
  readonly width: number;
  readonly size: number;
}

/** The pieces, a line break between lines as a plain string. */
export function cardPieces(lines: readonly NoteLine[], query: string, cut: CardCut): (CardPiece | string)[] {
  const reach = textReach(cardParagraphs(lines), cut.width, cut.size, cut.lines - 1);
  const matches = matchRanges(linesText(lines), query);
  const points = [reach, ...matches.flat()];
  const out: (CardPiece | string)[] = [];
  let at = 0;
  lines.forEach((line, index) => {
    if (index > 0) {
      out.push('\n');
      at += 1;
    }
    for (const run of line.runs) {
      const text = run.kind === 'text' ? run.text : MENTION_CHAR;
      const marks: Marks = run.kind === 'text' ? run.marks : {};
      const cuts = [...new Set([0, text.length, ...points.filter(point => point > at && point < at + text.length).map(point => point - at)])].sort((a, b) => a - b);
      for (let k = 0; k + 1 < cuts.length; k += 1) {
        const from = at + cuts[k]!;
        const to = at + cuts[k + 1]!;
        out.push({
          text: text.slice(cuts[k], cuts[k + 1]),
          bold: line.heading > 0 || !!marks.b,
          italic: !!marks.i,
          underline: !!marks.u && to <= reach,
          match: matches.some(([start, end]) => start <= from && to <= end),
        });
      }
      at += text.length;
    }
  });
  return out;
}
