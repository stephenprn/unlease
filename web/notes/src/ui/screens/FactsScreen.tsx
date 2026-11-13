/**
 * « Ce que Claude relève » (`/notes/facts`, from the Administration's Claude section and the search):
 * the collections that have their own facts (each its emblem, its name and its facts, opening its
 * page), then the usual facts of every kind of link (its glyph, its name, its facts, « Modifiées » once
 * changed). A collection takes its own from its menu: the line under the title says so. Réglages'
 * sheets and rows, as on the phone.
 */
import { useShallow } from 'zustand/react/shallow';

import { t } from '@unlease/core/i18n';
import { asLineColor } from '@unlease/design/colors';
import { collectionEmblem } from '@unlease/notes/models/collections';
import { INBOX_ID, LINK_KIND_NAMES, LINK_KINDS, shownTitle, type LinkKind } from '@unlease/notes/models/entities';
import { changedKindTemplate, collectionTemplate } from '@unlease/notes/services/templates';

import { useLibraryStore } from '../../app/store/library';
import { kindDraftFields } from '../../app/templates';
import { EmblemStone } from '@shared/ui/components/Emblem';
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

function CollectionRow({ id }: { id: string }) {
  const { line, names } = useLibraryStore(
    useShallow(s => {
      const note = s.notes[id];
      return { line: note, names: (collectionTemplate(s.linkTemplates, note)?.fields ?? []).map(field => field.name).join(', ') };
    }),
  );
  if (!line) return null;
  return (
    <button type="button" className={page.row} onClick={() => navigate(paths.template(id))}>
      <EmblemStone id={id} emblem={collectionEmblem(id, line.emblem)} color={asLineColor(line.color)} size={18} width={30} height={27} />
      <span className={page.rowText}>
        <span className={`${styles.rowName} t-body`}>{shownTitle(line)}</span>
        <span className={`${styles.rowMeta} t-meta`}>{names || t('No facts')}</span>
      </span>
      <Icon name="chevronRight" size={20} className={styles.chevron} />
    </button>
  );
}

function KindRow({ kind }: { kind: LinkKind }) {
  const { names, changed } = useLibraryStore(
    useShallow(s => ({ names: kindDraftFields(s.linkTemplates, kind).map(field => field.name).join(', '), changed: changedKindTemplate(s.linkTemplates, kind) !== null })),
  );
  const facts = names || t('No facts');
  return (
    <button type="button" className={page.row} onClick={() => navigate(paths.template(`kind-${kind}`))}>
      <Icon name={KIND_ICONS[kind]} size={24} />
      <span className={page.rowText}>
        <span className="t-body">{LINK_KIND_NAMES[kind]}</span>
        <span className={`${styles.rowMeta} t-meta`}>{changed ? `${facts} · ${t('Changed')}` : facts}</span>
      </span>
      <Icon name="chevronRight" size={20} className={styles.chevron} />
    </button>
  );
}

export function FactsScreen() {
  // The collections with their own facts, in the board's order.
  const own = useLibraryStore(
    useShallow(s =>
      s.noteOrder.filter(id => {
        const note = s.notes[id];
        return !!note && id !== INBOX_ID && note.kind === 'links' && note.trashedAt === null && note.deletedAt === null && collectionTemplate(s.linkTemplates, note) !== null;
      }),
    ),
  );
  return (
    <div className={page.page}>
      <div className={styles.head}>
        <PageHead title={t('Facts Claude notes')} />
        <p className={`${styles.lead} t-meta`}>{t('A collection can have its own: “Facts Claude notes” in its menu.')}</p>
      </div>
      {own.length > 0 ? (
        <Section title={t('Collections with their own')}>
          {own.map(id => (
            <CollectionRow key={id} id={id} />
          ))}
        </Section>
      ) : null}
      <Section title={t('Usual facts, by kind of link')}>
        {KINDS.map(kind => (
          <KindRow key={kind} kind={kind} />
        ))}
      </Section>
    </div>
  );
}
