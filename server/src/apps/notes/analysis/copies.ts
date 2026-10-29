/**
 * "Garder une copie" (`POST /api/copies`): the server reads the article itself (no Claude), keeps
 * its pictures as files, and answers its text as blocks; the app makes the page. Nothing is kept
 * here but the pictures: a page made twice is two pages, as the person asked.
 */
import { displayHost } from '@unlease/core/services/url';
import type { CopyDraft, CopyRequest, CopyResponse } from '@unlease/notes/sync/copies';
import type { BlobStore } from '../../../blobs/store';
import { log } from '../../../log';
import { extractArticle, type ArticleDraft } from './article';
import type { Fetcher } from './fetcher';
import { keepImage, type KeptImage } from './keep-images';
import { readLink } from './reader';
import type { ModuleOutcome } from './searches';

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
    if (!read.page || !read.html) return { ok: false, status: 502, error: read.error ?? 'La page n’a pas pu être lue' };
    const title = read.page.meta['og:title'] ?? read.page.title ?? '';
    const article = extractArticle(read.html, read.finalUrl, title);
    if (!article) return { ok: false, status: 502, error: 'Aucun texte à garder sur cette page' };

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
    log.info('page copied', { blocks: drafts.length, pictures: kept.size });
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
