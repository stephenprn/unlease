/**
 * How this browser shows the app's navigation, kept in localStorage and never synced: the sections
 * folded shut. Every access is guarded: blocked storage only means nothing is remembered.
 */
import { create } from 'zustand';

import { getStorageName } from '../env';

/** A section of an app's navigation that folds shut (Carnet's `collections`, `labels`). */
export type NavSection = string;

export interface NavUiState {
  readonly folded: ReadonlySet<NavSection>;
}

export const useNavUiStore = create<NavUiState>(() => ({ folded: new Set() }));

const storageKey = (): string => `${getStorageName()}.nav`;

export function loadNavUi(): void {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey()) ?? '{}') as { folded?: unknown };
    const folded = new Set(Array.isArray(parsed.folded) ? parsed.folded.filter((section): section is string => typeof section === 'string') : []);
    useNavUiStore.setState({ folded }, true);
  } catch {
    // Unreadable or blocked: every section starts open.
    useNavUiStore.setState({ folded: new Set() }, true);
  }
}

function save(): void {
  const { folded } = useNavUiStore.getState();
  try {
    localStorage.setItem(storageKey(), JSON.stringify({ folded: [...folded] }));
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
