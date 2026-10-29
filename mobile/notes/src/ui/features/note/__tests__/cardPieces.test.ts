import { cardParagraphs, noteLines } from '@unlease/notes/services/noteBody';
import { textReach } from '@unlease/design/textWrap';

import { cardPieces, type CardPiece } from '../cardPieces';

const CUT = { width: 156, size: 15 };
const pieces = (markup: string, lines: number, query = '') => cardPieces(noteLines(markup, true), query, { ...CUT, lines }).filter((piece): piece is CardPiece => typeof piece !== 'string');

describe('a formatted body on its card', () => {
  it('draws a heading and bold words bold, italic leant', () => {
    const shown = pieces('# Titre\n{b:gras} et {i:penché}', 4);
    expect(shown.map(piece => [piece.text, piece.bold, piece.italic])).toEqual([
      ['Titre', true, false],
      ['gras', true, false],
      [' et ', false, false],
      ['penché', false, true],
    ]);
  });

  it('keeps the lines apart with a break', () => {
    expect(cardPieces(noteLines('un\ndeux', true), '', { ...CUT, lines: 3 })).toEqual([expect.objectContaining({ text: 'un' }), '\n', expect.objectContaining({ text: 'deux' })]);
  });

  it('underlines nothing past the lines before the last one shown', () => {
    const markup = '{u:un long passage souligné qui court sur plusieurs lignes de la carte et plus loin encore}';
    const lines = noteLines(markup, true);
    const reach = textReach(cardParagraphs(lines), CUT.width, CUT.size, 1);
    const shown = pieces(markup, 2);
    let at = 0;
    for (const piece of shown) {
      at += piece.text.length;
      if (piece.underline) expect(at).toBeLessThanOrEqual(reach);
    }
    expect(shown.some(piece => piece.underline)).toBe(true);
    expect(shown.some(piece => !piece.underline)).toBe(true);
    // One line shown: no underline at all.
    expect(pieces(markup, 1).some(piece => piece.underline)).toBe(false);
  });

  it('marks search matches, cutting runs at their edges', () => {
    const shown = pieces('Le {b:croissant} du coin', 3, 'croiss');
    expect(shown.filter(piece => piece.match).map(piece => piece.text)).toEqual(['croiss']);
    expect(shown.find(piece => piece.text === 'ant')?.bold).toBe(true);
  });
});
