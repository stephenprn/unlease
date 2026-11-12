/**
 * Pages' home on the phone, laid out as Carnet's board is: the search strip (the pages alone), then
 * the pages changed last and every top-level page as rows, and the bottom bar whose pebble makes a
 * page. While there are only a few pages, a line says what one can hold; with none, the same empty
 * place as the board's. One quiet line leads to the pages in the bin. Back leaves the app.
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { LayoutAnimationConfig } from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';

import { GEOMETRY } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import { APP_WORDS } from '@unlease/core/appWords';
import { t, tc } from '@unlease/core/i18n';
import { RICH_KINDS, UNTITLED_PAGE } from '@unlease/pages/models/blocks';
import { ancestorPages } from '@unlease/pages/services/blocks';
import { formatEdited, plural } from '@unlease/core/services/format';
import { searchSummary } from '@unlease/core/services/searchWords';
import { buildPageDocuments, searchPageDocuments } from '@unlease/pages/services/pageSearch';
import { PAGES_SETTINGS_PLACES } from '@unlease/pages/services/settingsPlaces';
import { markupToPlain } from '@unlease/core/services/richText';
import { dateWords } from '@unlease/core/services/dates';
import { useMinute } from '@shared/app/hooks/useMinute';
import { childPagesOf, livePageIds, mentionLabel, pageEdited, useChildPages, useRecentPages, useTrashedPages } from '@app/hooks/usePages';
import { useLibraryStore, type LibraryState } from '@app/store/libraryStore';
import { createPage, duplicateBlocks, trashPage } from '@app/store/pages';
import { requestTitleFocus, setExpanded } from '@app/store/pagesUi';
import { selectDrawerOpen, setDrawerOpen, showSnack, useUiStore } from '@shared/app/store/uiStore';

import { AppText, EdgeScrollView, EmptyState, FAB_CLEARANCE, FabMenu, Ground, Icon, ListRow, SearchHeader, Sheet, SyncLine, Tappable, useArrivals, usePullToSync } from '@shared/ui/components';
import { settingsFound, SettingsMatches, settingsScreenOf, type PhoneSettingsPlace } from '@shared/ui/features/settings/SettingsMatches';
import { Drawer } from '../navigation/Drawer';
import type { ScreenProps } from '../navigation/types';
import { listIn, listMove, listOut, listPressDelay } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

/** Fewer pages than this, and the home says what a page can hold. */
const FEW_PAGES = 3;
/** Under this many pages « Toutes les pages » already shows them at a glance: no « Récentes » to repeat them. */
const RECENT_FROM = 5;
const RECENT = 4;

/** A page's first words (its own content's, a sub-page's are its own) and the pages above it. */
function pageGlance(s: LibraryState, id: string): { readonly preview: string; readonly path: string } {
  let preview = '';
  const walk = (parent: string, depth: number): void => {
    for (const childId of s.blocksByParent[parent] ?? []) {
      const block = s.blocks[childId];
      if (preview || depth > 200 || !block || block.kind === 'page') continue;
      if (RICH_KINDS.has(block.kind)) preview = markupToPlain(block.text, mentionLabel, dateWords).trim().slice(0, 240);
      if (!preview) walk(childId, depth + 1);
    }
  };
  walk(id, 0);
  const path = ancestorPages(s.blocks, id)
    .map(page => page.text.trim() || t(UNTITLED_PAGE))
    .join(' › ');
  return { preview, path };
}

function PageMark({ icon }: { icon: string | null }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return <View style={styles.mark}>{icon ? <AppText style={styles.emoji}>{icon}</AppText> : <Icon name="page" size={24} color={theme.color.ink} />}</View>;
}

/** A page as a row: its mark, its title, then where it sits or what it holds and when it changed. */
/** Held down, it opens the page's actions, as its row in the drawer's tree does. */
const PageRow = memo(function PageRow({ id, now, recent, onOpen, onActions, snippet }: { id: string; now: number; recent: boolean; onOpen: (id: string) => void; onActions?: (id: string) => void; snippet?: string }) {
  const styles = useThemedStyles(makeStyles);
  const page = useLibraryStore(s => s.blocks[id]);
  const glance = useLibraryStore(useShallow(s => pageGlance(s, id)));
  const subPages = useLibraryStore(s => childPagesOf(s, id).length);
  const edited = useLibraryStore(s => pageEdited(s, id));
  if (!page) return null;
  const title = page.text.trim() || t(UNTITLED_PAGE);
  const facts = [recent ? glance.path || null : subPages > 0 ? plural(subPages, 'sous-page') : null, formatEdited(edited, now)].filter(Boolean).join(' · ');
  const line = snippet ?? (recent ? glance.preview : '');
  return (
    <Tappable
      unstable_pressDelay={listPressDelay}
      onPress={() => onOpen(id)}
      onLongPress={onActions ? () => onActions(id) : undefined}
      style={styles.row}
      accessibilityRole="link"
      accessibilityLabel={title}
      accessibilityActions={onActions ? [{ name: 'actions', label: t('Plus d’actions') }] : undefined}
      onAccessibilityAction={onActions ? () => onActions(id) : undefined}
    >
      <PageMark icon={page.icon} />
      <View style={styles.rowText}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        {line ? (
          <AppText variant="meta" numberOfLines={1} color={undefined}>
            {line}
          </AppText>
        ) : null}
        <AppText variant="meta" numberOfLines={1}>
          {facts}
        </AppText>
      </View>
    </Tappable>
  );
});

/**
 * A page's actions, from its row in the drawer's tree held down: the web tree's « + » and menu (a
 * sub-page, a copy, the bin, the bin's slip taking it back).
 */
function PageActionsSheet({ id, onDismiss, onOpen, onNewPage }: { id: string | null; onDismiss: () => void; onOpen: (id: string) => void; onNewPage: (parentId: string) => void }) {
  // Kept while the sheet leaves, so its title does not change on the way out.
  const [shown, setShown] = useState(id);
  if (id && id !== shown) setShown(id);
  const title = useLibraryStore(s => (shown ? s.blocks[shown]?.text.trim() || t(UNTITLED_PAGE) : ''));
  const act = (run: (page: string) => void) => () => {
    onDismiss();
    if (id) run(id);
  };
  return (
    <Sheet visible={id !== null} onDismiss={onDismiss} title={title}>
      <ListRow icon="pagePlus" title={t('Ajouter une sous-page')} onPress={act(onNewPage)} />
      <ListRow
        icon="copy"
        title={t('Dupliquer')}
        onPress={act(page => {
          const [copy] = duplicateBlocks(null, [page]);
          if (copy) onOpen(copy);
        })}
      />
      <ListRow
        icon="trash"
        title={t('Mettre à la corbeille')}
        danger
        onPress={act(page => {
          const undo = trashPage(page);
          showSnack(t('Page placée dans la corbeille'), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
        })}
      />
    </Sheet>
  );
}

/** The pages a query finds, the best first, with the words that matched. */
function usePageResults(query: string) {
  const revision = useLibraryStore(s => s.revision);
  return useMemo(() => {
    const wanted = query.trim();
    if (!wanted) return [];
    const { blocks, blocksByParent } = useLibraryStore.getState();
    return searchPageDocuments(buildPageDocuments(blocks, blocksByParent, mentionLabel), wanted);
    // The revision stands for every change of the library.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, revision]);
}

export function PagesScreen({ navigation, route }: ScreenProps<'Pages'>) {
  // A setting a search found: its screen, with its section where that screen takes one (the import's and the erase's take none).
  const openSettingsPlace = (place: PhoneSettingsPlace): void => {
    const screen = settingsScreenOf(place);
    if (screen === 'Import' || screen === 'Erase') navigation.navigate(screen);
    else navigation.navigate(screen, place.section ? { section: place.section } : undefined);
  };
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;
  const results = usePageResults(query);
  const roots = useChildPages(null);
  const count = useLibraryStore(s => livePageIds(s).length);
  const recent = useRecentPages(RECENT);
  // What arrives while the home is shown settles in; back from a search, the lists are shown whole.
  const arrivedRecent = useArrivals(recent, searching ? 'search' : 'home');
  const arrivedRoots = useArrivals(roots, searching ? 'search' : 'home');
  const binned = useTrashedPages().length;
  const drawerOpen = useUiStore(selectDrawerOpen);
  const now = useMinute();
  const pullToSync = usePullToSync();

  // Back ends a search before it leaves the app.
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

  const openPage = useCallback((id: string) => navigation.navigate('Page', { id }), [navigation]);
  const newPage = (parentId: string | null = null): void => {
    const id = createPage({ parentId });
    if (parentId) setExpanded(parentId, true);
    requestTitleFocus(id);
    openPage(id);
  };
  /** The page whose actions are open (its tree row held down). */
  const [acting, setActing] = useState<string | null>(null);

  // A search asked for from the launcher's shortcut: the strip takes the keyboard.
  const [searchFocus, setSearchFocus] = useState(0);
  // The launcher's shortcuts arrive as a `capture` param: act once, then clear it.
  const capture = route.params?.capture;
  useEffect(() => {
    if (!capture) return;
    navigation.setParams({ capture: undefined });
    if (capture === 'page') newPage(null);
    if (capture === 'search') setSearchFocus(n => n + 1);
    // Only the param should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture]);

  return (
    <View style={styles.screen}>
      <Ground />
      <SearchHeader
        query={query}
        onQuery={setQuery}
        onMenu={() => setDrawerOpen(true)}
        placeholder={APP_WORDS.pages.search}
        focusKey={searchFocus}
        onServer={() => navigation.navigate('Admin', { section: 'server' })}
        localText={t('Pas de serveur : les pages restent sur ce téléphone.')}
      />
      <EdgeScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: FAB_CLEARANCE + insets.bottom }}
        refreshControl={pullToSync}
      >
        <SyncLine />
        {searching ? (
          <View>
            {/* The settings the words name, above the pages. */}
            <SettingsMatches
              query={query}
              own={PAGES_SETTINGS_PLACES}
              onOpen={place => openSettingsPlace(place)}
            />
            {/* The count over the results; as in every app, nothing found is the search's empty state: what it looks through under the count. */}
            {results.length === 0 ? (
              <EmptyState scene="search" title={searchSummary(query, 0, settingsFound(query, PAGES_SETTINGS_PLACES))} text={APP_WORDS.pages.searchHint} />
            ) : (
              <AppText variant="meta" style={styles.notice}>
                {searchSummary(query, results.length)}
              </AppText>
            )}
            {results.map(hit => (
              <PageRow key={hit.pageId} id={hit.pageId} now={now} recent onOpen={openPage} onActions={setActing} snippet={hit.snippet || undefined} />
            ))}
          </View>
        ) : roots.length === 0 ? (
          <EmptyState scene="notes" title={t('Aucune page pour l’instant')} text={t('Une page tient des titres, des listes, des tableaux, du code, des images, et vos notes, collections et liens. Le bouton +, en bas, en crée une.')} />
        ) : (
          <>
            {count < FEW_PAGES ? (
              <AppText variant="body" color={theme.color.inkMuted} style={styles.intro}>
                {t('Vos documents, rangés comme vous voulez : une page peut en contenir d’autres. Tapez « / » dans une page pour y ajouter un bloc, « @ » pour citer un contact, une note, une collection ou un lien.')}
              </AppText>
            ) : null}
            {/* A page leaving fades where it was and the others close ranks; one arriving settles in after them. A section shown whole (opened, back from a search) just is there, and goes whole. */}
            {count >= RECENT_FROM ? (
              <LayoutAnimationConfig skipEntering skipExiting>
                <View style={styles.section}>
                  <AppText variant="section" style={styles.head} accessibilityRole="header">
                    {t('Récentes')}
                  </AppText>
                  {recent.map(id => (
                    <Animated.View key={id} layout={listMove} entering={arrivedRecent.has(id) ? listIn : undefined} exiting={listOut}>
                      <PageRow id={id} now={now} recent onOpen={openPage} onActions={setActing} />
                    </Animated.View>
                  ))}
                </View>
              </LayoutAnimationConfig>
            ) : null}
            <LayoutAnimationConfig skipEntering skipExiting>
              <View style={styles.section}>
                <AppText variant="section" style={styles.head} accessibilityRole="header">
                  {t('Toutes les pages')}
                </AppText>
                {roots.map(id => (
                  <Animated.View key={id} layout={listMove} entering={arrivedRoots.has(id) ? listIn : undefined} exiting={listOut}>
                    <PageRow id={id} now={now} recent={false} onOpen={openPage} onActions={setActing} />
                  </Animated.View>
                ))}
              </View>
            </LayoutAnimationConfig>
          </>
        )}
        {binned > 0 && !searching ? (
          <Tappable onPress={() => navigation.navigate('Trash')} style={styles.binLink} accessibilityRole="link">
            <Icon name="trash" size={18} color={theme.color.inkMuted} />
            <AppText variant="meta">{t('{pages} dans la corbeille', { pages: plural(binned, 'page') })}</AppText>
          </Tappable>
        ) : null}
      </EdgeScrollView>
      <FabMenu actions={[{ icon: 'plus', label: t('Nouvelle page'), onPress: () => newPage(null) }]} />
      <Drawer
        open={drawerOpen}
        current="pages"
        onClose={() => setDrawerOpen(false)}
        onPages={() => setQuery('')}
        onPage={openPage}
        onPageActions={setActing}
        onNewPage={() => newPage(null)}
        onTrash={() => navigation.navigate('Trash')}
        onSettings={() => navigation.navigate('Settings')}
        onAdmin={() => navigation.navigate('Admin')}
      />
      <PageActionsSheet id={acting} onDismiss={() => setActing(null)} onOpen={openPage} onNewPage={newPage} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    section: { paddingTop: 8 },
    head: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
    notice: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
    intro: { paddingHorizontal: 16, paddingTop: 16, maxWidth: 560 },
    // A list row's geometry (inset 6, padded 10): the mark on the section heads' 16, the words at 56.
    row: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 64, marginHorizontal: 6, paddingHorizontal: 10, paddingVertical: 8, marginVertical: GEOMETRY.rowGap / 2, ...corners(SHAPES.tab) },
    rowText: { flex: 1, gap: 1 },
    // An emoji is a little wider than a glyph: its 32 box takes the 24 slot's room, centred on it.
    mark: { width: 32, height: 32, marginHorizontal: -4, alignItems: 'center', justifyContent: 'center' },
    emoji: { fontSize: 24, lineHeight: 30 },
    binLink: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', minHeight: 48, marginTop: 20, paddingHorizontal: 14, ...corners(SHAPES.chip) },
  });
