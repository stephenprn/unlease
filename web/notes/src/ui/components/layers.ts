/**
 * The stack of modal layers (dialogs, sheets, menus).
 *
 * The page underneath and every layer below the top one are made `inert`, so
 * focus, clicks and screen readers stay in the top layer; Escape dismisses the
 * top layer only; scrolling the page is locked while any layer is drawn (its
 * exit included, `holdScroll`); and focus returns to whatever opened the layer
 * when it closes.
 *
 * Snackbars, the transfer panel and tooltips live in a separate root (`#live`)
 * that is never made inert: an "Annuler" must stay reachable over a dialog.
 */
import { resetBackEntries } from '../router';

export interface LayerEntry {
  readonly element: HTMLElement;
  readonly dismiss: () => void;
  readonly restore: HTMLElement | null;
  /** Its scrim dims the page (not a menu's or a popover's clear one). */
  readonly dims?: boolean;
}

const stack: LayerEntry[] = [];
let listening = false;

function appRoot(): HTMLElement | null {
  return document.getElementById('root');
}

/** Layers on screen, closing ones included: the page stays locked until the last has finished leaving. */
let holds = 0;

function apply(): void {
  const top = stack[stack.length - 1];
  const root = appRoot();
  if (root) root.inert = stack.length > 0;
  for (const entry of stack) entry.element.inert = entry !== top;
}

/**
 * Holds the page still while a layer is drawn, its exit included: given back the moment the layer
 * starts leaving, the scrollbar would come back and a centred panel would slip sideways mid-exit.
 */
export function holdScroll(): () => void {
  holds += 1;
  lockScroll(true);
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    holds = Math.max(0, holds - 1);
    if (holds === 0) lockScroll(false);
  };
}

/**
 * The page stops scrolling under a layer. Its scrollbar's reserved room (`scrollbar-gutter: stable`)
 * lies outside what a fixed scrim can cover, so while locked the room is given back as padding of
 * the same width: nothing on the page moves, and the scrim dims the window edge to edge.
 */
function lockScroll(locked: boolean): void {
  const html = document.documentElement;
  if (locked === (html.dataset.locked !== undefined)) return;
  if (locked) {
    // The root's own box stops at the reserved room (its `clientWidth` reports the whole window).
    html.style.setProperty('--locked-gutter', `${Math.max(0, window.innerWidth - html.getBoundingClientRect().width)}px`);
    html.dataset.locked = '';
  } else {
    delete html.dataset.locked;
    html.style.removeProperty('--locked-gutter');
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.isComposing) return;
  const top = stack[stack.length - 1];
  if (!top) return;
  event.preventDefault();
  event.stopPropagation();
  top.dismiss();
}

export function pushLayer(entry: LayerEntry): () => void {
  if (!listening) {
    document.addEventListener('keydown', onKeyDown, true);
    listening = true;
  }
  stack.push(entry);
  apply();
  return () => {
    const index = stack.indexOf(entry);
    if (index >= 0) stack.splice(index, 1);
    apply();
    const restore = entry.restore;
    if (restore && document.contains(restore) && !restore.closest('[inert]')) restore.focus({ preventScroll: true });
  };
}

export function hasOpenLayer(): boolean {
  return stack.length > 0;
}

/** A layer below already dims the page: one opened over it lays no second scrim (it still takes the presses). */
export function dimmedBelow(): boolean {
  return stack.some(entry => entry.dims === true);
}

/** The overlay root for modal layers, created on demand (tests mount without index.html). */
export function overlayRoot(id: 'overlays' | 'live'): HTMLElement {
  let element = document.getElementById(id);
  if (!element) {
    element = document.createElement('div');
    element.id = id;
    document.body.appendChild(element);
  }
  return element;
}

/** What Tab would reach: a radio group's other options (tabindex -1) are not, so a picker opens on its chosen one. */
const FOCUSABLE = ['a[href]', 'button:not([disabled])', 'input:not([disabled])', 'textarea:not([disabled])', 'select:not([disabled])', '[tabindex]']
  .map(selector => `${selector}:not([tabindex="-1"])`)
  .join(', ');

export function firstFocusable(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-autofocus]') ?? container.querySelector<HTMLElement>(FOCUSABLE);
}

/** Test seam: no layer, and none holding an entry of the history. */
export function resetLayers(): void {
  stack.length = 0;
  holds = 0;
  apply();
  lockScroll(false);
  resetBackEntries();
}
