/**
 * The page, compressed for one Claude call: everything the server learned,
 * labelled, with hard caps per section so a heavy page costs about as much as
 * a light one (well under 12 000 characters, a few thousand tokens).
 */
import { displayHost } from '@unlease/core/services/url';
import type { ImageCandidate } from './html';
import type { LinkRead } from './reader';

const LIMITS = { structured: 3500, structuredItem: 1500, text: 6000, url: 300, total: 12_000 };

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export interface DigestInput {
  readonly read: LinkRead;
  readonly candidates: readonly ImageCandidate[];
  /** Dimensions of a direct image link, once decoded. */
  readonly imageSize?: { readonly width: number; readonly height: number } | null;
}

export function buildDigest({ read, candidates, imageSize }: DigestInput): string {
  const lines: string[] = [`URL: ${clip(read.url, LIMITS.url)}`];
  if (read.finalUrl !== read.url) lines.push(`Final URL after redirects: ${clip(read.finalUrl, LIMITS.url)}`);
  const page = read.page;
  const site = page?.siteName ?? read.oembed?.provider;
  lines.push(`Site: ${site ? `${site} (${displayHost(read.finalUrl)})` : displayHost(read.finalUrl)}`);

  if (read.image) {
    const size = imageSize ? `, ${imageSize.width} x ${imageSize.height} px` : '';
    lines.push(`The URL is a direct link to an image (${read.image.mime}${size}); the image is attached.`);
  }
  if (read.oembed) {
    const { provider, title, author, type } = read.oembed;
    lines.push(`oEmbed (${provider}): title "${title}"${author ? `, by "${author}"` : ''}${type ? `, type ${type}` : ''}`);
  }
  if (page) {
    if (page.lang) lines.push(`Page language: ${page.lang}`);
    if (page.title) lines.push(`Page title: ${clip(page.title, 300)}`);
    if (page.description) lines.push(`Description: ${clip(page.description, 600)}`);
    const meta = Object.entries(page.meta).filter(([key]) => key !== 'og:description' && key !== 'description' && key !== 'twitter:description');
    if (meta.length > 0) lines.push(`Meta tags: ${meta.map(([key, value]) => `${key}=${clip(value, 200)}`).join('; ')}`);
    if (page.canonical && page.canonical !== read.finalUrl) lines.push(`Canonical URL: ${clip(page.canonical, LIMITS.url)}`);
    if (page.metaPrice) lines.push(`Price in meta tags: ${page.metaPrice.amount} ${page.metaPrice.currency ?? '(no currency)'}`);
    if (page.structuredPrice) {
      lines.push(`Lowest offer in structured data: ${page.structuredPrice.amount} ${page.structuredPrice.currency ?? '(no currency)'}`);
    }
    if (page.structured.length > 0) {
      lines.push('Structured data (JSON-LD):');
      let used = 0;
      for (const item of page.structured) {
        const entry = `- ${item.type}: ${clip(JSON.stringify(item.data), LIMITS.structuredItem)}`;
        if (used + entry.length > LIMITS.structured) break;
        lines.push(entry);
        used += entry.length;
      }
    }
  }
  if (candidates.length > 0) {
    lines.push('Image candidates:');
    candidates.forEach((candidate, index) => lines.push(`[${index}] ${clip(candidate.url, 200)} (${candidate.source})`));
  } else {
    lines.push('Image candidates: none');
  }
  if (page?.text) lines.push('Page text (excerpt):', clip(page.text, LIMITS.text));
  else if (page) lines.push('Page text: none (the page is probably built by scripts)');
  return clip(lines.join('\n'), LIMITS.total);
}
