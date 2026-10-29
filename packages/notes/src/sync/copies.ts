/**
 * A readable copy of an article, kept as a page so it outlives its site: `POST /api/copies` a
 * CopyRequest -> CopyResponse, or 4xx/5xx { error } in French. The server reads the page itself
 * (no Claude), keeps its pictures as files, and answers its text as blocks to make; the app makes
 * the page with them, in one gesture.
 */
import { isLocale, type Locale } from '@unlease/core/i18n';
import type { BlockKind } from '../models/blocks';
import { cleanText, parseLinkAddress, type LinkAddress } from './brief';
import { isValidId } from '@unlease/core/sync/schema';
import { TEXT_LIMITS } from './types';

export interface CopyRequest {
  readonly link: LinkAddress;
  readonly lang: Locale;
}

/** A block to make, as `notes/services/pageText`'s drafts: markup for the rich kinds, the source for code. */
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
  const raw = body as { link?: unknown; lang?: unknown };
  const link = parseLinkAddress(raw.link);
  return link ? { link, lang: isLocale(raw.lang) ? raw.lang : 'fr' } : null;
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
    if (!kind || typeof raw.text !== 'string' || raw.text.length > TEXT_LIMITS.block.text) continue;
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
