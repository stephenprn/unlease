import {
  concatRich,
  deleteRich,
  inlineShortcut,
  insertRich,
  isRichEmpty,
  markupToPlain,
  marksAt,
  MENTION_CHAR,
  parseRich,
  rangeHas,
  rangeValue,
  richFromPlain,
  richLength,
  serializeRich,
  setFlag,
  setValue,
  sliceRich,
  type Run,
} from '../richText';
import { mergeText } from '../../sync/textMerge';

const plain = (text: string): Run => ({ kind: 'text', text, marks: {} });

describe('rich text markup', () => {
  it('reads plain text as it is, and escapes what would be markup', () => {
    expect(parseRich('Bonjour')).toEqual([plain('Bonjour')]);
    expect(serializeRich([plain('a {b} c \\ d')])).toBe('a \\{b\\} c \\\\ d');
    expect(parseRich('a \\{b\\} c \\\\ d')).toEqual([plain('a {b} c \\ d')]);
    expect(parseRich('')).toEqual([]);
  });

  it('round-trips marks, links and mentions', () => {
    const runs: Run[] = [
      plain('Voir '),
      { kind: 'text', text: 'ce site', marks: { b: true, a: 'https://exemple.fr/a?b=1,2:3' } },
      plain(', puis '),
      { kind: 'mention', target: { type: 'page', id: 'p1' } },
      { kind: 'text', text: ' {vite}', marks: { i: true, fg: 'red', bg: 'yellow' } },
    ];
    const markup = serializeRich(runs);
    expect(markup).toBe('Voir {b,a=https\\://exemple.fr/a?b=1\\,2\\:3:ce site}, puis {@page=p1}{i,fg=red,bg=yellow: \\{vite\\}}');
    expect(parseRich(markup)).toEqual(runs);
  });

  it('never throws on text a merge cut, and keeps every character', () => {
    expect(parseRich('{b:gras sans fin')).toEqual([{ kind: 'text', text: 'gras sans fin', marks: { b: true } }]);
    expect(parseRich('a } b')).toEqual([plain('a } b')]);
    expect(parseRich('{pas une marque')).toEqual([plain('{pas une marque')]);
    expect(parseRich('{b:un{i:deux}}')).toEqual([
      { kind: 'text', text: 'un', marks: { b: true } },
      { kind: 'text', text: 'deux', marks: { i: true } },
      plain('}'),
    ]);
    expect(parseRich('{zz,b:inconnue}')).toEqual([{ kind: 'text', text: 'inconnue', marks: { b: true } }]);
    expect(parseRich('{@note=}')).toEqual([plain('{@note=}')]);
    expect(parseRich('fin \\')).toEqual([plain('fin \\')]);
  });

  it('merges two devices formatting different words of one paragraph', () => {
    const base = serializeRich([plain('Le chat dort sur le canapé')]);
    const bold = serializeRich([plain('Le '), { kind: 'text', text: 'chat', marks: { b: true } }, plain(' dort sur le canapé')]);
    const edited = serializeRich([plain('Le chat dort sur le vieux canapé')]);
    const merged = parseRich(mergeText(base, bold, edited));
    expect(merged).toEqual([plain('Le '), { kind: 'text', text: 'chat', marks: { b: true } }, plain(' dort sur le vieux canapé')]);
  });

  it('counts a mention as one character', () => {
    const runs = parseRich('a{@link=l1}b');
    expect(richLength(runs)).toBe(3);
    expect(markupToPlain('a{@link=l1}b')).toBe(`a${MENTION_CHAR}b`);
    expect(markupToPlain('a{@link=l1}b', () => 'X')).toBe('aXb');
    expect(sliceRich(runs, 1, 2)).toEqual([{ kind: 'mention', target: { type: 'link', id: 'l1' } }]);
  });

  it('slices, joins, inserts and deletes across runs', () => {
    const runs = parseRich('ab{b:cd}ef');
    expect(sliceRich(runs, 1, 3)).toEqual([plain('b'), { kind: 'text', text: 'c', marks: { b: true } }]);
    expect(concatRich(sliceRich(runs, 0, 3), sliceRich(runs, 3))).toEqual(runs);
    expect(serializeRich(insertRich(runs, 3, [{ kind: 'text', text: 'X', marks: { b: true } }]))).toBe('ab{b:cXd}ef');
    expect(serializeRich(deleteRich(runs, 1, 5))).toBe('af');
  });

  it('sets and clears marks over a range', () => {
    const runs = richFromPlain('un deux trois');
    const bold = setFlag(runs, 3, 7, 'b', true);
    expect(serializeRich(bold)).toBe('un {b:deux} trois');
    expect(rangeHas(bold, 3, 7, 'b')).toBe(true);
    expect(rangeHas(bold, 2, 7, 'b')).toBe(false);
    expect(serializeRich(setFlag(bold, 0, 13, 'b', false))).toBe('un deux trois');
    const red = setValue(bold, 0, 7, 'fg', 'red');
    expect(serializeRich(red)).toBe('{fg=red:un }{b,fg=red:deux} trois');
    expect(rangeValue(red, 0, 7, 'fg')).toBe('red');
    expect(rangeValue(red, 0, 9, 'fg')).toBeNull();
    expect(serializeRich(setValue(red, 0, 13, 'fg', null))).toBe('un {b:deux} trois');
  });

  it('continues the marks before the caret, except a link and code', () => {
    const runs = parseRich('{b,a=https\\://x.fr:lien}{c:code}');
    expect(marksAt(runs, 4)).toEqual({ b: true });
    expect(marksAt(runs, 8)).toEqual({});
  });

  it('turns markdown typed inline into marks', () => {
    expect(inlineShortcut(richFromPlain('du **gras**'), 11)).toEqual({ runs: [plain('du '), { kind: 'text', text: 'gras', marks: { b: true } }], caret: 7 });
    expect(serializeRich(inlineShortcut(richFromPlain('un *mot*'), 8)!.runs)).toBe('un {i:mot}');
    expect(serializeRich(inlineShortcut(richFromPlain('`x = 1`'), 7)!.runs)).toBe('{c:x = 1}');
    expect(serializeRich(inlineShortcut(richFromPlain('~~non~~ oui'), 7)!.runs)).toBe('{s:non} oui');
    expect(inlineShortcut(richFromPlain('2 * 3 *'), 7)).toBeNull();
    expect(inlineShortcut(richFromPlain('**x*'), 4)).toBeNull();
  });

  it('knows an empty text', () => {
    expect(isRichEmpty('')).toBe(true);
    expect(isRichEmpty('{b:  }')).toBe(true);
    expect(isRichEmpty('{@page=p}')).toBe(false);
  });
});

describe('mentions of any app', () => {
  it('keeps a type this build does not know as it is, so an older client never rewrites what a newer one wrote', () => {
    const markup = 'Voir {@event=0192f8e2-4c1a-7b3e-9d2f-1a2b3c4d5e6f} et {@page=p1}';
    const runs = parseRich(markup);
    expect(runs.filter(run => run.kind === 'mention').map(run => (run.kind === 'mention' ? run.target : null))).toEqual([
      { type: 'event', id: '0192f8e2-4c1a-7b3e-9d2f-1a2b3c4d5e6f' },
      { type: 'page', id: 'p1' },
    ]);
    expect(serializeRich(runs)).toBe(markup);
  });

  it('still reads a date as a date, and leaves an ill-formed type as words', () => {
    expect(parseRich('{@date=2026-10-28}')[0]).toMatchObject({ kind: 'date', date: '2026-10-28' });
    expect(parseRich('{@Event=x}').some(run => run.kind === 'mention')).toBe(false);
  });
});
