import { applyDisplayEdit, displayEdit, displayToModel, modelToDisplay, richDisplay } from '../richDisplay';
import { parseRich, serializeRich } from '../richText';

const name = () => 'Courses';

describe('richDisplay', () => {
  const runs = parseRich('Voir {@page=p1} {b:vite}');
  const display = richDisplay(runs, name);

  it('spells a mention out as its name', () => {
    expect(display.text).toBe('Voir @Courses vite');
  });

  it('maps offsets both ways around a mention', () => {
    expect(displayToModel(display, 5, 'start')).toBe(5);
    expect(displayToModel(display, 8, 'start')).toBe(5);
    expect(displayToModel(display, 8, 'end')).toBe(6);
    expect(displayToModel(display, 13, 'start')).toBe(6);
    expect(modelToDisplay(display, 6)).toBe(13);
    expect(modelToDisplay(display, 8)).toBe(15);
  });
});

describe('displayEdit', () => {
  it('reads typing at the caret, even beside a repeated letter', () => {
    expect(displayEdit('hello', 'helllo', { start: 3, end: 3 })).toEqual({ start: 3, end: 3, inserted: 'l' });
  });

  it('reads a backspace', () => {
    expect(displayEdit('hello', 'helo', { start: 3, end: 3 })).toEqual({ start: 2, end: 3, inserted: '' });
  });

  it('reads typing over a selection', () => {
    expect(displayEdit('hello world', 'hello there', { start: 6, end: 11 })).toEqual({ start: 6, end: 11, inserted: 'there' });
  });

  it('falls back to what changed between the common ends', () => {
    expect(displayEdit('teh cat', 'the cat', { start: 7, end: 7 })).toEqual({ start: 1, end: 3, inserted: 'he' });
  });
});

describe('applyDisplayEdit', () => {
  it('continues the marks typed into', () => {
    const runs = parseRich('{b:gras} fin');
    const display = richDisplay(runs, name);
    const { runs: next, caret } = applyDisplayEdit(runs, display, { start: 4, end: 4, inserted: 'ou' });
    expect(serializeRich(next)).toBe('{b:grasou} fin');
    expect(caret).toBe(6);
  });

  it('takes a whole mention when part of its name goes', () => {
    const runs = parseRich('a {@note=n1} b');
    const display = richDisplay(runs, name);
    const { runs: next } = applyDisplayEdit(runs, display, { start: 9, end: 10, inserted: '' });
    expect(serializeRich(next)).toBe('a  b');
  });

  it('types after a mention when the caret was inside its name', () => {
    const runs = parseRich('{@note=n1}');
    const display = richDisplay(runs, name);
    const { runs: next, caret } = applyDisplayEdit(runs, display, { start: 3, end: 3, inserted: 'x' });
    expect(serializeRich(next)).toBe('{@note=n1}x');
    expect(caret).toBe(2);
  });
});
