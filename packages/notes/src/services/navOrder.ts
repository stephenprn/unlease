/**
 * The order of the navigation's collections and labels (the web's side, the phone's drawer): by
 * name, as a dictionary orders them in the interface's language (accents and case aside, « 2 » before
 * « 10 »), so a place is found where it is looked for and stays there however the board is
 * rearranged or whichever was made last. « Non classé » closes the collections, where what fits
 * nowhere else waits. Their positions keep ordering the board and the pickers.
 */
import { getLocale } from '@unlease/core/i18n';
import { INBOX_ID, shownTitle, type Label, type Note } from '../models/entities';

const collators = new Map<string, Intl.Collator>();

function collator(): Intl.Collator {
  const locale = getLocale();
  let found = collators.get(locale);
  if (!found) {
    found = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
    collators.set(locale, found);
  }
  return found;
}

/** Items by their names, a dictionary's way; two of one name stay in the order they came. */
export function byName<T>(items: readonly T[], name: (item: T) => string): T[] {
  const compare = collator().compare;
  return items
    .map((item, at) => ({ item, at, name: name(item).trim() }))
    .sort((a, b) => compare(a.name, b.name) || a.at - b.at)
    .map(({ item }) => item);
}

/** The collections by name, « Non classé » last. */
export function collectionsByName<T extends Pick<Note, 'id' | 'title'>>(lines: readonly T[]): T[] {
  return [...byName(lines.filter(line => line.id !== INBOX_ID), shownTitle), ...lines.filter(line => line.id === INBOX_ID)];
}

/** The live labels by name. */
export function labelsByName(order: readonly string[], labels: Readonly<Record<string, Label | undefined>>): Label[] {
  return byName(
    order.flatMap(id => {
      const label = labels[id];
      return label && label.deletedAt === null ? [label] : [];
    }),
    label => label.name,
  );
}
