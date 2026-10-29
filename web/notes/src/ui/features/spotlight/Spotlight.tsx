/**
 * The spotlight (⌘P, Ctrl+P elsewhere, or Ctrl+K): search everything, go anywhere. A field over the
 * results: the titles that answer first, then what holds the words in its content, each saying why
 * it matched; on a wide screen the chosen one itself beside the list, its matches marked. The type
 * chips (Tab cycles them), labels (#), when it last changed and the order narrow it; with nothing
 * typed it lists what was opened lately and the ways to start something. The field keeps the focus:
 * the arrows move the choice, Enter opens it, ⌘Enter (Ctrl+Enter) in a new tab.
 */
import { memo, useDeferredValue, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

import type { GlyphName } from '@unlease/design/glyphs';
import { t, tx } from '@unlease/core/i18n';
import type { Label } from '@unlease/notes/models/entities';
import { formatRelative, plural } from '@unlease/core/services/format';
import { bestPart, foldWords, highlight, snippet, type Matcher, type SearchDoc, type SearchHit } from '@unlease/core/services/searchIndex';
import type { SpotMeta } from '@unlease/notes/services/spotlight';

import { useMinute } from '../../../app/hooks/useMinute';
import { runSpotlight, SPOT_SCOPES, SPOT_SINCE, spotlightIndex, type SpotResults, type SpotScope, type SpotSince } from '../../../app/hooks/useSpotlight';
import { useLibraryStore, type LibraryState } from '../../../app/store/library';
import { createPage } from '../../../app/store/pages';
import { habitBoost, recordPick, useSpotlightMemory } from '../../../app/store/spotlight';
import { openCapture, selectSpotlightOpen, setShortcutsOpen, setSpotlightOpen, useUiStore } from '../../../app/store/ui';
import { newChecklist, newDrawing, newNote, newTitledNote } from '../../commands';
import { Highlight } from '../../components/Highlight';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { LabelTag } from '../../components/LabelMark';
import { Layer } from '../../components/Layer';
import { Menu, type MenuItem } from '../../components/Menu';
import { modKey } from '../../dom';
import { browserPath, navigate, paths } from '../../router';
import { useMedia } from '../../useMedia';
import board from '../board/board.module.css';
import { openNewPage } from '../pages/PageTree';
import { DocMark, docFacts, docHref, openDoc, shownDocTitle } from './docs';
import { SpotPreview } from './Preview';
import styles from './spotlight.module.css';

/** Wide enough for the chosen result beside the list. */
const WIDE = '(min-width: 1100px)';
/** A keyboard is likely: the keys are worth naming. */
const FINE = '(hover: hover) and (pointer: fine)';

const SCOPE_NAMES: Readonly<Record<SpotScope, string>> = { all: tx('Tout'), page: tx('Pages'), note: tx('Notes'), collection: tx('Collections'), link: tx('Liens') };
const SINCE_NAMES: Readonly<Record<SpotSince, string>> = { day: tx('Aujourd’hui'), week: tx('7 derniers jours'), month: tx('30 derniers jours'), year: tx('12 derniers mois') };

type Group = 'labels' | 'widen' | 'recent' | 'browse' | 'title' | 'content' | 'partial' | 'actions';

const GROUP_TITLES: Readonly<Record<Group, string | null>> = {
  labels: tx('Labels'),
  widen: null,
  recent: tx('Récents'),
  browse: tx('Les plus récents'),
  title: tx('Titres'),
  content: tx('Dans le contenu'),
  partial: tx('Résultats approchants'),
  actions: tx('Actions'),
};

/** How many of each group show before « Afficher plus ». */
const LIMITS: Readonly<Record<Group, number>> = { labels: 6, widen: 1, recent: 8, browse: 40, title: 8, content: 30, partial: 12, actions: 10 };

type Row =
  | { readonly kind: 'doc'; readonly key: string; readonly group: Group; readonly doc: SearchDoc<SpotMeta>; readonly hit: SearchHit<SpotMeta> | null }
  | { readonly kind: 'label'; readonly key: string; readonly group: Group; readonly label: Label; readonly notes: number }
  | { readonly kind: 'action'; readonly key: string; readonly group: Group; readonly title: string; readonly icon: GlyphName; readonly run: () => void }
  | { readonly kind: 'more'; readonly key: string; readonly group: Group; readonly hidden: number; readonly next: string | null }
  | { readonly kind: 'widen'; readonly key: string; readonly group: Group; readonly count: number };

type Filter = { readonly kind: 'label'; readonly id: string } | { readonly kind: 'since'; readonly since: SpotSince };

const ACTIONS: readonly { readonly title: string; readonly icon: GlyphName; readonly run: () => void }[] = [
  { title: tx('Nouvelle page'), icon: 'pagePlus', run: () => openNewPage(null) },
  { title: tx('Nouvelle note'), icon: 'note', run: () => void newNote() },
  { title: tx('Nouvelle liste à cocher'), icon: 'checklist', run: () => void newChecklist() },
  { title: tx('Nouveau dessin'), icon: 'draw', run: () => void newDrawing() },
  { title: tx('Classer un lien'), icon: 'link', run: () => openCapture('') },
  { title: tx('Réglages'), icon: 'settings', run: () => navigate(paths.settings) },
  { title: tx('Administration'), icon: 'server', run: () => navigate(paths.admin) },
  { title: tx('Raccourcis clavier'), icon: 'key', run: () => setShortcutsOpen(true) },
];

const squash = (text: string): string => foldWords(text).replace(/\s+/g, '');

/** A `#word` being typed at the end of the field: where it starts, and the word. */
function labelDraft(text: string): { readonly at: number; readonly word: string } | null {
  const match = /(^|\s)#([^\s#]*)$/.exec(text);
  return match ? { at: match.index + match[1]!.length, word: match[2]! } : null;
}

/** Every query word starts a word of the action's name. */
function actionMatches(title: string, query: string): boolean {
  const words = foldWords(title).split(/\s+/);
  return foldWords(query)
    .split(/\s+/)
    .filter(Boolean)
    .every(word => words.some(own => own.startsWith(word)));
}

interface RowInput {
  readonly results: SpotResults;
  readonly query: string;
  readonly draft: string | null;
  readonly labels: readonly Label[];
  readonly labelNotes: ReadonlyMap<string, number>;
  readonly chosenLabels: readonly string[];
  readonly recent: readonly SearchDoc<SpotMeta>[];
  readonly scope: SpotScope;
  readonly narrowed: boolean;
  readonly whole: ReadonlySet<Group>;
}

function buildRows({ results, query, draft, labels, labelNotes, chosenLabels, recent, scope, narrowed, whole }: RowInput): Row[] {
  const rows: Row[] = [];
  const add = (group: Group, items: readonly Row[]): void => {
    const limit = whole.has(group) ? Infinity : LIMITS[group];
    rows.push(...items.slice(0, limit));
    if (items.length > limit) rows.push({ kind: 'more', key: `more:${group}`, group, hidden: items.length - limit, next: items[limit]!.key });
  };
  const docRows = (group: Group, hits: readonly SearchHit<SpotMeta>[]): Row[] => hits.map(hit => ({ kind: 'doc', key: hit.doc.key, group, doc: hit.doc, hit }));
  if (draft !== null) {
    const wanted = foldWords(draft);
    const found = labels.filter(label => !chosenLabels.includes(label.id) && foldWords(label.name).includes(wanted));
    found.sort((a, b) => Number(!foldWords(b.name).startsWith(wanted)) - Number(!foldWords(a.name).startsWith(wanted)));
    add('labels', found.map(label => ({ kind: 'label', key: `label:${label.id}`, group: 'labels', label, notes: labelNotes.get(label.id) ?? 0 })));
  }
  if (results.everywhere !== null) rows.push({ kind: 'widen', key: 'widen', group: 'widen', count: results.everywhere });
  if (results.browsing) {
    if (scope === 'all' && !narrowed) {
      add('recent', recent.map(doc => ({ kind: 'doc', key: doc.key, group: 'recent', doc, hit: null })));
      add('actions', ACTIONS.map(action => ({ kind: 'action', key: `action:${action.title}`, group: 'actions', title: t(action.title), icon: action.icon, run: action.run })));
    } else {
      add('browse', docRows('browse', results.hits));
    }
    return rows;
  }
  add('title', docRows('title', results.hits.filter(hit => hit.tier === 'title')));
  add('content', docRows('content', results.hits.filter(hit => hit.tier === 'content')));
  add('partial', docRows('partial', results.hits.filter(hit => hit.tier === 'partial')));
  const actions: Row[] = [];
  const typed = query.trim();
  if (typed) {
    if (scope === 'all') for (const action of ACTIONS) if (actionMatches(t(action.title), typed)) actions.push({ kind: 'action', key: `action:${action.title}`, group: 'actions', title: t(action.title), icon: action.icon, run: action.run });
    // Nothing titled so: offer to make it, as Notion does.
    const named = results.hits.some(hit => hit.tier === 'title' && squash(hit.doc.title) === squash(typed));
    if (!named && (scope === 'all' || scope === 'page')) {
      actions.push({ kind: 'action', key: 'create:page', group: 'actions', title: t('Créer la page « {title} »', { title: typed }), icon: 'pagePlus', run: () => navigate(paths.page(createPage({ title: typed }))) });
    }
    if (!named && (scope === 'all' || scope === 'note')) {
      actions.push({ kind: 'action', key: 'create:note', group: 'actions', title: t('Créer la note « {title} »', { title: typed }), icon: 'note', run: () => void newTitledNote(typed) });
    }
  }
  add('actions', actions);
  return rows;
}

interface RowProps {
  readonly row: Row;
  readonly id: string;
  readonly at: number;
  readonly active: boolean;
  readonly matcher: Matcher;
  readonly library: LibraryState;
  readonly now: number;
}

/** A result; the list hears its pointer and its clicks for every row at once. */
const RowView = memo(function RowView({ row, id, at, active, matcher, library, now }: RowProps) {
  let mark: ReactNode = null;
  let title: ReactNode;
  let meta: string | null = null;
  let excerpt: ReturnType<typeof snippet> | null = null;
  let when: string | null = null;
  switch (row.kind) {
    case 'doc': {
      const shown = shownDocTitle(library, row.doc);
      mark = <DocMark doc={row.doc} />;
      title = <Highlight text={shown} ranges={highlight(shown, matcher)} />;
      const facts = docFacts(library, row.doc);
      if (row.hit?.tier === 'partial') facts.push(t('Manque : {words}', { words: row.hit.missing.join(', ') }));
      meta = facts.join(' · ');
      if (row.hit && row.hit.tier !== 'title') {
        const part = bestPart(row.doc, matcher);
        if (part && part.text.slice(0, 120) !== shown) excerpt = snippet(part.text, matcher, 150);
      }
      when = formatRelative(row.doc.editedAt, now);
      break;
    }
    case 'label':
      mark = <LabelTag color={row.label.color} size={16} />;
      title = row.label.name;
      meta = `${t('Label')} · ${plural(row.notes, t('note'), t('notes'))}`;
      break;
    case 'action':
      mark = <Icon name={row.icon} size={20} />;
      title = row.title;
      break;
    case 'more':
      title = t('Afficher {count} de plus', { count: row.hidden });
      break;
    case 'widen':
      mark = <Icon name="search" size={20} />;
      title = t('Chercher partout');
      meta = t('{results} sans les filtres', { results: plural(row.count, t('résultat'), t('résultats')) });
      break;
  }
  return (
    <div id={id} role="option" aria-selected={active} className={styles.row} data-active={active || undefined} data-kind={row.kind} data-at={at}>
      {row.kind === 'more' ? null : <span className={styles.mark}>{mark}</span>}
      <span className={styles.text}>
        <span className={`${styles.title} t-body`}>{title}</span>
        {meta ? <span className={`${styles.meta} t-meta`}>{meta}</span> : null}
        {excerpt ? (
          <span className={`${styles.snippet} t-meta`}>
            <Highlight text={excerpt.text} ranges={excerpt.ranges} />
          </span>
        ) : null}
      </span>
      {when ? <span className={`${styles.when} t-meta`}>{when}</span> : null}
    </div>
  );
});

/** A filter's chip in the field, with its way out. */
function FilterToken({ filter, labels, onRemove }: { filter: Filter; labels: Readonly<Record<string, Label>>; onRemove: () => void }) {
  const label = filter.kind === 'label' ? labels[filter.id] : undefined;
  const name = filter.kind === 'label' ? (label?.name ?? '') : t(SINCE_NAMES[filter.since]);
  return (
    <span className={`${styles.token} t-meta-strong`}>
      {label ? <LabelTag color={label.color} size={13} /> : <Icon name="clock" size={15} />}
      <span className={styles.tokenName}>{name}</span>
      <button type="button" className={styles.tokenRemove} aria-label={t('Retirer le filtre {name}', { name })} tabIndex={-1} onMouseDown={keepFocus} onClick={onRemove}>
        <Icon name="close" size={14} />
      </button>
    </span>
  );
}

/** A menu dropped from the filter row: the labels, when it changed, the order. */
function RefineButton({ icon, label, items, menuLabel, active, compact }: { icon: GlyphName; label: string; items: readonly MenuItem[]; menuLabel: string; active: boolean; compact: boolean }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={`${styles.refine} t-label`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={compact ? (active ? `${menuLabel} : ${label}` : menuLabel) : undefined}
        data-active={active || undefined}
        onMouseDown={keepFocus}
        onClick={() => setOpen(true)}
      >
        <Icon name={icon} size={18} />
        {compact ? null : <span>{label}</span>}
        <Icon name="chevronDown" size={16} />
      </button>
      <Menu open={open} anchor={anchor} onDismiss={() => setOpen(false)} items={items} label={menuLabel} />
    </>
  );
}

const NO_GROUPS: ReadonlySet<Group> = new Set();

const chosenMark = (chosen: boolean): ReactNode => (chosen ? <Icon name="check" size={22} /> : <span className={styles.menuGap} aria-hidden="true" />);

/** A press that must leave the focus in the field (a chip, a row), so the arrows and Enter go on working. */
const keepFocus = (event: MouseEvent): void => event.preventDefault();

/** The row a pointer event happened on. */
function rowAt(event: MouseEvent): number | null {
  const element = (event.target as HTMLElement).closest<HTMLElement>('[data-at]');
  return element ? Number(element.dataset.at) : null;
}

function SpotlightBody({ onClose }: { onClose: () => void }) {
  const library = useLibraryStore();
  const memory = useSpotlightMemory();
  const now = useMinute();
  const wide = useMedia(WIDE);
  const fine = useMedia(FINE);
  const [text, setText] = useState('');
  const [scope, setScope] = useState<SpotScope>('all');
  const [filters, setFilters] = useState<readonly Filter[]>([]);
  const [byDate, setByDate] = useState(false);
  const [expanded, setExpanded] = useState<{ readonly signature: string; readonly groups: ReadonlySet<Group> } | null>(null);
  const [selected, setSelected] = useState<{ readonly signature: string; readonly key: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const listId = useId();

  const deferred = useDeferredValue(text);
  const draft = labelDraft(deferred);
  const query = draft ? deferred.slice(0, draft.at) : deferred;
  const labelIds = useMemo(() => filters.flatMap(filter => (filter.kind === 'label' ? [filter.id] : [])), [filters]);
  const since = filters.find((filter): filter is Extract<Filter, { kind: 'since' }> => filter.kind === 'since')?.since ?? null;
  const index = useMemo(() => spotlightIndex(library), [library]);
  // On a phone the types scroll: the one chosen (by Tab too) comes into view.
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  }, [scope]);
  const boost = useMemo(() => habitBoost(query, memory, now), [query, memory, now]);
  const results = useMemo(() => runSpotlight(index, query, { scope, labelIds, since, byDate }, boost, now), [index, query, scope, labelIds, since, byDate, boost, now]);

  const liveLabels = useMemo(() => library.labelOrder.map(id => library.labels[id]).filter((label): label is Label => !!label && label.deletedAt === null), [library.labelOrder, library.labels]);
  const labelNotes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of library.noteOrder) {
      const note = library.notes[id];
      if (!note || note.deletedAt !== null || note.trashedAt !== null) continue;
      for (const labelId of note.labelIds) counts.set(labelId, (counts.get(labelId) ?? 0) + 1);
    }
    return counts;
  }, [library.noteOrder, library.notes]);
  // Typing, a scope or a filter starts the list over: the choice at the top, every group short again.
  const signature = `${deferred}\u0000${scope}\u0000${filters.map(filter => (filter.kind === 'label' ? filter.id : filter.since)).join(',')}\u0000${byDate}`;
  const whole = expanded && expanded.signature === signature ? expanded.groups : NO_GROUPS;
  const recent = useMemo(() => {
    const byKey = new Map(index.docs.map(doc => [doc.key, doc]));
    return memory.recent.map(key => byKey.get(key)).filter((doc): doc is SearchDoc<SpotMeta> => !!doc);
  }, [index, memory.recent]);
  const rows = useMemo(
    () => buildRows({ results, query, draft: draft?.word ?? null, labels: liveLabels, labelNotes, chosenLabels: labelIds, recent, scope, narrowed: filters.length > 0, whole }),
    [results, query, draft?.word, liveLabels, labelNotes, labelIds, recent, scope, filters.length, whole],
  );

  const found = selected && selected.signature === signature ? rows.findIndex(row => row.key === selected.key) : -1;
  const active = found === -1 ? 0 : found;
  const activeRow = rows[active];
  const select = (at: number): void => {
    const row = rows[at];
    if (row) setSelected({ signature, key: row.key });
  };

  const addLabel = (id: string): void => setFilters(current => [...current.filter(filter => !(filter.kind === 'label' && filter.id === id)), { kind: 'label', id }]);
  const setSince = (value: SpotSince | null): void =>
    setFilters(current => {
      const others = current.filter(filter => filter.kind !== 'since');
      return value ? [...others, { kind: 'since', since: value }] : others;
    });
  const refocus = (): void => {
    requestAnimationFrame(() => input.current?.focus());
  };
  const pickLabel = (label: Label): void => {
    addLabel(label.id);
    const draftNow = labelDraft(text);
    setText(draftNow ? text.slice(0, draftNow.at) : text);
    refocus();
  };

  const take = (row: Row | undefined, newTab = false): void => {
    if (!row) return;
    switch (row.kind) {
      case 'doc': {
        const part = row.hit && row.hit.tier !== 'title' ? bestPart(row.doc, results.matcher) : null;
        if (query.trim()) recordPick(query, row.key);
        if (newTab) {
          window.open(browserPath(docHref(row.doc, part)), '_blank', 'noopener');
          return;
        }
        onClose();
        openDoc(row.doc, part);
        return;
      }
      case 'label':
        pickLabel(row.label);
        return;
      case 'action':
        onClose();
        row.run();
        return;
      case 'more':
        // The group shows whole, the choice on the first of what it uncovers.
        setExpanded({ signature, groups: new Set(whole).add(row.group) });
        if (row.next) setSelected({ signature, key: row.next });
        return;
      case 'widen':
        setScope('all');
        setFilters([]);
        return;
    }
  };

  const move = (to: number): void => {
    if (rows.length === 0) return;
    select(to);
    // After React has drawn the new choice, which may sit in a group just expanded.
    requestAnimationFrame(() => document.getElementById(`${listId}-${to}`)?.scrollIntoView?.({ block: 'nearest' }));
  };

  const cycleScope = (step: number): void => {
    const at = SPOT_SCOPES.indexOf(scope);
    setScope(SPOT_SCOPES[(at + step + SPOT_SCOPES.length) % SPOT_SCOPES.length]!);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) return;
    const last = rows.length - 1;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        move(event.key === 'ArrowDown' ? (active >= last ? 0 : active + 1) : active <= 0 ? last : active - 1);
        break;
      case 'PageDown':
      case 'PageUp':
        event.preventDefault();
        move(Math.max(0, Math.min(last, active + (event.key === 'PageDown' ? 8 : -8))));
        break;
      case 'Enter':
        event.preventDefault();
        take(activeRow, event.metaKey || event.ctrlKey);
        break;
      case 'Tab': {
        // A label being typed is completed; otherwise Tab moves through the types, and past the last (or before the first) on to the menus beside them.
        const label = rows.find(row => row.kind === 'label');
        if (draft && label?.kind === 'label') {
          event.preventDefault();
          pickLabel(label.label);
          break;
        }
        const next = SPOT_SCOPES.indexOf(scope) + (event.shiftKey ? -1 : 1);
        if (next < 0 || next >= SPOT_SCOPES.length) break;
        event.preventDefault();
        cycleScope(event.shiftKey ? -1 : 1);
        break;
      }
      case 'Backspace': {
        const field = event.currentTarget;
        if (field.selectionStart === 0 && field.selectionEnd === 0 && filters.length > 0) {
          event.preventDefault();
          setFilters(current => current.slice(0, -1));
        }
        break;
      }
    }
  };

  const onChange = (value: string): void => {
    // « #travail » and a space: the label, when one has exactly that name.
    const typed = /(^|\s)#([^\s#]+)\s$/.exec(value);
    const label = typed ? liveLabels.find(candidate => squash(candidate.name) === squash(typed[2]!)) : undefined;
    if (typed && label) {
      addLabel(label.id);
      setText(value.slice(0, typed.index + typed[1]!.length));
      return;
    }
    setText(value);
  };

  const clear = (): void => {
    setText('');
    setFilters([]);
    refocus();
  };

  const counted = !(results.browsing && scope === 'all' && filters.length === 0);
  const total = counted ? results.counts[scope] : null;
  const nothing = !results.browsing && results.hits.length === 0 && draft === null;
  const activeDoc = activeRow?.kind === 'doc' ? activeRow : null;
  const activePart = activeDoc && activeDoc.hit && activeDoc.hit.tier !== 'title' ? bestPart(activeDoc.doc, results.matcher) : null;

  const labelItems: MenuItem[] = liveLabels.map(label => ({
    label: label.name,
    icon: 'tag',
    mark: <LabelTag color={label.color} size={16} />,
    onSelect: () => {
      addLabel(label.id);
      refocus();
    },
  }));
  const chooseSince = (value: SpotSince | null): void => {
    setSince(value);
    refocus();
  };
  const chooseOrder = (newest: boolean): void => {
    setByDate(newest);
    refocus();
  };
  const sinceItems: MenuItem[] = [
    { label: t('N’importe quand'), icon: 'clock', mark: chosenMark(since === null), onSelect: () => chooseSince(null) },
    ...SPOT_SINCE.map(value => ({ label: t(SINCE_NAMES[value]), icon: 'clock' as const, mark: chosenMark(since === value), onSelect: () => chooseSince(value) })),
  ];
  const sortItems: MenuItem[] = [
    { label: t('Pertinence'), icon: 'sort', mark: chosenMark(!byDate), onSelect: () => chooseOrder(false) },
    { label: t('Plus récents d’abord'), icon: 'sort', mark: chosenMark(byDate), onSelect: () => chooseOrder(true) },
  ];
  const removeFilter = (at: number): void => {
    setFilters(current => current.filter((_, k) => k !== at));
    refocus();
  };
  const tiers = { title: 0, content: 0, partial: 0 };
  for (const hit of results.hits) tiers[hit.tier] += 1;
  const groupCount = (group: Group): number | null => (group === 'title' || group === 'content' || group === 'partial' ? tiers[group] : group === 'browse' ? results.hits.length : null);

  return (
    <div className={styles.spotlight} data-wide={wide || undefined}>
      <div className={styles.head}>
        <div className={styles.field}>
          <span className={styles.glyph}>
            <Icon name="search" size={22} />
          </span>
          {filters.map((filter, at) => (
            <FilterToken key={filter.kind === 'label' ? filter.id : 'since'} filter={filter} labels={library.labels} onRemove={() => removeFilter(at)} />
          ))}
          <input
            ref={input}
            className={styles.input}
            value={text}
            autoFocus
            placeholder={filters.length > 0 ? t('Affiner…') : t('Chercher une page, une note, un lien…')}
            aria-label={t('Rechercher')}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={activeRow ? `${listId}-${active}` : undefined}
            aria-describedby={`${listId}-count`}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            onChange={event => onChange(event.target.value)}
            onKeyDown={onKeyDown}
          />
          {text || filters.length > 0 ? <IconButton icon="close" label={t('Effacer la recherche')} compact size={18} onClick={clear} /> : null}
          {fine && !text && filters.length === 0 ? (
            <kbd className={styles.key} aria-hidden="true">
              {t('Échap')}
            </kbd>
          ) : null}
        </div>
        <div className={styles.filters}>
          <div ref={strip} className={styles.scopes} role="radiogroup" aria-label={t('Type')}>
            {SPOT_SCOPES.map(value => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={scope === value}
                tabIndex={-1}
                className={`${styles.scope} t-label`}
                onMouseDown={keepFocus}
                onClick={() => setScope(value)}
              >
                <span>{t(SCOPE_NAMES[value])}</span>
                {counted ? (
                  <>
                    {' '}
                    <span className={styles.count}>{results.counts[value]}</span>
                  </>
                ) : null}
              </button>
            ))}
          </div>
          <div className={styles.refines}>
            {liveLabels.length > 0 ? <RefineButton icon="tag" label={t('Label')} menuLabel={t('Filtrer par label')} items={labelItems} active={labelIds.length > 0} compact={!wide} /> : null}
            <RefineButton icon="clock" label={since ? t(SINCE_NAMES[since]) : t('Modifié')} menuLabel={t('Modifié')} items={sinceItems} active={since !== null} compact={!wide} />
            <RefineButton icon="sort" label={byDate ? t('Plus récents') : t('Pertinence')} menuLabel={t('Trier')} items={sortItems} active={byDate} compact={!wide} />
          </div>
        </div>
      </div>
      <div className={styles.body}>
        <div className={styles.results}>
          {results.typos ? <p className={`${styles.notice} t-meta`}>{t('Aucun mot exact : voici les plus proches.')}</p> : null}
          {nothing ? (
            <div className={styles.nothing}>
              <p className="t-body-strong">{t('Rien ne correspond à « {query} »', { query: query.trim() || '…' })}</p>
              <p className="t-meta">{filters.length > 0 || scope !== 'all' ? t('Les filtres écartent peut-être ce que vous cherchez.') : t('Essayez un autre mot, ou moins de mots.')}</p>
            </div>
          ) : null}
          <div
            id={listId}
            role="listbox"
            aria-label={t('Résultats')}
            className={styles.list}
            onMouseDown={keepFocus}
            onPointerMove={event => {
              const at = rowAt(event);
              if (at !== null && at !== active) select(at);
            }}
            onClick={event => {
              const at = rowAt(event);
              const row = at === null ? undefined : rows[at];
              take(row, row?.kind === 'doc' && (event.metaKey || event.ctrlKey));
            }}
            onAuxClick={event => {
              const at = rowAt(event);
              const row = at === null ? undefined : rows[at];
              if (event.button === 1 && row?.kind === 'doc') take(row, true);
            }}
          >
            {rows.map((row, at) => {
              const heading = GROUP_TITLES[row.group];
              const count = groupCount(row.group);
              return (
                <div key={row.key} role="presentation">
                  {heading && (at === 0 || rows[at - 1]!.group !== row.group) ? (
                    <p className={`${styles.group} t-meta-strong`} aria-hidden="true">
                      {t(heading)}
                      {count !== null ? <span className={styles.groupCount}>{count}</span> : null}
                    </p>
                  ) : null}
                  <RowView row={row} id={`${listId}-${at}`} at={at} active={at === active} matcher={results.matcher} library={library} now={now} />
                </div>
              );
            })}
          </div>
        </div>
        {wide ? <SpotPreview doc={activeDoc?.doc ?? null} part={activePart} matcher={results.matcher} now={now} /> : null}
      </div>
      {fine ? (
        <div className={`${styles.foot} t-meta`} aria-hidden="true">
          <span className={styles.hints}>
            <span>
              <kbd className={board.kbd}>↑</kbd>
              <kbd className={board.kbd}>↓</kbd> {t('choisir')}
            </span>
            <span>
              <kbd className={board.kbd}>↵</kbd> {t('ouvrir')}
            </span>
            <span>
              <kbd className={board.kbd}>{modKey()}</kbd>
              <kbd className={board.kbd}>↵</kbd> {t('nouvel onglet')}
            </span>
            <span>
              <kbd className={board.kbd}>⇥</kbd> {t('type')}
            </span>
            <span>
              <kbd className={board.kbd}>#</kbd> {t('label')}
            </span>
          </span>
          <span className={styles.total}>{total === null ? null : plural(total, t('résultat'), t('résultats'))}</span>
        </div>
      ) : null}
      <p id={`${listId}-count`} className={styles.live} aria-live="polite">
        {total === null ? '' : plural(total, t('résultat'), t('résultats'))}
      </p>
    </div>
  );
}

export function Spotlight() {
  const open = useUiStore(selectSpotlightOpen);
  const close = (): void => setSpotlightOpen(false);
  // The index is built while the browser is idle, so the first ⌘P opens on it at once.
  useEffect(() => {
    if (typeof requestIdleCallback !== 'function') return;
    const handle = requestIdleCallback(() => spotlightIndex(useLibraryStore.getState()), { timeout: 5000 });
    return () => cancelIdleCallback(handle);
  }, []);
  return (
    <Layer open={open} onDismiss={close} label={t('Rechercher')} panelClassName={styles.panel}>
      {open ? <SpotlightBody onClose={close} /> : null}
    </Layer>
  );
}
