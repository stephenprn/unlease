import { describe, expect, it } from 'vitest';

import { fingerprint, mirrorChanges } from '../mirror';

describe('fingerprint', () => {
  it('is stable and tells values apart', () => {
    expect(fingerprint({ a: 1, b: ['x'] })).toBe(fingerprint({ a: 1, b: ['x'] }));
    expect(fingerprint({ a: 1, b: ['x'] })).not.toBe(fingerprint({ a: 1, b: ['y'] }));
    expect(fingerprint('é')).toMatch(/^[0-9a-f]{14}$/);
  });
});

describe('mirrorChanges', () => {
  const row = (id: string, print: string) => ({ id, fingerprint: print, payload: id });

  it('writes what is new or changed, and nothing else', () => {
    const changes = mirrorChanges([row('a', '1'), row('b', '2'), row('c', '3')], [
      { id: 'a', fingerprint: '1' },
      { id: 'b', fingerprint: 'old' },
    ]);
    expect(changes.upserts.map(item => item.id)).toEqual(['b', 'c']);
    expect(changes.deletes).toEqual([]);
  });

  it('takes away what is no longer wanted', () => {
    const changes = mirrorChanges([row('a', '1')], [
      { id: 'a', fingerprint: '1' },
      { id: 'gone', fingerprint: '9' },
    ]);
    expect(changes.upserts).toEqual([]);
    expect(changes.deletes).toEqual(['gone']);
  });

  it('writes a record held twice again, once', () => {
    const changes = mirrorChanges([row('a', '1')], [
      { id: 'a', fingerprint: '1' },
      { id: 'a', fingerprint: '1' },
    ]);
    expect(changes.deletes).toEqual(['a']);
    expect(changes.upserts.map(item => item.id)).toEqual(['a']);
  });

  it('changes nothing when both sides agree', () => {
    const changes = mirrorChanges([row('a', '1')], [{ id: 'a', fingerprint: '1' }]);
    expect(changes).toEqual({ upserts: [], deletes: [] });
  });
});
