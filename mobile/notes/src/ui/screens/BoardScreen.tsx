/**
 * The board: one screen for every view of the notes. The drawer switches views through this
 * screen's params instead of pushing screens, so Back always leaves the board.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackActions, useFocusEffect } from '@react-navigation/native';

import { t, tc, tx } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { collectionsWithLinks } from '@unlease/notes/services/sorting';
import { INBOX_ID, INBOX_TITLE, TRASH_RETENTION_DAYS } from '@unlease/notes/models/entities';
import { useBoardSections, useSearch, type BoardView } from '@app/hooks/useBoard';
import { useMinute } from '@app/hooks/useMinute';
import { pickInto } from '@app/media';
import { createNote, deleteForever, emptyTrash, restoreNotes, setArchived, setPinned, trashLines, trashNotes, addCheck } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { useTrashedPages } from '@app/hooks/usePages';
import { createPage, emptyPagesBin } from '@app/store/pages';
import { requestTitleFocus } from '@app/store/pagesUi';
import { selectLayout, setLayout, useSettingsStore } from '@app/store/settingsStore';
import { selectDrawerOpen, openCapture, setDrawerOpen, showSnack, useUiStore } from '@app/store/uiStore';
import { requestSync } from '@app/sync/syncManager';
import { haptic } from '@platform/haptics';
import { readClipboard } from '@platform/intake';
import { extractUrls } from '@unlease/core/services/url';

import { AppText, Button, Dialog, Ground, IconButton } from '../components';
import { BoardHeader, LineChips, SyncLine } from '../features/board/BoardHeader';
import { SelectionBar } from '../features/board/SelectionBar';
import { BottomBar, BOTTOM_BAR_HEIGHT } from '../features/board/BottomBar';
import { EmptyBoard } from '../features/board/EmptyBoard';
import { Wall } from '../features/board/Wall';
import { useWallMetrics } from '../features/board/wallLayout';
import { DeleteLineSheet, type LinksFate } from '../features/lines/DeleteLineSheet';
import { MoveSheet } from '../features/lines/MoveSheet';
import { NewLineSheet } from '../features/lines/NewLineSheet';
import { sortDeletedLinksOnSlip } from '../features/lines/sortingSlips';
import { DeletePageDialog, PagesBinSection } from '../features/pages/PagesBin';
import { Drawer } from '../navigation/Drawer';
import type { ScreenProps } from '../navigation/types';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';

const EMPTY_SELECTION: ReadonlySet<string> = new Set();

/** "Non classé" stays on the board: it is where unsorted links land. */
const canSwipe = (id: string) => id !== INBOX_ID;

function viewTitle(view: BoardView, labelName: string | undefined): string | null {
  if (view === 'reminders') return t('Rappels');
  if (view === 'archive') return t('Archives');
  if (view === 'trash') return t('Corbeille');
  if (view.startsWith('label:')) return labelName ?? t('Label');
  return null;
}

export function BoardScreen({ navigation, route }: ScreenProps<'Board'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const label = route.params?.label;
  const view: BoardView = route.params?.view ?? (label ? `label:${label}` : 'notes');
  const labelName = useLibraryStore(s => (view.startsWith('label:') ? s.labels[view.slice(6)]?.name : undefined));
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<ReadonlySet<string>>(EMPTY_SELECTION);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // A binned page to erase: its dialog lies at the root, over the whole screen.
  const [pageToDelete, setPageToDelete] = useState<string | null>(null);
  const [newLineOpen, setNewLineOpen] = useState(false);
  // A selection holding collections with links: deleting asks where the links go first.
  const [deleteIds, setDeleteIds] = useState<readonly string[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const drawerOpen = useUiStore(selectDrawerOpen);
  const layout = useSettingsStore(selectLayout);
  const columns = layout === 'wall' ? 2 : 1;
  const metrics = useWallMetrics(columns);
  const now = useMinute();
  const { sections, total: notesTotal } = useBoardSections(view, now);
  // The bin holds pages too: one Corbeille for both spaces.
  const binnedPages = useTrashedPages().length;
  const total = notesTotal + (view === 'trash' ? binnedPages : 0);
  const results = useSearch(query, view === 'trash');
  const searching = query.trim().length > 0;
  // Back ends a search before it leaves the app; only while the board is the screen shown, so it never takes a note's Back.
  useFocusEffect(
    useCallback(() => {
      if (!searching) return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        setQuery('');
        return true;
      });
      return () => subscription.remove();
    }, [searching]),
  );
  const showCapture = view === 'notes' || view === 'reminders' || view.startsWith('label:');

  const shown = useMemo(
    () => (searching ? [{ key: 'results', title: null, ids: results }] : sections),
    [searching, results, sections],
  );

  const openNote = useCallback(
    (id: string) => {
      const note = useLibraryStore.getState().notes[id];
      if (!note) return;
      if (note.kind === 'links') navigation.navigate('Line', { id });
      else navigation.navigate('Note', { id });
    },
    [navigation],
  );

  const toggleSelected = useCallback((id: string) => {
    setSelection(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onPress = useCallback((id: string) => (selection.size > 0 ? toggleSelected(id) : openNote(id)), [selection.size, toggleSelected, openNote]);
  // A long press picks a card up: the system's long-press click says it took hold.
  const onLongPress = useCallback(
    (id: string) => {
      haptic('pick');
      toggleSelected(id);
    },
    [toggleSelected],
  );

  const labelIds = view.startsWith('label:') ? [view.slice(6)] : [];
  // From Rappels, a new note opens on its reminder sheet, keyboard closed so it stays in view.
  const open = (id: string, focus: 'body' | 'check') =>
    navigation.navigate('Note', view === 'reminders' ? { id, reminder: true } : { id, focus });
  const newNote = () => open(createNote({ kind: 'text', labelIds }), 'body');
  const newChecklist = () => {
    const id = createNote({ kind: 'checklist', labelIds });
    addCheck(id, '');
    open(id, 'check');
  };
  const newDrawing = () => navigation.navigate('Note', { id: createNote({ kind: 'drawing', labelIds }) });
  const newPhotoNote = async (source: 'gallery' | 'camera') => {
    const id = createNote({ kind: 'text', labelIds });
    const outcome = await pickInto(id, source);
    if (outcome.status === 'ok') {
      open(id, 'body');
    } else {
      deleteForever([id]);
      if (outcome.status === 'error') showSnack(outcome.message, undefined, { tone: 'error' });
    }
  };
  const newLink = async () => {
    const clip = await readClipboard();
    openCapture(extractUrls(clip)[0] ?? '');
  };

  // A search asked for from the home screen: the strip takes the keyboard.
  const [searchFocus, setSearchFocus] = useState(0);

  // The widgets' buttons arrive as a `capture` param: act once, then clear it.
  const capture = route.params?.capture;
  useEffect(() => {
    if (!capture) return;
    navigation.setParams({ capture: undefined });
    if (capture === 'note') newNote();
    if (capture === 'checklist') newChecklist();
    if (capture === 'photo') newPhotoNote('gallery');
    if (capture === 'camera') newPhotoNote('camera');
    if (capture === 'link') newLink();
    if (capture === 'search') setSearchFocus(n => n + 1);
    // As from Rappels: the note opens on its reminder sheet.
    if (capture === 'reminder') navigation.navigate('Note', { id: createNote({ kind: 'text', labelIds }), reminder: true });
    // The actions are recreated each render; only the param should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture]);

  const selected = [...selection];
  const clearSelection = useCallback(() => setSelection(EMPTY_SELECTION), []);
  const selectionInk = theme.color.onActionContainer;

  // Keep's swipe: off the board into the archive, or out of the archive; the snackbar undoes it.
  const swipeable = selection.size === 0 && !searching && view !== 'trash';
  const onSwipe = useCallback((id: string) => {
    // By the note itself: Rappels shows archived notes too, and one of those comes out of the archive.
    const archive = !useLibraryStore.getState().notes[id]?.archived;
    const undo = setArchived(id, archive);
    showSnack(archive ? t('Note archivée') : t('Note désarchivée'), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
  }, []);
  const allPinned = selected.every(id => useLibraryStore.getState().notes[id]?.pinned);
  /** "Note …" for one, "Notes …" for several. */
  const byCount = (one: string, several: string) => (selected.length > 1 ? several : one);
  const bulk = (run: () => () => void, message: string) => {
    const undo = run();
    clearSelection();
    showSnack(message, { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
  };
  const trashSelected = () => {
    const { notes, linksByNote } = useLibraryStore.getState();
    if (collectionsWithLinks(selected, notes, linksByNote).length === 0) {
      bulk(() => trashNotes(selected), byCount(t('Note placée dans la corbeille'), t('Notes placées dans la corbeille')));
      return;
    }
    // "Non classé" never goes to the bin, so its links are not asked about.
    setDeleteIds(selected.filter(id => id !== INBOX_ID));
    setDeleteOpen(true);
  };
  /** The selection goes to the bin; the links of its collections where the person said. */
  const removeSelected = (fate: LinksFate) => {
    const { notes, linksByNote } = useLibraryStore.getState();
    const links = deleteIds.flatMap(id => (notes[id]?.kind === 'links' ? (linksByNote[id] ?? []) : []));
    const deleted = deleteIds.length > 1 ? tx('Notes supprimées') : tx('Collection supprimée');
    clearSelection();
    if (fate.kind === 'bin') {
      showSnack(deleteIds.length > 1 ? t('Notes placées dans la corbeille') : t('Note placée dans la corbeille'), { label: tc('undo', 'Annuler'), run: trashLines(deleteIds, null) }, { tone: 'success' });
    } else if (fate.kind === 'move') {
      const undo = trashLines(deleteIds, fate.to);
      const name = fate.to === INBOX_ID ? t(INBOX_TITLE) : (notes[fate.to]?.title ?? '');
      showSnack(t('{deleted} : {links} dans {name}', { deleted: t(deleted), links: plural(links.length, 'lien déplacé', 'liens déplacés'), name }), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
    } else {
      sortDeletedLinksOnSlip(links, trashLines(deleteIds, INBOX_ID), deleted);
    }
  };

  const title = viewTitle(view, labelName);
  const go = (next: BoardView) => {
    setQuery('');
    clearSelection();
    navigation.setParams({ view: next });
  };
  const openLine = useCallback((id: string) => navigation.navigate('Line', { id }), [navigation]);
  /** Over to the pages: their home takes the board's place, so Back still leaves the app. */
  const toPages = () => navigation.dispatch(StackActions.replace('Pages'));
  const newLine = useCallback(() => setNewLineOpen(true), []);
  // A pull asks for a sync, on the wall and on an empty view alike.
  const refresh = () => {
    setRefreshing(true);
    requestSync();
    setTimeout(() => setRefreshing(false), 900);
  };

  // The head of the wall, scrolling with it: only the search strip stays pinned.
  const intro = (
    <View>
      <SyncLine />
      {view === 'notes' && !searching ? <LineChips onOpenLine={openLine} onNewLine={newLine} selecting={selection.size > 0} /> : null}
      {title && !searching ? (
        <View style={styles.viewTitle}>
          <AppText variant="title" accessibilityRole="header">
            {title}
          </AppText>
          {view === 'trash' && total > 0 ? (
            <Button kind="text" label={t('Vider la corbeille')} onPress={() => setConfirmEmpty(true)} />
          ) : null}
        </View>
      ) : null}
      {view === 'trash' && !searching ? (
        <AppText variant="meta" style={styles.notice}>
          {t('Les notes et les pages de la corbeille sont supprimées au bout de {days} jours.', { days: TRASH_RETENTION_DAYS })}
        </AppText>
      ) : null}
      {view === 'trash' && !searching ? <PagesBinSection notesFollow={notesTotal > 0} onDelete={setPageToDelete} /> : null}
      {searching ? (
        <AppText variant="meta" style={styles.notice}>
          {results.length === 0 ? t('Aucun résultat') : plural(results.length, 'résultat')}
        </AppText>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <Ground />
      <BoardHeader
        query={query}
        onQuery={setQuery}
        onMenu={() => setDrawerOpen(true)}
        layout={layout}
        onToggleLayout={() => setLayout(layout === 'wall' ? 'list' : 'wall')}
        placeholder={title ? t('Rechercher ({view})', { view: title.toLowerCase() }) : t('Rechercher dans vos notes')}
        focusKey={searchFocus}
        onServer={() => navigation.navigate('Admin')}
      />

      {total === 0 && !searching ? (
        <EmptyBoard view={view} header={intro} bottomSpace={showCapture ? BOTTOM_BAR_HEIGHT + insets.bottom : insets.bottom} refreshing={refreshing} onRefresh={refresh} />
      ) : (
        <Wall
          sections={shown}
          metrics={metrics}
          columns={columns}
          query={query}
          selection={selection}
          onPress={onPress}
          onLongPress={onLongPress}
          header={intro}
          footerSpace={(showCapture ? BOTTOM_BAR_HEIGHT : 16) + insets.bottom + 72}
          onSwipe={swipeable ? onSwipe : undefined}
          canSwipe={canSwipe}
          refreshing={refreshing}
          onRefresh={refresh}
        />
      )}

      {showCapture && selection.size === 0 ? (
        <BottomBar onChecklist={newChecklist} onDrawing={newDrawing} onPhoto={() => newPhotoNote('gallery')} onLink={newLink} onNote={newNote} />
      ) : null}

      {selection.size > 0 ? (
        <SelectionBar count={selection.size} onClose={clearSelection}>
          {view === 'trash' ? (
            <>
              <IconButton icon="restore" label={t('Restaurer')} color={selectionInk} shape={1} onPress={() => bulk(() => restoreNotes(selected), byCount(t('Note restaurée'), t('Notes restaurées')))} />
              <IconButton icon="trash" label={t('Supprimer définitivement')} color={selectionInk} shape={2} onPress={() => setConfirmDelete(true)} />
            </>
          ) : (
            <>
              <IconButton
                icon={allPinned ? 'pinOff' : 'pin'}
                label={allPinned ? t('Retirer des épinglées') : t('Épingler')}
                color={selectionInk}
                shape={1}
                onPress={() => {
                  const undos = selected.map(id => setPinned(id, !allPinned));
                  clearSelection();
                  showSnack(allPinned ? byCount(t('Retirée des épinglées'), t('Retirées des épinglées')) : byCount(t('Note épinglée'), t('Notes épinglées')), { label: tc('undo', 'Annuler'), run: () => undos.forEach(u => u()) }, { tone: 'success' });
                }}
              />
              <IconButton
                icon={view === 'archive' ? 'unarchive' : 'archive'}
                label={view === 'archive' ? t('Désarchiver') : t('Archiver')}
                color={selectionInk}
                shape={2}
                onPress={() => {
                  const undos = selected.map(id => setArchived(id, view !== 'archive'));
                  clearSelection();
                  showSnack(view === 'archive' ? byCount(t('Note désarchivée'), t('Notes désarchivées')) : byCount(t('Note archivée'), t('Notes archivées')), { label: tc('undo', 'Annuler'), run: () => undos.forEach(u => u()) }, { tone: 'success' });
                }}
              />
              <IconButton icon="trash" label={t('Supprimer')} color={selectionInk} shape={0} onPress={trashSelected} />
            </>
          )}
        </SelectionBar>
      ) : null}

      <Drawer
        open={drawerOpen}
        space="notes"
        current={view}
        onClose={() => setDrawerOpen(false)}
        onView={go}
        onLine={id => navigation.navigate('Line', { id })}
        onLines={() => navigation.navigate('Lines')}
        onNewLine={newLine}
        onLabels={() => navigation.navigate('Labels')}
        onSettings={() => navigation.navigate('Settings')}
        onAdmin={() => navigation.navigate('Admin')}
        onPages={toPages}
        onPage={id => {
          toPages();
          navigation.navigate('Page', { id });
        }}
        onNewPage={() => {
          const id = createPage();
          requestTitleFocus(id);
          toPages();
          navigation.navigate('Page', { id });
        }}
      />

      <NewLineSheet visible={newLineOpen} onDismiss={() => setNewLineOpen(false)} onCreated={id => navigation.navigate('Line', { id })} />
      <DeleteLineSheet ids={deleteIds} visible={deleteOpen} onDismiss={() => setDeleteOpen(false)} onChoose={removeSelected} onPickLine={() => setPicking(true)} />
      <MoveSheet visible={picking} currentLineId={null} exclude={deleteIds} title={t('Déplacer les liens vers')} onDismiss={() => setPicking(false)} onPick={target => removeSelected({ kind: 'move', to: target })} />

      <Dialog
        visible={confirmEmpty}
        title={t('Vider la corbeille ?')}
        message={t('Toutes les notes et les pages de la corbeille seront supprimées définitivement, sur tous vos appareils.')}
        confirmLabel={t('Vider')}
        danger
        onCancel={() => setConfirmEmpty(false)}
        onConfirm={() => {
          setConfirmEmpty(false);
          const notes = emptyTrash();
          const pages = emptyPagesBin();
          const notesGone = plural(notes, 'note supprimée', 'notes supprimées');
          const pagesGone = plural(pages, 'page supprimée', 'pages supprimées');
          showSnack(notes > 0 && pages > 0 ? t('{notes} et {pages} définitivement', { notes: notesGone, pages: pagesGone }) : t('{deleted} définitivement', { deleted: pages > 0 ? pagesGone : notesGone }), undefined, { tone: 'success' });
        }}
      />
      <Dialog
        visible={confirmDelete}
        title={t('Supprimer définitivement ?')}
        message={t('Ces notes disparaîtront de tous vos appareils. Cette action est irréversible.')}
        confirmLabel={t('Supprimer')}
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          // Only what is in the bin is ever erased from here.
          const { notes } = useLibraryStore.getState();
          const binned = selected.filter(id => notes[id] && notes[id]!.trashedAt !== null);
          deleteForever(binned);
          clearSelection();
          showSnack(t('{deleted} définitivement', { deleted: plural(binned.length, 'note supprimée', 'notes supprimées') }), undefined, { tone: 'success' });
        }}
      />
      <DeletePageDialog id={pageToDelete} onClose={() => setPageToDelete(null)} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    viewTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, minHeight: 56 },
    notice: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  });
