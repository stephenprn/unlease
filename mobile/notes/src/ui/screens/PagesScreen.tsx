/**
 * The pages' home on the phone, the other space beside the notes' board and laid out as it is: the
 * search strip (the pages alone), then the pages changed last and every top-level page as rows,
 * and the bottom bar whose pebble makes a page. While there are only a few pages, a line says what
 * one can hold; with none, the same empty place as the board's. The pages in the bin are in the
 * Corbeille with the notes; one quiet line here leads there. Back leaves the app, as from the board.
 */
import React, { memo, useCallback, useMemo, useState } from 'react';
import { BackHandler, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackActions, useFocusEffect } from '@react-navigation/native';
import { useShallow } from 'zustand/react/shallow';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { RICH_KINDS, UNTITLED_PAGE } from '@unlease/notes/models/blocks';
import { ancestorPages } from '@unlease/notes/services/blocks';
import { formatEdited, plural } from '@unlease/core/services/format';
import { buildPageDocuments, searchPageDocuments } from '@unlease/notes/services/pageSearch';
import { markupToPlain } from '@unlease/core/services/richText';
import { dateWords } from '@unlease/core/services/dates';
import { useMinute } from '@app/hooks/useMinute';
import { childPagesOf, livePageIds, mentionLabel, pageEdited, useChildPages, useRecentPages, useTrashedPages } from '@app/hooks/usePages';
import { useLibraryStore, type LibraryState } from '@app/store/libraryStore';
import { createPage } from '@app/store/pages';
import { requestTitleFocus } from '@app/store/pagesUi';
import { selectDrawerOpen, setDrawerOpen, useUiStore } from '@app/store/uiStore';
import { requestSync } from '@app/sync/syncManager';

import { AppText, Collage, Ground, Icon, Tappable } from '../components';
import { BoardHeader, SyncLine } from '../features/board/BoardHeader';
import { BottomBar, BOTTOM_BAR_HEIGHT } from '../features/board/BottomBar';
import { Drawer } from '../navigation/Drawer';
import type { ScreenProps } from '../navigation/types';
import { corners } from '../theme/shape';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';

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
const PageRow = memo(function PageRow({ id, now, recent, onOpen, snippet }: { id: string; now: number; recent: boolean; onOpen: (id: string) => void; snippet?: string }) {
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
    <Tappable onPress={() => onOpen(id)} style={styles.row} accessibilityRole="link" accessibilityLabel={title}>
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

export function PagesScreen({ navigation }: ScreenProps<'Pages'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;
  const results = usePageResults(query);
  const roots = useChildPages(null);
  const count = useLibraryStore(s => livePageIds(s).length);
  const recent = useRecentPages(RECENT);
  const binned = useTrashedPages().length;
  const drawerOpen = useUiStore(selectDrawerOpen);
  const now = useMinute();
  const [refreshing, setRefreshing] = useState(false);

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
    requestTitleFocus(id);
    openPage(id);
  };
  /** Back to the notes: the board takes this home's place, so Back still leaves the app. */
  const toBoard = (view?: 'notes' | 'reminders' | 'archive' | 'trash' | `label:${string}`): void => navigation.dispatch(StackActions.replace('Board', view ? { view } : undefined));

  return (
    <View style={styles.screen}>
      <Ground />
      <BoardHeader query={query} onQuery={setQuery} onMenu={() => setDrawerOpen(true)} placeholder={t('Rechercher dans les pages')} onServer={() => navigation.navigate('Admin')} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: BOTTOM_BAR_HEIGHT + insets.bottom + 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            colors={[theme.color.focus]}
            progressBackgroundColor={theme.color.paper}
            onRefresh={() => {
              setRefreshing(true);
              requestSync();
              setTimeout(() => setRefreshing(false), 900);
            }}
          />
        }
      >
        <SyncLine />
        {searching ? (
          <View style={styles.section}>
            <AppText variant="meta" style={styles.notice}>
              {results.length === 0 ? t('Aucune page ne correspond') : plural(results.length, 'page trouvée', 'pages trouvées')}
            </AppText>
            {results.map(hit => (
              <PageRow key={hit.pageId} id={hit.pageId} now={now} recent onOpen={openPage} snippet={hit.snippet || undefined} />
            ))}
          </View>
        ) : roots.length === 0 ? (
          <View style={styles.empty}>
            <Collage scene="notes" width={252} />
            <AppText variant="title" style={styles.emptyTitle}>
              {t('Aucune page pour l’instant')}
            </AppText>
            <AppText variant="body" color={theme.color.inkMuted} style={styles.emptyText}>
              {t('Une page tient des titres, des listes, des tableaux, du code, des images, et vos notes, collections et liens. Le bouton +, en bas, en crée une.')}
            </AppText>
          </View>
        ) : (
          <>
            {count < FEW_PAGES ? (
              <AppText variant="body" color={theme.color.inkMuted} style={styles.intro}>
                {t('Vos documents, rangés comme vous voulez : une page peut en contenir d’autres. Tapez « / » dans une page pour y ajouter un bloc, « @ » pour citer une note, une collection ou un lien.')}
              </AppText>
            ) : null}
            {count >= RECENT_FROM ? (
              <View style={styles.section}>
                <AppText variant="section" style={styles.head} accessibilityRole="header">
                  {t('Récentes')}
                </AppText>
                {recent.map(id => (
                  <PageRow key={id} id={id} now={now} recent onOpen={openPage} />
                ))}
              </View>
            ) : null}
            <View style={styles.section}>
              <AppText variant="section" style={styles.head} accessibilityRole="header">
                {t('Toutes les pages')}
              </AppText>
              {roots.map(id => (
                <PageRow key={id} id={id} now={now} recent={false} onOpen={openPage} />
              ))}
            </View>
          </>
        )}
        {binned > 0 && !searching ? (
          <Tappable onPress={() => toBoard('trash')} style={styles.binLink} accessibilityRole="link">
            <Icon name="trash" size={18} color={theme.color.inkMuted} />
            <AppText variant="meta">{t('{pages} dans la corbeille', { pages: plural(binned, 'page') })}</AppText>
          </Tappable>
        ) : null}
      </ScrollView>
      <BottomBar onPage={() => newPage(null)} />
      <Drawer
        open={drawerOpen}
        space="pages"
        current="pages"
        onClose={() => setDrawerOpen(false)}
        onView={view => toBoard(view)}
        onLine={id => navigation.navigate('Line', { id })}
        onLines={() => navigation.navigate('Lines')}
        onNewLine={() => toBoard()}
        onLabels={() => navigation.navigate('Labels')}
        onSettings={() => navigation.navigate('Settings')}
        onAdmin={() => navigation.navigate('Admin')}
        onPages={() => setQuery('')}
        onPage={openPage}
        onNewPage={newPage}
      />
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
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, marginHorizontal: 8, paddingHorizontal: 10, paddingVertical: 8, ...corners(SHAPES.tab) },
    rowText: { flex: 1, gap: 1 },
    mark: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    emoji: { fontSize: 24, lineHeight: 30 },
    empty: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 32, gap: 12 },
    emptyTitle: { textAlign: 'center', marginTop: 8 },
    emptyText: { textAlign: 'center', maxWidth: 360 },
    binLink: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', minHeight: 48, marginTop: 20, paddingHorizontal: 14, ...corners(SHAPES.chip) },
  });
