/**
 * One collection: its head, a field to add a link straight into it, the links to do, then the
 * ones done, stamped, at the foot under "Déjà faits". One list, as on the phone, so a link
 * stamped (or put back) files itself there rather than leaving one list for another. The links
 * are rows, a gallery, a mosaic or a table (`LineLayout`). Over them, the layout, the order and the
 * filter this browser keeps for the collection (`lineView`), and « Tout
 * lire » while Claude could read links kept unread here, else « Tout relire » for the links read
 * before the last change to the collection's own facts (« Ce que Claude relève »).
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { collectionEmblem } from '@unlease/notes/models/collections';
import { t, tx } from '@unlease/core/i18n';
import { asLineColor } from '@unlease/design/colors';
import { formatPrice, formatUsd, plural, totalPrice } from '@unlease/core/services/format';
import { CLAUDE_COST_PER_LINK } from '@unlease/core/sync/settings';
import { arrangeLine, DEFAULT_LINE_VIEW, type LineView } from '@unlease/notes/services/lineView';
import { sortable } from '@unlease/notes/services/sorting';
import { addedMessage, addedTone } from '@unlease/notes/services/savedLinks';
import { extractUrls } from '@unlease/core/services/url';
import { isBlank } from '@unlease/core/services/formChecks';
import { INBOX_ID, INBOX_TITLE, shownHint, shownTitle, type LinkItem } from '@unlease/notes/models/entities';
import { collectionTemplate, linksReadBefore } from '@unlease/notes/services/templates';

import { useLines } from '../../app/hooks/useLines';
import { useMinute } from '@shared/app/hooks/useMinute';
import { addLinks, readLinks, restoreNotes, setPinned, trashLines, trashNotes } from '../../app/store/actions';
import { useLibraryStore, type LibraryState } from '../../app/store/library';
import { setLineView, useLineView } from '../../app/store/lineViews';
import { selectServerSettings, useServerFeature, useServerSettingsStore } from '@shared/app/store/serverSettings';
import { showError, showSnack, showUndo } from '@shared/app/store/ui';
import { useForm } from '@shared/ui/components/useForm';
import { BoundInput, FieldProblem } from '../features/BoundInput';
import { selectSorting, useNotesUiStore } from '../../app/store/notesUi';
import { openLink } from '../commands';
import { Button } from '@shared/ui/components/Button';
import { settleIn } from '@shared/ui/components/EmptyLine';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton } from '@shared/ui/components/IconButton';
import { Menu } from '@shared/ui/components/Menu';
import { CollectionHeader } from '../features/lines/CollectionHeader';
import { FilteredEmpty, LineRefine, ReadAllBanner } from '../features/lines/LineRefine';
import { DeleteLineDialog, type LinksFate } from '../features/lines/DeleteLineDialog';
import { EditLineDialog } from '../features/lines/LineDialogs';
import { ModulesDialog } from '../features/lines/ModulesDialog';
import styles from '../features/lines/lines.module.css';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { MoveDialog } from '../features/lines/MoveDialog';
import { ReviewDialog } from '../features/lines/ReviewDialog';
import { sortDeletedLinksOnSlip, sortInboxOnSlip } from '../features/lines/sortingSlips';
import { LinkRow } from '../features/links/LinkRow';
import { LinkTable } from '../features/links/LinkTable';
import { LinkTile } from '../features/links/LinkTile';
import views from '../features/links/linkViews.module.css';
import { useFilingMotion } from '../features/links/useFilingMotion';
import { navigate } from '@shared/ui/router';
import { paths } from '../routes';
import { NotFound } from '@shared/ui/screens/NotFound';

const canPaste = (): boolean => typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function';

/** The collection's live links, in its own order. */
const linksOf = (s: LibraryState, id: string): LinkItem[] => (s.linksByNote[id] ?? []).flatMap(lid => (s.links[lid] ? [s.links[lid]!] : []));

/** How the rows lie with this view: when it changes, they move (`useFilingMotion`). */
const orderOf = (s: LibraryState, id: string, view: LineView): string => {
  const shown = arrangeLine(linksOf(s, id), view);
  return `${shown.open.map(link => link.id).join(',')}|${shown.done.map(link => link.id).join(',')}`;
};

export function LineScreen({ id }: { id: string }) {
  const line = useLibraryStore(s => s.notes[id]);
  const now = useMinute();
  const view = useLineView(id);
  const { open, done, total, toDo, all, unread, failed, priceDrop, priced, skipped } = useLibraryStore(
    useShallow(s => {
      const links = linksOf(s, id);
      const shown = arrangeLine(links, view);
      // The head counts what is left to do whatever the filter.
      const left = links.filter(link => !link.done);
      const sum = totalPrice(left);
      return {
        open: shown.open.map(link => link.id).join(','),
        done: shown.done.map(link => link.id).join(','),
        total: sum ? formatPrice(sum.amount, sum.currency) : '',
        toDo: left.length,
        ...shown.counts,
        priced: shown.priced,
        skipped: links.filter(link => link.status === 'skipped').length,
      };
    }),
  );
  const model = useServerSettingsStore(selectServerSettings)?.analysis.model ?? 'claude-opus-5-5';
  // What Claude may sort here: in "Non classé", not what the person put there themselves.
  const sortableCount = useLibraryStore(
    s =>
      (s.linksByNote[id] ?? []).filter(lid => {
        const link = s.links[lid];
        return !!link && sortable(link) && (id !== INBOX_ID || link.filedBy !== 'person');
      }).length,
  );
  // Claude's offers (reading, sorting, its facts) only once the server has said it has a key.
  const reading = useServerFeature('claude');
  // Its links noted before the last change to its own facts (« Ce que Claude relève »).
  const stale = useLibraryStore(
    useShallow(s => {
      const template = id === INBOX_ID ? null : collectionTemplate(s.linkTemplates, s.notes[id]);
      return template ? linksReadBefore(template, linksOf(s, id), s.notes, s.linkTemplates).map(link => link.id) : [];
    }),
  );
  const sorting = useNotesUiStore(selectSorting);
  const otherLines = useLines().some(other => other.id !== id && other.id !== INBOX_ID);
  const [url, setUrl] = useState('');
  // Words with no link in them are said under the strip, what was typed kept.
  const form = useForm({ url: !isBlank(url) && extractUrls(url).length === 0 ? t('Aucun lien ici : collez une adresse, comme https://example.org/page.') : null });
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [modules, setModules] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLElement | null>(null);
  const holdList = useCallback((node: HTMLElement | null) => {
    list.current = node;
  }, []);
  const openIds = useMemo(() => (open ? open.split(',') : []), [open]);
  const doneIds = useMemo(() => (done ? done.split(',') : []), [done]);
  const order = useCallback((s: LibraryState) => orderOf(s, id, view), [id, view]);
  useFilingMotion(list, order);

  if (!line || line.deletedAt !== null || line.kind !== 'links') return <NotFound what={t('Cette collection n’existe plus.')} />;

  const inbox = id === INBOX_ID;
  // Opened from the bin, it reads as it is and takes nothing until it is restored (the note editor's way).
  const trashed = line.trashedAt !== null;
  const add = (text: string): void => {
    const found = extractUrls(text);
    if (found.length === 0) {
      // Pasted words with no link: shown in the strip with the problem under it.
      if (text !== url) setUrl(text);
      form.fail('url', t('Aucun lien ici : collez une adresse, comme https://example.org/page.'));
      return;
    }
    const placed = addLinks(found, { noteId: id });
    const message = addedMessage(placed, { into: id, here: true }, useLibraryStore.getState().notes);
    if (message) showSnack(message, undefined, { tone: addedTone(placed) });
    setUrl('');
    form.reset();
  };
  const paste = async (): Promise<void> => {
    try {
      add(await navigator.clipboard.readText());
    } catch {
      showError(t('Le navigateur refuse la lecture du presse-papiers : collez avec Ctrl+V.'));
    }
  };

  // What is left to do. With none, it says nothing: the empty panel, or « Déjà faits · n », says it (never « 0 lien » over them), as on the phone.
  const summary = toDo === 0 ? '' : total ? t('{links} · total {total}', { links: plural(toDo, 'lien'), total }) : plural(toDo, 'lien');
  const canReview = !inbox && reading && sortableCount > 0;
  const filtered = view.filter !== 'all';
  // Claude could read some links here now: those kept unread while the filter shows them, or those that failed under their own filter.
  const retrying = view.filter === 'failed';
  const toRead = !reading || trashed ? 0 : retrying ? failed : view.filter === 'all' || view.filter === 'unread' ? skipped : 0;
  const readAll = (): void => {
    const links = linksOf(useLibraryStore.getState(), id).filter(link => (retrying ? link.status === 'failed' : link.status === 'skipped'));
    const sent = readLinks(links.map(link => link.id));
    // No « Annuler »: the server starts reading at once, and a reading begun is spent.
    if (sent > 0) showSnack(t('{links} en lecture', { links: plural(sent, 'lien envoyé', 'liens envoyés') }), undefined, { tone: 'success' });
  };
  const cost = formatUsd(toRead * CLAUDE_COST_PER_LINK[model]);
  // Never with the unread well: reading what was never read comes first.
  const toReread = !reading || trashed || toRead >= 2 ? 0 : stale.length;
  const rereadCost = formatUsd(toReread * CLAUDE_COST_PER_LINK[model]);
  const rereadAll = (): void => {
    const sent = readLinks(stale);
    if (sent > 0) showSnack(t('{links} en lecture', { links: plural(sent, 'lien envoyé', 'liens envoyés') }), undefined, { tone: 'success' });
  };

  /** The collection goes to the bin; its links where the person said. */
  const remove = (fate: LinksFate): void => {
    const ids = [...(useLibraryStore.getState().linksByNote[id] ?? [])];
    navigate(paths.lines, { replace: true });
    if (fate.kind === 'bin') {
      showUndo(t('Collection et liens placés dans la corbeille'), trashLines([id], null));
    } else if (fate.kind === 'move') {
      const undo = trashLines([id], fate.to);
      const name = fate.to === INBOX_ID ? t(INBOX_TITLE) : (useLibraryStore.getState().notes[fate.to]?.title ?? '');
      showUndo(t('Collection supprimée : {links} dans {name}', { links: plural(ids.length, 'lien déplacé', 'liens déplacés'), name }), undo);
    } else {
      sortDeletedLinksOnSlip(ids, trashLines([id], INBOX_ID), tx('Collection supprimée'));
    }
  };
  const doneHeading = t('Déjà faits · {count}', { count: doneIds.length });
  const listLabel = t('Liens de {collection}', { collection: shownTitle(line) });
  // One flat run of keyed rows: a row changing sides is moved, never remounted, so its stamp lands.
  const rows = [
    ...openIds.map(lid => <LinkRow key={lid} id={lid} now={now} onOpen={openLink} />),
    ...(doneIds.length > 0
      ? [
          <li key="done-heading" className={styles.heading} data-flip="done-heading">
            <h2 className="t-section">{doneHeading}</h2>
          </li>,
        ]
      : []),
    ...doneIds.map(lid => <LinkRow key={lid} id={lid} now={now} onOpen={openLink} />),
  ];
  const tiles = (ids: readonly string[], shape: 'gallery' | 'mosaic'): ReactNode[] => ids.map(lid => <LinkTile key={lid} id={lid} now={now} shape={shape} onOpen={openLink} />);
  const links: ReactNode =
    rows.length === 0 ? null : view.layout === 'gallery' ? (
      // One grid, as the rows are one list: a tile stamped files itself under « Déjà faits » and moves there.
      <ul ref={holdList} className={views.gallery} aria-label={listLabel}>
        {tiles(openIds, 'gallery')}
        {doneIds.length > 0 ? (
          <li key="done-heading" className={`${views.heading} ${views.headingWide}`} data-flip="done-heading">
            <h2 className="t-section">{doneHeading}</h2>
          </li>
        ) : null}
        {tiles(doneIds, 'gallery')}
      </ul>
    ) : view.layout === 'mosaic' ? (
      // Columns cannot hold a heading across them: the done ones are a mosaic of their own.
      <div ref={holdList}>
        {openIds.length > 0 ? (
          <ul className={views.mosaic} aria-label={listLabel}>
            {tiles(openIds, 'mosaic')}
          </ul>
        ) : null}
        {doneIds.length > 0 ? (
          <>
            <h2 className={`${views.heading} t-section`} data-flip="done-heading">
              {doneHeading}
            </h2>
            <ul className={views.mosaic} aria-label={doneHeading}>
              {tiles(doneIds, 'mosaic')}
            </ul>
          </>
        ) : null}
      </div>
    ) : view.layout === 'table' ? (
      <LinkTable tableRef={holdList} open={openIds} done={doneIds} now={now} sort={view.sort} priced={priced} label={listLabel} onSort={sort => setLineView(id, { ...view, sort })} onOpen={openLink} />
    ) : (
      <ul ref={holdList} className={styles.list} aria-label={listLabel}>
        {rows}
      </ul>
    );

  return (
    <div className={styles.screen}>
      <CollectionHeader
        title={shownTitle(line)}
        emblem={collectionEmblem(id, line.emblem)}
        color={asLineColor(line.color)}
        id={id}
        hint={shownHint(line) || (inbox ? t('Les liens que Claude ne sait pas où ranger.') : '')}
        meta={summary}
        actions={
          trashed ? null : (
            <>
              <IconButton icon="edit" label={t('Modifier la collection')} onClick={() => setEditing(true)} />
              <IconButton ref={more} icon="more" label={t('Plus d’actions')} hasPopup="menu" expanded={menu} onClick={() => setMenu(true)} />
            </>
          )
        }
      />
      <div className={styles.page} data-layout={view.layout}>
        {trashed ? (
          <OutlinedBox kind="panel" edge={false} className={`${styles.trashBanner} t-meta`}>
            <span>{t('Une collection dans la corbeille ne peut pas être modifiée.')}</span>
            <Button kind="tonal" small icon="restore" onClick={() => restoreNotes([id])}>
              {t('Restaurer')}
            </Button>
          </OutlinedBox>
        ) : (
        <>
        <form
          className={styles.add}
          data-invalid={form.error('url') ? '' : undefined}
          noValidate
          onSubmit={event => {
            event.preventDefault();
            add(url);
          }}
        >
          <Icon name="link" size={20} />
          <BoundInput
            field={form.field('url')}
            problemId="line-add-problem"
            className={styles.addInput}
            value={url}
            onChange={setUrl}
            placeholder={t('Ajouter un lien à {collection}', { collection: shownTitle(line) })}
            aria-label={t('Ajouter un lien à {collection}', { collection: shownTitle(line) })}
            inputMode="url"
            enterKeyHint="done"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {url.trim() ? (
            <IconButton icon="check" label={t('Ajouter')} onClick={() => add(url)} />
          ) : canPaste() ? (
            <IconButton icon="copy" label={t('Coller le lien copié')} onClick={() => void paste()} />
          ) : null}
        </form>
        <FieldProblem field={form.field('url')} id="line-add-problem" className={styles.addProblem} />
        </>
        )}

        {all === 0 ? (
          <OutlinedBox kind="panel" className={`${styles.empty} ${settleIn} t-body`}>
            {inbox
              ? t('Les liens que Claude ne sait pas où ranger arrivent ici, comme ceux gardés sans lecture.')
              : t('Aucun lien pour l’instant. Collez une adresse ici, ou n’importe où sur cette page : Claude y rangera aussi ceux qui lui correspondent.')}
          </OutlinedBox>
        ) : null}
        {toRead >= 2 ? (
          <ReadAllBanner
            text={
              retrying
                ? t('{links} · environ {cost} pour tout relire', { links: plural(toRead, 'lecture impossible', 'lectures impossibles'), cost })
                : t('{links} · environ {cost} pour tout lire', { links: plural(toRead, 'lien gardé sans lecture', 'liens gardés sans lecture'), cost })
            }
            action={retrying ? t('Tout réessayer') : t('Tout lire')}
            onRead={readAll}
          />
        ) : toReread > 0 ? (
          <ReadAllBanner
            text={
              toReread === 1
                ? t('{links} avant ce changement · environ {cost} pour le relire', { links: plural(1, 'lien lu', 'liens lus'), cost: rereadCost })
                : t('{links} avant ce changement · environ {cost} pour les relire', { links: plural(toReread, 'lien lu', 'liens lus'), cost: rereadCost })
            }
            action={toReread === 1 ? t('Relire') : t('Tout relire')}
            onRead={rereadAll}
          />
        ) : null}
        {/* Only where there is something to order or pick: never over a single link, unless this browser keeps a view for it. */}
        {all >= 2 || filtered || view.sort !== DEFAULT_LINE_VIEW.sort || view.layout !== DEFAULT_LINE_VIEW.layout ? <LineRefine view={view} counts={{ all, unread, failed, priceDrop }} priced={priced} onChange={next => setLineView(id, next)} /> : null}
        {all > 0 && rows.length === 0 ? <FilteredEmpty filter={view.filter} collection={shownTitle(line)} onClear={() => setLineView(id, { ...view, filter: 'all' })} /> : null}
        {links}
      </div>

      <Menu
        open={menu}
        anchor={more}
        onDismiss={() => setMenu(false)}
        label={t('Plus d’actions')}
        items={[
          { label: t('Modifier la collection'), icon: 'edit', onSelect: () => setEditing(true) },
          { label: t('Modules'), icon: 'puzzle', onSelect: () => setModules(true) },
          // What Claude notes on its links: « Non classé » reads each link by its kind.
          ...(inbox || !reading ? [] : [{ label: t('Ce que Claude relève'), icon: 'list' as const, onSelect: () => navigate(paths.template(id)) }]),
          ...(canReview ? [{ label: t('Vérifier les liens'), icon: 'sparkle' as const, onSelect: () => setReviewing(true) }] : []),
          ...(inbox && reading && sortableCount > 0 && otherLines && !sorting ? [{ label: t('Ranger Non classé'), icon: 'sparkle' as const, onSelect: sortInboxOnSlip }] : []),
          {
            label: line.pinned ? t('Retirer du tableau') : t('Épingler sur le tableau'),
            icon: line.pinned ? 'pinOff' : 'pin',
            onSelect: () => {
              const undo = setPinned(id, !line.pinned);
              showUndo(line.pinned ? t('Retirée du tableau') : t('Épinglée sur le tableau'), undo);
            },
          },
          ...(inbox
            ? []
            : [
                {
                  label: t('Supprimer la collection'),
                  icon: 'trash' as const,
                  danger: true,
                  separatorBefore: true,
                  onSelect: () => {
                    if (all > 0) {
                      setDeleting(true);
                      return;
                    }
                    const undo = trashNotes([id]);
                    navigate(paths.lines, { replace: true });
                    showUndo(t('Collection placée dans la corbeille'), undo);
                  },
                },
              ]),
        ]}
      />
      <EditLineDialog
        id={id}
        open={editing}
        onDismiss={() => setEditing(false)}
        onSaved={meaning => {
          if (meaning && canReview) showSnack(t('Collection modifiée'), { label: t('Vérifier les liens'), run: () => setReviewing(true) }, { tone: 'success' });
        }}
      />
      <ReviewDialog id={id} open={reviewing} onDismiss={() => setReviewing(false)} />
      <ModulesDialog id={id} open={modules} onDismiss={() => setModules(false)} />
      <DeleteLineDialog ids={[id]} open={deleting} onDismiss={() => setDeleting(false)} onChoose={remove} onPickLine={() => setPicking(true)} />
      <MoveDialog open={picking} currentLineId={null} exclude={[id]} title={t('Déplacer les liens vers')} onDismiss={() => setPicking(false)} onPick={target => remove({ kind: 'move', to: target })} />
    </div>
  );
}
