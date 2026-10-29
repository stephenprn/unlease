/**
 * What the spotlight remembers in this browser, kept in localStorage and never synced: what was
 * opened lately (pages, notes, collections, links, by `spotKey`), and what was picked for which
 * query, so typing a query again, or the start of it, puts the same choice first (as a launcher
 * learns). Every access is guarded: blocked storage only means nothing is remembered.
 */
import { create } from 'zustand';

import { foldWords } from '@unlease/core/services/searchIndex';

import { getStorageName } from '../env';

interface Pick {
  /** Folded, its spaces single. */
  readonly query: string;
  readonly key: string;
  readonly count: number;
  readonly at: number;
}

export interface SpotlightMemory {
  /** Keys, the latest first. */
  readonly recent: readonly string[];
  readonly picks: readonly Pick[];
}

const MAX_RECENT = 30;
const MAX_PICKS = 80;
const DAY = 86_400_000;

export const useSpotlightMemory = create<SpotlightMemory>(() => ({ recent: [], picks: [] }));

const storageKey = (): string => `${getStorageName()}.spotlight`;

const asQuery = (text: string): string => foldWords(text).trim().replace(/\s+/g, ' ');

function isPick(value: unknown): value is Pick {
  const pick = value as Partial<Pick> | null;
  return !!pick && typeof pick.query === 'string' && typeof pick.key === 'string' && typeof pick.count === 'number' && typeof pick.at === 'number';
}

export function loadSpotlightMemory(): void {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey()) ?? '{}') as { recent?: unknown; picks?: unknown };
    const recent = Array.isArray(parsed.recent) ? parsed.recent.filter((key): key is string => typeof key === 'string').slice(0, MAX_RECENT) : [];
    const picks = Array.isArray(parsed.picks) ? parsed.picks.filter(isPick).slice(0, MAX_PICKS) : [];
    useSpotlightMemory.setState({ recent, picks });
  } catch {
    useSpotlightMemory.setState({ recent: [], picks: [] });
  }
}

function save(): void {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(useSpotlightMemory.getState()));
  } catch {
    // Blocked storage: remembered for this visit only.
  }
}

/** Something just opened goes to the front of the recent ones. */
export function recordVisit(key: string): void {
  const { recent } = useSpotlightMemory.getState();
  if (recent[0] === key) return;
  useSpotlightMemory.setState({ recent: [key, ...recent.filter(entry => entry !== key)].slice(0, MAX_RECENT) });
  save();
}

/** A result taken for a query: the next time, it comes first for that query and for its start. */
export function recordPick(text: string, key: string, now: number = Date.now()): void {
  const query = asQuery(text);
  if (!query) return;
  const { picks } = useSpotlightMemory.getState();
  const had = picks.find(pick => pick.query === query && pick.key === key);
  const next: Pick = { query, key, count: (had?.count ?? 0) + 1, at: now };
  useSpotlightMemory.setState({ picks: [next, ...picks.filter(pick => pick !== had)].slice(0, MAX_PICKS) });
  save();
}

/**
 * How much the person's habits lift each document for a query, 0 to 1: taken for this query or one
 * it starts or continues (more for the same query, often and lately), else opened lately.
 */
export function habitBoost(text: string, memory: SpotlightMemory, now: number = Date.now()): (key: string) => number {
  const query = asQuery(text);
  const lifts = new Map<string, number>();
  memory.recent.forEach((key, at) => lifts.set(key, 0.3 * (1 - at / MAX_RECENT)));
  if (query) {
    for (const pick of memory.picks) {
      const related = pick.query === query ? 1 : query.startsWith(pick.query) || pick.query.startsWith(query) ? 0.7 : 0;
      if (related === 0) continue;
      const lift = related * Math.min(1, 0.6 + 0.2 * pick.count) * Math.exp(-Math.max(0, now - pick.at) / (30 * DAY));
      lifts.set(pick.key, Math.max(lifts.get(pick.key) ?? 0, lift));
    }
  }
  return key => lifts.get(key) ?? 0;
}
