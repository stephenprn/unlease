/**
 * A block holding line breaks (Maj+Entrée on the web) in the phone's field: cut at each break, the
 * text holding a break either starts its line or has no line height, so typing at the next line's
 * start never lays the line above out wrong on Android (`linePieces`).
 */
import { StyleSheet, type TextStyle } from 'react-native';

import { parseRich, richToPlain, type Run } from '@unlease/core/services/richText';

import { linePieces } from '../RichInput';

const PLAIN: TextStyle = { fontSize: 17, lineHeight: 26 };
const BOLD: TextStyle = { fontSize: 17, lineHeight: 26, fontWeight: '600' };
const styleOf = (run: Run): TextStyle => (run.kind === 'text' && run.marks.b ? BOLD : PLAIN);
const atom = (): string => '@Léa';

const lineHeightOf = (style: unknown): number | undefined => (StyleSheet.flatten(style as TextStyle) ?? {}).lineHeight;

describe('a block’s lines in the phone’s field', () => {
  it.each(['{b:gras} et\nla suite\n\nfin', 'une\ndeux\n', 'Voir {@contact=0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b}\npuis', '\n{b:gras}\n'])('lets no line height start inside a line and reach over its break: %j', markup => {
    const runs = parseRich(markup);
    const pieces = linePieces(runs, styleOf, atom);
    const text = pieces.map(piece => piece.text).join('');
    expect(text).toBe(richToPlain(runs, () => '@Léa'));
    let at = 0;
    for (const piece of pieces) {
      expect(piece.text.slice(0, -1)).not.toContain('\n');
      if (piece.text.endsWith('\n') && lineHeightOf(piece.style) !== undefined) expect(at === 0 || text[at - 1] === '\n').toBe(true);
      at += piece.text.length;
    }
  });

  it('keeps a line of one run whole with its break, and gives a line of several a break with no line height', () => {
    const pieces = linePieces(parseRich('{b:gras} et\nla suite\n\nfin'), styleOf, atom);
    expect(pieces.map(piece => [piece.text, lineHeightOf(piece.style)])).toEqual([
      ['gras', 26],
      [' et', 26],
      ['\n', undefined],
      ['la suite\n', 26],
      ['\n', 26],
      ['fin', 26],
    ]);
  });
});
