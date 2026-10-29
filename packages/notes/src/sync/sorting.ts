/**
 * Claude sorting saved links: `POST /api/sort` a SortRequest -> SortResponse, or 4xx/5xx { error } in French.
 * The apps send what they show and write the moves themselves, as one undoable batch.
 * `file`: each link moves to the target it clearly belongs in, or stays where it is.
 * `review`: the links all sit in `from` (one of the targets); only those that clearly no longer
 * belong there move, to another target or to "Non classé".
 */
import { INBOX_ID, LINK_KINDS, type LinkKind } from '../models/entities';
import { isValidId } from '@unlease/core/sync/schema';

export type SortTask = 'file' | 'review';

export interface SortTarget {
  readonly id: string;
  readonly title: string;
  /** "Ce qui va dans cette collection". */
  readonly hint: string;
  /** Titles of its newest links. */
  readonly examples: readonly string[];
}

export interface SortLink {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly site: string;
  readonly kind: LinkKind;
  readonly summary: string;
  /** "Label : valeur". */
  readonly facts: readonly string[];
}

export interface SortRequest {
  readonly task: SortTask;
  readonly from: string | null;
  readonly targets: readonly SortTarget[];
  readonly links: readonly SortLink[];
}

export interface SortMove {
  readonly link: string;
  /** A target's id, or "Non classé" (`INBOX_ID`, in a review only). */
  readonly to: string;
}

export interface SortResponse {
  readonly moves: readonly SortMove[];
  /** Why part of the links went unread (a batch Claude failed on), when the moves are only those of the rest. */
  readonly incomplete: string | null;
}

export const SORT_LIMITS = { links: 400, targets: 100, examples: 5 } as const;

/** How much of each text travels: enough to tell what a link is, no more. */
const TEXT = { name: 100, hint: 500, example: 200, url: 500, title: 300, site: 100, summary: 400, fact: 120, facts: 8 } as const;

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '');
const texts = (value: unknown, count: number, max: number): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string').slice(0, count).map(entry => entry.slice(0, max)) : [];

function parseTarget(value: unknown): SortTarget | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (!isValidId(raw.id) || typeof raw.title !== 'string') return null;
  return { id: raw.id, title: text(raw.title, TEXT.name), hint: text(raw.hint, TEXT.hint), examples: texts(raw.examples, SORT_LIMITS.examples, TEXT.example) };
}

function parseLink(value: unknown): SortLink | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (!isValidId(raw.id)) return null;
  return {
    id: raw.id,
    url: text(raw.url, TEXT.url),
    title: text(raw.title, TEXT.title),
    site: text(raw.site, TEXT.site),
    kind: (LINK_KINDS as readonly unknown[]).includes(raw.kind) ? (raw.kind as LinkKind) : 'other',
    summary: text(raw.summary, TEXT.summary),
    facts: texts(raw.facts, TEXT.facts, TEXT.fact),
  };
}

export function parseSortRequest(body: unknown): SortRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as { task?: unknown; from?: unknown; targets?: unknown; links?: unknown };
  if (raw.task !== 'file' && raw.task !== 'review') return null;
  if (!Array.isArray(raw.targets) || raw.targets.length > SORT_LIMITS.targets) return null;
  if (!Array.isArray(raw.links) || raw.links.length === 0 || raw.links.length > SORT_LIMITS.links) return null;
  const targets: SortTarget[] = [];
  for (const entry of raw.targets) {
    const target = parseTarget(entry);
    if (!target) return null;
    // "Non classé" is never a target: a link that fits nothing just stays.
    if (target.id !== INBOX_ID && !targets.some(other => other.id === target.id)) targets.push(target);
  }
  const links: SortLink[] = [];
  const seen = new Set<string>();
  for (const entry of raw.links) {
    const link = parseLink(entry);
    if (!link) return null;
    if (!seen.has(link.id)) links.push(link);
    seen.add(link.id);
  }
  const from = raw.task === 'review' && typeof raw.from === 'string' && targets.some(target => target.id === raw.from) ? raw.from : null;
  if (targets.length === 0 || (raw.task === 'review' && from === null)) return null;
  return { task: raw.task, from, targets, links };
}

export function parseSortResponse(body: unknown): SortResponse | null {
  const raw = body as { moves?: unknown; incomplete?: unknown } | null;
  if (!Array.isArray(raw?.moves)) return null;
  return {
    moves: raw.moves.flatMap(entry => {
      const move = entry as Partial<SortMove> | null;
      return move && isValidId(move.link) && isValidId(move.to) ? [{ link: move.link, to: move.to }] : [];
    }),
    incomplete: typeof raw.incomplete === 'string' ? raw.incomplete.slice(0, 300) : null,
  };
}
