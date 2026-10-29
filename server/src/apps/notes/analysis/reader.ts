/**
 * Reading one link: the page as a browser would ask for it, then once more as
 * a link-preview bot when the first answer is a wall or a blank shell (shops
 * and social sites serve Open Graph tags to those bots), plus oEmbed where it
 * exists. The outcome says what was read, or in short French why nothing was.
 */
import { sniffImageMime } from '../../../blobs/images';
import { FetchError, type Fetcher } from './fetcher';
import { decodeHtml, parsePage, type ImageCandidate, type PageInfo } from './html';
import { fetchOEmbed, type OEmbed } from './oembed';

export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';
export const PREVIEW_USER_AGENT = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
export const ACCEPT_LANGUAGE = 'fr-FR,fr;q=0.9,en;q=0.8';

const PAGE_LIMIT = 3 * 1024 * 1024;
export const IMAGE_LIMIT = 10 * 1024 * 1024;
const TIMEOUT_MS = 12_000;
const BLOCKED_STATUSES = new Set([401, 403, 429, 503]);
/** Titles of bot walls and consent interstitials, which say nothing about the page behind them. */
const WALL_TITLE =
  /just a moment|attention required|access denied|acc[eè]s refus[eé]|are you a (?:robot|human)|robot check|captcha|security check|verify(?:ing)? (?:that )?you are|pardon our interruption|please wait|un instant|avant d.acc[eé]der|before you continue|request blocked|checking your browser|ddos-guard/i;

export interface DirectImage {
  readonly url: string;
  readonly data: Buffer;
  readonly mime: string;
}

export interface LinkRead {
  /** The URL that was asked for. */
  readonly url: string;
  /** Where the redirects ended. */
  readonly finalUrl: string;
  readonly page: PageInfo | null;
  /** The page's own HTML, decoded, when one was read: a copy of the page is made from it. */
  readonly html?: string | null;
  readonly oembed: OEmbed | null;
  /** Set when the URL is an image itself. */
  readonly image: DirectImage | null;
  /** Why nothing could be read, in French; null when something was. */
  readonly error: string | null;
  /** Nothing to gain from asking Claude to fetch it (refused address, page gone). */
  readonly fatal: boolean;
}

type Attempt =
  | { kind: 'html'; status: number; url: string; page: PageInfo; html: string; quality: 'good' | 'thin' | 'wall' }
  | { kind: 'image'; status: number; url: string; data: Buffer; mime: string }
  | { kind: 'other'; status: number; url: string }
  | { kind: 'failed'; error: FetchError };

const isImageType = (type: string): boolean => type.startsWith('image/') && !type.startsWith('image/svg');
const isHtmlType = (type: string): boolean => type.startsWith('text/html') || type.startsWith('application/xhtml+xml');
const looksLikeHtml = (body: Buffer): boolean => /^\s*(?:<!doctype html|<html|<head|<!--)/i.test(body.subarray(0, 512).toString('latin1'));

export function isReadable(read: LinkRead): boolean {
  return read.page !== null || read.oembed !== null || read.image !== null;
}

function quality(page: PageInfo): 'good' | 'thin' | 'wall' {
  const title = page.meta['og:title'] ?? page.title;
  if (title && WALL_TITLE.test(title)) return 'wall';
  if (page.structured.length > 0 || title) return 'good';
  return 'thin';
}

async function attempt(url: string, userAgent: string, fetcher: Fetcher, signal: AbortSignal): Promise<Attempt> {
  try {
    const response = await fetcher.fetch(url, {
      headers: {
        'user-agent': userAgent,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language': ACCEPT_LANGUAGE,
      },
      maxBytes: type => (isImageType(type.toLowerCase()) ? IMAGE_LIMIT : PAGE_LIMIT),
      timeoutMs: TIMEOUT_MS,
      signal,
    });
    const type = (response.headers['content-type'] ?? '').toLowerCase();
    const sniffed = sniffImageMime(response.body);
    if (isImageType(type) || (!type && sniffed)) {
      if (sniffed && !response.truncated && response.status < 400) {
        return { kind: 'image', status: response.status, url: response.url, data: response.body, mime: sniffed };
      }
      return { kind: 'other', status: response.status, url: response.url };
    }
    if (isHtmlType(type) || ((!type || type.startsWith('text/plain')) && looksLikeHtml(response.body))) {
      const html = decodeHtml(response.body, response.headers['content-type']);
      const page = parsePage(html, response.url);
      return { kind: 'html', status: response.status, url: response.url, page, html, quality: quality(page) };
    }
    return { kind: 'other', status: response.status, url: response.url };
  } catch (error) {
    if (error instanceof FetchError) return { kind: 'failed', error };
    throw error;
  }
}

function needsRetry(attempt: Attempt): boolean {
  if (attempt.kind === 'failed' || attempt.kind === 'image') return false;
  if (BLOCKED_STATUSES.has(attempt.status)) return true;
  return attempt.kind === 'html' && attempt.quality !== 'good';
}

function score(attempt: Attempt): number {
  if (attempt.kind === 'failed') return 0;
  if (attempt.status >= 400) return 1;
  if (attempt.kind === 'html') return attempt.quality === 'good' ? 5 : attempt.quality === 'thin' ? 3 : 1;
  if (attempt.kind === 'image') return 4;
  return 2;
}

function failure(attempt: Attempt): { error: string; fatal: boolean } {
  if (attempt.kind === 'failed') {
    switch (attempt.error.code) {
      case 'blocked':
        return { error: 'Adresse non autorisée', fatal: true };
      case 'invalid_url':
        return { error: 'Adresse invalide', fatal: true };
      case 'timeout':
        return { error: 'Délai dépassé', fatal: false };
      case 'redirects':
        return { error: 'Trop de redirections', fatal: false };
      case 'aborted':
        return { error: 'Analyse interrompue', fatal: false };
      default:
        return { error: 'Site injoignable', fatal: false };
    }
  }
  if (attempt.status === 404 || attempt.status === 410) return { error: `Page introuvable (${attempt.status})`, fatal: true };
  if (attempt.status >= 400) return { error: `Page inaccessible (${attempt.status})`, fatal: false };
  if (attempt.kind === 'html') return { error: 'Page protégée contre les robots', fatal: false };
  return { error: 'Contenu illisible', fatal: false };
}

export async function readLink(url: string, fetcher: Fetcher, signal: AbortSignal): Promise<LinkRead> {
  const oembedJob = fetchOEmbed(url, fetcher, signal);
  let best = await attempt(url, BROWSER_USER_AGENT, fetcher, signal);
  if (needsRetry(best) && !signal.aborted) {
    const retry = await attempt(url, PREVIEW_USER_AGENT, fetcher, signal);
    if (score(retry) > score(best)) best = retry;
  }
  const oembed = await oembedJob;
  const finalUrl = best.kind === 'failed' ? url : best.url;
  const base = { url, finalUrl, page: null, oembed, image: null, error: null, fatal: false };
  if (best.kind === 'html' && best.status < 400 && best.quality !== 'wall') return { ...base, page: best.page, html: best.html };
  if (best.kind === 'image') return { ...base, image: { url: best.url, data: best.data, mime: best.mime } };
  if (oembed) return base;
  return { ...base, ...failure(best) };
}

/** Images worth keeping, best guess first: the oEmbed thumbnail, then the page's own candidates. */
export function imageCandidates(read: LinkRead): ImageCandidate[] {
  if (read.image) return [{ url: read.image.url, source: 'direct image link' }];
  const candidates: ImageCandidate[] = [];
  if (read.oembed?.thumbnailUrl) candidates.push({ url: read.oembed.thumbnailUrl, source: 'oembed thumbnail' });
  for (const image of read.page?.images ?? []) {
    if (!candidates.some(candidate => candidate.url === image.url)) candidates.push(image);
  }
  return candidates.slice(0, 6);
}
