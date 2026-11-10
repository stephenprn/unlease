/**
 * A small history router. An app has a few dozen places and no nested layouts,
 * so a pattern table (its `routes.ts`, under its path: `/notes/…`, `/pages/…`) and
 * `history.pushState` cover it, with nothing to keep up to date between majors. The
 * shell's places sit under the app's path too (`/notes/settings`, `/notes/admin`).
 * Each app is a web app of its own on the same server: an address outside this
 * app's path is another app's page, loaded whole (`navigate`).
 *
 * Deep links work on a static host: Cloudflare Pages serves each app's `index.html`
 * for any path of it (`root/_redirects`), and this reads the path.
 *
 * An app's routes may be overlays: Carnet's note (`/notes/note/:id`) opens over the
 * board it was opened from, a link (`/notes/link/:id`) over its collection. The page underneath is in
 * the history entry's state (`background`); a deep link has none, so a
 * sensible page is drawn under it instead. Closing an overlay goes back when
 * the previous entry is ours, so the browser's Back and the close button agree.
 *
 * Back closes what is open before it leaves the page, as Android's Back does in
 * the phone app: a sheet, a dialog, a popover or a menu, then the drawer, then a
 * selection, then a search. Each holds an entry of its own above the page's (the
 * same address; `base` in its state is the page's index), so Back pops it and the
 * router closes it, which plays its exit. Closed any other way (its ×, the scrim,
 * Escape, an action) it gives its entry back once the action has committed: what
 * the action opened or went to takes that entry over (the next layer holds it, the
 * next page replaces it), and otherwise the history steps back onto the page, which
 * does not move. An entry is never written just after such a step: Chrome skips,
 * on its Back button, entries a page writes after a move through its history
 * without a fresh user activation.
 */
import { useEffectEvent, useLayoutEffect, useState, useSyncExternalStore, type CSSProperties, type MouseEvent, type ReactNode } from 'react';

import type { GlyphName } from '@unlease/design/glyphs';

/**
 * Every place, by name, with what it carries. The shell's are here; each app adds its own from its
 * module (`declare module '@shared/ui/router' { interface Routes { … } }`), so the shell knows
 * none of them and a route still type-checks where it is used.
 */
export interface Routes {
  /** `/`: the app's home. */
  readonly home: object;
  readonly settings: object;
  /** The Administration, the server's settings for every app: its home (null) or one of its sections (`/notes/admin/backup`). */
  readonly admin: { readonly section: string | null };
  readonly notFound: object;
}

export type RouteName = keyof Routes;

export type Route = { [K in RouteName]: { readonly name: K } & Routes[K] }[RouteName];

/** Reads an app's part of the address (`/notes/…`): its route, or null when it is none of its own. */
export type RouteParser = (path: string) => Route | null;

const parsers: RouteParser[] = [];

/** An app's routes, from its module (`shared/modules`). */
export function registerRoutes(parse: RouteParser): void {
  if (!parsers.includes(parse)) parsers.push(parse);
}

/** The app's path (`/notes`): its places and the shell's are under it; anything else is another app's. */
let appHome = '';

/** Set as the app is installed (`installApp`). */
export function setAppHome(home: string): void {
  appHome = home.replace(/\/+$/, '');
}

/** Whether an app path (`/pages/…?x`) is one of this app's places (or the shell's), rather than another app's. */
export function ownsPath(to: string): boolean {
  const path = to.split(/[?#]/)[0] ?? '';
  return !appHome || path === '/' || path === appHome || path.startsWith(`${appHome}/`);
}

interface HistoryState {
  /** Position in this tab's history, so "back" knows when it would leave the app. */
  readonly index: number;
  /** The page an overlay was opened over. */
  readonly background?: string;
  /** On an entry held by something open over the page (a layer, a selection, a search): the index of the page's own entry. */
  readonly base?: number;
}

export interface Location {
  readonly path: string;
  readonly search: string;
  /** The place on the page (`#ground`): a page that lands on it hears it change. */
  readonly hash: string;
  readonly state: HistoryState;
}

/** A path's part, as written in it (`%20` read back). */
export const decodePart = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export function parseRoute(path: string): Route {
  const clean = path.replace(/\/+$/, '') || '/';
  if (clean === '/') return { name: 'home' };
  if (clean === `${appHome}/settings`) return { name: 'settings' };
  if (clean === `${appHome}/admin`) return { name: 'admin', section: null };
  if (clean.startsWith(`${appHome}/admin/`)) {
    const admin = /^\/([\w-]+)$/.exec(clean.slice(`${appHome}/admin`.length));
    if (admin) return { name: 'admin', section: admin[1]! };
  }
  for (const parse of parsers) {
    const route = parse(clean);
    if (route) return route;
  }
  return { name: 'notFound' };
}

/** The Administration's glyph, in the launcher and the navigation: an icon like the others. */
export const ADMIN_GLYPH: GlyphName = 'server';

/** The shell's own places, under the app's path; each app has its own `paths` (`@notes/ui/routes`, `@pages/ui/routes`). */
export const paths = {
  get home(): string {
    return appHome || '/';
  },
  get settings(): string {
    return `${appHome}/settings`;
  },
  get admin(): string {
    return `${appHome}/admin`;
  },
};

/** The Administration's home, or one of its sections (`server`, `reading`, an app's `seerr`). */
export function adminPath(section?: string | null): string {
  return section ? `${paths.admin}/${section}` : paths.admin;
}

// ── the base the app is served under ────────────────────────────────────────

/**
 * Nothing when the apps are served at a host's root (by the server), `/unlease` for the demo on GitHub Pages
 * (`vite.config.ts`). Routes, `navigate` and `paths` never carry it: only the browser's address does.
 */
const BASE = __SUITE_BASE__;

/** The app's path for the browser's: the base taken off. */
export function appPath(pathname: string): string {
  if (!BASE) return pathname;
  if (pathname === BASE) return '/';
  return pathname.startsWith(`${BASE}/`) ? pathname.slice(BASE.length) : pathname;
}

/** The browser's address for an app path (`/page/…`); anything else (`https://…`) as it is. */
export function browserPath(to: string): string {
  return BASE && to.startsWith('/') && !to.startsWith('//') ? `${BASE}${to}` : to;
}

// ── the location as an external store ───────────────────────────────────────

const listeners = new Set<() => void>();
let snapshot: Location | null = null;

function readState(): HistoryState {
  const raw = (typeof history !== 'undefined' ? history.state : null) as Partial<HistoryState> | null;
  return {
    index: typeof raw?.index === 'number' ? raw.index : 0,
    ...(typeof raw?.background === 'string' ? { background: raw.background } : {}),
    ...(typeof raw?.base === 'number' ? { base: raw.base } : {}),
  };
}

function current(): Location {
  const state = readState();
  const path = appPath(location.pathname);
  if (!snapshot || snapshot.path !== path || snapshot.search !== location.search || snapshot.hash !== location.hash || snapshot.state.index !== state.index || snapshot.state.background !== state.background) {
    snapshot = { path, search: location.search, hash: location.hash, state };
  }
  return snapshot;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener('popstate', emit);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('popstate', emit);
  };
}

export function useLocation(): Location {
  return useSyncExternalStore(subscribe, current, current);
}

export function getLocation(): Location {
  return current();
}

/** How a page came on screen: navigated to, or the history moved back to it. */
export type Arrival = 'forward' | 'back';

const scrollPositions = new Map<number, number>();
let currentIndex = 0;
/** The page on screen (an overlay's included): entries held over it share it, and moving between them scrolls nothing. */
let shownPage = '';

const pageOf = (state: HistoryState): string => `${location.pathname}${location.search}|${state.background ?? ''}`;

// ── Back closes what is open first ──────────────────────────────────────────

interface Held {
  /** Its entry's index, once written. */
  index: number | null;
  readonly close: () => void;
}

/** What is open and holds an entry, in the order it opened. */
const held: Held[] = [];
/** History writes waiting their turn: behind a step of ours on its way, or the commit of the action that asked for them. */
const writes: (() => void)[] = [];
/** A step of ours is on its way (its popstate has not come): the fallback that stops waiting for one that never lands. */
let stepping: ReturnType<typeof setTimeout> | null = null;
/** The action under way commits first (a layer it closed gives its entry back then): the turn after it. */
let committing: ReturnType<typeof setTimeout> | null = null;
let listening = false;

const STEP_TIMEOUT_MS = 1000;

function heldAt(index: number): boolean {
  return held.some(entry => entry.index === index);
}

/** On an entry something open held, and gave back: the next layer or page of the same action takes it over. */
function givenBack(state: HistoryState): boolean {
  return state.base !== undefined && !heldAt(state.index);
}

/** Moves `delta` entries through the history; writes wait until it lands. */
function step(delta: number): void {
  if (stepping) clearTimeout(stepping);
  stepping = setTimeout(() => {
    stepping = null;
    flush();
  }, STEP_TIMEOUT_MS);
  history.go(delta);
}

/**
 * Off an entry given back and not taken over (or left by a reload), down onto the nearest one still held, or the
 * page's own. Nothing moves on screen: it is the same page.
 */
function settle(): void {
  if (stepping || committing) return;
  const here = readState();
  if (!givenBack(here)) return;
  let target = here.base!;
  for (const entry of held) if (entry.index !== null && entry.index < here.index && entry.index > target) target = entry.index;
  step(target - here.index);
}

function flush(): void {
  while (!stepping && !committing && writes.length > 0) writes.shift()!();
}

function write(run: () => void): void {
  listen();
  if (stepping || committing || writes.length > 0) writes.push(run);
  else run();
}

/**
 * Waits for the commit of the action under way: a layer it closed gives its entry back then, the writes it asked
 * for (the next layer, the next page) take that entry over, and an entry nobody took is stepped off.
 */
function afterCommit(): void {
  if (committing) return;
  committing = setTimeout(() => {
    committing = null;
    flush();
    settle();
  }, 0);
}

/** What is open above `index` closes, the top first. */
function closeAbove(index: number): void {
  for (let at = held.length - 1; at >= 0; at -= 1) {
    const entry = held[at]!;
    if (entry.index !== null && entry.index > index) {
      held.splice(at, 1);
      entry.close();
    }
  }
}

function onPopState(): void {
  if (stepping) {
    clearTimeout(stepping);
    stepping = null;
  }
  const here = readState();
  // Each page keeps its scroll: Back or Forward to another restores where it was.
  const page = pageOf(here);
  if (page !== shownPage) {
    scrollPositions.set(currentIndex, window.scrollY);
    const saved = scrollPositions.get(here.index);
    if (saved !== undefined) requestAnimationFrame(() => window.scrollTo(0, saved));
  }
  shownPage = page;
  currentIndex = here.index;
  // Back went below what was open: it closes, playing its exit.
  closeAbove(here.index);
  settle();
  flush();
}

function listen(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('popstate', onPopState);
}

/**
 * Something just opened over the page holds an entry until it closes, so Back closes it first (`close`, which
 * plays its exit). The returned release is for when it closed another way: its entry is given back.
 */
export function holdBackEntry(close: () => void): () => void {
  const entry: Held = { index: null, close };
  held.push(entry);
  write(() => {
    // Closed before its turn came: nothing to hold.
    if (!held.includes(entry)) return;
    const here = readState();
    // The entry a layer closed by this same action gave back (a menu's item opening a sheet): this one holds it now.
    if (givenBack(here)) {
      entry.index = here.index;
      return;
    }
    const state: HistoryState = { ...here, index: here.index + 1, base: here.base ?? here.index };
    scrollPositions.delete(state.index);
    history.pushState(state, '');
    entry.index = state.index;
    currentIndex = state.index;
    emit();
  });
  return () => {
    const at = held.indexOf(entry);
    // Already closed by Back.
    if (at < 0) return;
    held.splice(at, 1);
    if (entry.index !== null) afterCommit();
  };
}

/**
 * While `open`, Back closes it (`close`) before it leaves the page. A close that keeps it open (changes
 * not saved: it asked first) holds a fresh entry, so the next Back asks again rather than leaving.
 */
export function useBackCloses(open: boolean, close: () => void): void {
  const onBack = useEffectEvent(close);
  const [turn, setTurn] = useState(0);
  useLayoutEffect(
    () =>
      open
        ? holdBackEntry(() => {
            onBack();
            setTurn(value => value + 1);
          })
        : undefined,
    [open, turn],
  );
}

// ── Leaving a page holding changes not saved ────────────────────────────────

/** Asks before the page is left, then calls `leave` if the person agrees. */
export type LeaveAsk = (leave: () => void) => void;

let leaveAsk: LeaveAsk | null = null;

/**
 * While set, going to another page of this app (a link, the navigation, Back through `goBack`) asks
 * first. An overlay opened over the page is not leaving it. Returns its removal.
 */
export function guardLeaving(ask: LeaveAsk): () => void {
  leaveAsk = ask;
  return () => {
    if (leaveAsk === ask) leaveAsk = null;
  };
}

/** Whether going somewhere waits for the person's word first. */
function asksFirst(proceed: () => void): boolean {
  const ask = leaveAsk;
  if (!ask) return false;
  ask(() => {
    if (leaveAsk === ask) leaveAsk = null;
    proceed();
  });
  return true;
}

function forgetHeld(): void {
  held.length = 0;
  writes.length = 0;
  if (stepping) clearTimeout(stepping);
  stepping = null;
  if (committing) clearTimeout(committing);
  committing = null;
}

/**
 * Test seam: nothing open, no write waiting, and the entry under the hand a page's own. A step still on its
 * way (an entry given back as the last test unmounted) is dropped by writing a fresh entry: jsdom drops its
 * queued traversals on `pushState`, so the step cannot land in the next test.
 */
export function resetBackEntries(): void {
  const moving = stepping !== null;
  forgetHeld();
  if (typeof history === 'undefined') return;
  const here = readState();
  const plain: HistoryState = { index: here.index, ...(here.background ? { background: here.background } : {}) };
  if (moving) history.pushState(plain, '');
  else if (here.base !== undefined) history.replaceState(plain, '');
}

/**
 * Give the first entry an index, so the app can tell its own history from the
 * browser's, and restore each page's scroll when Back or Forward returns to it.
 */
export function initHistory(): void {
  if (typeof history.state?.index !== 'number') history.replaceState({ ...(history.state as object | null), index: 0 }, '');
  history.scrollRestoration = 'manual';
  forgetHeld();
  currentIndex = readState().index;
  shownPage = pageOf(readState());
  listen();
  // Reloaded on an entry something open held: nothing is open now, so Back must simply go back.
  settle();
}

export interface NavigateOptions {
  readonly replace?: boolean;
  /** For overlays: the page to draw underneath. */
  readonly background?: string;
}

/** How another app's page is opened: the browser loads it whole (a test watches it here, jsdom loads nothing). */
export const otherApp = {
  open(href: string): void {
    location.assign(href);
  },
};

/**
 * Another app's place (`/pages/<id>` from Carnet): its own page, loaded whole. The dev server's demo
 * (`?demo`) goes along, so the other app opens on its made-up data too.
 */
function openOtherApp(to: string): void {
  const demo = import.meta.env.DEV ? new URLSearchParams(location.search).get('demo') : null;
  const href = demo !== null && !/[?&]demo\b/.test(to) ? `${to}${to.includes('?') ? '&' : '?'}demo=${encodeURIComponent(demo)}` : to;
  otherApp.open(browserPath(href));
}

export function navigate(to: string, options: NavigateOptions = {}): void {
  if (!options.background && asksFirst(() => navigate(to, options))) return;
  if (to.startsWith('/') && !ownsPath(to)) {
    openOtherApp(to);
    return;
  }
  // Asked for from inside something open (a menu's item, a dialog's button, a row of the drawer): after its commit.
  if (readState().base !== undefined) afterCommit();
  write(() => go(to, options));
}

function go(to: string, { replace = false, background }: NavigateOptions): void {
  const here = readState();
  // A page replaced takes along what is still open over it: down onto the page's own entry, then replace it.
  if (replace && here.base !== undefined) {
    closeAbove(here.base);
    writes.unshift(() => go(to, { replace, background }));
    step(here.base - here.index);
    return;
  }
  if (`${appPath(location.pathname)}${location.search}` === to && here.background === background) return;
  // The entry the drawer (or a dialog) gave back as it closed to go here: the page takes it over.
  const takeOver = givenBack(here);
  // Where Back from the page will land keeps its scroll: the entry under a taken-over one shows the same page.
  scrollPositions.set(takeOver ? here.index - 1 : here.index, window.scrollY);
  const state: HistoryState = { index: replace || takeOver ? here.index : here.index + 1, ...(background ? { background } : {}) };
  if (replace || takeOver) history.replaceState(state, '', browserPath(to));
  else history.pushState(state, '', browserPath(to));
  // A fresh page at this index forgets what an older one scrolled to.
  if (!replace) scrollPositions.delete(state.index);
  currentIndex = state.index;
  shownPage = pageOf(state);
  emit();
  // A new page starts at its top; an overlay leaves the page under it where it was.
  if (!background) window.scrollTo(0, 0);
}

/** Back when the previous entry is this app's; otherwise to `fallback`, without leaving. What is open over the page goes with it. */
export function goBack(fallback: string): void {
  if (asksFirst(() => goBack(fallback))) return;
  if (readState().base !== undefined) afterCommit();
  write(() => {
    const here = readState();
    const page = here.base ?? here.index;
    if (page > 0) step(page - 1 - here.index);
    else go(fallback, { replace: true });
  });
}

export function isPlainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export interface LinkProps {
  readonly to: string;
  readonly children: ReactNode;
  readonly className?: string;
  /** A hand cut picked from core (a collection tab's corners). */
  readonly style?: CSSProperties;
  readonly background?: string;
  readonly replace?: boolean;
  readonly onNavigate?: () => void;
  readonly ariaLabel?: string;
  /** 'page' for the place on screen, 'true' for the current one of a set (the space switch). */
  readonly ariaCurrent?: 'page' | 'location' | 'true' | undefined;
  readonly tip?: string;
}

/** An in-app link: a real anchor (middle click opens a tab), navigating in place otherwise. */
export function Link({ to, children, className, style, background, replace, onNavigate, ariaLabel, ariaCurrent, tip }: LinkProps) {
  return (
    <a
      href={browserPath(to)}
      className={className}
      style={style}
      aria-label={ariaLabel}
      aria-current={ariaCurrent}
      data-tip={tip}
      onClick={event => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        onNavigate?.();
        navigate(to, { replace, background });
      }}
    >
      {children}
    </a>
  );
}
