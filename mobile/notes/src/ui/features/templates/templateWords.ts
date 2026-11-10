/** What the rows of « Ce que Claude relève » say: a kind's usual facts, a fact, the well offering to read links again (the web's words, the same). */
import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import type { LinkKind } from '@unlease/notes/models/entities';
import type { TemplateField } from '@unlease/notes/models/templates';
import { changedKindTemplate, kindFields, shownFieldAnswer, type Templates } from '@unlease/notes/services/templates';

/** A list of facts by name (« Temps total, Portions, Difficulté »), or « Aucune information ». */
export function factNames(fields: readonly TemplateField[]): string {
  return fields.length > 0 ? fields.map(field => field.name).join(', ') : t('Aucune information');
}

/** A kind's usual facts by name, then « · Modifiées » once the person changed them. */
export function kindFactsMeta(templates: Templates, kind: LinkKind): string {
  const names = factNames(kindFields(templates, kind));
  return changedKindTemplate(templates, kind) ? `${names} · ${t('Modifiées')}` : names;
}

/** A fact's line: what Claude notes in it, then the shape of its answer when it is not « quelques mots ». */
export function factMeta(field: TemplateField): string {
  return [field.hint.trim(), field.type === 'text' ? '' : shownFieldAnswer(field.type)].filter(Boolean).join(' · ');
}

/** The well over the facts: how many links were read before the change, and about what reading them again costs. */
export function readAgainWords(count: number, cost: string): string {
  const links = plural(count, 'lien lu', 'liens lus');
  return count === 1 ? t('{links} avant ce changement · environ {cost} pour le relire', { links, cost }) : t('{links} avant ce changement · environ {cost} pour les relire', { links, cost });
}
