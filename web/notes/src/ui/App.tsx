/**
 * The app shell: the header on the wall, the navigation docked beside the
 * page on wide screens, the page, and the overlays (a note over the board, a
 * link over its collection, the capture dialog, the transfer panel, the
 * snackbar). On a phone-sized window the search header belongs to the homes
 * of the two spaces (the board, as on the phone, and the pages' home); every
 * other page gets the phone's top bar instead.
 */
import { useEffect, useLayoutEffect, useState } from 'react';

import { APP_NAME } from '@unlease/notes/brand';
import { t } from '@unlease/core/i18n';
import { UNTITLED_PAGE } from '@unlease/notes/models/blocks';
import { shownTitle } from '@unlease/notes/models/entities';
import { spotKey } from '@unlease/notes/services/spotlight';

import { useSyncLifecycle } from '../app/sync/loop';
import { useLibraryStore, type LibraryState } from '../app/store/library';
import { selectGrain, selectLocale, selectOnboarded, selectThemePreference, useSettingsStore } from '../app/store/settings';
import { clearSelection, selectQuery, useBoardStore } from '../app/store/board';
import { recordSpaceVisit } from '../app/store/navUi';
import { recordVisit } from '../app/store/spotlight';
import { selectNewLineOpen, setNewLineOpen, useUiStore } from '../app/store/ui';
import { useAppearanceEffect } from './appearanceStyle';
import { useLeaving } from './components/presence';
import { Snackbar } from './components/Snackbar';
import { Tooltip } from './components/Tooltip';
import { CaptureDialog } from './features/capture/CaptureDialog';
import { ServicesCssDialog } from './features/appearance/ServicesCssDialog';
import { TransferPanel } from './features/capture/TransferPanel';
import { GlobalDeleteLines } from './features/lines/GlobalDeleteLines';
import { NewLineDialog } from './features/lines/LineDialogs';
import { KitchenTimers } from './features/links/KitchenTimers';
import { LinkPanel } from './features/links/LinkPanel';
import { NoteEditor } from './features/note/NoteEditor';
import { ShortcutsDialog } from './features/ShortcutsDialog';
import { Spotlight } from './features/spotlight/Spotlight';
import { BottomBar } from './navigation/BottomBar';
import { APP_HEADER_ID, Header } from './navigation/Header';
import { NavDrawer, NavList } from './navigation/NavDrawer';
import { PageHeadSlot, TopBar } from './navigation/PageHead';
import shell from './navigation/shell.module.css';
import { spaceOf } from './navigation/space';
import { goBack, navigate, parseRoute, paths, pathForView, useLocation, type Arrival, type Route } from './router';
import { BoardScreen } from './screens/BoardScreen';
import { LabelsScreen } from './screens/LabelsScreen';
import { LinesScreen } from './screens/LinesScreen';
import { LineScreen } from './screens/LineScreen';
import { NotFound } from './screens/NotFound';
import { PageScreen } from './screens/PageScreen';
import { PagesScreen } from './screens/PagesScreen';
import { AdminScreen } from './screens/AdminScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SetupScreen } from './screens/SetupScreen';
import { useGlobalKeys } from './shortcuts';
import { NARROW, useMedia } from './useMedia';

/** Longer than any layer's exit, so the layer finishes leaving before the editor or the link panel unmounts. */
const OVERLAY_EXIT_MS = 300;

/** Pins the theme on `<html>` (or follows the system); the browser chrome takes the ground's top (`useAppearanceEffect`). */
function useThemeEffect(): void {
  const theme = useSettingsStore(selectThemePreference);
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);
}

/** The paper's grain on or off on every sheet, before the first paint (`html[data-grain='off']`, base.css). */
function useGrainEffect(): void {
  const grain = useSettingsStore(selectGrain);
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (grain) delete root.dataset.grain;
    else root.dataset.grain = 'off';
  }, [grain]);
}

/** The height of the bar the page sits under (the header, or the phone's top bar), for what must clear it. */
function useHeaderHeight(): void {
  useLayoutEffect(() => {
    const header = document.getElementById(APP_HEADER_ID);
    const root = document.documentElement;
    if (!header) {
      // A collection's page on a phone: its back pebble lies over the head and takes no room.
      root.style.setProperty('--header-height', '0px');
      return;
    }
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => root.style.setProperty('--header-height', `${header.offsetHeight}px`));
    observer.observe(header);
    return () => observer.disconnect();
  });
}

/** How the page on screen arrived: null for the first one, 'back' when the history moved back to it. */
function usePageEntry(key: string, index: number): Arrival | null {
  const [shown, setShown] = useState<{ key: string; index: number; entry: Arrival | null }>({ key, index, entry: null });
  if (shown.key === key) return shown.entry;
  const entry: Arrival = index < shown.index ? 'back' : 'forward';
  setShown({ key, index, entry });
  return entry;
}

function titleFor(state: LibraryState, route: Route, overlay: Route): string {
  const name = (() => {
    if (overlay.name === 'note') return state.notes[overlay.id]?.title.trim() || t('Note');
    if (overlay.name === 'link') return state.links[overlay.id]?.title || t('Lien');
    switch (route.name) {
      case 'board':
        if (route.view === 'reminders') return t('Rappels');
        if (route.view === 'archive') return t('Archives');
        if (route.view === 'trash') return t('Corbeille');
        if (route.view.startsWith('label:')) return state.labels[route.view.slice(6)]?.name ?? t('Label');
        return null;
      case 'line': {
        const line = state.notes[route.id];
        return line ? shownTitle(line) : t('Collection');
      }
      case 'lines':
        return t('Collections');
      case 'labels':
        return t('Labels');
      case 'settings':
        return t('Réglages');
      case 'admin':
        return t('Administration');
      case 'pages':
        return t('Pages');
      case 'page':
        return state.blocks[route.id]?.text.trim() || t(UNTITLED_PAGE);
      default:
        return null;
    }
  })();
  return name ? `${name} · ${APP_NAME}` : APP_NAME;
}

/** The page drawn under an overlay: where it was opened from, or a sensible default for a deep link. */
function pageUnder(route: Route, background: string | undefined): Route {
  if (route.name === 'note') return background ? parseRoute(new URL(background, location.origin).pathname) : { name: 'board', view: 'notes' };
  if (route.name === 'link') {
    if (background) return parseRoute(new URL(background, location.origin).pathname);
    const link = useLibraryStore.getState().links[route.id];
    return link ? { name: 'line', id: link.noteId } : { name: 'lines' };
  }
  return route;
}

function pathOf(route: Route): string {
  switch (route.name) {
    case 'board':
      return pathForView(route.view);
    case 'line':
      return paths.line(route.id);
    case 'lines':
      return paths.lines;
    case 'labels':
      return paths.labels;
    case 'settings':
      return paths.settings;
    case 'admin':
      return paths.admin;
    case 'pages':
      return paths.pages;
    case 'page':
      return paths.page(route.id);
    default:
      return '/';
  }
}

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case 'board':
      return <BoardScreen view={route.view} />;
    case 'line':
      return <LineScreen key={route.id} id={route.id} />;
    case 'lines':
      return <LinesScreen />;
    case 'labels':
      return <LabelsScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'admin':
      return <AdminScreen />;
    case 'pages':
      return <PagesScreen />;
    case 'page':
      return <PageScreen key={route.id} id={route.id} />;
    default:
      return <NotFound />;
  }
}

function GlobalNewLine() {
  const open = useUiStore(selectNewLineOpen);
  return <NewLineDialog open={open} onDismiss={() => setNewLineOpen(false)} onCreated={id => navigate(paths.line(id))} />;
}

/** The app in the interface's language: a new one draws everything again, on the same page. */
export function LocaleRoot() {
  const locale = useSettingsStore(selectLocale);
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return <App key={locale} />;
}

export function App() {
  useSyncLifecycle();
  useThemeEffect();
  useGrainEffect();
  useAppearanceEffect();
  const onboarded = useSettingsStore(selectOnboarded);
  // Not during the first-run setup: a letter typed there must not make a note or a page.
  useGlobalKeys(onboarded);
  useHeaderHeight();
  const location = useLocation();
  const route = parseRoute(location.path);
  const page = pageUnder(route, location.state.background);
  const pagePath = pathOf(page);
  // Subscribing keeps the tab title in step with renames.
  const title = useLibraryStore(state => titleFor(state, page, route));
  // A note or a link closed by the route stays drawn while its layer animates out.
  const note = useLeaving(route.name === 'note' ? route.id : null, OVERLAY_EXIT_MS);
  const link = useLeaving(route.name === 'link' ? route.id : null, OVERLAY_EXIT_MS);
  // The phone's chrome: away from a space's home (the board, the pages' home), a top bar with the back pebble instead of the search header.
  const narrow = useMedia(NARROW);
  const topBar = narrow && page.name !== 'board' && page.name !== 'pages';
  const overHead = page.name === 'line';
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // The board's views change in place; any other page arrives.
  const pageKey = page.name === 'board' ? 'board' : pagePath;
  const entry = usePageEntry(pageKey, location.state.index);

  useEffect(() => {
    document.title = title;
  }, [title]);

  // A selection belongs to the page it was made on.
  useEffect(() => {
    clearSelection();
  }, [pagePath]);

  // What was opened lately, for the spotlight's « Récents »: a page, a collection, a note or a link over its page.
  const opened = route.name === 'page' ? spotKey('page', route.id) : route.name === 'line' ? spotKey('collection', route.id) : route.name === 'note' ? spotKey('note', route.id) : route.name === 'link' ? spotKey('link', route.id) : null;
  useEffect(() => {
    if (opened) recordVisit(opened);
  }, [opened]);

  // The space on screen, and where in it: the navigation follows, and switching back lands here.
  const searching = useBoardStore(s => selectQuery(s).length > 0);
  const space = spaceOf(page, searching);
  useEffect(() => {
    if (space) recordSpaceVisit(space, pagePath);
  }, [space, pagePath]);

  if (!onboarded) {
    return (
      <>
        <SetupScreen />
        <ServicesCssDialog />
        <Snackbar />
        <Tooltip />
      </>
    );
  }

  return (
    <div className={shell.shell}>
      <a className={shell.skip} href="#main">
        {t('Aller au contenu')}
      </a>
      {topBar ? null : <Header route={page} enter={entry} />}
      <div className={shell.body}>
        <aside className={shell.dock} aria-label={t('Navigation')}>
          <NavList route={page} />
        </aside>
        <main id="main" className={shell.main} tabIndex={-1}>
          {/* A page arrives whole, its top bar and title with it, as the phone's screen does. */}
          <div key={pageKey} className={shell.page} data-enter={entry ?? undefined}>
            {topBar ? <TopBar fallback={page.name === 'line' ? paths.lines : page.name === 'page' ? paths.pages : '/'} over={overHead} onSlot={setSlot} /> : null}
            <PageHeadSlot value={topBar && !overHead ? slot : null}>
              <Page route={page} />
            </PageHeadSlot>
          </div>
        </main>
      </div>
      <BottomBar key={pageKey} route={page} enter={entry} />
      <NavDrawer route={page} />
      {note.value !== null ? <NoteEditor key={note.value} id={note.value} closing={note.leaving} onClose={() => goBack(pagePath)} /> : null}
      {link.value !== null ? <LinkPanel key={link.value} id={link.value} closing={link.leaving} onClose={() => goBack(pagePath)} /> : null}
      <CaptureDialog />
      <GlobalNewLine />
      <GlobalDeleteLines />
      <ShortcutsDialog />
      <ServicesCssDialog />
      <Spotlight />
      <TransferPanel />
      <KitchenTimers />
      <Snackbar />
      <Tooltip />
    </div>
  );
}
