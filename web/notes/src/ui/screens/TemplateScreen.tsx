/**
 * A template's editor (« Modèle de fiche »): a kind's (« Recette »: what Claude notes on every link
 * it reads as one; « Rétablir l'original » while changed) or one of the person's own (its name, the
 * collections that read with it; « Supprimer le modèle » in its menu). Its fields (`FieldRows`), then
 * « Essayer » beside them on a wide window (under them otherwise): the fields as they stand, read on
 * one link, nothing written. « Enregistrer » sticks to the window's foot (⌘/Ctrl+S, ⌘/Ctrl+Entrée)
 * and saves the template whole; the page stays, so a well at its top can offer to read again the
 * links read with another version. Leaving with changes asks first.
 */
import { useContext, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { t } from '@unlease/core/i18n';
import { formatUsd, plural } from '@unlease/core/services/format';
import { CLAUDE_COST_PER_LINK } from '@unlease/core/sync/settings';
import { LINK_KIND_NAMES, shownTitle, type LinkItem, type LinkKind } from '@unlease/notes/models/entities';
import { TEMPLATE_LIMITS, type TemplateField } from '@unlease/notes/models/templates';
import { changedKindTemplate, collectionsOfTemplate, kindTemplateId, linksOfTemplate, linksReadBefore, templateProblems } from '@unlease/notes/services/templates';

import { deleteTemplate, readLinks, resetKindTemplate, saveTemplate } from '../../app/store/actions';
import { useLibraryStore, type LibraryState } from '../../app/store/library';
import { useCanRead } from '../../app/store/prefs';
import { kindDraftFields, templateKey, type TemplateKey } from '../../app/templates';
import { selectServerSettings, useServerSettingsStore } from '@shared/app/store/serverSettings';
import { showSnack, showUndo } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { FormFoot } from '@shared/ui/components/FormFoot';
import { IconButton } from '@shared/ui/components/IconButton';
import { Menu } from '@shared/ui/components/Menu';
import { TextField } from '@shared/ui/components/TextField';
import { useForm } from '@shared/ui/components/useForm';
import { useUnsaved } from '@shared/ui/components/useUnsaved';
import { Section } from '@shared/ui/features/settings/Section';
import { PageHead, PageHeadSlot } from '@shared/ui/navigation/PageHead';
import shell from '@shared/ui/navigation/shell.module.css';
import { navigate, useLocation } from '@shared/ui/router';
import { ReadAllBanner } from '../features/lines/LineRefine';
import { FieldRows } from '../features/templates/FieldRows';
import { TryPanel } from '../features/templates/TryPanel';
import styles from '../features/templates/templates.module.css';
import { paths } from '../routes';

/** How many links « Essayer » offers. */
const TRY_LINKS = 8;

/** The tab's name for the editor at `part`. */
export function templateTitle(state: LibraryState, part: string): string {
  const key = templateKey(part);
  if (key.kind === 'new') return t('Nouveau modèle');
  if (key.kind === 'kind') return LINK_KIND_NAMES[key.linkKind];
  const template = state.linkTemplates[key.id];
  return template && template.deletedAt === null && template.name ? template.name : t('Modèle de fiche');
}

export function TemplateScreen({ part }: { part: string }) {
  const key = useMemo(() => templateKey(part), [part]);
  const own = useLibraryStore(s => (key.kind === 'own' ? s.linkTemplates[key.id] : undefined));
  // Deleted from its own menu: the editor stays as it was while the page goes back to the list.
  const [leaving, setLeaving] = useState(false);
  if (key.kind === 'own' && !leaving && (!own || own.deletedAt !== null || own.kind !== null)) {
    return (
      <div className={styles.editor}>
        <EmptyState scene="trash" as="h1" title={t('Ce modèle n’existe plus')} text={t('Il a été supprimé, sur cet appareil ou sur un autre.')}>
          <Button kind="tonal" icon="rows" onClick={() => navigate(paths.templates, { replace: true })}>
            {t('Modèles de fiche')}
          </Button>
        </EmptyState>
      </div>
    );
  }
  return <TemplateEditor templateKey={key} leaving={leaving} onLeave={() => setLeaving(true)} />;
}

interface Draft {
  readonly name: string;
  readonly fields: readonly TemplateField[];
}

/** What is saved now: a kind's changed fields or its preset's, one of the person's own as it is, nothing for a new one. */
function savedDraft(templates: LibraryState['linkTemplates'], key: TemplateKey): Draft {
  if (key.kind === 'kind') return { name: '', fields: kindDraftFields(templates, key.linkKind) };
  if (key.kind === 'own') {
    const template = templates[key.id];
    return { name: template?.name ?? '', fields: template?.fields ?? [] };
  }
  return { name: '', fields: [] };
}

/** The draft as it is kept: its words trimmed. */
const trimmed = (draft: Draft): Draft => ({ name: draft.name.trim(), fields: draft.fields.map(field => ({ ...field, name: field.name.trim(), hint: field.hint.trim() })) });

const sameDraft = (a: Draft, b: Draft): boolean => JSON.stringify(trimmed(a)) === JSON.stringify(trimmed(b));

function TemplateEditor({ templateKey: key, leaving, onLeave }: { templateKey: TemplateKey; leaving: boolean; onLeave: () => void }) {
  const kind: LinkKind | null = key.kind === 'kind' ? key.linkKind : null;
  const savedId = key.kind === 'kind' ? kindTemplateId(key.linkKind) : key.kind === 'own' ? key.id : null;
  const location = useLocation();
  // Made from a collection's picker: chosen there once saved.
  const forCollection = key.kind === 'new' ? (new URLSearchParams(location.search).get('for') ?? undefined) : undefined;
  const templates = useLibraryStore(s => s.linkTemplates);
  const saved = savedDraft(templates, key);
  const [draft, setDraft] = useState<Draft>(saved);
  const [base, setBase] = useState<Draft>(saved);
  const dirty = !sameDraft(draft, base);
  // Changed elsewhere (another device, « Annuler » on a slip) while nothing is typed here: the editor follows.
  if (!leaving && !sameDraft(saved, base) && !dirty) {
    setBase(saved);
    setDraft(saved);
  }
  const unsaved = useUnsaved(dirty, { page: paths.templates });
  const reading = useCanRead();
  const model = useServerSettingsStore(selectServerSettings)?.analysis.model ?? 'claude-opus-5-5';
  const slot = useContext(PageHeadSlot);
  const [menu, setMenu] = useState(false);
  const more = useRef<HTMLButtonElement>(null);

  const changed = kind !== null && changedKindTemplate(templates, kind) !== null;
  const others = Object.values(templates).filter(template => template.id !== savedId);
  const problems = templateProblems({ name: draft.name, kind, fields: draft.fields }, others);
  const checks: Record<string, string | null> = { name: kind === null ? problems.name : null };
  for (const field of draft.fields) checks[`field:${field.id}`] = problems.fields[field.id] ?? null;
  const form = useForm<string>(checks);

  const collections = useLibraryStore(
    useShallow(s => {
      if (key.kind === 'own') return collectionsOfTemplate(key.id, s.notes).map(shownTitle);
      const line = forCollection ? s.notes[forCollection] : undefined;
      return line ? [shownTitle(line)] : [];
    }),
  );
  // Read with another version than the one saved: « Tout relire ».
  const before = useLibraryStore(
    useShallow(s =>
      savedId === null
        ? []
        : linksReadBefore({ id: savedId, kind }, Object.values(s.links), s.notes, s.linkTemplates)
            .map(link => link.id),
    ),
  );
  // The links « Essayer » offers: those this template reads (a new one, its collection's), newest first.
  const tryLinks = useLibraryStore(
    useShallow(s => {
      const links: LinkItem[] =
        savedId !== null
          ? linksOfTemplate({ id: savedId, kind }, Object.values(s.links), s.notes, s.linkTemplates)
          : forCollection
            ? (s.linksByNote[forCollection] ?? []).flatMap(id => (s.links[id] ? [s.links[id]!] : []))
            : [];
      return [...links].sort((a, b) => b.createdAt - a.createdAt).slice(0, TRY_LINKS);
    }),
  );

  const title = key.kind === 'new' ? t('Nouveau modèle') : kind !== null ? LINK_KIND_NAMES[kind] : base.name || t('Modèle de fiche');

  const save = (): void => {
    const { id } = saveTemplate({ id: key.kind === 'own' ? key.id : null, name: draft.name, kind, fields: draft.fields }, { forCollection });
    const kept = trimmed(draft);
    setDraft(kept);
    setBase(kept);
    unsaved.saved();
    form.reset();
    showSnack(t('Modèle enregistré'), undefined, { tone: 'success' });
    if (key.kind === 'new') navigate(paths.template(id), { replace: true });
  };

  // ⌘/Ctrl+S and ⌘/Ctrl+Entrée save from anywhere on the page.
  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || !(event.key === 'Enter' || event.key.toLowerCase() === 's')) return;
    event.preventDefault();
    if (dirty || key.kind === 'new') void form.submit(save);
  });
  useEffect(() => {
    const listen = (event: KeyboardEvent): void => onShortcut(event);
    window.addEventListener('keydown', listen);
    return () => window.removeEventListener('keydown', listen);
  }, []);

  const reset = (): void => {
    if (kind === null) return;
    const undo = resetKindTemplate(kind);
    unsaved.saved();
    showUndo(t('Modèle d’origine rétabli'), undo);
  };

  const remove = (): void => {
    if (key.kind !== 'own') return;
    unsaved.saved();
    onLeave();
    navigate(paths.templates, { replace: true });
    showUndo(t('Modèle supprimé'), deleteTemplate(key.id));
  };

  // One of the person's own, once saved: its menu (the top bar's pebble on a phone-sized window).
  const menuItems = key.kind === 'own' ? [{ label: t('Supprimer le modèle'), icon: 'trash' as const, danger: true, onSelect: remove }] : [];
  const head = slot ? (
    <PageHead title={title} action={menuItems.length > 0 ? { icon: 'more', label: t('Plus d’actions'), onClick: () => setMenu(true), menu: { anchor: more, open: menu } } : undefined} />
  ) : (
    <div className={shell.pageHead}>
      <h1 className={`${shell.pageTitle} t-display`}>{title}</h1>
      {menuItems.length > 0 ? <IconButton ref={more} icon="more" label={t('Plus d’actions')} hasPopup="menu" expanded={menu} onClick={() => setMenu(true)} /> : null}
    </div>
  );

  const cost = formatUsd(before.length * CLAUDE_COST_PER_LINK[model]);
  const rereadAll = (): void => {
    const sent = readLinks(before);
    // No « Annuler »: the server starts reading at once, and a reading begun is spent.
    if (sent > 0) showSnack(t('{links} en lecture', { links: plural(sent, 'lien envoyé', 'liens envoyés') }), undefined, { tone: 'success' });
  };

  return (
    <form className={styles.editor} onSubmit={form.onSubmit(save)} noValidate>
      {head}
      {kind !== null ? (
        <div className={slot ? styles.kindLead : `${styles.kindLead} ${styles.kindLeadUnderTitle}`}>
          <p className="t-meta">{t('Pour les liens que Claude reconnaît comme « {kind} ».', { kind: LINK_KIND_NAMES[kind] })}</p>
          {changed ? (
            <Button kind="text" small icon="restore" onClick={reset}>
              {t('Rétablir l’original')}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className={styles.columns}>
        <div className={styles.main}>
          {kind === null ? (
            <div className={styles.nameBlock}>
              <TextField
                kind="text"
                field={form.field('name')}
                label={t('Nom du modèle')}
                placeholder={t('Vin, plante, jeu de société…')}
                value={draft.name}
                maxLength={TEMPLATE_LIMITS.name}
                autoFocus={key.kind === 'new'}
                onChange={name => setDraft(current => ({ ...current, name }))}
              />
              <p className="t-meta">
                {collections.length > 0
                  ? key.kind === 'new'
                    ? t('Lu sur les liens de {collections} une fois enregistré.', { collections: collections.join(', ') })
                    : t('Lu sur les liens de {collections}.', { collections: collections.join(', ') })
                  : t('Choisissez-le dans le menu d’une collection.')}
              </p>
            </div>
          ) : null}
          {reading && before.length > 0 ? (
            <div className={styles.well}>
              <ReadAllBanner
                text={
                  before.length === 1
                    ? t('{links} · environ {cost} pour le relire', { links: plural(1, 'lien lu avec une autre version', 'liens lus avec une autre version'), cost })
                    : t('{links} · environ {cost} pour les relire', { links: plural(before.length, 'lien lu avec une autre version', 'liens lus avec une autre version'), cost })
                }
                action={before.length === 1 ? t('Relire') : t('Tout relire')}
                onRead={rereadAll}
              />
            </div>
          ) : null}
          <Section title={t('Champs')}>
            <FieldRows fields={draft.fields} onChange={fields => setDraft(current => ({ ...current, fields }))} binding={id => form.field(`field:${id}`)} />
          </Section>
        </div>
        <div className={styles.side}>
          <Section title={t('Essayer')}>
            <TryPanel fields={draft.fields} links={tryLinks} />
          </Section>
        </div>
      </div>
      <FormFoot form={form}>
        <Button type="submit" icon="check" busy={form.busy} disabled={!dirty && key.kind !== 'new'}>
          {t('Enregistrer')}
        </Button>
      </FormFoot>
      <Menu open={menu} anchor={more} onDismiss={() => setMenu(false)} label={t('Plus d’actions')} items={menuItems} />
      {unsaved.dialog}
    </form>
  );
}
