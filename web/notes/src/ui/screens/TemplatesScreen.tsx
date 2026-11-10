/**
 * « Modèles de fiche »: what Claude notes on the links kept. The person's own first (« Vos modèles »,
 * once there is one: each its name, its fields and the collections reading with it), « Nouveau
 * modèle », then every kind's (« Par type de lien »: its glyph, its name, its fields, « Modifié »
 * once changed). A row opens its editor. Réglages' sheets and rows, as on the phone.
 */
import { useShallow } from 'zustand/react/shallow';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { LINK_KIND_NAMES, LINK_KINDS, shownTitle, type LinkKind } from '@unlease/notes/models/entities';
import { TEMPLATE_LIMITS } from '@unlease/notes/models/templates';
import { changedKindTemplate, collectionsOfTemplate } from '@unlease/notes/services/templates';

import { useLibraryStore } from '../../app/store/library';
import { kindDraftFields, ownTemplates, templatePart } from '../../app/templates';
import { Icon } from '@shared/ui/components/Icon';
import { Section } from '@shared/ui/features/settings/Section';
import page from '@shared/ui/features/settings/settings.module.css';
import { PageHead } from '@shared/ui/navigation/PageHead';
import { navigate } from '@shared/ui/router';
import { KIND_ICONS } from '../features/links/kindIcon';
import styles from '../features/templates/templates.module.css';
import { paths } from '../routes';

/** Every kind but « Lien », which reads a title and a summary alone. */
const KINDS = LINK_KINDS.filter((kind): kind is Exclude<LinkKind, 'other'> => kind !== 'other');

function OwnRow({ id }: { id: string }) {
  const { name, fields, collections } = useLibraryStore(
    useShallow(s => {
      const template = s.linkTemplates[id];
      return { name: template?.name ?? '', fields: template?.fields.length ?? 0, collections: collectionsOfTemplate(id, s.notes).map(shownTitle).join(', ') };
    }),
  );
  return (
    <button type="button" className={page.row} onClick={() => navigate(paths.template(id))}>
      <Icon name="rows" size={24} />
      <span className={page.rowText}>
        <span className={`${styles.rowName} t-body`}>{name}</span>
        <span className={`${styles.rowMeta} t-meta`}>{collections ? t('{fields} · {collections}', { fields: plural(fields, 'champ'), collections }) : t('{fields} · Aucune collection', { fields: plural(fields, 'champ') })}</span>
      </span>
      <Icon name="chevronRight" size={20} className={styles.chevron} />
    </button>
  );
}

function KindRow({ kind }: { kind: LinkKind }) {
  const { names, changed } = useLibraryStore(
    useShallow(s => ({ names: kindDraftFields(s.linkTemplates, kind).map(field => field.name).join(', '), changed: changedKindTemplate(s.linkTemplates, kind) !== null })),
  );
  const fields = names || t('Aucun champ');
  return (
    <button type="button" className={page.row} onClick={() => navigate(paths.template(templatePart({ id: '', kind })))}>
      <Icon name={KIND_ICONS[kind]} size={24} />
      <span className={page.rowText}>
        <span className="t-body">{LINK_KIND_NAMES[kind]}</span>
        <span className={`${styles.rowMeta} t-meta`}>{changed ? t('{fields} · Modifié', { fields }) : fields}</span>
      </span>
      <Icon name="chevronRight" size={20} className={styles.chevron} />
    </button>
  );
}

export function TemplatesScreen() {
  const own = useLibraryStore(useShallow(s => ownTemplates(s.linkTemplates).map(template => template.id)));
  const full = own.length >= TEMPLATE_LIMITS.templates;
  const newRow = (
    <button
      type="button"
      className={`${page.row} ${styles.newRow}`}
      aria-disabled={full || undefined}
      onClick={full ? undefined : () => navigate(paths.template('new'))}
    >
      <Icon name="plus" size={24} />
      <span className={page.rowText}>
        <span className="t-body">{t('Nouveau modèle')}</span>
        {full ? (
          <span className="t-meta">{t('{count} modèles au plus.', { count: TEMPLATE_LIMITS.templates })}</span>
        ) : own.length === 0 ? (
          <span className="t-meta">{t('Vos propres champs, pour les liens d’une collection : vins, plantes, jeux…')}</span>
        ) : null}
      </span>
    </button>
  );
  return (
    <div className={page.page}>
      <div className={styles.head}>
        <PageHead title={t('Modèles de fiche')} />
        <p className={`${styles.lead} t-meta`}>{t('Ce que Claude relève sur les liens que vous gardez.')}</p>
      </div>
      {own.length > 0 ? (
        <Section title={t('Vos modèles')}>
          {own.map(id => (
            <OwnRow key={id} id={id} />
          ))}
          {newRow}
        </Section>
      ) : (
        <Section label={t('Vos modèles')}>{newRow}</Section>
      )}
      <Section title={t('Par type de lien')}>
        {KINDS.map(kind => (
          <KindRow key={kind} kind={kind} />
        ))}
      </Section>
    </div>
  );
}
