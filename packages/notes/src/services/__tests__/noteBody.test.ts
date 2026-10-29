import { mergeField } from '@unlease/core/sync/textMerge';
import {
  bodyFromText,
  bodyMarkdown,
  carryMarks,
  fitLines,
  bodyText,
  cardParagraphs,
  clearFormat,
  headingIn,
  headingShortcut,
  isFormatted,
  linesIn,
  linesText,
  noteLines,
  noteMarksAt,
  noteRangeHas,
  serializeLines,
  setHeading,
  setNoteFlag,
  type NoteLine,
} from '../noteBody';
import { richFromPlain } from '@unlease/core/services/richText';
import { textReach, wrapLines, wrapRunLines } from '@unlease/design/textWrap';
import { layoutCard, type CardShape, type WallMetrics } from '../wall';

const line = (text: string, heading: NoteLine['heading'] = 0): NoteLine => ({ heading, runs: richFromPlain(text) });

describe('a formatted body', () => {
  const body = '# Marché\ntomates, {i:basilic}\n{u:ne pas oublier}\n\\#motclé';

  it('reads its headings, its marks and a line that starts with # without being one', () => {
    const lines = noteLines(body, true);
    expect(lines.map(each => each.heading)).toEqual([1, 0, 0, 0]);
    expect(linesText(lines)).toBe('Marché\ntomates, basilic\nne pas oublier\n#motclé');
    expect(serializeLines(lines)).toBe(body);
    expect(bodyText({ body, rich: true })).toBe('Marché\ntomates, basilic\nne pas oublier\n#motclé');
  });

  it('leaves a plain body as it is, braces and backslashes included', () => {
    const plain = '# pas un titre\nC:\\dossier {x}';
    expect(bodyText({ body: plain, rich: false })).toBe(plain);
    expect(noteLines(plain, false).every(each => each.heading === 0)).toBe(true);
    expect(linesText(noteLines(serializeLines(noteLines(plain, false)), true))).toBe(plain);
    expect(bodyFromText(plain, true)).toBe('\\# pas un titre\nC:\\\\dossier \\{x\\}');
  });

  it('knows when anything is formatted', () => {
    expect(isFormatted(noteLines('a\nb', false))).toBe(false);
    expect(isFormatted(noteLines('## a', true))).toBe(true);
    expect(isFormatted(noteLines('{b:a}', true))).toBe(true);
  });

  it('writes Markdown for a backup', () => {
    expect(bodyMarkdown({ body: '# Marché\n{b:tomates} et {i,u:basilic}', rich: true })).toBe('# Marché\n**tomates** et *<u>basilic</u>*');
    expect(bodyMarkdown({ body: '*brut*', rich: false })).toBe('*brut*');
  });
});

describe('a formatted body against its limit and an edit from elsewhere', () => {
  it('cuts what passes the limit at the end, counting marks and escapes, never inside a mark', () => {
    const lines = setNoteFlag([line('abc {x}'), line('défg')], 0, 3, 'b', true);
    expect(serializeLines(lines)).toBe('{b:abc} \\{x\\}\ndéfg');
    const fitted = fitLines(lines, 16);
    expect(serializeLines(fitted).length).toBeLessThanOrEqual(16);
    expect(serializeLines(fitted)).toBe('{b:abc} \\{x\\}\ndé');
    expect(serializeLines(fitLines(lines, 8))).toBe('{b:abc} ');
    expect(fitLines(lines, 100)).toEqual(lines);
  });

  it('carries the marks onto their own words once an edit from elsewhere is merged in', () => {
    const carry = (since: string, ours: NoteLine[], theirs: string): string => serializeLines(carryMarks(ours, noteLines(mergeField('note', 'body', since, linesText(ours), theirs, false), false)));
    expect(carry('milk eggs bread', setNoteFlag(noteLines('milk eggs bread', false), 5, 9, 'b', true), 'Milk eggs Bread')).toBe('Milk {b:eggs} Bread');
    // Words added right after a mark stay out of it.
    expect(carry('Lait', setNoteFlag(noteLines('Lait bio', false), 0, 4, 'b', true), 'Lait x2')).toBe('{b:Lait} x2 bio');
    expect(carry('a\nb', setHeading(noteLines('a\nb', false), 2, 2, 1), 'z\na\nb')).toBe('z\na\n# b');
  });
});

describe('formatting a body by offsets', () => {
  const lines = [line('Titre'), line('deux mots'), line(''), line('fin')];

  it('finds the lines a range touches', () => {
    expect(linesIn(lines, 0, 0)).toEqual([0]);
    expect(linesIn(lines, 5, 5)).toEqual([0]);
    expect(linesIn(lines, 6, 6)).toEqual([1]);
    expect(linesIn(lines, 2, 8)).toEqual([0, 1]);
    // A range ending at a line's start does not touch it; an empty line inside one does.
    expect(linesIn(lines, 0, 6)).toEqual([0]);
    expect(linesIn(lines, 8, 18)).toEqual([1, 2, 3]);
  });

  it('makes the touched lines headings, and back', () => {
    const headed = setHeading(lines, 2, 8, 2);
    expect(headed.map(each => each.heading)).toEqual([2, 2, 0, 0]);
    expect(headingIn(headed, 0, 3)).toBe(2);
    expect(headingIn(headed, 0, 17)).toBeNull();
    expect(setHeading(headed, 7, 7, 0).map(each => each.heading)).toEqual([2, 0, 0, 0]);
  });

  it('marks words across lines, and reads it back', () => {
    const bold = setNoteFlag(lines, 3, 10, 'b', true);
    expect(serializeLines(bold)).toBe('Tit{b:re}\n{b:deux} mots\n\nfin');
    expect(noteRangeHas(bold, 3, 10, 'b')).toBe(true);
    expect(noteRangeHas(bold, 3, 11, 'b')).toBe(false);
    expect(noteMarksAt(bold, 5)).toEqual({ b: true });
    expect(noteMarksAt(bold, 1)).toEqual({});
  });

  it('takes the marks and headings off a range', () => {
    const formatted = setHeading(setNoteFlag(lines, 0, 15, 'i', true), 0, 0, 1);
    expect(serializeLines(clearFormat(formatted, 0, 15))).toBe('Titre\ndeux mots\n\nfin');
  });

  it('turns « # » typed at a line’s start into a heading', () => {
    const typed = [line('Titre'), line('## courses')];
    const done = headingShortcut(typed, 9);
    expect(done && serializeLines(done.lines)).toBe('Titre\n## courses');
    expect(done?.caret).toBe(6);
    expect(headingShortcut(typed, 8)).toBeNull();
  });
});

describe('a formatted card', () => {
  const metrics: WallMetrics = { columnWidth: 186, gap: 8, padding: 14, border: 1, fontSize: 15, lineHeight: 21, checkRow: 24, metaLine: 18, footer: 40, maxHeight: 384 };
  const shape = (over: Partial<CardShape>): CardShape => ({ id: 'x', kind: 'text', title: '', body: '', paragraphs: null, drawing: null, openChecks: 0, hasCheckedSummary: false, hasPhoto: false, hasThumbs: false, hasFooter: false, ...over });

  it('wraps runs as plain text wraps, bold ones on bold widths', () => {
    const text = 'Le meilleur croissant de Belleville, et le pain aussi';
    expect(wrapRunLines([[{ text, weight: 'regular' }]], 156, 15)).toBe(wrapLines(text, 156, 15));
    expect(wrapRunLines([[{ text, weight: 'bold' }]], 156, 15)).toBe(wrapLines(text, 156, 15, 'bold'));
    expect(wrapRunLines([[], [{ text: 'a', weight: 'regular' }]], 156, 15)).toBe(2);
  });

  it('says how far the first lines reach, so a cut card can keep its marks in view', () => {
    const paragraphs = [[{ text: 'un deux', weight: 'regular' as const }], [{ text: 'trois', weight: 'regular' as const }]];
    expect(textReach(paragraphs, 156, 15, 1)).toBe(7);
    expect(textReach(paragraphs, 156, 15, 5)).toBe(Number.POSITIVE_INFINITY);
  });

  it('sizes a heading as a bold line at the card’s size', () => {
    const lines = noteLines('# Un titre assez long pour passer à la ligne\ntexte', true);
    const paragraphs = cardParagraphs(lines);
    expect(paragraphs[0]!.every(run => run.weight === 'bold')).toBe(true);
    const formatted = layoutCard(shape({ body: linesText(lines), paragraphs }), metrics);
    const plain = layoutCard(shape({ body: linesText(lines) }), metrics);
    expect(formatted.body).toBeGreaterThanOrEqual(plain.body);
  });

  it('puts a drawing at the top, edge to edge, and only paper under a title', () => {
    expect(layoutCard(shape({ kind: 'drawing', drawing: 0.75 }), metrics).height).toBe(2 + Math.round(186 * 0.75));
    expect(layoutCard(shape({ kind: 'drawing', drawing: 3, title: 'Plan' }), metrics).height).toBe(2 + Math.round(186 * 1.25) + 14 * 2 + 21);
  });
});
