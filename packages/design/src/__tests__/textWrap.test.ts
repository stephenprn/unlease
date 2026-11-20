import { describe, expect, it } from 'vitest';

import { ADVANCES, type AdvanceWeight } from '../advances';
import { textReach, textWidth, wrapLines, wrapRunLines } from '../textWrap';

/** The measure spelled out a character at a time, as the fonts' tables read: what `textWrap` must agree with, whatever way it reads a text. */
const widthByTheBook = (text: string, size: number, weight: AdvanceWeight): number => {
  const table = new Map<number, number>();
  for (const [start, widths] of ADVANCES[weight]) widths.forEach((width, index) => table.set(start + index, width));
  let total = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    total += table.get(code) ?? (code > 0xffff ? 1000 : 560);
  }
  return (total * size * 0.996) / 1000;
};

const linesByTheBook = (text: string, room: number, size: number, weight: AdvanceWeight): number => {
  let lines = 0;
  for (const paragraph of text.split(/\r?\n/)) {
    lines += 1;
    let line = 0;
    let spaces = 0;
    let word = '';
    const lay = (): void => {
      let wide = widthByTheBook(word, size, weight);
      if (wide === 0) return;
      if (line > 0 && line + spaces + wide > room) {
        lines += 1;
        line = 0;
      } else {
        line += spaces;
      }
      while (wide > room) {
        wide -= room;
        lines += 1;
      }
      line += wide;
      word = '';
      spaces = 0;
    };
    for (const char of paragraph) {
      if (char === ' ' || char === '\t') {
        lay();
        spaces += widthByTheBook(char, size, weight);
        continue;
      }
      word += char;
      if (['-', '?', '!', '‐', '–', '—'].includes(char)) lay();
    }
    lay();
  }
  return lines;
};

const TEXTS = [
  'Penser au courrier',
  'Mélanger 500 g de farine avec le sel et la levure dans un grand saladier, puis pétrir dix minutes.',
  'porte-monnaie, arc-en-ciel et qu’est-ce que c’est ? Oui ! Non — peut-être – jamais',
  'https://example.org/un/chemin/assez/long/pour/ne/pas/tenir?sur=une&seule=ligne-du-tout',
  'Des émojis 🎉🎉 au milieu 👩‍👩‍👧 des mots et 日本語のテキスト aussi',
  'tabs\tand  double  spaces\tand a trailing space ',
  'a lone half \ud83c of a pair, and one at the end \ud83c',
  'œuvre, cœur, Ærø, ßtraße, ĳ, Ǆ, ɐɑɒ and Ω ≈ ç √ ∫',
  'ligne une\nligne deux un peu plus longue que la première\n\nligne quatre',
  '',
];

describe('measuring text from the fonts’ advances', () => {
  it('measures a text as the tables spell it, character by character', () => {
    for (const weight of ['regular', 'bold'] as const) {
      for (const text of TEXTS) expect(textWidth(text, 15, weight)).toBeCloseTo(widthByTheBook(text, 15, weight), 6);
    }
  });

  it('breaks lines where a greedy break at spaces and after hyphens does', () => {
    for (const weight of ['regular', 'bold'] as const) {
      for (const room of [60, 156, 320]) {
        for (const text of TEXTS.filter(each => each !== '')) expect(wrapLines(text, room, 15, weight), `${weight} ${room} ${text}`).toBe(linesByTheBook(text, room, 15, weight));
      }
    }
  });

  it('counts runs of one weight as the same text', () => {
    for (const text of TEXTS.filter(each => each !== '' && !each.includes('\n'))) {
      expect(wrapRunLines([[{ text, weight: 'regular' }]], 156, 15)).toBe(wrapLines(text, 156, 15));
    }
  });

  it('reaches into a text by its places, a character outside the first plane taking two', () => {
    const text = '🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉 🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉 fin';
    const reach = textReach([[{ text, weight: 'regular' }]], 156, 15, 1);
    expect(reach).toBe(20);
    expect(text.slice(0, reach)).toBe('🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉');
  });
});
