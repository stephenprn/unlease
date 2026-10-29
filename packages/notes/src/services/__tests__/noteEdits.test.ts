import { linesText, noteLines, serializeLines, type NoteLine } from '../noteBody';
import { applyNoteEdit, backspaceHeading, offsetAfter, respell, textChange } from '../noteEdits';
import { displayEdit } from '@unlease/core/services/richDisplay';
import { MENTION_CHAR } from '@unlease/core/services/richText';

const body = (markup: string): NoteLine[] => noteLines(markup, true);
const edited = (markup: string, start: number, end: number, inserted: string) => {
  const done = applyNoteEdit(body(markup), { start, end, inserted });
  return { body: serializeLines(done.lines), caret: done.caret };
};

describe('typing in a formatted note', () => {
  it('continues the marks of the character before the caret', () => {
    expect(edited('{b:gras} puis', 4, 4, 'se')).toEqual({ body: '{b:grasse} puis', caret: 6 });
    expect(edited('{b:gras} puis', 5, 5, 'et ')).toEqual({ body: '{b:gras} et puis', caret: 8 });
    // At a line's start, the line's first character's.
    expect(edited('un\n{i:deux}', 3, 3, 'a')).toEqual({ body: 'un\n{i:adeux}', caret: 4 });
  });

  it('gives words typed over a selection the marks of the first one replaced', () => {
    expect(edited('le {u:mot} juste', 3, 6, 'nom')).toEqual({ body: 'le {u:nom} juste', caret: 6 });
  });

  it('keeps an autocorrected word’s marks, the edit read from the field', () => {
    const lines = body('x {b:teh}');
    const edit = displayEdit(linesText(lines), 'x the ', { start: 5, end: 5 });
    expect(serializeLines(applyNoteEdit(lines, edit).lines)).toBe('x {b:the }');
  });

  it('takes marks given instead', () => {
    expect(serializeLines(applyNoteEdit(body('ab'), { start: 1, end: 1, inserted: 'x' }, { u: true }).lines)).toBe('a{u:x}b');
  });

  it('leaves the lines it does not touch as they were', () => {
    const lines = body('# Titre\nun\ndeux');
    const done = applyNoteEdit(lines, { start: 6, end: 6, inserted: 'e' });
    expect(done.lines[0]).toBe(lines[0]);
    expect(done.lines[2]).toBe(lines[2]);
    expect(linesText(done.lines)).toBe('Titre\neun\ndeux');
  });
});

describe('line breaks in a formatted note', () => {
  it('keeps a heading before a break typed inside it, the rest going on as text', () => {
    expect(edited('# Grand titre', 5, 5, '\n')).toEqual({ body: '# Grand\n titre', caret: 6 });
  });

  it('starts a line of text after a heading', () => {
    expect(edited('## Titre\nsuite', 5, 5, '\n')).toEqual({ body: '## Titre\n\nsuite', caret: 6 });
  });

  it('pushes a heading down with its words when split at its start', () => {
    expect(edited('avant\n# Titre', 6, 6, '\n')).toEqual({ body: 'avant\n\n# Titre', caret: 7 });
  });

  it('keeps an empty heading where it is, a line of text under it', () => {
    expect(edited('# ', 0, 0, '\n')).toEqual({ body: '# \n', caret: 1 });
  });

  it('joins two lines under the first one’s heading', () => {
    expect(edited('texte\n# Titre', 5, 6, '')).toEqual({ body: 'texteTitre', caret: 5 });
    expect(edited('# Titre\ntexte', 5, 6, '')).toEqual({ body: '# Titretexte', caret: 5 });
  });

  it('keeps a heading when the empty line above it goes', () => {
    expect(edited('un\n\n# Titre', 3, 4, '')).toEqual({ body: 'un\n# Titre', caret: 3 });
  });

  it('leaves the next line as it was when a whole heading line goes with its break', () => {
    expect(edited('# Titre\n{b:texte}', 0, 6, '')).toEqual({ body: '{b:texte}', caret: 0 });
  });

  it('replaces a selection across lines', () => {
    expect(edited('# Titre\nun\ndeux', 2, 10, 'x')).toEqual({ body: '# Tixeux', caret: 3 });
    expect(edited('# Titre\nun\n## deux', 2, 11, '\n')).toEqual({ body: '# Ti\nux', caret: 3 });
  });

  it('pastes lines: the middle ones as text, the last one before what followed', () => {
    expect(edited('# Titre', 2, 2, 'A\nB\nC')).toEqual({ body: '# TiA\nB\nCtre', caret: 7 });
    expect(edited('# Titre', 5, 5, '\nB\nC')).toEqual({ body: '# Titre\nB\nC', caret: 9 });
  });

  it('drops a mention’s place holder, the caret after what is kept', () => {
    expect(edited('ab', 1, 1, `x${MENTION_CHAR}y`)).toEqual({ body: 'axyb', caret: 3 });
  });

  it('clamps an edit past the text', () => {
    expect(edited('ab', 5, 9, 'c')).toEqual({ body: 'abc', caret: 3 });
    expect(applyNoteEdit([], { start: 0, end: 0, inserted: 'a\nb' }).lines.map(line => line.runs.length)).toEqual([1, 1]);
  });
});

describe('Backspace at a heading’s start', () => {
  const lines = body('texte\n## Titre\nfin');
  const backspace = { start: 5, end: 6, inserted: '' };

  it('turns the heading back into text first, its line break kept', () => {
    const done = backspaceHeading(lines, backspace, { start: 6, end: 6 });
    expect(done && serializeLines(done)).toBe('texte\nTitre\nfin');
    expect(done?.[0]).toBe(lines[0]);
    expect(done?.[2]).toBe(lines[2]);
  });

  it('joins the line on the next Backspace', () => {
    const done = backspaceHeading(lines, backspace, { start: 6, end: 6 })!;
    expect(backspaceHeading(done, backspace, { start: 6, end: 6 })).toBeNull();
    expect(serializeLines(applyNoteEdit(done, backspace).lines)).toBe('texteTitre\nfin');
  });

  it('turns the first line back into text, where the key takes nothing away', () => {
    const done = backspaceHeading(body('# Titre\nfin'), null, { start: 0, end: 0 });
    expect(done && serializeLines(done)).toBe('Titre\nfin');
    expect(backspaceHeading(body('Titre'), null, { start: 0, end: 0 })).toBeNull();
    expect(backspaceHeading(body('# Titre'), null, { start: 2, end: 2 })).toBeNull();
  });

  it('leaves any other edit alone', () => {
    // A line break selected and taken away, the one after a heading, a forward delete, a character.
    expect(backspaceHeading(lines, backspace, { start: 5, end: 6 })).toBeNull();
    expect(backspaceHeading(body('# Titre\ntexte'), { start: 5, end: 6, inserted: '' }, { start: 6, end: 6 })).toBeNull();
    expect(backspaceHeading(lines, backspace, { start: 5, end: 5 })).toBeNull();
    expect(backspaceHeading(lines, { start: 6, end: 7, inserted: '' }, { start: 7, end: 7 })).toBeNull();
  });
});

describe('an edit landing from elsewhere', () => {
  it('reads one change between two texts', () => {
    expect(textChange('le chat dort', 'le gros chat dort')).toEqual({ start: 3, end: 3, inserted: 'gros ' });
    expect(textChange('abc', 'abc')).toEqual({ start: 3, end: 3, inserted: '' });
    expect(textChange('aXb', 'ab')).toEqual({ start: 1, end: 2, inserted: '' });
  });

  it('moves an offset by what changed before it', () => {
    const edit = { start: 3, end: 3, inserted: 'gros ' };
    expect(offsetAfter(2, edit)).toBe(2);
    expect(offsetAfter(3, edit)).toBe(3);
    expect(offsetAfter(7, edit)).toBe(12);
    expect(offsetAfter(5, { start: 3, end: 8, inserted: 'x' })).toBe(3);
  });

  it('spells the lines anew, keeping the marks of what did not change', () => {
    const lines = body('# Titre\nle {b:chat} dort');
    expect(serializeLines(respell(lines, 'Titre\nle chat dort bien'))).toBe('# Titre\nle {b:chat} dort bien');
    expect(serializeLines(respell(lines, 'Titre\nle gros chat dort'))).toBe('# Titre\nle gros {b:chat} dort');
  });
});
