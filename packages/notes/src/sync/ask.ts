/**
 * "Demander à Claude": a question about a link, answered from its page and, when the person ticks
 * it, from the web. `POST /api/ask` an AskRequest -> AskResponse, or 4xx/5xx { error } in French.
 * Nothing is kept: each question is asked as it comes.
 */
import { isLocale, type Locale } from '@unlease/core/i18n';
import { cleanText, parseLinkBrief, webAddress, type LinkBrief } from './brief';

export interface AskRequest {
  readonly link: LinkBrief;
  readonly question: string;
  /** Claude may search the web too (dearer). */
  readonly web: boolean;
  readonly lang: Locale;
}

export interface AskSource {
  readonly title: string;
  readonly url: string;
}

export interface AskResponse {
  /** Paragraphs, separated by a blank line. */
  readonly answer: string;
  readonly sources: readonly AskSource[];
}

export const ASK_LIMITS = { question: 500, answer: 6000, sources: 6 } as const;

export function parseAskRequest(body: unknown): AskRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as { link?: unknown; question?: unknown; web?: unknown; lang?: unknown };
  const link = parseLinkBrief(raw.link);
  const question = typeof raw.question === 'string' ? raw.question.trim().slice(0, ASK_LIMITS.question) : '';
  if (!link || !question) return null;
  return { link, question, web: raw.web === true, lang: isLocale(raw.lang) ? raw.lang : 'fr' };
}

/** An answer's paragraphs kept, its sources each once. */
export function parseAskResponse(body: unknown): AskResponse | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as { answer?: unknown; sources?: unknown };
  if (typeof raw.answer !== 'string' || !raw.answer.trim()) return null;
  const answer = raw.answer
    .split(/\n\s*\n/)
    .map(part => part.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
    .slice(0, ASK_LIMITS.answer);
  const seen = new Set<string>();
  const sources: AskSource[] = [];
  for (const entry of Array.isArray(raw.sources) ? raw.sources : []) {
    const source = (typeof entry === 'object' && entry !== null ? entry : {}) as { title?: unknown; url?: unknown };
    const url = webAddress(source.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    sources.push({ title: cleanText(source.title, 200) || url, url });
    if (sources.length === ASK_LIMITS.sources) break;
  }
  return { answer, sources };
}
