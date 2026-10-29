/**
 * Seerr (the requests app of a Plex or Jellyfin server), when the Administration links one: a film
 * or a series found in it. `POST /api/seerr` a SeerrRequest -> SeerrResponse, or 4xx/5xx { error }
 * in French. With Seerr's API key the server finds the title's own page and whether it is there;
 * without one, the answer is Seerr's search for it.
 */
import { cleanText, parseLinkBrief, type LinkBrief } from './brief';

export interface SeerrRequest {
  readonly link: LinkBrief;
}

export const SEERR_STATUSES = ['available', 'partial', 'processing', 'requested', 'missing'] as const;
export type SeerrStatus = (typeof SEERR_STATUSES)[number];

export interface SeerrResponse {
  /** The title's page in Seerr, or its search. */
  readonly url: string;
  /** Null when Seerr was only searched (no API key), or the title was not found. */
  readonly status: SeerrStatus | null;
  /** The title as Seerr names it, with its year, when found: "Dune (2021)". */
  readonly title: string;
}

export function parseSeerrRequest(body: unknown): SeerrRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const link = parseLinkBrief((body as { link?: unknown }).link);
  return link ? { link } : null;
}

/** An http(s) address, a bare host included: Seerr is often reached as `http://seerr:5055` on a home network. */
const seerrAddress = (value: unknown): string | null => (typeof value === 'string' && value.length <= 4000 && /^https?:\/\/[^\s/?#]+(?:[/?#]\S*)?$/i.test(value) ? value : null);

export function parseSeerrResponse(body: unknown): SeerrResponse | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as { url?: unknown; status?: unknown; title?: unknown };
  const url = seerrAddress(raw.url);
  if (!url) return null;
  return { url, status: (SEERR_STATUSES as readonly unknown[]).includes(raw.status) ? (raw.status as SeerrStatus) : null, title: cleanText(raw.title, 200) };
}
