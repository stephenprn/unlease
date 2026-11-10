/**
 * oEmbed for the sites whose pages are hostile to servers (consent walls,
 * script-only shells) but which answer a public, keyless oEmbed endpoint.
 */
import type { Fetcher } from './fetcher';

export interface OEmbed {
  readonly provider: string;
  readonly title: string | null;
  readonly author: string | null;
  readonly thumbnailUrl: string | null;
  readonly type: string | null;
}

const PROVIDERS: readonly { name: string; hosts: RegExp; endpoint: string }[] = [
  { name: 'YouTube', hosts: /^(?:(?:www|m|music)\.)?youtube\.com$|^youtu\.be$/, endpoint: 'https://www.youtube.com/oembed' },
  { name: 'Vimeo', hosts: /^(?:(?:www|player)\.)?vimeo\.com$/, endpoint: 'https://vimeo.com/api/oembed.json' },
  { name: 'TikTok', hosts: /^(?:(?:www|m|vm|vt)\.)?tiktok\.com$/, endpoint: 'https://www.tiktok.com/oembed' },
  { name: 'Spotify', hosts: /^open\.spotify\.com$/, endpoint: 'https://open.spotify.com/oembed' },
];

export function oembedEndpoint(url: string): { provider: string; url: string } | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const provider = PROVIDERS.find(entry => entry.hosts.test(host));
  if (!provider) return null;
  return { provider: provider.name, url: `${provider.endpoint}?url=${encodeURIComponent(url)}&format=json` };
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

export async function fetchOEmbed(url: string, fetcher: Fetcher, signal: AbortSignal): Promise<OEmbed | null> {
  const endpoint = oembedEndpoint(url);
  if (!endpoint) return null;
  try {
    const response = await fetcher.fetch(endpoint.url, {
      headers: { accept: 'application/json', 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8' },
      maxBytes: 256 * 1024,
      timeoutMs: 12_000,
      signal,
    });
    if (response.status !== 200 || response.truncated) return null;
    const data = JSON.parse(response.body.toString('utf8')) as Record<string, unknown>;
    const title = text(data.title);
    if (!title) return null;
    return {
      provider: text(data.provider_name) ?? endpoint.provider,
      title,
      author: text(data.author_name),
      thumbnailUrl: text(data.thumbnail_url),
      type: text(data.type),
    };
  } catch {
    return null;
  }
}
