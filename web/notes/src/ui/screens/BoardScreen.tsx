/**
 * The board: every view of the notes (all notes, reminders, a label, the
 * archive, the bin) is the same wall over a different selection, as on the
 * phone. Search replaces the wall with its results, best first, matches marked.
 */
import { useCallback, useMemo, useRef, useState, type MouseEvent } from 'react';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { TRASH_RETENTION_DAYS } from '@unlease/notes/models/entities';

import { useBoardSections, useSearch, type BoardView } from '../../app/hooks/useBoard';
import { useTrashedPages } from '../../app/hooks/usePages';
import { usePageSearch } from '../../app/hooks/usePageSearch';
import { useMinute } from '../../app/hooks/useMinute';
import { emptyTrash } from '../../app/store/actions';
import { emptyPagesBin } from '../../app/store/pages';
import { addToSelection, selectQuery, selectSelection, toggleSelected, useBoardStore } from '../../app/store/board';
import { useLibraryStore } from '../../app/store/library';
import { selectLayout, useSettingsStore } from '../../app/store/settings';
import { showSnack } from '../../app/store/ui';
import { newChecklist, newDrawing, newNote, newPhotoNote, openNote } from '../commands';
import { Button } from '../components/Button';
import { Confirm } from '../components/Dialog';
import { LabelTag } from '../components/LabelMark';
import styles from '../features/board/board.module.css';
import { CollectionChips } from '../features/board/CollectionChips';
import { Composer } from '../features/board/Composer';
import { EmptyBoard } from '../features/board/EmptyBoard';
import { PageResults } from '../features/board/PageResults';
import { PagesBinSection } from '../features/pages/PagesBin';
import { Wall } from '../features/board/Wall';
import { SyncNotice } from '../navigation/Header';
import { DOCKED, NARROW, useMedia } from '../useMedia';
import screens from './screens.module.css';

function viewTitle(view: BoardView, labelName: string | undefined): string {
  if (view === 'reminders') return t('Rappels');
  if (view === 'archive') return t('Archives');
  if (view === 'trash') return t('Corbeille');
  if (view.startsWith('label:')) return labelName ?? t('Label');
  return t('Notes');
}

export function BoardScreen({ view }: { view: BoardView }) {
  const query = useBoardStore(selectQuery);
  const selection = useBoardStore(selectSelection);
  const layout = useSettingsStore(selectLayout);
  const label = useLibraryStore(s => (view.startsWith('label:') ? s.labels[view.slice(6)] : undefined));
  const now = useMinute();
  const { sections, total } = useBoardSections(view, now);
  const results = useSearch(query, view === 'trash');
  const pageHits = usePageSearch(query);
  const searching = query.trim().length > 0;
  const found = results.length + pageHits.length;
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  // One bin: the pages thrown away wait here with the notes.
  const binnedPages = useTrashedPages().length;
  const inBin = view === 'trash' ? total + binnedPages : total;
  const anchor = useRef<string | null>(null);

  const docked = useMedia(DOCKED);
  const narrow = useMedia(NARROW);
  const shown = useMemo(() => (searching ? [{ key: 'results', title: null, ids: results }] : sections), [searching, results, sections]);
  const title = viewTitle(view, label?.name);
  const showComposer = !searching && (view === 'notes' || view === 'reminders' || view.startsWith('label:'));

  const onSelect = useCallback((id: string, event: MouseEvent, order: readonly string[]) => {
    // Shift extends from the last picked card, in reading order.
    if (event.shiftKey && anchor.current && order.includes(anchor.current)) {
      const from = order.indexOf(anchor.current);
      const to = order.indexOf(id);
      addToSelection(order.slice(Math.min(from, to), Math.max(from, to) + 1));
    } else {
      toggleSelected(id);
    }
    anchor.current = id;
  }, []);

  const onOpen = useCallback(
    (id: string) => {
      if (selection.size > 0) toggleSelected(id);
      else openNote(id);
    },
    [selection.size],
  );

  return (
    <div className={styles.board}>
      {narrow && !searching ? <SyncNotice /> : null}
      {view === 'notes' && !searching ? (
        <h1 className="sr-only">{title}</h1>
      ) : !searching ? (
        <div className={styles.viewHead}>
          <h1 className={`${styles.viewTitle} t-display`}>
            {label ? <LabelTag color={label.color} size={24} /> : null}
            {title}
          </h1>
          {view === 'trash' && inBin > 0 ? (
            <Button kind="text" icon="trash" onClick={() => setConfirmEmpty(true)}>
              {t('Vider la corbeille')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {/* The docked navigation lists the collections; without it, they head the board, scrolling with it. */}
      {view === 'notes' && !searching && !docked ? <CollectionChips resting={selection.size > 0} /> : null}
      {view === 'trash' && !searching ? <p className={`${styles.notice} t-meta`}>{t('Les notes et les pages de la corbeille sont supprimées au bout de {days} jours.', { days: TRASH_RETENTION_DAYS })}</p> : null}
      {view === 'trash' && !searching ? <PagesBinSection embedded /> : null}
      {view === 'trash' && !searching && binnedPages > 0 && total > 0 ? <h2 className={`${styles.resultsHead} t-section`}>{t('Notes · {count}', { count: total })}</h2> : null}
      {showComposer ? <Composer onNote={newNote} onChecklist={newChecklist} onDrawing={newDrawing} onPhotos={files => void newPhotoNote(files)} /> : null}
      {searching ? (
        // As on the phone: the count, a line of meta over the results; the pages first, then the notes.
        <h1 className={`${screens.resultCount} t-meta`} aria-live="polite">
          {found === 0 ? t('Aucun résultat pour « {query} »', { query: query.trim() }) : plural(found, 'résultat')}
        </h1>
      ) : null}
      {searching && found === 0 ? <p className={`${screens.resultHint} t-meta`}>{t('Les notes, les listes, les liens des collections et les pages sont cherchés, mot à mot, sans tenir compte des accents.')}</p> : null}
      {searching ? <PageResults hits={pageHits} query={query} /> : null}
      {searching && pageHits.length > 0 && results.length > 0 ? <h2 className={`${styles.resultsHead} t-section`}>{t('Notes')}</h2> : null}
      {inBin === 0 && !searching ? (
        <EmptyBoard view={view} />
      ) : shown.some(section => section.ids.length > 0) ? (
        <Wall sections={shown} layout={layout} query={searching ? query : ''} selection={selection} now={now} onOpen={onOpen} onSelect={onSelect} />
      ) : null}
      <Confirm
        open={confirmEmpty}
        title={t('Vider la corbeille ?')}
        message={t('Les notes et les pages de la corbeille seront supprimées définitivement, sur tous vos appareils.')}
        confirmLabel={t('Vider')}
        danger
        onCancel={() => setConfirmEmpty(false)}
        onConfirm={() => {
          setConfirmEmpty(false);
          const notes = emptyTrash();
          const pages = emptyPagesBin();
          const count = notes > 0 ? plural(notes, 'note') : plural(pages, 'page');
          const said = notes > 0 && pages > 0 ? t('{notes} et {pages} supprimées définitivement', { notes: plural(notes, 'note'), pages: plural(pages, 'page') }) : notes + pages > 1 ? t('{count} supprimées définitivement', { count }) : notes + pages === 1 ? t('{count} supprimée définitivement', { count }) : '';
          showSnack(said || t('La corbeille était déjà vide'), undefined, { tone: said ? 'success' : 'info' });
        }}
      />
    </div>
  );
}
