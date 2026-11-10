import { describe, expect, it } from 'vitest';

import { menuSeparated } from '../menus';

describe('menuSeparated', () => {
  it('sets the danger items apart under the others', () => {
    const items = [{}, { danger: true }, { danger: true }];
    expect(items.map((_, index) => menuSeparated(items, index))).toEqual([false, true, false]);
  });

  it('draws no hairline over the first item, danger or asked', () => {
    expect(menuSeparated([{ danger: true }, {}], 0)).toBe(false);
    expect(menuSeparated([{ separatorBefore: true }], 0)).toBe(false);
  });

  it('draws one where an item asks for it', () => {
    const items = [{}, { separatorBefore: true }, {}];
    expect(items.map((_, index) => menuSeparated(items, index))).toEqual([false, true, false]);
  });
});
