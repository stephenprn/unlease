/**
 * One-tap starter collections, shared by the phone and the web. Fixed ids, so two devices that
 * both tap "Films & séries" make one collection, not two.
 */
import { EMBLEMS, isEmblem, type CollectionEmblem, type Emblem } from '@unlease/design/emblems';
import { cutIndex } from '@unlease/design/shapes';
import { t, tx } from '@unlease/core/i18n';
import type { LineColor } from '@unlease/design/colors';
import { INBOX_ID } from './entities';

export interface SuggestedCollection {
  readonly id: string;
  readonly title: string;
  readonly code: string;
  readonly hint: string;
  readonly emblem: Emblem;
  readonly color: LineColor;
}

/** Its title and sentence read in the interface's language, so a tapped one is made in it. */
const starter = (made: SuggestedCollection): SuggestedCollection => ({ ...made, get title() { return t(made.title); }, get hint() { return t(made.hint); } });

export const SUGGESTED_COLLECTIONS: readonly SuggestedCollection[] = [
  starter({ id: 'line-mode', title: tx('Mode'), code: 'M', hint: tx('Vêtements, chaussures et accessoires à acheter.'), emblem: 'fleur', color: 'pink' }),
  starter({ id: 'line-films', title: tx('Films & séries'), code: 'F', hint: tx('Films et séries à voir, au cinéma ou en streaming.'), emblem: 'etoile', color: 'yellow' }),
  starter({ id: 'line-restos', title: tx('Restaurants'), code: 'R', hint: tx('Restaurants, cafés et bars à essayer.'), emblem: 'soleil', color: 'red' }),
  starter({ id: 'line-lire', title: tx('À lire'), code: 'L', hint: tx('Articles, essais et livres à lire.'), emblem: 'feuille', color: 'green' }),
  starter({ id: 'line-maison', title: tx('Maison'), code: 'H', hint: tx('Meubles, déco et objets pour la maison.'), emblem: 'arche', color: 'ochre' }),
  starter({ id: 'line-voyages', title: tx('Voyages'), code: 'V', hint: tx('Lieux, hôtels et idées de voyage.'), emblem: 'oiseau', color: 'blue' }),
];

/** A collection's name as two names compare: case and accents aside. */
const nameKey = (title: string): string => title.trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * The starters not made yet: by their fixed id, and by their name (a collection restored or made on
 * another device has its own id, and « À lire » twice reads as one).
 */
export function suggestionsFor(lines: readonly { readonly id: string; readonly title: string }[]): SuggestedCollection[] {
  const ids = new Set(lines.map(line => line.id));
  const names = new Set(lines.map(line => nameKey(line.title)));
  return SUGGESTED_COLLECTIONS.filter(suggestion => !ids.has(suggestion.id) && !names.has(nameKey(suggestion.title)));
}

/**
 * The emblem a collection wears: its own choice, else a starter's designed one (they predate
 * emblems on older devices), else one picked from its id: stable everywhere.
 */
export function emblemOf(id: string, chosen: string | null): Emblem {
  if (isEmblem(chosen)) return chosen;
  return SUGGESTED_COLLECTIONS.find(starter => starter.id === id)?.emblem ?? EMBLEMS[cutIndex(id, EMBLEMS.length)]!;
}

/** What a collection draws: "Non classé" is always the tray. */
export function collectionEmblem(id: string, chosen: string | null): CollectionEmblem {
  return id === INBOX_ID ? 'bac' : emblemOf(id, chosen);
}

/** The first emblem no collection shows yet, stored or derived, in order. */
export function nextEmblem(collections: readonly { readonly id: string; readonly emblem: string | null }[]): Emblem {
  const shown = new Set<string>(collections.map(collection => collectionEmblem(collection.id, collection.emblem)));
  return EMBLEMS.find(emblem => !shown.has(emblem)) ?? EMBLEMS[collections.length % EMBLEMS.length]!;
}
