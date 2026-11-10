/**
 * Pictures, videos, PDFs and files in a page: which block a file makes and how a video's address
 * plays in the page (a size reads through `formatBytes`, `@unlease/core/services/format`).
 */
import type { MediaKind } from '../models/blocks';

/** The largest file a page takes: Cloudflare refuses a bigger request on the way to the server. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

/** The image types the server reads (the attachment schema's). */
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif']);

export function isUploadableImage(mime: string): boolean {
  return IMAGE_TYPES.has(mime.toLowerCase() === 'image/jpg' ? 'image/jpeg' : mime.toLowerCase());
}

/** The block a dropped or picked file makes. */
export function mediaKindFor(mime: string): MediaKind {
  const type = mime.toLowerCase();
  if (isUploadableImage(type)) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type === 'application/pdf') return 'pdf';
  return 'file';
}

/** Where a video page's player lives, to show it in a frame: YouTube (without its cookies), Vimeo, Dailymotion. Null for anything else. */
export function videoEmbedUrl(address: string): string | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, '');
  const start = (url.searchParams.get('t') ?? url.searchParams.get('start') ?? '').replace(/s$/, '');
  const at = /^\d+$/.test(start) ? `?start=${start}` : '';
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return id && /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}${at}` : null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
    const id = url.searchParams.get('v') ?? /^\/(?:embed|shorts|live)\/([\w-]+)/.exec(url.pathname)?.[1];
    return id && /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}${at}` : null;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = /\/(?:video\/)?(\d{5,12})/.exec(url.pathname)?.[1];
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  if (host === 'dailymotion.com' || host === 'dai.ly') {
    const id = host === 'dai.ly' ? url.pathname.slice(1) : /^\/(?:embed\/)?video\/([a-zA-Z0-9]+)/.exec(url.pathname)?.[1];
    return id && /^[a-zA-Z0-9]{5,12}$/.test(id) ? `https://www.dailymotion.com/embed/video/${id}` : null;
  }
  return null;
}

/** An address the browser plays itself in a `<video>`. */
export function isVideoFileUrl(address: string): boolean {
  return /^https?:\/\/[^?#]+\.(mp4|webm|ogv|ogg|mov|m4v)(?:[?#].*)?$/i.test(address);
}

/** The last part of an address, as a file's name. */
export function fileNameFromUrl(address: string): string {
  try {
    const name = decodeURIComponent(new URL(address).pathname.split('/').filter(Boolean).pop() ?? '');
    return name || new URL(address).hostname;
  } catch {
    return address;
  }
}
