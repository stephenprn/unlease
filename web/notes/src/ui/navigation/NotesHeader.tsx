/**
 * Carnet's part of the shell's header: « Classer un lien » and the board's layout beside the search
 * (on a phone-sized window, the layout in the strip, on the board), and, while notes are picked, a
 * matcha bar laid over the strip, the same size and cut, so nothing below moves. Back clears a
 * selection before it leaves the board.
 */
import { memo, useRef, useState, type AnimationEvent } from 'react';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { collectionsWithLinks } from '@unlease/notes/services/sorting';
import { INBOX_ID } from '@unlease/notes/models/entities';

import { clearSelection, selectSelection, useBoardStore } from '../../app/store/board';
import { deleteForever, restoreNotes, setArchived, setLabelOn, setPinned, trashNotes } from '../../app/store/actions';
import { useLibraryStore } from '../../app/store/library';
import { askDeleteLines, openCapture } from '../../app/store/notesUi';
import { setLayout, useLayout } from '../../app/store/prefs';
import { showSnack, showUndo } from '@shared/app/store/ui';
import { Confirm } from '@shared/ui/components/Dialog';
import { EmptyLine } from '@shared/ui/components/EmptyLine';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton } from '@shared/ui/components/IconButton';
import { LabelCheck } from '@shared/ui/components/LabelMark';
import { Popover } from '@shared/ui/components/Popover';
import { usePresence } from '@shared/ui/components/presence';
import { useBackCloses, type Route } from '@shared/ui/router';
import { NARROW, useMedia } from '@shared/ui/useMedia';
import styles from '@shared/ui/navigation/shell.module.css';
import { BulkFinish } from './BulkFinish';

/** The selection bar's fade (`--duration-short`), and a little longer for the fallback that lets it go. */
const SELECTION_FADE_MS = 200;

export function LayoutToggle() {
  const layout = useLayout();
  return (
    <IconButton
      icon={layout === 'wall' ? 'rows' : 'grid'}
      label={layout === 'wall' ? t('Afficher en liste') : t('Afficher en mur')}
      shape={1}
      onClick={() => setLayout(layout === 'wall' ? 'list' : 'wall')}
    />
  );
}

/** The picked notes' labels: each tag is its checkbox, ticked when every picked note wears it; a press puts it on all, or takes it off all. */
function BulkLabels({ ids }: { ids: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const order = useLibraryStore(s => s.labelOrder);
  const labels = useLibraryStore(s => s.labels);
  const notes = useLibraryStore(s => s.notes);
  const live = order.map(id => labels[id]).filter(label => !!label && label.deletedAt === null);
  return (
    <>
      <IconButton ref={anchor} icon="tag" label={t('Labels')} shape={2} onClick={() => setOpen(true)} />
      <Popover open={open} anchor={anchor} onDismiss={() => setOpen(false)} label={t('Labels des notes sélectionnées')} align="end" className={styles.bulkLabels} rows>
        {live.length === 0 ? (
          <EmptyLine glyph="tag" text={t('Aucun label. Créez-en depuis la page Labels.')} className={styles.bulkEmpty} />
        ) : (
          <ul className={styles.bulkList}>
            {live.map(label => {
              const wearing = ids.filter(id => notes[id]?.labelIds.includes(label!.id)).length;
              const all = wearing === ids.length && ids.length > 0;
              return (
                <li key={label!.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={all ? true : wearing > 0 ? 'mixed' : false}
                    className={styles.bulkRow}
                    onClick={() => {
                      const undo = setLabelOn(ids, label!.id, !all);
                      showUndo(all ? t('« {name} » retiré', { name: label!.name }) : t('« {name} » ajouté', { name: label!.name }), undo);
                    }}
                  >
                    <LabelCheck color={label!.color} checked={all} size={22} />
                    <span className={styles.bulkName}>{label!.name}</span>
                    {wearing > 0 && !all ? <span className={`${styles.bulkSome} t-meta`}>{t('{count} sur {total}', { count: wearing, total: ids.length })}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Popover>
    </>
  );
}

interface SelectionBarProps {
  readonly route: Route;
  /** The selection is over: the bar fades off the strip, then `onGone`. */
  readonly closing: boolean;
  readonly onGone: () => void;
  readonly onDeleteForever: () => void;
}

function SelectionBar({ route, closing, onGone, onDeleteForever }: SelectionBarProps) {
  const live = useBoardStore(selectSelection);
  const notes = useLibraryStore(s => s.notes);
  const livePinned = live.size > 0 && [...live].every(id => notes[id]?.pinned ?? true);
  // Fading out, it keeps showing what was picked rather than "0", and the pin it offered rather than the one just done.
  const [held, setHeld] = useState({ selection: live, allPinned: livePinned });
  if (live.size > 0 && (live !== held.selection || livePinned !== held.allPinned)) setHeld({ selection: live, allPinned: livePinned });
  const selection = live.size > 0 ? live : held.selection;
  const selected = [...selection].filter(id => notes[id]);
  const inTrash = route.name === 'board' && route.view === 'trash';
  const inArchive = route.name === 'board' && route.view === 'archive';
  const allPinned = selected.length > 0 && (live.size > 0 ? livePinned : held.allPinned);
  const done = (undo: () => void, message: string) => {
    clearSelection();
    showUndo(message, undo);
  };
  const count = selected.length;
  const narrow = useMedia(NARROW);
  const gone = (event: AnimationEvent<HTMLDivElement>): void => {
    if (closing && event.target === event.currentTarget) onGone();
  };
  return (
    <div className={styles.selectionBar} role="toolbar" aria-label={t('Notes sélectionnées')} data-closing={closing || undefined} inert={closing} onAnimationEnd={gone}>
      <IconButton icon="close" label={t('Annuler la sélection')} onClick={clearSelection} shortcut={t('Échap')} />
      {/* On a phone-sized window the number alone, as the phone's bar: the words would be cut short by its five actions. */}
      <p className={`${styles.selectionCount} t-title`} aria-live="polite">
        {narrow ? (
          <>
            <span aria-hidden="true">{count}</span>
            <span className="sr-only">{plural(count, 'sélectionnée', 'sélectionnées')}</span>
          </>
        ) : (
          plural(count, 'sélectionnée', 'sélectionnées')
        )}
      </p>
      {inTrash ? (
        <>
          <IconButton icon="restore" label={t('Restaurer')} shape={1} onClick={() => done(restoreNotes(selected), count > 1 ? t('Notes restaurées') : t('Note restaurée'))} />
          <IconButton icon="trash" label={t('Supprimer définitivement')} shape={2} onClick={onDeleteForever} />
        </>
      ) : (
        <>
          <IconButton
            icon={allPinned ? 'pinOff' : 'pin'}
            label={allPinned ? t('Retirer des épinglées') : t('Épingler')}
            shape={1}
            onClick={() => {
              const undos = selected.map(id => setPinned(id, !allPinned));
              done(() => undos.forEach(undo => undo()), allPinned ? (count > 1 ? t('Retirées des épinglées') : t('Retirée des épinglées')) : count > 1 ? t('Notes épinglées') : t('Note épinglée'));
            }}
          />
          <BulkFinish ids={selected} shape={0} />
          <BulkLabels ids={selected} />
          <IconButton
            icon={inArchive ? 'unarchive' : 'archive'}
            label={inArchive ? t('Désarchiver') : t('Archiver')}
            shape={2}
            shortcut="E"
            onClick={() => {
              const undos = selected.map(id => setArchived(id, !inArchive));
              done(() => undos.forEach(undo => undo()), inArchive ? (count > 1 ? t('Notes désarchivées') : t('Note désarchivée')) : count > 1 ? t('Notes archivées') : t('Note archivée'));
            }}
          />
          <IconButton
            icon="trash"
            label={t('Supprimer')}
            shortcut="#"
            onClick={() => {
              // Collections holding links ask where those go first; "Non classé" never goes to the bin.
              if (collectionsWithLinks(selected, notes, useLibraryStore.getState().linksByNote).length > 0) askDeleteLines(selected.filter(id => id !== INBOX_ID));
              else done(trashNotes(selected), count > 1 ? t('Notes placées dans la corbeille') : t('Note placée dans la corbeille'));
            }}
          />
        </>
      )}
    </div>
  );
}

/** Beside the search, wide: « Classer un lien » (K) and the board's layout. */
export function NotesHeaderActions({ route }: { route: Route }) {
  return (
    <>
      <button type="button" className={`${styles.classify} paper`} onClick={() => openCapture('')} aria-label={t('Classer un lien')} data-tip={t('Classer un lien (K)')}>
        <Icon name="link" size={20} />
        <span className={styles.classifyLabel}>{t('Classer un lien')}</span>
      </button>
      {/* The layout is the board's: elsewhere (a collection, the settings) it would change nothing on screen. */}
      {route.name === 'board' ? <LayoutToggle /> : null}
    </>
  );
}

/** In the strip on a phone-sized window: the layout, on the board. */
export function NotesNarrowTools({ route }: { route: Route }) {
  return route.name === 'board' ? <LayoutToggle /> : null;
}

/** Notes are picked: the strip is out of reach under the selection bar. */
export const useSelecting = (): boolean => useBoardStore(s => s.selection.size > 0);

/** The selection bar, over the strip while notes are picked; « Supprimer définitivement » asks first. */
export const NotesHeaderCover = memo(function NotesHeaderCover({ route }: { route: Route }) {
  const selecting = useSelecting();
  const selectionBar = usePresence(selecting, SELECTION_FADE_MS);
  // Back clears a selection before it leaves the board.
  useBackCloses(selecting, clearSelection);
  // Here rather than on the bar, so the dialog plays its exit after the bar has gone.
  const [confirmForever, setConfirmForever] = useState(false);
  return (
    <>
      {selectionBar.present ? <SelectionBar route={route} closing={selectionBar.closing} onGone={selectionBar.done} onDeleteForever={() => setConfirmForever(true)} /> : null}
      <Confirm
        open={confirmForever}
        title={t('Supprimer définitivement ?')}
        message={t('Ces notes disparaîtront de tous vos appareils. Cette action est irréversible.')}
        confirmLabel={t('Supprimer')}
        danger
        onCancel={() => setConfirmForever(false)}
        onConfirm={() => {
          setConfirmForever(false);
          const notes = useLibraryStore.getState().notes;
          // Only what is in the bin is ever erased from here.
          const selected = [...useBoardStore.getState().selection].filter(id => notes[id] && notes[id]!.trashedAt !== null);
          deleteForever(selected);
          clearSelection();
          showSnack(t('{deleted} définitivement', { deleted: plural(selected.length, 'note supprimée', 'notes supprimées') }), undefined, { tone: 'success' });
        }}
      />
    </>
  );
});
