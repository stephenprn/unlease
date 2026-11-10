/**
 * A menu's hairlines, the same on both clients: danger items close the menu, set apart by a hairline
 * over the first of them; an item may ask for one over itself to start a group of its own.
 */

/** What a menu's item says of the hairline over it. */
export interface MenuGrouping {
  readonly danger?: boolean;
  /** A hairline over it, setting a group apart (the danger items get theirs on their own). */
  readonly separatorBefore?: boolean;
}

/** Whether a hairline goes over the item at `index`: asked for, or the first of the danger items under others. */
export function menuSeparated(items: readonly MenuGrouping[], index: number): boolean {
  const item = items[index];
  if (!item || index === 0) return false;
  return item.separatorBefore === true || (item.danger === true && items[index - 1]?.danger !== true);
}
