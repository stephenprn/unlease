/**
 * The board: every view of the notes (all notes, reminders, a label, the
 * archive, the bin) is the same wall over a different selection, as on the
 * phone. Search replaces the wall with its results, best first, matches marked,
 * the other apps' results (Pages') first. Its bin holds the notes; the pages
 * have a bin of their own.
 */
import { useCallback, useMemo, useRef, useState, type MouseEvent } from 'react';

import { t, tc } from '@unlease/core/i18n';
import { searchSummary } from '@unlease/core/services/searchWords';
import { APP_WORDS } from '@unlease/core/appWords';
import { plural } from '@unlease/core/services/format';
import { TRASH_RETENTION_DAYS } from '@unlease/notes/models/entities';

import { useBoardSections, useSearch, type BoardView } from '../../app/hooks/useBoard';
import { useMinute } from '@shared/app/hooks/useMinute';
import { emptyTrash } from '../../app/store/actions';
import { addToSelection, selectSelection, toggleSelected, useBoardStore } from '../../app/store/board';
import { useQuery } from '@shared/app/store/search';
import { useLibraryStore } from '../../app/store/library';
import { useLayout } from '../../app/store/prefs';
import { showSnack } from '@shared/app/store/ui';
import { newChecklist, newDrawing, newNote, newPhotoNote, openNote } from '../commands';
import { Button } from '@shared/ui/components/Button';
import { Confirm } from '@shared/ui/components/Dialog';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { LabelTag } from '@shared/ui/components/LabelMark';
import styles from '../features/board/board.module.css';
import { CollectionChips } from '../features/board/CollectionChips';
import { Composer } from '../features/board/Composer';
import { EmptyBoard } from '../features/board/EmptyBoard';
import { Wall } from '../features/board/Wall';
import { SyncNotice } from '@shared/ui/navigation/Header';
import { settingsFound, SettingsMatches } from '@shared/ui/features/settings/SettingsMatches';
import { DOCKED, NARROW, useMedia } from '@shared/ui/useMedia';
import screens from '@shared/ui/screens/screens.module.css';

function viewTitle(view: BoardView, labelName: string | undefined): string {
  if (view === 'reminders') return t('Reminders');
  if (view === 'archive') return tc('place', 'Archive');
  if (view === 'trash') return t('Bin');
  if (view.startsWith('label:')) return labelName ?? tc('notes', 'Label');
  return t('Notes');
}

export function BoardScreen({ view }: { view: BoardView }) {
  const query = useQuery();
  const selection = useBoardStore(selectSelection);
  const layout = useLayout();
  const label = useLibraryStore(s => (view.startsWith('label:') ? s.labels[view.slice(6)] : undefined));
  const now = useMinute();
  const { sections, total } = useBoardSections(view, now);
  const results = useSearch(query, view === 'trash');
  const searching = query.trim().length > 0;
  const found = results.length;
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const inBin = total;
  const anchor = useRef<string | null>(null);

  const docked = useMedia(DOCKED);
  const narrow = useMedia(NARROW);
  const shown = useMemo(() => (searching ? [{ key: 'results', title: null, ids: results }] : sections), [searching, results, sections]);
  const title = viewTitle(view, label?.name);
  const showComposer = !searching && (view === 'notes' || view === 'reminders' || view.startsWith('label:'));
  const summary = searching ? searchSummary(query, found, view === 'notes' ? settingsFound(query) : 0) : '';

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
            <Button kind="text" icon="broom" onClick={() => setConfirmEmpty(true)}>
              {t('Empty the bin')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {/* The docked navigation lists the collections; without it, they head the board, scrolling with it. */}
      {view === 'notes' && !searching && !docked ? <CollectionChips resting={selection.size > 0} /> : null}
      {/* How long things stay, while it holds something (empty, its empty state says it). */}
      {view === 'trash' && !searching && inBin > 0 ? <p className={`${styles.notice} t-meta`}>{t('Notes in the bin are deleted after {days} days.', { days: TRASH_RETENTION_DAYS })}</p> : null}
      {showComposer ? <Composer onNote={newNote} onChecklist={newChecklist} onDrawing={newDrawing} onPhotos={files => void newPhotoNote(files)} /> : null}
      {/* As on the phone: the settings the words name, above the notes, in the search of every note (a view's searches its own). */}
      {searching && view === 'notes' ? <SettingsMatches query={query} /> : null}
      {searching ? (
        // As on the phone: the count, a line of meta over the results; nothing found, the empty state
        // says it, and this line stays for a screen reader alone, still announcing as words are typed.
        <h1 className={found === 0 ? 'sr-only' : `${screens.resultCount} t-meta`} aria-live="polite">
          {summary}
        </h1>
      ) : null}
      {searching && found === 0 ? <EmptyState scene="search" title={summary} text={APP_WORDS.notes.searchHint} /> : null}
      {inBin === 0 && !searching ? (
        <EmptyBoard view={view} />
      ) : shown.some(section => section.ids.length > 0) ? (
        <Wall sections={shown} layout={layout} query={searching ? query : ''} selection={selection} now={now} onOpen={onOpen} onSelect={onSelect} />
      ) : null}
      <Confirm
        open={confirmEmpty}
        title={t('Empty the bin?')}
        message={t('Every note in the bin will be deleted for good, on all your devices.')}
        confirmLabel={t('Empty')}
        danger
        onCancel={() => setConfirmEmpty(false)}
        onConfirm={() => {
          setConfirmEmpty(false);
          const notes = emptyTrash();
          if (notes > 0) showSnack(t('{deleted} forever', { deleted: plural(notes, 'note deleted', 'notes deleted') }), undefined, { tone: 'success' });
          else showSnack(t('The bin was already empty'));
        }}
      />
    </div>
  );
}
