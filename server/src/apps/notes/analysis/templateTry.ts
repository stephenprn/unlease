/**
 * « Essayer » a template being shaped (`POST /api/notes/template-try`, `@unlease/notes/sync/templateTry`):
 * one page read as a link is read (the same digest, the same fixed prompt, the fields in the message
 * as a collection's own template's), and what Claude put in each field, by the field's id. Nothing is
 * written. A try is kept a day by address, language and the fields' version (task `template` in the
 * spending), and a link already read with these very fields answers from its reading kept: either
 * costs nothing. A page read in the last minutes is not fetched again (each change to the fields is a
 * try of the same page). Billed within the monthly budget, a few dozen tries an hour at most; the
 * same try asked twice at once is joined.
 */
import { isHttpUrl, normalizeUrl } from '@unlease/core/services/url';
import { templateSignature } from '@unlease/notes/services/templates';
import type { TemplateTryRequest, TemplateTryResponse } from '@unlease/notes/sync/templateTry';
import type { LinkAttribute } from '@unlease/notes/models/entities';
import type { TemplateField } from '@unlease/notes/models/templates';
import { processLinkImage } from '../../../blobs/images';
import { BudgetSpentError } from '../../../claude/client';
import { BUDGET_SPENT, withCutOffCall, type ModuleOutcome } from '../../../claude/outcome';
import type { CallUsage, Kept, UsageStore } from '../../../claude/usage';
import { log } from '../../../log';
import type { Fetcher } from '../../../reading/fetcher';
import { imageCandidates, isReadable, readLink, type LinkRead } from '../../../reading/reader';
import { buildDigest } from './digest';
import { ModelError } from './model';
import type { AnalysisContext } from './provider';
import { NO_KEY } from './searches';
import { templatedAttributes } from './templates';
import { cachedReading, type ModuleTask } from './usage';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** A try answered again without Claude, and a link's reading answering one: a day, and the reading cache's month. */
const KEEP_MS = DAY;
const READING_KEEP_MS = 30 * DAY;
/** A page read for a try, read again only after this; a handful kept. */
const PAGE_KEEP_MS = 10 * MINUTE;
const PAGES_KEPT = 8;
/** Tries that ask Claude, for the whole server. */
export const TRIES_PER_HOUR = 30;
/** The read and Claude share it, within the apps' wait (100 s). */
const DEADLINE_MS = 85_000;
const READ_DEADLINE_MS = 30_000;

export const TRY_WORDS = {
  invalid: 'Invalid template try',
  tooMany: 'Too many tries: try again in a moment.',
} as const;

const TASK = 'template' satisfies ModuleTask;

/** A try kept: what Claude answered, for this address, language and version of the fields; its facts by the fields' names (the same fields may come back under other ids). */
interface KeptTry {
  readonly title: string;
  readonly attributes: readonly LinkAttribute[];
  readonly signature: string;
}

export interface TemplateTrierOptions {
  readonly usage: UsageStore;
  /** Read for every try, so a key, model or budget set from the apps applies at once. */
  readonly analysis: () => AnalysisContext;
  readonly fetcher: Fetcher;
  readonly now?: () => number;
}

/** Facts labelled with the fields' names, as values by the fields' ids. */
function valuesOf(fields: readonly TemplateField[], attributes: readonly LinkAttribute[]): Record<string, string> {
  const byName = new Map(attributes.map(attribute => [attribute.label, attribute.value] as const));
  const values: Record<string, string> = {};
  for (const field of fields) {
    const value = byName.get(field.name);
    if (value) values[field.id] = value;
  }
  return values;
}

export class TemplateTrier {
  private readonly now: () => number;
  private readonly running = new Map<string, Promise<ModuleOutcome<TemplateTryResponse>>>();
  private readonly pages = new Map<string, { readonly read: LinkRead; readonly at: number }>();
  private asks: number[] = [];

  constructor(private readonly options: TemplateTrierOptions) {
    this.now = options.now ?? Date.now;
  }

  try(request: TemplateTryRequest): Promise<ModuleOutcome<TemplateTryResponse>> {
    const url = normalizeUrl(request.url);
    const signature = templateSignature(request.fields);
    const key = JSON.stringify([url, request.lang, signature]);
    const running = this.running.get(key);
    if (running) return running;
    const job = this.answer(request, url, signature).finally(() => this.running.delete(key));
    this.running.set(key, job);
    return job;
  }

  private async answer(request: TemplateTryRequest, url: string, signature: string): Promise<ModuleOutcome<TemplateTryResponse>> {
    const { usage } = this.options;
    const { model, budgetUsd } = this.options.analysis();
    if (!model) return { ok: false, status: 409, error: NO_KEY };
    const kept = this.kept(request, url, signature);
    if (kept) return { ok: true, answer: kept };
    if (!isHttpUrl(url)) return { ok: false, status: 502, error: 'Invalid address' };
    const now = this.now();
    this.asks = this.asks.filter(at => now - at < HOUR);
    if (this.asks.length >= TRIES_PER_HOUR) return { ok: false, status: 409, error: TRY_WORDS.tooMany };

    const started = now;
    const deadline = AbortSignal.timeout(DEADLINE_MS);
    const read = await this.page(url, AbortSignal.any([deadline, AbortSignal.timeout(READ_DEADLINE_MS)]));
    const record = (ok: boolean, error: string | null, spent: CallUsage | null, result: KeptTry | null) =>
      usage.record(TASK, { url, usage: spent, ok, error, durationMs: this.now() - started, result: result ? { ...result, lang: request.lang } : null });
    // A page gone or refused for good: Claude would be paid to find nothing.
    if (read.fatal) return { ok: false, status: 502, error: read.error ?? 'Page unreachable' };
    const hold = usage.hold(budgetUsd);
    if (!hold) return { ok: false, status: 409, error: BUDGET_SPENT };
    this.asks.push(now);
    try {
      const candidates = imageCandidates(read);
      const image = read.image ? await processLinkImage(read.image.data) : null;
      const { output, usage: spent } = await model.holding(hold).describe(
        {
          url,
          digest: buildDigest({ read, candidates, imageSize: image }),
          lists: null,
          lang: request.lang,
          webFetch: isReadable(read) ? null : { reason: read.error ?? 'page illisible' },
          image: image ? { mediaType: 'image/webp', data: image.data.toString('base64') } : null,
          imageCount: candidates.length,
          templates: { fields: request.fields, kinds: [] },
        },
        deadline,
      );
      if (!output.pageRead) {
        const error = read.error ?? 'Unreadable page';
        record(false, error, spent, null);
        return { ok: false, status: 502, error };
      }
      const tried: KeptTry = { title: output.title, attributes: templatedAttributes(output.attributes, request.fields, output.kind), signature };
      record(true, null, spent, tried);
      log.info('template tried', { fields: request.fields.length, found: tried.attributes.length, costUsd: Math.round(spent.costUsd * 10_000) / 10_000 });
      return { ok: true, answer: { title: tried.title, values: valuesOf(request.fields, tried.attributes), costUsd: spent.costUsd } };
    } catch (error) {
      if (!deadline.aborted && !(error instanceof ModelError)) log.error('template try crashed', { error });
      const message = deadline.aborted ? 'Claude took too long' : error instanceof ModelError ? error.message : 'Reading error';
      const spent = error instanceof ModelError ? error.usage : null;
      // Cut off, it was reading the page (with web_fetch at most), not searching the web.
      record(false, message, deadline.aborted ? withCutOffCall(spent, model.model, true) : spent, null);
      return { ok: false, status: error instanceof BudgetSpentError ? 409 : 502, error: message };
    } finally {
      hold.release();
    }
  }

  /** The same try kept, or a link's reading made with these very fields: free. */
  private kept(request: TemplateTryRequest, url: string, signature: string): TemplateTryResponse | null {
    const { usage } = this.options;
    const tried = usage.results<Kept<KeptTry>>(TASK, url, this.now() - KEEP_MS, TRIES_PER_HOUR).find(result => result.lang === request.lang && result.signature === signature && Array.isArray(result.attributes));
    if (tried) return { title: tried.title, values: valuesOf(request.fields, tried.attributes), costUsd: 0 };
    const reading = cachedReading(usage, url, this.now() - READING_KEEP_MS, request.lang, result => result.readWith === signature);
    if (reading) return { title: reading.title, values: valuesOf(request.fields, reading.attributes), costUsd: 0 };
    return null;
  }

  /** The page, read again only after a few minutes. */
  private async page(url: string, signal: AbortSignal): Promise<LinkRead> {
    const now = this.now();
    for (const [address, page] of this.pages) if (now - page.at >= PAGE_KEEP_MS) this.pages.delete(address);
    const known = this.pages.get(url);
    if (known) return known.read;
    const read = await readLink(url, this.options.fetcher, signal);
    if (!signal.aborted) {
      this.pages.set(url, { read, at: now });
      // The oldest goes first: a Map keeps its order of insertion.
      while (this.pages.size > PAGES_KEPT) this.pages.delete(this.pages.keys().next().value!);
    }
    return read;
  }
}
