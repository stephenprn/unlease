/** "Pour N personnes": people (or a factor, when the recipe does not say how many it serves) stepped on this device; the list and the cook mode follow. */
import { t } from '@unlease/core/i18n';
import { MODULE_NAMES } from '@unlease/notes/models/modules';
import type { LinkItem } from '@unlease/notes/models/entities';
import { formatNumber } from '@unlease/core/services/format';
import { servingsOf, servingsUnit, servingsWords, stepFactor } from '@unlease/notes/services/recipes';

import { selectFactor, setFactor, useKitchenStore } from '../../../app/store/kitchen';
import { Stepper } from './Stepper';

export function ServingsStepper({ link, inBar }: { link: LinkItem; inBar?: boolean }) {
  const factor = useKitchenStore(selectFactor(link.id));
  const base = servingsOf(link.attributes);
  // What the recipe counts when it is not people (« 15 crêpes »): the stepper counts it too.
  const unit = servingsUnit(link.attributes);
  const people = base !== null && unit === null;
  const less = stepFactor(base, factor, -1);
  const more = stepFactor(base, factor, 1);
  return (
    <Stepper
      inBar={inBar}
      label={MODULE_NAMES.servings}
      value={servingsWords(base, factor, unit)}
      icon="people"
      lessLabel={people ? t('Une personne de moins') : t('Moins')}
      moreLabel={people ? t('Une personne de plus') : t('Plus')}
      onLess={less !== factor ? () => setFactor(link.id, less) : undefined}
      onMore={more !== factor ? () => setFactor(link.id, more) : undefined}
    />
  );
}

/** What the list and the cook mode say of the quantities: the recipe's own count, or how they were scaled. */
export function servingsLine(link: LinkItem, factor: number, written: string): string {
  if (factor === 1) return written ? t('Recette pour {servings}', { servings: written }) : '';
  const base = servingsOf(link.attributes);
  return base === null ? t('Quantités multipliées par {factor}', { factor: formatNumber(factor, 2) }) : t('Quantités pour {servings}', { servings: servingsWords(base, factor, servingsUnit(link.attributes)) });
}
