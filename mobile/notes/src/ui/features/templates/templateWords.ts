/** What the templates' rows say of a template, a kind's or the person's own, and of a field (the web's words, the same). */
import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { shownTitle, type LinkKind, type Note } from '@unlease/notes/models/entities';
import type { LinkTemplate, TemplateField } from '@unlease/notes/models/templates';
import { changedKindTemplate, collectionsOfTemplate, kindFields, shownFieldType, type Templates } from '@unlease/notes/services/templates';

/** The collections that pick one of the person's own, by name (« Vins, Caves »); empty when none does. */
export function templateCollections(template: LinkTemplate, notes: Readonly<Record<string, Note>>): string {
  const collections = collectionsOfTemplate(template.id, notes).map(shownTitle);
  return collections.length > 0 ? collections.join(', ') : '';
}

/** « 3 champs · Vins, Caves », or « 3 champs · Aucune collection ». */
export function ownTemplateMeta(template: LinkTemplate, notes: Readonly<Record<string, Note>>): string {
  const fields = plural(template.fields.length, 'champ');
  const collections = templateCollections(template, notes);
  return collections ? t('{fields} · {collections}', { fields, collections }) : t('{fields} · Aucune collection', { fields });
}

/** A kind's fields by name (« Temps total, Portions, Difficulté »), then « · Modifié » once the person changed them. */
export function kindTemplateMeta(templates: Templates, kind: LinkKind): string {
  const names = kindFields(templates, kind).map(field => field.name);
  const fields = names.length > 0 ? names.join(', ') : t('Aucun champ');
  return changedKindTemplate(templates, kind) ? t('{fields} · Modifié', { fields }) : fields;
}

/** A field's row: its type, then what to put in it (« Nombre · L’année de sortie »). */
export function fieldMeta(field: TemplateField): string {
  const type = shownFieldType(field.type).name;
  return field.hint.trim() ? `${type} · ${field.hint.trim()}` : type;
}

/** « Tout relire »'s well: how many links were read with another version, and about what reading them again costs. */
export function rereadWords(count: number, cost: string): string {
  const links = plural(count, 'lien lu avec une autre version', 'liens lus avec une autre version');
  return count === 1 ? t('{links} · environ {cost} pour le relire', { links, cost }) : t('{links} · environ {cost} pour les relire', { links, cost });
}
