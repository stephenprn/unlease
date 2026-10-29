/**
 * "Pour N personnes": how much of a recipe this phone cooks, a person (or a factor) at a time, kept
 * for the visit (`@app/store/kitchen`). The base is what the link's reading says the recipe serves,
 * everywhere, so the bar, the shopping list and the cook mode always agree.
 */
import React from 'react';

import { t } from '@unlease/core/i18n';
import { MODULE_NAMES } from '@unlease/notes/models/modules';
import { formatNumber } from '@unlease/core/services/format';
import { servingsOf, servingsUnit, servingsWords, stepFactor } from '@unlease/notes/services/recipes';
import { useLibraryStore } from '@app/store/libraryStore';
import { selectFactor, setFactor, useKitchenStore } from '@app/store/kitchen';

import { Stepper } from './Stepper';

/**
 * The factor this phone cooks the recipe at, how many it serves as written (null: its reading does
 * not say), and what it counts when it is not people (« crêpes » in « 15 crêpes »).
 */
export function useServings(id: string): { readonly factor: number; readonly base: number | null; readonly unit: string | null } {
  const attributes = useLibraryStore(s => s.links[id]?.attributes);
  const factor = useKitchenStore(selectFactor(id));
  return { factor, base: attributes ? servingsOf(attributes) : null, unit: attributes ? servingsUnit(attributes) : null };
}

/** The line over a recipe's ingredients: what it makes as written, or what the quantities are now for; null when there is nothing to say. */
export function servingsLine(servings: string, base: number | null, factor: number, unit: string | null): string | null {
  if (factor === 1) return servings ? t('Recette pour {servings}', { servings }) : null;
  return base === null ? t('Quantités multipliées par {factor}', { factor: formatNumber(factor, 2) }) : t('Quantités pour {servings}', { servings: servingsWords(base, factor, unit) });
}

export function ServingsStepper({ id, inBar }: { id: string; inBar?: boolean }) {
  const { factor, base, unit } = useServings(id);
  const people = base !== null && unit === null;
  const less = stepFactor(base, factor, -1);
  const more = stepFactor(base, factor, 1);
  return (
    <Stepper
      label={MODULE_NAMES.servings}
      value={servingsWords(base, factor, unit)}
      icon="people"
      lessLabel={people ? t('Une personne de moins') : t('Moins')}
      moreLabel={people ? t('Une personne de plus') : t('Plus')}
      // At either end the step gives the same factor back (or, past the most people offered, a smaller one): that side is off.
      onLess={less < factor ? () => setFactor(id, less) : undefined}
      onMore={more > factor ? () => setFactor(id, more) : undefined}
      inBar={inBar}
    />
  );
}
