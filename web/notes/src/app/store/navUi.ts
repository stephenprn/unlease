/**
 * How this browser shows the navigation, kept in localStorage and never synced: the space on screen
 * (the notes or the pages) and the last place visited in each, and the sections folded shut. Every
 * access is guarded: blocked storage only means nothing is remembered.
 */
import { create } from 'zustand';

import { getStorageName } from '../env';

export type NavSection = 'collections' | 'labels';

/** The app's two halves: the notes (Keep's side) and the pages (the knowledge base). */
export type Space = 'notes' | 'pages';

/** Where each space opens before anything was visited in it. */
export const SPACE_HOMES: Readonly<Record<Space, string>> = { notes: '/', pages: '/pages' };

export interface NavUiState {
  readonly folded: ReadonlySet<NavSection>;
  /** The space the navigation shows; places that belong to both (the bin, the settings) keep it. */
  readonly space: Space;
  /** The last place shown in each space: switching back lands there. */
  readonly lastPath: Readonly<Record<Space, string>>;
}

const SECTIONS: readonly NavSection[] = ['collections', 'labels'];

export const useNavUiStore = create<NavUiState>(() => ({ folded: new Set(), space: 'notes', lastPath: SPACE_HOMES }));

const storageKey = (): string => `${getStorageName()}.nav`;

const isSpace = (value: unknown): value is Space => value === 'notes' || value === 'pages';
/** An in-app path, never another origin's. */
const isPath = (value: unknown): value is string => typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');

export function loadNavUi(): void {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey()) ?? '{}') as { folded?: unknown; space?: unknown; lastPath?: { notes?: unknown; pages?: unknown } };
    const folded = new Set(Array.isArray(parsed.folded) ? SECTIONS.filter(section => (parsed.folded as unknown[]).includes(section)) : []);
    const space = isSpace(parsed.space) ? parsed.space : 'notes';
    const lastPath = {
      notes: isPath(parsed.lastPath?.notes) ? parsed.lastPath.notes : SPACE_HOMES.notes,
      pages: isPath(parsed.lastPath?.pages) ? parsed.lastPath.pages : SPACE_HOMES.pages,
    };
    useNavUiStore.setState({ folded, space, lastPath });
  } catch {
    // Unreadable or blocked: every section starts open, the notes first.
  }
}

function save(): void {
  const { folded, space, lastPath } = useNavUiStore.getState();
  try {
    localStorage.setItem(storageKey(), JSON.stringify({ folded: [...folded], space, lastPath }));
  } catch {
    // Blocked storage: remembered for this visit only.
  }
}

export function setSectionFolded(section: NavSection, folded: boolean): void {
  const current = useNavUiStore.getState().folded;
  if (current.has(section) === folded) return;
  const next = new Set(current);
  if (folded) next.add(section);
  else next.delete(section);
  useNavUiStore.setState({ folded: next });
  save();
}

/** A place of `space` is on screen: the navigation shows that space, and switching back returns here. */
export function recordSpaceVisit(space: Space, path: string): void {
  const state = useNavUiStore.getState();
  if (state.space === space && state.lastPath[space] === path) return;
  useNavUiStore.setState({ space, lastPath: { ...state.lastPath, [space]: path } });
  save();
}
