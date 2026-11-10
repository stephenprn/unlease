import { describe, expect, it } from 'vitest';

import { firstProblem, isBlank, liveAfter } from '../formChecks';

const quiet = { live: false, showing: false, empty: false, sent: false };

describe('formChecks', () => {
  it('says nothing while a fresh value is typed, and checks it once left', () => {
    expect(liveAfter('edit', quiet)).toBe(false);
    expect(liveAfter('leave', quiet)).toBe(true);
  });

  it('calls an empty field missing only once the form was sent', () => {
    expect(liveAfter('leave', { ...quiet, empty: true })).toBe(false);
    expect(liveAfter('leave', { ...quiet, empty: true, sent: true })).toBe(true);
    expect(liveAfter('send', { ...quiet, empty: true })).toBe(true);
  });

  it('checks a field showing a problem at every keystroke, and goes quiet once it is right', () => {
    expect(liveAfter('edit', { ...quiet, live: true, showing: true })).toBe(true);
    // Right at the last render: the next edit waits until the field is left.
    expect(liveAfter('edit', { ...quiet, live: true, showing: false })).toBe(false);
  });

  it('sends the focus to the first field holding a problem, in the form’s order', () => {
    expect(firstProblem(['title', 'start', 'url'], { url: 'x', start: 'y' })).toBe('start');
    expect(firstProblem(['title'], { title: null })).toBeNull();
  });

  it('counts spaces as nothing', () => {
    expect(isBlank('  ')).toBe(true);
    expect(isBlank(' a ')).toBe(false);
  });
});
