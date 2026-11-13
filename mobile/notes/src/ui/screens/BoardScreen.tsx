/**
 * The board: one screen for every view of the notes. The drawer switches views through this
 * screen's params instead of pushing screens, so Back always leaves the board.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { APP_WORDS } from '@unlease/core/appWords';
import { t, tc, tx } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { searchSummary } from '@unlease/core/services/searchWords';
import { collectionsWithLinks } from '@unlease/notes/services/sorting';
import { INBOX_ID, INBOX_SHOWN_TITLE, TRASH_RETENTION_DAYS } from '@unlease/notes/models/entities';
import { NOTES_SETTINGS_PLACES } from '@unlease/notes/services/settingsPlaces';
import { useBoardSections, useSearch, type BoardView } from '@app/hooks/useBoard';
import { useMinute } from '@shared/app/hooks/useMinute';
import { pickInto } from '@app/media';
import { createNote, deleteForever, emptyTrash, restoreNotes, setArchived, setPinned, trashLines, trashNotes, addCheck } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { selectLayout, setLayout, useLayoutStore } from '@app/store/layoutStore';
import { selectDrawerOpen, setDrawerOpen, showSnack, useUiStore } from '@shared/app/store/uiStore';
import { openCapture } from '@app/store/captureStore';
import { haptic } from '@shared/platform/haptics';
import { readClipboard } from '@shared/platform/clipboard';
import { extractUrls } from '@unlease/core/services/url';

import { AppText, Button, Dialog, EmptyState, FAB_CLEARANCE, FabMenu, Ground, IconButton, usePullToSync } from '../components';
import { BoardHeader, LineChips, SyncLine } from '../features/board/BoardHeader';
import { SelectionBar } from '../features/board/SelectionBar';
import { BulkLabelsSheet } from '../features/board/BulkLabelsSheet';
import { BulkColorSheet, onlyCollections } from '../features/board/BulkColorSheet';
import { EmptyBoard } from '../features/board/EmptyBoard';
import { Wall } from '../features/board/Wall';
import { useWallMetrics } from '../features/board/wallLayout';
import { DeleteLineSheet, type LinksFate } from '../features/lines/DeleteLineSheet';
import { MoveSheet } from '../features/lines/MoveSheet';
import { NewLineSheet } from '../features/lines/NewLineSheet';
import { sortDeletedLinksOnSlip } from '../features/lines/sortingSlips';
import { settingsFound, SettingsMatches, settingsScreenOf, type PhoneSettingsPlace } from '@shared/ui/features/settings/SettingsMatches';
import { Drawer } from '../navigation/Drawer';
import type { ScreenProps } from '../navigation/types';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

const EMPTY_SELECTION: ReadonlySet<string> = new Set();

/** "Non classé" stays on the board: it is where unsorted links land. */
const canSwipe = (id: string) => id !== INBOX_ID;

function viewTitle(view: BoardView, labelName: string | undefined): string | null {
  if (view === 'reminders') return t('Reminders');
  if (view === 'archive') return tc('place', 'Archive');
  if (view === 'trash') return t('Bin');
  if (view.startsWith('label:')) return labelName ?? tc('notes', 'Label');
  return null;
}

export function BoardScreen({ navigation, route }: ScreenProps<'Board'>) {
  // A setting a search found: its screen, with its section where that screen takes one (the import's and the erase's take none).
  const openSettingsPlace = (place: PhoneSettingsPlace): void => {
    const screen = settingsScreenOf(place);
    if (screen === 'Import' || screen === 'Erase') navigation.navigate(screen);
    else navigation.navigate(screen, place.section ? { section: place.section } : undefined);
  };
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
  const [newLineOpen, setNewLineOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  // A selection holding collections with links: deleting asks where the links go first.
  const [deleteIds, setDeleteIds] = useState<readonly string[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  // A pull asks for a sync, on the wall and on an empty view alike.
  const pullToSync = usePullToSync();
  const drawerOpen = useUiStore(selectDrawerOpen);
  const layout = useLayoutStore(selectLayout);
  const columns = layout === 'wall' ? 2 : 1;
  const metrics = useWallMetrics(columns);
  const now = useMinute();
  const { sections, total } = useBoardSections(view, now);
  const results = useSearch(query, view === 'trash');
  const searching = query.trim().length > 0;
  // Back ends a search, then the narrowed board (a label, Rappels, Archives, Corbeille: back to the notes, as Contacts'
  // and Agenda's lists go back to all), before it leaves the app; only while the board is the screen shown, so it
  // never takes a note's Back. What is open over it (a sheet, a menu, the drawer, a selection) closes first, on its own.
  const narrowed = view !== 'notes';
  useFocusEffect(
    useCallback(() => {
      if (!searching && !narrowed) return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (searching) setQuery('');
        else navigation.setParams({ view: 'notes', label: undefined });
        return true;
      });
      return () => subscription.remove();
    }, [searching, narrowed, navigation]),
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
  const clearSelection = useCallback(() => {
    setSelection(EMPTY_SELECTION);
    setLabelsOpen(false);
    setColorOpen(false);
  }, []);
  const selectionInk = theme.color.onActionContainer;

  // Keep's swipe: off the board into the archive, or out of the archive; the snackbar undoes it.
  const swipeable = selection.size === 0 && !searching && view !== 'trash';
  const onSwipe = useCallback((id: string) => {
    // By the note itself: Rappels shows archived notes too, and one of those comes out of the archive.
    const archive = !useLibraryStore.getState().notes[id]?.archived;
    const undo = setArchived(id, archive);
    showSnack(archive ? t('Note archived') : t('Note unarchived'), { label: t('Undo'), run: undo }, { tone: 'success' });
  }, []);
  const allPinned = selected.every(id => useLibraryStore.getState().notes[id]?.pinned);
  /** "Note …" for one, "Notes …" for several. */
  const byCount = (one: string, several: string) => (selected.length > 1 ? several : one);
  const bulk = (run: () => () => void, message: string) => {
    const undo = run();
    clearSelection();
    showSnack(message, { label: t('Undo'), run: undo }, { tone: 'success' });
  };
  const trashSelected = () => {
    const { notes, linksByNote } = useLibraryStore.getState();
    if (collectionsWithLinks(selected, notes, linksByNote).length === 0) {
      bulk(() => trashNotes(selected), byCount(t('Note moved to the bin'), t('Notes moved to the bin')));
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
    const deleted = deleteIds.length > 1 ? tx('Notes deleted') : tx('Collection deleted');
    clearSelection();
    if (fate.kind === 'bin') {
      showSnack(deleteIds.length > 1 ? t('Notes moved to the bin') : t('Note moved to the bin'), { label: t('Undo'), run: trashLines(deleteIds, null) }, { tone: 'success' });
    } else if (fate.kind === 'move') {
      const undo = trashLines(deleteIds, fate.to);
      const name = fate.to === INBOX_ID ? t(INBOX_SHOWN_TITLE) : (notes[fate.to]?.title ?? '');
      showSnack(t('{deleted}: {links} to {name}', { deleted: t(deleted), links: plural(links.length, 'link moved', 'links moved'), name }), { label: t('Undo'), run: undo }, { tone: 'success' });
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
  const newLine = useCallback(() => setNewLineOpen(true), []);

  // The head of the wall, scrolling with it: only the search strip stays pinned.
  const intro = (
    <View>
      <SyncLine />
      {view === 'notes' && !searching ? <LineChips onOpenLine={openLine} onNewLine={newLine} selecting={selection.size > 0} /> : null}
      {title && !searching ? (
        <View style={styles.viewTitle}>
          {/* A long label's name wraps rather than pushing what follows it off the screen. */}
          <AppText variant="title" accessibilityRole="header" style={styles.viewTitleText}>
            {title}
          </AppText>
          {view === 'trash' && total > 0 ? (
            // Small beside the title, so the title stands where every view's does.
            <Button kind="text" small icon="broom" label={t('Empty the bin')} onPress={() => setConfirmEmpty(true)} />
          ) : null}
        </View>
      ) : null}
      {/* Said once, under the title, while the bin holds something: empty, its empty state says how long notes stay. */}
      {view === 'trash' && !searching && total > 0 ? (
        <AppText variant="meta" style={styles.underTitle}>
          {t('Notes in the bin are deleted after {days} days.', { days: TRASH_RETENTION_DAYS })}
        </AppText>
      ) : null}
      {/* The settings the words name, above the notes, in the search of every note (a view's searches its own). */}
      {searching && view === 'notes' ? (
        <SettingsMatches
          query={query}
          own={NOTES_SETTINGS_PLACES}
          onOpen={place => openSettingsPlace(place)}
        />
      ) : null}
      {/* The count over the results; as in every app, nothing found is the search's empty state: what it looks through under the count. */}
      {searching && results.length === 0 ? (
        <EmptyState scene="search" title={searchSummary(query, 0, view === 'notes' ? settingsFound(query, NOTES_SETTINGS_PLACES) : 0)} text={APP_WORDS.notes.searchHint} />
      ) : searching ? (
        <AppText variant="meta" style={styles.notice}>
          {searchSummary(query, results.length)}
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
        localText={t('No server: notes stay on this phone.')}
        layout={layout}
        onToggleLayout={() => setLayout(layout === 'wall' ? 'list' : 'wall')}
        placeholder={title ? t('Search in “{view}”', { view: title }) : APP_WORDS.notes.search}
        focusKey={searchFocus}
        onServer={() => navigation.navigate('Admin', { section: 'server' })}
      />

      {total === 0 && !searching ? (
        <EmptyBoard view={view} header={intro} bottomSpace={showCapture ? FAB_CLEARANCE + insets.bottom : insets.bottom} refreshControl={pullToSync} />
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
          footerSpace={(showCapture ? FAB_CLEARANCE : 16) + insets.bottom + 24}
          onSwipe={swipeable ? onSwipe : undefined}
          canSwipe={canSwipe}
          refreshControl={pullToSync}
        />
      )}

      <FabMenu
        visible={showCapture && selection.size === 0}
        label={t('Create')}
        actions={[
          { icon: 'note', label: t('Note'), onPress: newNote },
          { icon: 'checklist', label: t('List'), onPress: newChecklist },
          { icon: 'draw', label: t('Drawing'), onPress: newDrawing },
          { icon: 'image', label: t('Photo'), onPress: () => newPhotoNote('gallery') },
          { icon: 'link', label: t('Link'), onPress: newLink },
        ]}
      />

      {selection.size > 0 ? (
        <SelectionBar count={selection.size} onClose={clearSelection}>
          {view === 'trash' ? (
            <>
              <IconButton icon="restore" label={t('Restore')} color={selectionInk} shape={1} onPress={() => bulk(() => restoreNotes(selected), byCount(t('Note restored'), t('Notes restored')))} />
              <IconButton icon="trash" label={t('Delete forever')} color={selectionInk} shape={2} onPress={() => setConfirmDelete(true)} />
            </>
          ) : (
            <>
              <IconButton
                icon={allPinned ? 'pinOff' : 'pin'}
                label={allPinned ? t('Unpin') : t('Pin')}
                color={selectionInk}
                shape={1}
                onPress={() => {
                  const undos = selected.map(id => setPinned(id, !allPinned));
                  clearSelection();
                  showSnack(allPinned ? byCount(t('Unpinned'), tc('many', 'Unpinned')) : byCount(t('Note pinned'), t('Notes pinned')), { label: t('Undo'), run: () => undos.forEach(u => u()) }, { tone: 'success' });
                }}
              />
              <IconButton icon="palette" label={onlyCollections(selected) ? t('Colour') : t('Colour and paper')} color={selectionInk} shape={0} onPress={() => setColorOpen(true)} />
              <IconButton icon="tag" label={tc('notes', 'Labels')} color={selectionInk} shape={3} onPress={() => setLabelsOpen(true)} />
              <IconButton
                icon={view === 'archive' ? 'unarchive' : 'archive'}
                label={view === 'archive' ? t('Unarchive') : t('Archive')}
                color={selectionInk}
                shape={2}
                onPress={() => {
                  const undos = selected.map(id => setArchived(id, view !== 'archive'));
                  clearSelection();
                  showSnack(view === 'archive' ? byCount(t('Note unarchived'), t('Notes unarchived')) : byCount(t('Note archived'), t('Notes archived')), { label: t('Undo'), run: () => undos.forEach(u => u()) }, { tone: 'success' });
                }}
              />
              <IconButton icon="trash" label={t('Delete')} color={selectionInk} shape={0} onPress={trashSelected} />
            </>
          )}
        </SelectionBar>
      ) : null}

      <Drawer
        open={drawerOpen}
        current={view}
        onClose={() => setDrawerOpen(false)}
        onView={go}
        onLine={id => navigation.navigate('Line', { id })}
        onLines={() => navigation.navigate('Lines')}
        onNewLine={newLine}
        onLabels={() => navigation.navigate('Labels')}
        onSettings={() => navigation.navigate('Settings')}
        onAdmin={() => navigation.navigate('Admin')}
      />

      <BulkLabelsSheet visible={labelsOpen} ids={selected} onDismiss={() => setLabelsOpen(false)} />
      <BulkColorSheet visible={colorOpen} ids={selected} onDismiss={() => setColorOpen(false)} />
      <NewLineSheet visible={newLineOpen} onDismiss={() => setNewLineOpen(false)} onCreated={id => navigation.navigate('Line', { id })} />
      <DeleteLineSheet ids={deleteIds} visible={deleteOpen} onDismiss={() => setDeleteOpen(false)} onChoose={removeSelected} onPickLine={() => setPicking(true)} />
      <MoveSheet visible={picking} currentLineId={null} exclude={deleteIds} title={t('Move the links to')} onDismiss={() => setPicking(false)} onPick={target => removeSelected({ kind: 'move', to: target })} />

      <Dialog
        visible={confirmEmpty}
        title={t('Empty the bin?')}
        message={t('Every note in the bin will be deleted for good, on all your devices.')}
        confirmLabel={t('Empty')}
        danger
        onCancel={() => setConfirmEmpty(false)}
        onConfirm={() => {
          setConfirmEmpty(false);
          const notes = emptyTrash();
          showSnack(t('{deleted} forever', { deleted: plural(notes, 'note deleted', 'notes deleted') }), undefined, { tone: 'success' });
        }}
      />
      <Dialog
        visible={confirmDelete}
        title={t('Delete forever?')}
        message={t('These notes will disappear from all your devices. This can’t be undone.')}
        confirmLabel={t('Delete')}
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          // Only what is in the bin is ever erased from here.
          const { notes } = useLibraryStore.getState();
          const binned = selected.filter(id => notes[id] && notes[id]!.trashedAt !== null);
          deleteForever(binned);
          clearSelection();
          showSnack(t('{deleted} forever', { deleted: plural(binned.length, 'note deleted', 'notes deleted') }), undefined, { tone: 'success' });
        }}
      />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    viewTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, minHeight: 56 },
    viewTitleText: { flexShrink: 1 },
    notice: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
    // The search's second line, under its count: one block, not two notices.
    // A line that belongs to the title above it: closer to it than to the cards under it.
    underTitle: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 8 },
  });
