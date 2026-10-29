/**
 * A small history router. The app has a dozen places and no nested layouts, so
 * a pattern table and `history.pushState` cover it, with nothing to keep up to
 * date between majors.
 *
 * Deep links work on a static host: Cloudflare Pages serves `index.html` for
 * any path it has no file for (there is no 404.html), and this reads the path.
 *
 * Two routes are overlays: a note (`/note/:id`) opens over the board it was
 * opened from, a link (`/link/:id`) over its collection. The page underneath is in
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
import { useEffectEvent, useLayoutEffect, useSyncExternalStore, type CSSProperties, type MouseEvent, type ReactNode } from 'react';

import type { BoardView } from '../app/hooks/useBoard';

export type CaptureKind = 'note' | 'checklist' | 'link' | 'share';

export type Route =
  | { readonly name: 'board'; readonly view: BoardView }
  | { readonly name: 'note'; readonly id: string }
  | { readonly name: 'line'; readonly id: string }
  | { readonly name: 'link'; readonly id: string }
  | { readonly name: 'lines' }
  | { readonly name: 'labels' }
  | { readonly name: 'settings' }
  | { readonly name: 'admin' }
  | { readonly name: 'pages' }
  | { readonly name: 'page'; readonly id: string }
  | { readonly name: 'capture'; readonly kind: CaptureKind }
  | { readonly name: 'notFound' };

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
  readonly state: HistoryState;
}

const decode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export function parseRoute(path: string): Route {
  const clean = path.replace(/\/+$/, '') || '/';
  if (clean === '/') return { name: 'board', view: 'notes' };
  if (clean === '/reminders') return { name: 'board', view: 'reminders' };
  if (clean === '/archive') return { name: 'board', view: 'archive' };
  if (clean === '/trash') return { name: 'board', view: 'trash' };
  if (clean === '/lines') return { name: 'lines' };
  if (clean === '/labels') return { name: 'labels' };
  if (clean === '/settings') return { name: 'settings' };
  if (clean === '/admin') return { name: 'admin' };
  if (clean === '/pages') return { name: 'pages' };
  const match = /^\/(label|note|line|link|page|capture)\/([^/]+)$/.exec(clean);
  if (match) {
    const id = decode(match[2]!);
    switch (match[1]) {
      case 'label':
        return { name: 'board', view: `label:${id}` };
      case 'note':
        return { name: 'note', id };
      case 'line':
        return { name: 'line', id };
      case 'link':
        return { name: 'link', id };
      case 'page':
        return { name: 'page', id };
      case 'capture':
        if (id === 'note' || id === 'checklist' || id === 'link' || id === 'share') return { name: 'capture', kind: id };
    }
  }
  return { name: 'notFound' };
}

export function pathForView(view: BoardView): string {
  if (view === 'notes') return '/';
  if (view === 'reminders') return '/reminders';
  if (view === 'archive') return '/archive';
  if (view === 'trash') return '/trash';
  return `/label/${encodeURIComponent(view.slice(6))}`;
}

export const paths = {
  note: (id: string): string => `/note/${encodeURIComponent(id)}`,
  line: (id: string): string => `/line/${encodeURIComponent(id)}`,
  link: (id: string): string => `/link/${encodeURIComponent(id)}`,
  page: (id: string): string => `/page/${encodeURIComponent(id)}`,
  pages: '/pages',
  lines: '/lines',
  labels: '/labels',
  settings: '/settings',
  admin: '/admin',
} as const;

// ── the base the app is served under ────────────────────────────────────────

/**
 * Nothing when the app is served at a host's root (by the server), `/unlease` for the demo on GitHub Pages
 * (Vite's `base`). Routes, `navigate` and `paths` never carry it: only the browser's address does.
 */
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');

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
  if (!snapshot || snapshot.path !== path || snapshot.search !== location.search || snapshot.state.index !== state.index || snapshot.state.background !== state.background) {
    snapshot = { path, search: location.search, state };
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

/** While `open`, Back closes it (`close`) before it leaves the page. */
export function useBackCloses(open: boolean, close: () => void): void {
  const onBack = useEffectEvent(close);
  useLayoutEffect(() => (open ? holdBackEntry(() => onBack()) : undefined), [open]);
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

export function navigate(to: string, options: NavigateOptions = {}): void {
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
  readonly ariaCurrent?: 'page' | 'true' | undefined;
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
