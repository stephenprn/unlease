import { comparePositions, keyBetween, placeAt, RESPACE_AT, type Placed } from '../fractionalIndex';

/** `siblings` with `count` new items written at `index`, as a batch writes them. */
function insert(siblings: Placed[], index: number, ids: string[]): Placed[] {
  const { positions, moved } = placeAt(siblings, index, ids.length);
  const next = new Map(siblings.map(sibling => [sibling.id, sibling]));
  for (const twin of moved) next.set(twin.id, twin);
  ids.forEach((id, at) => next.set(id, { id, position: positions[at]! }));
  return [...next.values()].sort(comparePositions);
}

describe('placing items again and again at one place', () => {
  it('keeps every key short, respacing the run around the gap in the same batch, the order kept', () => {
    const first = keyBetween(null, null);
    let list: Placed[] = [
      { id: 'top', position: first },
      { id: 'foot', position: keyBetween(first, null) },
    ];
    const expected = ['top'];
    // Typing paragraph after paragraph above the same last block, three thousand times.
    for (let n = 0; n < 3000; n += 1) {
      const id = `p${String(n).padStart(4, '0')}`;
      list = insert(list, list.length - 1, [id]);
      expected.push(id);
      expect(Math.max(...list.map(item => item.position.length))).toBeLessThanOrEqual(RESPACE_AT);
    }
    expected.push('foot');
    expect(list.map(item => item.id)).toEqual(expected);
  });

  it('respaces only when a key would grow too long, and keeps the others where they are', () => {
    const list: Placed[] = [
      { id: 'a', position: 'a0' },
      { id: 'b', position: 'a1' },
    ];
    expect(placeAt(list, 1).moved).toEqual([]);
    const long = `a0${'z'.repeat(RESPACE_AT)}`;
    const crowded: Placed[] = [
      { id: 'a', position: 'a0' },
      { id: 'b', position: long },
      { id: 'c', position: 'a1' },
      { id: 'd', position: 'a2' },
    ];
    const { positions, moved } = placeAt(crowded, 2);
    expect(moved.map(item => item.id)).toEqual(['b']);
    expect([...positions, ...moved.map(item => item.position)].every(key => key.length <= RESPACE_AT)).toBe(true);
    expect(moved[0]!.position < positions[0]!).toBe(true);
    expect(positions[0]! < 'a1').toBe(true);
  });
});
