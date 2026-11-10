/**
 * A readable copy of an article, kept as a page in Pages so it outlives its site (Carnet's « Garder
 * une copie »): `POST /api/pages/copies` a CopyRequest -> CopyMade, or 4xx/5xx { error } in French.
 * The server reads the page itself (no Claude), keeps its pictures as files and makes the page: its
 * blocks (the link's card first, who wrote it and when, then the article: `CopyResponse`'s drafts)
 * under its own clock, and the link's `copy` set to the page in the same change. A client that shows
 * no pages (Carnet's) then opens it through the link's `copy`. Needs Pages on the server.
 */
import { isLocale, type Locale } from '@unlease/core/i18n';
import type { BlockKind } from '../models/blocks';
import { cleanText, parseLinkAddress, type LinkAddress } from '@unlease/notes/sync/brief';
import { isValidId } from '@unlease/core/sync/schema';
import { PAGES_TEXT_LIMITS } from './types';

export interface CopyRequest {
  readonly link: LinkAddress;
  readonly lang: Locale;
  /** The page's title: the link's own, as its row shows it (the article's carries its site's name). '' takes the article's. */
  readonly title?: string;
}

/** The page made: the link's `copy` points at it once the change syncs. */
export interface CopyMade {
  readonly pageId: string;
}

export function parseCopyMade(body: unknown): CopyMade | null {
  const raw = body as { pageId?: unknown } | null;
  return raw && isValidId(raw.pageId) ? { pageId: raw.pageId } : null;
}

/** A block to make, as `services/pageText`'s drafts: markup for the rich kinds, the source for code. */
export interface CopyDraft {
  readonly kind: BlockKind;
  readonly text: string;
  readonly language?: string;
  /** A picture's file: `fileId`, `fileName`, `mime`, `bytes`, `width`, `height`, `uploaded`. */
  readonly extra?: Readonly<Record<string, unknown>>;
  readonly children?: readonly CopyDraft[];
}

export interface CopyResponse {
  readonly title: string;
  /** The site as people write it. */
  readonly site: string;
  /** Who wrote it, as the page says, or ''. */
  readonly byline: string;
  /** The day it was published (`2026-10-21`), when the page says. */
  readonly published: string | null;
  readonly drafts: readonly CopyDraft[];
}

export const COPY_KINDS: readonly BlockKind[] = ['text', 'h1', 'h2', 'h3', 'h4', 'bullet', 'numbered', 'callout', 'code', 'image'];
/** Lists nest; nothing else does. */
const NESTING: ReadonlySet<BlockKind> = new Set(['bullet', 'numbered']);
export const COPY_LIMITS = { drafts: 2000, depth: 3, title: 300 } as const;
const IMAGE_MIME = /^image\/(?:jpeg|png|webp|gif|avif)$/;

export function parseCopyRequest(body: unknown): CopyRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as { link?: unknown; lang?: unknown; title?: unknown };
  const link = parseLinkAddress(raw.link);
  const title = typeof raw.title === 'string' ? cleanText(raw.title, COPY_LIMITS.title) : '';
  return link ? { link, lang: isLocale(raw.lang) ? raw.lang : 'fr', ...(title ? { title } : {}) } : null;
}

const int = (value: unknown, max: number): number | null => (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max ? (value as number) : null);

function imageFile(value: unknown): Readonly<Record<string, unknown>> | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const width = int(raw.width, 100_000);
  const height = int(raw.height, 100_000);
  const bytes = int(raw.bytes, 100 * 1024 * 1024);
  if (!isValidId(raw.fileId) || typeof raw.mime !== 'string' || !IMAGE_MIME.test(raw.mime) || width === null || height === null || bytes === null) return null;
  return { fileId: raw.fileId, fileName: cleanText(raw.fileName, 255), mime: raw.mime, bytes, width, height, uploaded: true };
}

/** The drafts that parse, at most `COPY_LIMITS.drafts` in all: an unknown kind or a picture without its file is left out. */
export function parseCopyDrafts(value: unknown, depth = 0, budget = { left: COPY_LIMITS.drafts }): CopyDraft[] {
  const out: CopyDraft[] = [];
  for (const entry of Array.isArray(value) ? value : []) {
    if (budget.left <= 0) break;
    if (typeof entry !== 'object' || entry === null) continue;
    const raw = entry as Record<string, unknown>;
    const kind = (COPY_KINDS as readonly unknown[]).includes(raw.kind) ? (raw.kind as BlockKind) : null;
    if (!kind || typeof raw.text !== 'string' || raw.text.length > PAGES_TEXT_LIMITS.block.text) continue;
    if (kind === 'image') {
      const file = imageFile(raw.extra);
      if (!file) continue;
      budget.left -= 1;
      out.push({ kind, text: '', extra: file });
      continue;
    }
    if (!raw.text.trim()) continue;
    budget.left -= 1;
    const children = NESTING.has(kind) && depth + 1 < COPY_LIMITS.depth ? parseCopyDrafts(raw.children, depth + 1, budget) : [];
    out.push({
      kind,
      text: raw.text,
      ...(kind === 'code' && typeof raw.language === 'string' && /^[a-z0-9+#-]{1,30}$/.test(raw.language) ? { language: raw.language } : {}),
      ...(children.length > 0 ? { children } : {}),
    });
  }
  return out;
}

export function parseCopyResponse(body: unknown): CopyResponse | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as { title?: unknown; site?: unknown; byline?: unknown; published?: unknown; drafts?: unknown };
  const drafts = parseCopyDrafts(raw.drafts);
  if (drafts.length === 0) return null;
  return {
    title: cleanText(raw.title, COPY_LIMITS.title),
    site: cleanText(raw.site, 100),
    byline: cleanText(raw.byline, 200),
    published: typeof raw.published === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.published) ? raw.published : null,
    drafts,
  };
}
