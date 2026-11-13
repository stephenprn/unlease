/**
 * "Garder une copie" (`POST /api/pages/copies`, a module of Carnet's links): the server reads the
 * article itself (no Claude), keeps its pictures as files (`PageCopier`), then writes the page
 * (`CopyMaker`): a top-level page placed after the others, the link's card first, who wrote it and
 * when (the day as a date, each device writing it in its own language), then the article, nested
 * lists as children; and the link's `copy` set to it. All in one change under the server's clocks,
 * so every device hears of it through the sync, Carnet's that hold no pages included. A copy being
 * made for a link is joined; a link whose copy is still there (not deleted, not in the bin) gets
 * that page back.
 */
import type { StatementSync } from 'node:sqlite';
import { createId } from '@unlease/core/services/ids';
import { comparePositions, placeAt, positionsBetween } from '@unlease/core/services/fractionalIndex';
import { dateRun, serializeRich, type Run } from '@unlease/core/services/richText';
import { displayHost } from '@unlease/core/services/url';
import type { Fields } from '@unlease/core/sync/record';
import { parseCopyDrafts, type CopyDraft, type CopyMade, type CopyRequest, type CopyResponse } from '@unlease/pages/sync/copies';
import { blockFields, type NewBlockFields } from '@unlease/pages/sync/entities';
import type { BlobStore } from '../../blobs/store';
import { log } from '../../log';
import type { RecordStore } from '../../sync/records';
import type { ServerEdit, SyncService } from '../../sync/service';
import { extractArticle, type ArticleDraft } from '../../reading/article';
import type { Fetcher } from '../../reading/fetcher';
import { keepImage, type KeptImage } from '../../reading/keep-images';
import { readLink } from '../../reading/reader';
import type { ModuleOutcome } from '../../claude/outcome';

const READ_DEADLINE_MS = 30_000;
/** Pictures downloaded at once. */
const AT_ONCE = 3;

export interface PageCopierOptions {
  readonly fetcher: Fetcher;
  readonly blobs: BlobStore;
}

export class PageCopier {
  constructor(private readonly options: PageCopierOptions) {}

  async copy(request: CopyRequest): Promise<ModuleOutcome<CopyResponse>> {
    const signal = AbortSignal.timeout(READ_DEADLINE_MS * 2);
    const read = await readLink(request.link.url, this.options.fetcher, AbortSignal.any([signal, AbortSignal.timeout(READ_DEADLINE_MS)]));
    if (!read.page || !read.html) return { ok: false, status: 502, error: read.error ?? 'The page could not be read' };
    const title = read.page.meta['og:title'] ?? read.page.title ?? '';
    const article = extractArticle(read.html, read.finalUrl, title);
    if (!article) return { ok: false, status: 502, error: 'No text to keep on this page' };

    const addresses = [...new Set(article.drafts.flatMap(function collect(draft: ArticleDraft): string[] {
      return [...(draft.image ? [draft.image] : []), ...(draft.children ?? []).flatMap(collect)];
    }))];
    const kept = new Map<string, KeptImage>();
    for (let start = 0; start < addresses.length; start += AT_ONCE) {
      const batch = addresses.slice(start, start + AT_ONCE);
      const images = await Promise.all(batch.map(url => keepImage(url, { referer: read.finalUrl, fetcher: this.options.fetcher, blobs: this.options.blobs, signal })));
      batch.forEach((url, index) => {
        const image = images[index];
        if (image) kept.set(url, image);
      });
    }

    const toDraft = (draft: ArticleDraft): CopyDraft | null => {
      if (draft.image !== undefined) {
        const image = kept.get(draft.image);
        return image ? { kind: 'image', text: '', extra: { fileId: image.id, fileName: `${image.id}.webp`, mime: 'image/webp', bytes: image.bytes, width: image.width, height: image.height, uploaded: true } } : null;
      }
      const children = (draft.children ?? []).map(toDraft).filter((child): child is CopyDraft => child !== null);
      return { kind: draft.kind, text: draft.text, ...(draft.language ? { language: draft.language } : {}), ...(children.length > 0 ? { children } : {}) };
    };
    const drafts = article.drafts.map(toDraft).filter((draft): draft is CopyDraft => draft !== null);
    log.info('article read for a copy', { blocks: drafts.length, pictures: kept.size });
    return {
      ok: true,
      answer: {
        title: article.title || displayHost(read.finalUrl),
        site: read.page.siteName ?? displayHost(read.finalUrl),
        byline: article.byline,
        published: article.published,
        drafts,
      },
    };
  }
}

/** Asked for a link the server has not heard of yet (made offline a moment ago): its `copy` could not be set. */
export const LINK_NOT_HERE = 'This link has not reached the server yet: try again in a moment';

export interface CopyMakerOptions {
  readonly reader: PageCopier;
  readonly sync: SyncService;
  readonly records: RecordStore;
  readonly now?: () => number;
}

const isLive = (fields: Fields | undefined): boolean => fields !== undefined && typeof fields.deletedAt !== 'number';

/** Who wrote it and when, in italics; the day a date, so each device shows it in its own words. Empty when the page says neither. */
export function creditLine(byline: string, published: string | null): string {
  const day = published ? dateRun(published) : null;
  const runs: Run[] = [];
  if (byline) runs.push({ kind: 'text', text: byline, marks: { i: true } });
  if (byline && day) runs.push({ kind: 'text', text: ' · ', marks: { i: true } });
  if (day) runs.push(day);
  return runs.length > 0 ? serializeRich(runs) : '';
}

export class CopyMaker {
  private readonly now: () => number;
  private readonly running = new Map<string, Promise<ModuleOutcome<CopyMade>>>();
  private readonly topLevel: StatementSync;

  constructor(private readonly options: CopyMakerOptions) {
    this.now = options.now ?? Date.now;
    this.topLevel = options.records.db.prepare(
      `SELECT id, json_extract(fields, '$.position') AS position FROM records WHERE type = 'block'
       AND json_extract(fields, '$.parentId') IS NULL AND json_extract(fields, '$.deletedAt') IS NULL`,
    );
  }

  /** The page copied from this link: the one being made joined, the one already there given back, else a new one. */
  make(request: CopyRequest): Promise<ModuleOutcome<CopyMade>> {
    const running = this.running.get(request.link.id);
    if (running) return running;
    const job = this.run(request).finally(() => this.running.delete(request.link.id));
    this.running.set(request.link.id, job);
    return job;
  }

  /** The link's copy, while it is there: not deleted, not in the bin. */
  private liveCopy(linkId: string): string | null {
    const copy = this.options.records.get('link', linkId)?.fields.copy;
    if (typeof copy !== 'string' || !copy) return null;
    const page = this.options.records.get('block', copy)?.fields;
    return page && isLive(page) && page.kind === 'page' && typeof page.trashedAt !== 'number' ? copy : null;
  }

  private async run(request: CopyRequest): Promise<ModuleOutcome<CopyMade>> {
    const kept = this.liveCopy(request.link.id);
    if (kept) return { ok: true, answer: { pageId: kept } };
    if (!isLive(this.options.records.get('link', request.link.id)?.fields)) return { ok: false, status: 409, error: LINK_NOT_HERE };
    const read = await this.options.reader.copy(request);
    if (!read.ok) return read;
    const pageId = this.write(request, read.answer);
    log.info('page copied', { link: request.link.id, page: pageId });
    return { ok: true, answer: { pageId } };
  }

  /** The page and its blocks, and the link's `copy`, in one change. Synchronous from reading the siblings to the write, so nothing lands between. */
  private write(request: CopyRequest, copy: CopyResponse): string {
    const now = this.now();
    const edits: ServerEdit[] = [];
    const make = (fields: NewBlockFields): string => {
      const id = createId(now);
      const written = blockFields(fields);
      edits.push({ type: 'block', id, create: true, patch: () => written });
      return id;
    };
    // After every top-level page; a later twin of the last one moves after it, in the same change.
    const siblings = (this.topLevel.all() as unknown as { id: string; position: unknown }[])
      .map(row => ({ id: row.id, position: typeof row.position === 'string' ? row.position : '' }))
      .sort(comparePositions);
    const { positions, moved } = placeAt(siblings, siblings.length);
    for (const twin of moved) edits.push({ type: 'block', id: twin.id, patch: () => ({ position: twin.position }) });
    const pageId = make({ parentId: null, position: positions[0]!, kind: 'page', text: request.title || copy.title, trashedAt: null, createdAt: now });

    const fill = (into: string, list: readonly NewBlockDraft[]): void => {
      const keys = positionsBetween(null, null, list.length);
      list.forEach((draft, index) => {
        const id = make({ ...draft.fields, parentId: into, position: keys[index]!, createdAt: now });
        if (draft.children.length > 0) fill(id, draft.children);
      });
    };
    const credit = creditLine(copy.byline, copy.published);
    fill(pageId, [
      { fields: { kind: 'bookmark', target: { type: 'link', id: request.link.id } }, children: [] },
      ...(credit ? [{ fields: { kind: 'text' as const, text: credit }, children: [] }] : []),
      ...parseCopyDrafts(copy.drafts).map(toNew),
    ]);
    edits.push({ type: 'link', id: request.link.id, patch: current => (isLive(current.fields) ? { copy: pageId } : null) });
    this.options.sync.apply(edits);
    return pageId;
  }
}

/** A block to write and those under it. */
interface NewBlockDraft {
  readonly fields: Omit<NewBlockFields, 'parentId' | 'position' | 'createdAt'>;
  readonly children: readonly NewBlockDraft[];
}

function toNew(draft: CopyDraft): NewBlockDraft {
  return {
    fields: { ...(draft.extra as Partial<NewBlockFields> | undefined), kind: draft.kind, text: draft.text, ...(draft.language ? { language: draft.language } : {}) },
    children: (draft.children ?? []).map(toNew),
  };
}
