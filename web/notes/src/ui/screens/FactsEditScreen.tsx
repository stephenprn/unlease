/**
 * « Ce que Claude relève » for one collection, or the usual facts of one kind of link
 * (`/notes/facts/<collection>`, `/notes/facts/kind-recipe`).
 *
 * A collection's page asks one thing first: « Informations adaptatives » (each link gets those of
 * its kind; « Types de liens ici » lists the kinds its links have, each opening its usual facts) or
 * « Informations personnalisées » (one list for every link here, edited right there, starting from a starter's
 * own facts, else the usual facts of its most frequent kind). A kind's page is that list alone, with « Rétablir celles de
 * Claude » while it is changed. Either way the facts read as they will on a link (`FactRows`), a
 * preview on one link sits beside them on a wide window (under them otherwise), and « Enregistrer »
 * sticks to the window's foot (⌘/Ctrl+S, ⌘/Ctrl+Entrée) and saves the page whole: the page stays,
 * so a well at its top can offer to read again the links read before the change. Leaving with
 * changes asks first.
 *
 * An address of the « Modèles de fiche » that named a template goes to the first collection noting
 * with it.
 */
import { useContext, useEffect, useEffectEvent, useMemo, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { t, tc } from '@unlease/core/i18n';
import { formatUsd, plural } from '@unlease/core/services/format';
import { CLAUDE_COST_PER_LINK } from '@unlease/core/sync/settings';
import { asLineColor } from '@unlease/design/colors';
import { collectionEmblem } from '@unlease/notes/models/collections';
import { INBOX_ID, LINK_KIND_NAMES, shownTitle, type LinkItem, type LinkKind, type Note } from '@unlease/notes/models/entities';
import type { TemplateField } from '@unlease/notes/models/templates';
import {
  changedKindTemplate,
  collectionKinds,
  collectionTemplate,
  collectionsOfTemplate,
  kindFields,
  kindsOfLinks,
  kindTemplateId,
  linksOfTemplate,
  linksReadBefore,
  linkTemplateSource,
  otherCollectionsOf,
  readingSignature,
  startingFacts,
  templateProblems,
} from '@unlease/notes/services/templates';

import { readLinks, resetKindTemplate, saveCollectionFacts, saveTemplate } from '../../app/store/actions';
import { useLibraryStore, type LibraryState } from '../../app/store/library';
import { kindDraftFields, templateKey } from '../../app/templates';
import { selectServerSettings, useServerFeature, useServerSettingsStore } from '@shared/app/store/serverSettings';
import { showSnack, showUndo } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { EmblemStone } from '@shared/ui/components/Emblem';
import { EmptyLine } from '@shared/ui/components/EmptyLine';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { FormFoot } from '@shared/ui/components/FormFoot';
import { Icon } from '@shared/ui/components/Icon';
import { useForm } from '@shared/ui/components/useForm';
import { useUnsaved } from '@shared/ui/components/useUnsaved';
import { Section } from '@shared/ui/features/settings/Section';
import page from '@shared/ui/features/settings/settings.module.css';
import { PageHead, PageHeadSlot } from '@shared/ui/navigation/PageHead';
import shell from '@shared/ui/navigation/shell.module.css';
import { navigate } from '@shared/ui/router';
import { ReadAllBanner } from '../features/lines/LineRefine';
import { KIND_ICONS } from '../features/links/kindIcon';
import { FactRows } from '../features/templates/FactRows';
import { TryPanel } from '../features/templates/TryPanel';
import styles from '../features/templates/templates.module.css';
import { paths } from '../routes';

/** How many links the preview offers. */
const TRY_LINKS = 8;

/** A collection that can note its own facts: a live collection of links, never « Non classé ». */
function ownsFacts(note: Note | undefined): note is Note {
  return !!note && note.id !== INBOX_ID && note.kind === 'links' && note.deletedAt === null && note.trashedAt === null;
}

/** The tab's name for the page at `part`. */
export function factsTitle(state: LibraryState, part: string): string {
  const key = templateKey(part);
  if (key.kind === 'kind') return t('Usual facts · {kind}', { kind: LINK_KIND_NAMES[key.linkKind] });
  const line = state.notes[part];
  return ownsFacts(line) ? t('{collection} · Facts Claude notes', { collection: shownTitle(line) }) : t('Facts Claude notes');
}

export function FactsEditScreen({ part }: { part: string }) {
  const key = useMemo(() => templateKey(part), [part]);
  const line = useLibraryStore(s => (key.kind === 'kind' ? undefined : s.notes[part]));
  // An old address naming a template: the first collection noting with it.
  const moved = useLibraryStore(s => (key.kind === 'kind' || ownsFacts(s.notes[part]) ? null : (collectionsOfTemplate(part, s.notes).find(ownsFacts)?.id ?? null)));
  useEffect(() => {
    if (moved) navigate(paths.template(moved), { replace: true });
  }, [moved]);
  if (key.kind === 'kind') return <FactsEditor kind={key.linkKind} />;
  if (ownsFacts(line)) return <FactsEditor lineId={line.id} />;
  if (moved) return null;
  return (
    <div className={styles.editor}>
      <EmptyState scene="trash" as="h1" title={t('This list of facts no longer exists')} text={tc('template', 'It was deleted, on this device or another.')}>
        <Button kind="tonal" icon="list" onClick={() => navigate(paths.templates, { replace: true })}>
          {t('Facts Claude notes')}
        </Button>
      </EmptyState>
    </div>
  );
}

interface Draft {
  /** A collection's own list (true), or Claude's usual facts (false); a kind's page always edits its list. */
  readonly own: boolean;
  readonly fields: readonly TemplateField[];
}

/** The draft as it is kept: its words trimmed, a collection back on the usual facts keeping none. */
const trimmed = (draft: Draft): Draft => ({ own: draft.own, fields: draft.own ? draft.fields.map(field => ({ ...field, name: field.name.trim(), hint: field.hint.trim() })) : [] });

const sameDraft = (a: Draft, b: Draft): boolean => JSON.stringify(trimmed(a)) === JSON.stringify(trimmed(b));

type EditorProps = { readonly kind: LinkKind; readonly lineId?: undefined } | { readonly lineId: string; readonly kind?: undefined };

function FactsEditor({ kind, lineId }: EditorProps) {
  const templates = useLibraryStore(s => s.linkTemplates);
  const line = useLibraryStore(s => (lineId ? s.notes[lineId] : undefined));
  const collection = lineId ? shownTitle(line!) : '';
  const template = lineId ? collectionTemplate(templates, line) : null;
  const saved: Draft = kind ? { own: true, fields: kindDraftFields(templates, kind) } : { own: template !== null, fields: template?.fields ?? [] };
  const [draft, setDraft] = useState<Draft>(saved);
  const [base, setBase] = useState<Draft>(saved);
  const dirty = !sameDraft(draft, base);
  // Changed elsewhere (another device, « Annuler » on a slip) while nothing is typed here: the page follows.
  if (!sameDraft(saved, base) && !dirty) {
    setBase(saved);
    setDraft(saved);
  }
  const unsaved = useUnsaved(dirty, { page: lineId ? paths.line(lineId) : paths.templates });
  // Reading again and the try, once the server has said Claude has a key.
  const reading = useServerFeature('claude');
  const model = useServerSettingsStore(selectServerSettings)?.analysis.model ?? 'claude-opus-5-5';
  const slot = useContext(PageHeadSlot);

  // A collection's list is named after it: only its facts are checked (a kind given, the name is not).
  const problems = templateProblems({ name: '', kind: kind ?? 'other', fields: draft.own ? draft.fields : [] }, []);
  const checks: Record<string, string | null> = {};
  for (const field of draft.fields) checks[`field:${field.id}`] = draft.own ? (problems.fields[field.id] ?? null) : null;
  const form = useForm<string>(checks);

  // The collection's links, newest first: what the preview offers, and the kinds they have.
  const links = useLibraryStore(
    useShallow(s => {
      if (lineId) return (s.linksByNote[lineId] ?? []).flatMap(id => (s.links[id] && s.links[id]!.deletedAt === null ? [s.links[id]!] : []));
      return linksOfTemplate({ id: kindTemplateId(kind!), kind: kind! }, Object.values(s.links), s.notes, s.linkTemplates);
    }),
  );
  const kinds = useMemo(() => kindsOfLinks(links), [links]);
  // What the facts are for: the page's kind, or the collection's links' kinds then those its title names (« Films & séries »).
  const expected = useMemo((): LinkKind[] => (kind ? [kind] : collectionKinds(links, collection)), [kind, links, collection]);
  const tryLinks: LinkItem[] = useMemo(() => [...links].sort((a, b) => b.createdAt - a.createdAt).slice(0, TRY_LINKS), [links]);
  // Read before the facts they read with now (as saved): « Tout relire ».
  const before = useLibraryStore(
    useShallow(s => {
      if (kind) return linksReadBefore({ id: kindTemplateId(kind), kind }, Object.values(s.links), s.notes, s.linkTemplates).map(link => link.id);
      return (s.linksByNote[lineId!] ?? []).filter(id => {
        const link = s.links[id];
        return !!link && link.deletedAt === null && link.status === 'ready' && (link.readWith ?? 'preset') !== readingSignature(linkTemplateSource(s.linkTemplates, link, s.notes));
      });
    }),
  );
  const others = useLibraryStore(useShallow(s => (template && lineId ? otherCollectionsOf(template.id, s.notes, lineId).map(shownTitle) : [])));
  const changed = kind ? changedKindTemplate(templates, kind) !== null : false;

  const choose = (own: boolean): void => {
    setDraft(current => {
      if (current.own === own) return current;
      // Its own list taken for the first time: a starter's own facts, else the usual facts of its most frequent kind, to change.
      const fields = own && current.fields.length === 0 ? startingFacts(templates, expected, lineId) : current.fields;
      return { own, fields };
    });
  };

  const save = (): void => {
    if (kind) {
      saveTemplate({ id: null, name: '', kind, fields: draft.fields });
      showSnack(t('Facts saved'), undefined, { tone: 'success' });
    } else {
      showUndo(t('Facts saved'), saveCollectionFacts(lineId!, draft.own ? draft.fields : null));
    }
    const kept = trimmed(draft);
    setDraft(kept);
    setBase(kept);
    unsaved.saved();
    form.reset();
  };

  // ⌘/Ctrl+S and ⌘/Ctrl+Entrée save from anywhere on the page.
  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || !(event.key === 'Enter' || event.key.toLowerCase() === 's')) return;
    event.preventDefault();
    if (dirty) void form.submit(save);
  });
  useEffect(() => {
    const listen = (event: KeyboardEvent): void => onShortcut(event);
    window.addEventListener('keydown', listen);
    return () => window.removeEventListener('keydown', listen);
  }, []);

  const reset = (): void => {
    if (!kind) return;
    const undo = resetKindTemplate(kind);
    unsaved.saved();
    showUndo(t('Claude’s facts restored'), undo);
  };

  const cost = formatUsd(before.length * CLAUDE_COST_PER_LINK[model]);
  const readAgain = (): void => {
    const sent = readLinks(before);
    // No « Annuler »: the server starts reading at once, and a reading begun is spent.
    if (sent > 0) showSnack(t('{links} for reading', { links: plural(sent, 'link sent', 'links sent') }), undefined, { tone: 'success' });
  };

  const title = kind ? t('Usual facts · {kind}', { kind: LINK_KIND_NAMES[kind] }) : t('Facts Claude notes');
  const head = slot ? <PageHead title={title} /> : (
    <div className={shell.pageHead}>
      <h1 className={`${shell.pageTitle} t-display`}>{title}</h1>
    </div>
  );

  return (
    <form className={styles.editor} onSubmit={form.onSubmit(save)} noValidate>
      {head}
      <div className={slot ? styles.lead2 : `${styles.lead2} ${styles.leadUnderTitle}`}>
        {kind ? (
          <>
            <p className="t-meta">{t('Claude notes these on every link it recognises as “{kind}”, except in a collection that has its own.', { kind: LINK_KIND_NAMES[kind] })}</p>
            {changed ? (
              <Button kind="text" small icon="restore" onClick={reset}>
                {t('Restore Claude’s facts')}
              </Button>
            ) : null}
          </>
        ) : (
          <button type="button" className={`${styles.collectionLink} t-label`} onClick={() => navigate(paths.line(lineId!))}>
            <EmblemStone id={lineId!} emblem={collectionEmblem(lineId!, line!.emblem)} color={asLineColor(line!.color)} size={18} width={30} height={27} />
            <span>{t('On the links in {collection}', { collection })}</span>
          </button>
        )}
      </div>
      {reading && before.length > 0 && !dirty ? (
        <div className={styles.well}>
          <ReadAllBanner
            text={
              before.length === 1
                ? t('{links} before this change · about {cost} to read it again', { links: plural(1, 'link read', 'links read'), cost })
                : t('{links} before this change · about {cost} to read them again', { links: plural(before.length, 'link read', 'links read'), cost })
            }
            action={before.length === 1 ? t('Read again') : t('Read all again')}
            onRead={readAgain}
          />
        </div>
      ) : null}
      {lineId ? <SourceChoice own={draft.own} onChoose={choose} stone={<EmblemStone id={lineId} emblem={collectionEmblem(lineId, line!.emblem)} color={asLineColor(line!.color)} size={16} width={28} height={25} />} /> : null}
      <div className={styles.columns}>
        <div className={styles.main}>
          {draft.own ? (
            <Section title={t('Facts')}>
              <FactRows fields={draft.fields} problems={problems.fields} kinds={expected} onChange={fields => setDraft(current => ({ ...current, fields }))} binding={id => form.field(`field:${id}`)} />
              {others.length > 0 ? <p className={`${styles.shared} t-meta`}>{t('Also noted on the links in {collections}.', { collections: others.join(', ') })}</p> : null}
            </Section>
          ) : (
            <UsualFacts kinds={kinds} />
          )}
        </div>
        {draft.own && reading ? (
          <div className={styles.side}>
            <Section title={t('Preview on a link')}>
              <TryPanel fields={draft.fields} links={tryLinks} />
            </Section>
          </div>
        ) : null}
      </div>
      <FormFoot form={form}>
        <Button type="submit" icon="check" busy={form.busy} disabled={!dirty}>
          {t('Save')}
        </Button>
      </FormFoot>
      {unsaved.dialog}
    </form>
  );
}

/** Where a collection's facts come from: Claude's usual ones (its sparkle), or its own list (its stone); a choice of two, saved with the page. */
function SourceChoice({ own, onChoose, stone }: { own: boolean; onChoose: (own: boolean) => void; stone: ReactNode }) {
  const choice = (value: boolean, mark: ReactNode, name: string, meta: string) => (
    <button key={String(value)} type="button" role="radio" aria-checked={own === value} tabIndex={own === value ? 0 : -1} className={styles.choice} onClick={() => onChoose(value)}>
      <span className={styles.choiceGlyph}>{mark}</span>
      <span className={styles.choiceText}>
        <span className="t-body-strong">{name}</span>
        <span className={`${styles.choiceMeta} t-meta`}>{meta}</span>
      </span>
      <Icon name="check" size={20} className={styles.choiceTick} />
    </button>
  );
  return (
    <div
      role="radiogroup"
      aria-label={t('Facts Claude notes')}
      className={styles.choices}
      onKeyDown={event => {
        // The arrows move between the two, as a radio group's do.
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        onChoose(!own);
        const next = event.currentTarget.querySelector<HTMLElement>(`[aria-checked="false"]`);
        next?.focus();
      }}
    >
      {choice(false, <Icon name="sparkle" size={24} />, t('Adaptive facts'), t('Claude picks them by each link’s kind: a product’s brand, a film’s director…'))}
      {choice(true, stone, t('Custom facts'), t('The ones you choose, the same on every link here.'))}
    </div>
  );
}

/** What Claude notes on a collection reading by kind: each kind its links have, with its usual facts, opening them. */
function UsualFacts({ kinds }: { kinds: readonly LinkKind[] }) {
  const templates = useLibraryStore(s => s.linkTemplates);
  return (
    <Section title={t('Kinds of link here')}>
      {kinds.length === 0 ? <EmptyLine text={t('Its links have no kind yet: Claude gives one to each link it reads.')} className={styles.usualEmpty} /> : null}
      {kinds.map(kind => {
        const names = kindFields(templates, kind)
          .map(field => field.name)
          .join(', ');
        return (
          <button key={kind} type="button" className={page.row} onClick={() => navigate(paths.template(`kind-${kind}`))}>
            <Icon name={KIND_ICONS[kind]} size={24} />
            <span className={page.rowText}>
              <span className="t-body">{LINK_KIND_NAMES[kind]}</span>
              <span className={`${styles.rowMeta} t-meta`}>{names || t('No facts')}</span>
            </span>
            <Icon name="chevronRight" size={20} className={styles.chevron} />
          </button>
        );
      })}
      <button type="button" className={`${styles.usualAll} t-label`} onClick={() => navigate(paths.templates)}>
        {t('Usual facts, by kind of link')}
        <Icon name="chevronRight" size={18} />
      </button>
    </Section>
  );
}
