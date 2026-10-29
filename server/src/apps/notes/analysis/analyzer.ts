/**
 * One link, from `pending` to `ready` or `failed`.
 *
 * Read the page, ask Claude what it is (and which list it belongs in when the
 * link came through the quick input), keep its images, then write everything
 * back as one server edit, so every device sees the finished card at once.
 * Whatever fails, the link ends up in a settled state with a short French
 * reason and whatever was learned on the way; it is never left pending,
 * except at shutdown, when the next start picks it up again. With no Claude key
 * in the settings nothing is read at all: the link becomes `skipped`.
 */
import type { Locale } from '@unlease/core/i18n';
import { INBOX_ID, type LinkKind } from '@unlease/notes/models/entities';
import { foldText } from '@unlease/core/services/search';
import { displayHost, isHttpUrl, normalizeUrl } from '@unlease/core/services/url';
import { linkFromRecord } from '@unlease/notes/sync/entities';
import type { Fields } from '@unlease/core/sync/record';
import { processLinkImage } from '../../../blobs/images';
import type { BlobStore } from '../../../blobs/store';
import { log } from '../../../log';
import type { RecordStore, StoredRecord } from '../../../sync/records';
import type { SyncService } from '../../../sync/service';
import { isPendingLink } from './pending';
import { buildDigest } from './digest';
import type { Fetcher } from './fetcher';
import { fetchedImages, type ImageCandidate } from './html';
import { keepImages } from './keep-images';
import { routeCached, routingLists } from './lists';
import { ModelError, type Description } from './model';
import { clipText } from './output';
import type { AnalysisContext } from './provider';
import { imageCandidates, isReadable, readLink, type LinkRead } from './reader';
import { monthStart, type CachedAnalysis, type CallUsage, type UsageStore } from './usage';

const DAY = 86_400_000;
const CACHE_DAYS = 30;

export interface AnalyzerOptions {
  readonly sync: SyncService;
  readonly records: RecordStore;
  readonly blobs: BlobStore;
  readonly usage: UsageStore;
  readonly fetcher: Fetcher;
  /** Read at the start of every job, so a key, model or budget set from the apps applies to the next link. */
  readonly analysis: () => AnalysisContext;
  readonly now?: () => number;
  /** A link whose URL changed while it was being read goes back in the queue. */
  readonly requeue?: (id: string) => void;
}

interface Job {
  readonly id: string;
  /** Normalized: the cache key, and what the page fetch uses. */
  readonly url: string;
  readonly autoFile: boolean;
  /** The language Claude writes in: the one the link asks for. */
  readonly lang: Locale;
  readonly started: number;
  /** `noteId`'s clock at the start: if it moved since, the person filed the link themselves. */
  readonly noteClock: string | undefined;
}

interface Learned {
  readonly title?: string | null;
  readonly siteName?: string | null;
  readonly kind?: LinkKind | null;
  readonly imageUrl?: string | null;
  readonly imageIds?: readonly string[];
}

const SEPARATOR = /^(.*\S)\s+[|\-\u2013\u2014\u00b7\u2022:]\s+(\S.*)$/;

/** "Veste en jean | Zara" becomes "Veste en jean" when the suffix is the site's own name. */
export function withoutSiteSuffix(title: string, site: string): string {
  const match = SEPARATOR.exec(title.trim());
  if (!match) return title.trim();
  const squash = (value: string) => foldText(value).replace(/[^a-z0-9]/g, '');
  const suffix = squash(match[2]!);
  const name = squash(site.replace(/\.[a-z]{2,}$/i, ''));
  if (name.length < 3 || suffix.length < 3) return title.trim();
  return suffix.includes(name) || name.includes(suffix) ? match[1]! : title.trim();
}

function siteNameOf(read: LinkRead): string {
  return read.page?.siteName ?? read.oembed?.provider ?? displayHost(read.finalUrl);
}

function learnedFrom(read: LinkRead, candidates: readonly ImageCandidate[]): Learned {
  const siteName = siteNameOf(read);
  const raw = read.page?.meta['og:title'] ?? read.oembed?.title ?? read.page?.title ?? null;
  return { title: raw ? withoutSiteSuffix(raw, siteName) : null, siteName, imageUrl: candidates[0]?.url ?? null };
}

function present(value: unknown): boolean {
  if (typeof value === 'string' || Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null;
}

export class LinkAnalyzer {
  private readonly now: () => number;

  constructor(private readonly options: AnalyzerOptions) {
    this.now = options.now ?? Date.now;
  }

  async analyze(id: string, signal: AbortSignal): Promise<void> {
    const record = this.options.records.get('link', id);
    if (!record || !isPendingLink(record)) return;
    const link = linkFromRecord(record);
    const job: Job = {
      id,
      url: normalizeUrl(link.url),
      autoFile: link.autoFile,
      lang: link.lang,
      started: this.now(),
      noteClock: record.clocks.noteId,
    };
    try {
      await this.run(job, this.options.usage.analysedBefore(id), signal);
    } catch (error) {
      if (signal.aborted) return;
      log.error('link analysis crashed', { id, error });
      this.fail(job, 'Erreur interne', {}, null);
    }
  }

  private async run(job: Job, reanalysis: boolean, signal: AbortSignal): Promise<void> {
    const { usage, fetcher, blobs } = this.options;
    const { model, budgetUsd } = this.options.analysis();
    if (!model) return this.skip(job);
    if (!isHttpUrl(job.url)) return this.fail(job, 'Adresse invalide', {}, null);

    // The same product shared twice costs one call. A re-analysis asks for fresh eyes.
    if (!reanalysis) {
      const cached = usage.cached(job.url, this.now() - CACHE_DAYS * DAY, job.lang);
      if (cached) return this.fromCache(job, cached, signal);
    }

    const read = await readLink(job.url, fetcher, signal);
    if (signal.aborted) return;
    const candidates = imageCandidates(read);
    const learned = learnedFrom(read, candidates);
    const prefetched = read.image ? new Map([[read.image.url, read.image.data]]) : undefined;
    const failWith = async (error: string, extra: Learned = {}, cost: CallUsage | null = null): Promise<void> => {
      // A failed link still keeps the page's picture: it may be all that is left of the page later.
      const kept = await keepImages({ candidates: candidates.map(c => c.url), first: 0, referer: read.finalUrl, fetcher, blobs, signal, prefetched });
      if (!signal.aborted) this.fail(job, error, { ...learned, ...extra, imageIds: kept.ids }, cost);
    };

    if (read.fatal) return failWith(read.error ?? 'Page inaccessible');
    if (usage.costSince(monthStart(this.now())) >= budgetUsd) return failWith('Budget mensuel atteint');

    const lists = job.autoFile ? routingLists(this.options.records) : null;
    const image = read.image ? await processLinkImage(read.image.data) : null;
    let description: Description;
    try {
      description = await model.describe(
        {
          url: job.url,
          digest: buildDigest({ read, candidates, imageSize: image }),
          lists,
          lang: job.lang,
          webFetch: isReadable(read) ? null : { reason: read.error ?? 'page illisible' },
          image: image ? { mediaType: 'image/webp', data: image.data.toString('base64') } : null,
          imageCount: candidates.length,
        },
        signal,
      );
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ModelError) return failWith(error.message, {}, error.usage);
      throw error;
    }
    const { output } = description;
    if (!output.pageRead) {
      // web_fetch could not read it either: keep what Claude made of the URL, but say it failed.
      return failWith(read.error ?? 'Page illisible', { title: learned.title || output.title, kind: output.kind, ...(output.site ? { siteName: output.site } : {}) }, description.usage);
    }

    // A page only Claude could read shows its pictures through what web_fetch returned, best guess (og:image) first.
    const pictures = description.fetched ? fetchedImages(description.fetched.text, description.fetched.url) : candidates;
    const first = description.fetched ? (pictures.length > 0 ? 0 : null) : output.imageIndex;
    const kept = await keepImages({
      candidates: pictures.map(c => c.url),
      first,
      referer: read.finalUrl,
      fetcher,
      blobs,
      signal,
      prefetched,
    });
    if (signal.aborted) return;
    const result: CachedAnalysis = {
      title: output.title,
      summary: output.summary,
      kind: output.kind,
      price: output.price,
      currency: output.currency,
      attributes: output.attributes,
      siteName: clipText(output.site || siteNameOf(read), 200),
      imageUrl: first === null ? null : (pictures[first]?.url ?? null),
      imageUrls: kept.urls,
      imageIds: kept.ids,
      listId: lists?.find(list => list.id === output.listId)?.id ?? null,
      listTitle: lists?.find(list => list.id === output.listId)?.title ?? null,
      lang: job.lang,
    };
    this.writeReady(job, result, output.listId);
    usage.record({
      linkId: job.id,
      url: job.url,
      usage: description.usage,
      ok: true,
      cached: false,
      error: null,
      durationMs: this.now() - job.started,
      result,
    });
    log.info('link analysed', { id: job.id, kind: result.kind, model: description.usage.model, costUsd: Number(description.usage.costUsd.toFixed(5)) });
  }

  private async fromCache(job: Job, cached: CachedAnalysis, signal: AbortSignal): Promise<void> {
    const { blobs, fetcher } = this.options;
    let imageIds = cached.imageIds;
    if (!imageIds.every(id => blobs.get(id))) {
      // The first link's images were collected after it was deleted: fetch them again.
      const kept = await keepImages({ candidates: cached.imageUrls, first: cached.imageUrls.length > 0 ? 0 : null, referer: job.url, fetcher, blobs, signal });
      if (signal.aborted) return;
      imageIds = kept.ids;
    }
    const listId = job.autoFile ? routeCached(routingLists(this.options.records), cached) : null;
    this.writeReady(job, { ...cached, imageIds }, listId);
    this.options.usage.record({
      linkId: job.id,
      url: job.url,
      usage: null,
      ok: true,
      cached: true,
      error: null,
      durationMs: this.now() - job.started,
      result: null,
    });
    log.info('link analysis reused', { id: job.id });
  }

  /** Reading is off: the link stays a plain link, in the inbox if the server was to file it. */
  private skip(job: Job): void {
    this.write(job, current => ({
      status: 'skipped',
      error: null,
      autoFile: false,
      ...(current.fields.autoFile === true ? { noteId: INBOX_ID } : {}),
    }));
    log.debug('link reading is off: link kept as a plain link', { id: job.id });
  }

  private writeReady(job: Job, result: CachedAnalysis, listId: string | null): void {
    const now = this.now();
    this.write(job, current => {
      const patch: Fields = {
        title: result.title,
        summary: result.summary,
        kind: result.kind,
        price: result.price,
        currency: result.currency,
        attributes: result.attributes.map(({ label, value }) => ({ label, value })),
        siteName: result.siteName,
        imageIds: [...result.imageIds],
        imageUrl: result.imageUrl,
        status: 'ready',
        error: null,
        analyzedAt: now,
      };
      this.file(job, current, patch, listId);
      return patch;
    });
  }

  private fail(job: Job, error: string, learned: Learned, cost: CallUsage | null): void {
    const now = this.now();
    this.write(job, current => {
      const patch: Fields = { status: 'failed', error: clipText(error, 500), analyzedAt: now };
      // Only fill what is empty: a failed re-analysis must not wipe an earlier good result.
      if (learned.title && !present(current.fields.title)) patch.title = clipText(learned.title, 500);
      if (learned.siteName && !present(current.fields.siteName)) patch.siteName = clipText(learned.siteName, 200);
      if (learned.kind && (current.fields.kind === undefined || current.fields.kind === 'other')) patch.kind = learned.kind;
      if (learned.imageUrl && !present(current.fields.imageUrl)) patch.imageUrl = learned.imageUrl;
      if (learned.imageIds && learned.imageIds.length > 0 && !present(current.fields.imageIds)) patch.imageIds = [...learned.imageIds];
      this.file(job, current, patch, null);
      return patch;
    });
    this.options.usage.record({
      linkId: job.id,
      url: job.url,
      usage: cost,
      ok: false,
      cached: false,
      error,
      durationMs: now - job.started,
      result: null,
    });
    log.info('link analysis failed', { id: job.id, error });
  }

  /** A quick-input link goes to its list (or the inbox) and loses the flag, unless the person moved it meanwhile. */
  private file(job: Job, current: StoredRecord, patch: Fields, listId: string | null): void {
    if (current.fields.autoFile !== true) return;
    if (current.clocks.noteId === job.noteClock) {
      const known = listId !== null && routingLists(this.options.records).some(list => list.id === listId);
      patch.noteId = known ? listId : INBOX_ID;
      // Landing in "Non classé" is no one's choice: only a real collection is Claude's.
      if (known && listId !== INBOX_ID) patch.filedBy = 'claude';
    }
    patch.autoFile = false;
  }

  /** Writes only if the link is still the pending link this job started from. */
  private write(job: Job, build: (current: StoredRecord) => Fields): void {
    let changedUnderUs = false;
    this.options.sync.apply([
      {
        type: 'link',
        id: job.id,
        patch: current => {
          if (!isPendingLink(current)) return null;
          if (normalizeUrl(typeof current.fields.url === 'string' ? current.fields.url : '') !== job.url) {
            changedUnderUs = true;
            return null;
          }
          return build(current);
        },
      },
    ]);
    if (changedUnderUs) this.options.requeue?.(job.id);
  }
}
