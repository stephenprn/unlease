/**
 * An app's shell: the header on the wall (the app's brand, the search), the navigation docked
 * beside the page on wide screens, the app's page, its overlays (Carnet's note over the board, a
 * link over its collection, the capture dialog…), and the shell's own (the spotlight, the
 * shortcuts, the snackbar). On a phone-sized window the search header belongs to the app's home
 * (the board, as on the phone, or the pages' home); every other page gets the phone's top bar
 * instead. Connected to a server that does not run the app, the app says so (`AppOffScreen`) in
 * place of its own pages; the Réglages and the Administration stay in reach.
 */
import { useEffect, useLayoutEffect, useState } from 'react';

import { APPS } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';

import { useAppOff } from '../app/apps';
import { useSyncLifecycle } from '../app/sync/loop';
import { selectGrain, selectLocale, selectOnboarded, selectServerApps, selectThemePreference, useSettingsStore } from '../app/store/settings';
import { recordVisit } from '../app/store/spotlight';
import { moduleOfRoute, theApp, type AppModule } from '../modules';
import { adminPlace } from './features/admin/places';
import { useAppearanceEffect } from './appearanceStyle';
import { usePageEdges } from './components/scrollEdges';
import { Snackbar } from './components/Snackbar';
import { Tooltip } from './components/Tooltip';
import { LookShareDialog } from './features/appearance/LookShareDialog';
import { ServicesCssDialog } from './features/appearance/ServicesCssDialog';
import { ShortcutsDialog } from './features/ShortcutsDialog';
import { Spotlight } from './features/spotlight/Spotlight';
import { APP_HEADER_ID, Header } from './navigation/Header';
import { NavDrawer, NavList } from './navigation/NavDrawer';
import { PageHeadSlot, TopBar } from './navigation/PageHead';
import shell from './navigation/shell.module.css';
import { adminPath, navigate, parseRoute, paths, settingsPagePath, useLocation, type Arrival, type Route } from './router';
import { AdminScreen } from './screens/AdminScreen';
import { AppearanceScreen } from './screens/AppearanceScreen';
import { EraseScreen } from './screens/EraseScreen';
import { ImportScreen } from './screens/ImportScreen';
import { AppOffScreen } from './screens/AppOffScreen';
import { NotFound } from './screens/NotFound';
import { SettingsScreen } from './screens/SettingsScreen';
import { SetupScreen } from './screens/SetupScreen';
import { useGlobalKeys } from './shortcuts';
import { NARROW, useMedia } from './useMedia';

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

/** The page drawn under an overlay (an app's), or the route itself. */
function pageUnder(route: Route, background: string | undefined): Route {
  return moduleOfRoute(route)?.pageUnder?.(route, background) ?? route;
}

function pathOf(route: Route): string {
  switch (route.name) {
    case 'settings':
      return settingsPagePath(route.page);
    case 'admin':
      return adminPath(route.section);
    default:
      return moduleOfRoute(route)?.pathOf(route) ?? paths.home;
  }
}

/** The shell's own places; each app draws its own. */
function Page({ route, module }: { route: Route; module: AppModule | null }) {
  switch (route.name) {
    case 'settings':
      return route.page === 'appearance' ? <AppearanceScreen /> : route.page === 'import' ? <ImportScreen /> : route.page === 'erase' ? <EraseScreen /> : <SettingsScreen />;
    case 'admin':
      return <AdminScreen route={route} />;
    case 'home':
      return null;
    default: {
      const Screen = module?.Screen;
      return Screen ? <Screen route={route} /> : <NotFound />;
    }
  }
}

/** The tab's title: the page's name and the app's (« Lisbonne · Pages », « Claude · Administration · Carnet »). */
function useTabTitle(module: AppModule | null, page: Route, route: Route): string {
  const app = theApp();
  // The hooks run on every render: the same hooks each time.
  const own = app.useTitle(page, route);
  const on = useSettingsStore(selectServerApps);
  const name = APPS[app.id].name;
  if (page.name === 'admin') {
    const section = page.section ? adminPlace(page.section, on) : null;
    return section ? `${section.title} · ${t('Administration')} · ${name}` : `${t('Administration')} · ${name}`;
  }
  if (page.name === 'settings' && page.page === 'appearance') return `${t('Apparence')} · ${t('Réglages')} · ${name}`;
  if (page.name === 'settings' && page.page === 'import') return `${t('Importer')} · ${t('Réglages')} · ${name}`;
  if (page.name === 'settings' && page.page === 'erase') return `${t('Effacer des données')} · ${t('Réglages')} · ${name}`;
  const title = (module ? own : null) ?? (page.name === 'settings' ? t('Réglages') : null);
  return title ? `${title} · ${name}` : name;
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
  // How far the page runs on above and below the window: the header's fade and a form's pinned foot follow it.
  usePageEdges();
  const location = useLocation();
  const route = parseRoute(location.path);
  const page = pageUnder(route, location.state.background);
  const pagePath = pathOf(page);
  const own = moduleOfRoute(page);
  // The server does not run the app (turned off since): its places say so; the shell's stay.
  const off = useAppOff() && route.name !== 'settings' && route.name !== 'admin';
  const title = useTabTitle(own, page, route);
  // The phone's chrome: away from an app's home (the board, the pages' home), a top bar with the back pebble instead of the search header.
  const narrow = useMedia(NARROW);
  const home = own !== null && own.isHome(page);
  const topBar = narrow && !home;
  const overHead = own?.overHead?.(page) ?? false;
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // An app's home changes its views in place (the board's); any other page arrives.
  const pageKey = home && own ? own.id : pagePath;
  const entry = usePageEntry(pageKey, location.state.index);

  useEffect(() => {
    document.title = title;
  }, [title]);

  // `/` (the dev server's): the app's home.
  const goHome = onboarded && route.name === 'home';
  useEffect(() => {
    if (goHome) navigate(theApp().home, { replace: true });
  }, [goHome]);

  // A page's own state (a selection) belongs to the page it was made on.
  useEffect(() => {
    theApp().onPageChange?.();
  }, [pagePath]);

  // What was opened lately, for the spotlight's « Récents »: a page, a collection, a note or a link over its page.
  const opened = moduleOfRoute(route)?.opened?.(route) ?? null;
  useEffect(() => {
    if (opened) recordVisit(opened);
  }, [opened]);

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

  // Back from a section of the Administration, on a tab opened there: its home.
  // Back from a section of the Administration, on a tab opened there: its home.
  // Back from Réglages' « Apparence », on a tab opened there: the overview.
  const fallback = page.name === 'admin' && page.section ? adminPath() : page.name === 'settings' && page.page ? paths.settings : (own?.backTo?.(page) ?? theApp().home);
  const Bar = own && !off ? own.BottomBar : undefined;
  const Overlays = theApp().Overlays;
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
            {topBar ? <TopBar fallback={fallback} over={overHead} onSlot={setSlot} /> : null}
            <PageHeadSlot value={topBar && !overHead ? slot : null}>{off ? <AppOffScreen /> : goHome ? null : <Page route={page} module={own} />}</PageHeadSlot>
          </div>
        </main>
      </div>
      {Bar ? <Bar key={`bar-${pageKey}`} route={page} enter={entry} /> : null}
      <NavDrawer route={page} />
      {Overlays && !off ? <Overlays route={route} pagePath={pagePath} /> : null}
      <ShortcutsDialog />
      <ServicesCssDialog />
      <LookShareDialog />
      <Spotlight />
      <Snackbar />
      <Tooltip />
    </div>
  );
}
