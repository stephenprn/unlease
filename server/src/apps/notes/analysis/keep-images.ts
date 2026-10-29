/**
 * Downloads a page's images and keeps them as blobs, so a list still shows
 * its pictures after the shop deletes the product page.
 */
import { createHash } from 'node:crypto';
import { createId } from '@unlease/core/services/ids';
import { processLinkImage } from '../../../blobs/images';
import type { BlobStore } from '../../../blobs/store';
import { log } from '../../../log';
import type { Fetcher } from './fetcher';
import { ACCEPT_LANGUAGE, BROWSER_USER_AGENT, IMAGE_LIMIT } from './reader';

const KEEP = 3;
const ATTEMPTS = 5;

export interface KeptImages {
  readonly ids: readonly string[];
  /** The source URL of each kept image, same order. */
  readonly urls: readonly string[];
}

export interface KeepImagesOptions {
  readonly candidates: readonly string[];
  /** The candidate to keep first; null keeps nothing (no candidate shows the thing). */
  readonly first: number | null;
  /** The page, sent as Referer: many image CDNs refuse hotlinks without it. */
  readonly referer: string;
  readonly fetcher: Fetcher;
  readonly blobs: BlobStore;
  readonly signal: AbortSignal;
  /** Bytes already downloaded, by URL (a direct image link). */
  readonly prefetched?: ReadonlyMap<string, Buffer>;
}

async function download(url: string, options: Pick<KeepImagesOptions, 'referer' | 'fetcher' | 'signal' | 'prefetched'>): Promise<Buffer | null> {
  const known = options.prefetched?.get(url);
  if (known) return known;
  try {
    const response = await options.fetcher.fetch(url, {
      headers: {
        'user-agent': BROWSER_USER_AGENT,
        accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'accept-language': ACCEPT_LANGUAGE,
        referer: options.referer,
      },
      maxBytes: IMAGE_LIMIT,
      timeoutMs: 12_000,
      signal: options.signal,
    });
    const type = (response.headers['content-type'] ?? '').toLowerCase();
    if (response.status < 200 || response.status >= 300 || response.truncated) return null;
    if (type && (!type.startsWith('image/') || type.startsWith('image/svg'))) return null;
    return response.body;
  } catch {
    return null;
  }
}

/** One picture kept as a blob (WebP, bounded): what a page block needs to show it. */
export interface KeptImage {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
}

/** Downloads one picture and keeps it, or null when it cannot be had or is no picture worth keeping. */
export async function keepImage(url: string, options: Pick<KeepImagesOptions, 'referer' | 'fetcher' | 'blobs' | 'signal'>): Promise<KeptImage | null> {
  const data = await download(url, options);
  const image = data ? await processLinkImage(data) : null;
  if (!image) return null;
  const id = createId();
  await options.blobs.save(
    { id, mime: 'image/webp', width: image.width, height: image.height, bytes: image.data.length, displayMime: 'image/webp', displayBytes: image.data.length, source: 'link' },
    { display: image.data, original: null },
  );
  return { id, width: image.width, height: image.height, bytes: image.data.length };
}

export async function keepImages(options: KeepImagesOptions): Promise<KeptImages> {
  const { candidates, first } = options;
  if (first === null || first < 0 || first >= candidates.length) return { ids: [], urls: [] };
  const order = [candidates[first]!, ...candidates.filter((_, index) => index !== first)];
  const ids: string[] = [];
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const url of order.slice(0, ATTEMPTS)) {
    if (ids.length >= KEEP || options.signal.aborted) break;
    const data = await download(url, options);
    if (!data) continue;
    const image = await processLinkImage(data);
    if (!image) continue;
    // og:image and twitter:image are often the same picture under two URLs.
    const hash = createHash('sha1').update(image.data).digest('hex');
    if (seen.has(hash)) continue;
    seen.add(hash);
    const id = createId();
    await options.blobs.save(
      {
        id,
        mime: 'image/webp',
        width: image.width,
        height: image.height,
        bytes: image.data.length,
        displayMime: 'image/webp',
        displayBytes: image.data.length,
        source: 'link',
      },
      { display: image.data, original: null },
    );
    ids.push(id);
    urls.push(url);
  }
  log.debug('kept link images', { kept: ids.length, candidates: candidates.length });
  return { ids, urls };
}
