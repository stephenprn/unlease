/**
 * One collection: its head, a field to add a link straight into it, the links to do, then the
 * ones done, stamped, at the foot under "Déjà faits". One list, as on the phone, so a link
 * stamped (or put back) files itself there rather than leaving one list for another.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { collectionEmblem } from '@unlease/notes/models/collections';
import { t, tx } from '@unlease/core/i18n';
import { asLineColor } from '@unlease/design/colors';
import { formatPrice, plural, totalPrice } from '@unlease/core/services/format';
import { sortable } from '@unlease/notes/services/sorting';
import { addedMessage } from '@unlease/notes/services/savedLinks';
import { extractUrls } from '@unlease/core/services/url';
import { INBOX_ID, INBOX_TITLE, shownHint, shownTitle } from '@unlease/notes/models/entities';

import { lineLinkIds, useLines } from '../../app/hooks/useLines';
import { useMinute } from '../../app/hooks/useMinute';
import { addLinks, restoreNotes, setPinned, trashLines, trashNotes } from '../../app/store/actions';
import { useLibraryStore, type LibraryState } from '../../app/store/library';
import { selectCanRead, useSettingsStore } from '../../app/store/settings';
import { addedTone, selectSorting, showError, showSnack, showUndo, useUiStore } from '../../app/store/ui';
import { openLink } from '../commands';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { IconButton } from '../components/IconButton';
import { Menu } from '../components/Menu';
import { CollectionHeader } from '../features/lines/CollectionHeader';
import { DeleteLineDialog, type LinksFate } from '../features/lines/DeleteLineDialog';
import { EditLineDialog } from '../features/lines/LineDialogs';
import { ModulesDialog } from '../features/lines/ModulesDialog';
import styles from '../features/lines/lines.module.css';
import { OutlinedBox } from '../components/Outline';
import { MoveDialog } from '../features/lines/MoveDialog';
import { ReviewDialog } from '../features/lines/ReviewDialog';
import { sortDeletedLinksOnSlip, sortInboxOnSlip } from '../features/lines/sortingSlips';
import { LinkRow } from '../features/links/LinkRow';
import { useFilingMotion } from '../features/links/useFilingMotion';
import { navigate, paths } from '../router';
import { NotFound } from './NotFound';

const canPaste = (): boolean => typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function';

export function LineScreen({ id }: { id: string }) {
  const line = useLibraryStore(s => s.notes[id]);
  const now = useMinute();
  const { open, done, total } = useLibraryStore(
    useShallow(s => {
      const ids = lineLinkIds(s, id);
      const sum = totalPrice(ids.open.map(lid => ({ price: s.links[lid]!.price, currency: s.links[lid]!.currency })));
      return { open: ids.open.join(','), done: ids.done.join(','), total: sum ? formatPrice(sum.amount, sum.currency) : '' };
    }),
  );
  // What Claude may sort here: in "Non classé", not what the person put there themselves.
  const sortableCount = useLibraryStore(
    s =>
      (s.linksByNote[id] ?? []).filter(lid => {
        const link = s.links[lid];
        return !!link && sortable(link) && (id !== INBOX_ID || link.filedBy !== 'person');
      }).length,
  );
  const reading = useSettingsStore(selectCanRead);
  const sorting = useUiStore(selectSorting);
  const otherLines = useLines().some(other => other.id !== id && other.id !== INBOX_ID);
  const [url, setUrl] = useState('');
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [modules, setModules] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const openIds = useMemo(() => (open ? open.split(',') : []), [open]);
  const doneIds = useMemo(() => (done ? done.split(',') : []), [done]);
  const order = useCallback((s: LibraryState) => {
    const ids = lineLinkIds(s, id);
    return `${ids.open.join(',')}|${ids.done.join(',')}`;
  }, [id]);
  useFilingMotion(list, order);

  if (!line || line.deletedAt !== null || line.kind !== 'links') return <NotFound what={t('Cette collection n’existe plus.')} />;

  const inbox = id === INBOX_ID;
  // Opened from the bin, it reads as it is and takes nothing until it is restored (the note editor's way).
  const trashed = line.trashedAt !== null;
  const add = (text: string): void => {
    const found = extractUrls(text);
    if (found.length === 0) {
      showError(t('Ce n’est pas un lien'));
      return;
    }
    const placed = addLinks(found, { noteId: id });
    const message = addedMessage(placed, { into: id, here: true }, useLibraryStore.getState().notes);
    if (message) showSnack(message, undefined, { tone: addedTone(placed) });
    setUrl('');
  };
  const paste = async (): Promise<void> => {
    try {
      add(await navigator.clipboard.readText());
    } catch {
      showError(t('Le navigateur refuse la lecture du presse-papiers : collez avec Ctrl+V.'));
    }
  };

  const summary = total ? t('{links} · total {total}', { links: plural(openIds.length, 'lien'), total }) : plural(openIds.length, 'lien');
  const canReview = !inbox && reading && sortableCount > 0;

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
  // One flat run of keyed rows: a row changing sides is moved, never remounted, so its stamp lands.
  const rows = [
    ...openIds.map(lid => <LinkRow key={lid} id={lid} now={now} onOpen={openLink} />),
    ...(doneIds.length > 0
      ? [
          <li key="done-heading" className={styles.heading} data-flip="done-heading">
            <h2 className="t-section">{t('Déjà faits · {count}', { count: doneIds.length })}</h2>
          </li>,
        ]
      : []),
    ...doneIds.map(lid => <LinkRow key={lid} id={lid} now={now} onOpen={openLink} />),
  ];

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
      <div className={styles.page}>
        {trashed ? (
          <OutlinedBox kind="panel" edge={false} className={`${styles.trashBanner} t-meta`}>
            <span>{t('Une collection dans la corbeille ne peut pas être modifiée.')}</span>
            <Button kind="tonal" small icon="restore" onClick={() => restoreNotes([id])}>
              {t('Restaurer')}
            </Button>
          </OutlinedBox>
        ) : (
        <form
          className={styles.add}
          onSubmit={event => {
            event.preventDefault();
            add(url);
          }}
        >
          <Icon name="link" size={20} />
          <input
            className={styles.addInput}
            value={url}
            onChange={event => setUrl(event.target.value)}
            placeholder={t('Ajouter un lien à {collection}', { collection: shownTitle(line) })}
            aria-label={t('Ajouter un lien à {collection}', { collection: shownTitle(line) })}
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
          />
          {url.trim() ? (
            <IconButton icon="check" label={t('Ajouter')} onClick={() => add(url)} />
          ) : canPaste() ? (
            <IconButton icon="copy" label={t('Coller le lien copié')} onClick={() => void paste()} />
          ) : null}
        </form>
        )}

        {openIds.length === 0 && doneIds.length === 0 ? (
          <OutlinedBox kind="panel" className={`${styles.empty} t-body`}>
            {inbox
              ? t('Les liens que Claude ne sait pas où ranger arrivent ici, comme ceux gardés sans lecture.')
              : t('Aucun lien pour l’instant. Collez une adresse ici, ou n’importe où sur cette page : Claude y rangera aussi ceux qui lui correspondent.')}
          </OutlinedBox>
        ) : null}
        {rows.length > 0 ? (
          <ul ref={list} className={styles.list} aria-label={t('Liens de {collection}', { collection: shownTitle(line) })}>
            {rows}
          </ul>
        ) : null}
      </div>

      <Menu
        open={menu}
        anchor={more}
        onDismiss={() => setMenu(false)}
        label={t('Plus d’actions')}
        items={[
          { label: t('Modifier la collection'), icon: 'edit', onSelect: () => setEditing(true) },
          { label: t('Modules'), icon: 'puzzle', onSelect: () => setModules(true) },
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
                    if (openIds.length + doneIds.length > 0) {
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
