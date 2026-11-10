/**
 * Pages' routes, beside the platform's under `/api` and behind the same token, answered while
 * Pages is on: questions about pages (`ask.ts`), copies of articles kept as pages (`copies.ts`), the
 * pages that mention something (`mentions.ts`: a contact's or an event's « Mentionné dans »), and the
 * pages Agenda asks for (`journal.ts`: an event's notes, the day's page).
 */
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { parseCopyRequest } from '@unlease/pages/sync/copies';
import { parsePagesAskRequest } from '@unlease/pages/sync/pagesAsk';
import { DAILY_PATH, FROM_EVENT_PATH, parseDailyRequest, parseFromEventRequest } from '@unlease/pages/sync/journal';
import type { JournalMaker } from './journal';
import { parseMentionsQuery, type MentionsResponse } from '@unlease/core/sync/mentions';
import type { RecordStore } from '../../sync/records';
import { pagesMentioning } from './mentions';
import type { Env } from '../types';
import type { ModuleOutcome } from '../../claude/outcome';
import type { PagesAsker } from './ask';
import type { CopyMaker } from './copies';

const MB = 1024 * 1024;
const JSON_LIMIT = 1 * MB;
/** A question about pages carries them: up to 400 000 characters, each up to three bytes, and their ids. */
const PAGES_LIMIT = 4 * MB;

const tooLarge = (c: Context) => c.json({ error: 'body too large' }, 413);

export interface PagesServices {
  readonly asker: PagesAsker;
  readonly copies: CopyMaker;
  readonly records: RecordStore;
  readonly journal: JournalMaker;
}

/** A JSON request parsed, then answered; a run goes on if the app hangs up (it is paid for). */
const answer =
  <R, T>(parse: (body: unknown) => R | null, invalid: string, run: (request: R) => Promise<ModuleOutcome<T>>) =>
  async (c: Context<Env>) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Requête invalide' }, 400);
    }
    const request = parse(body);
    if (!request) return c.json({ error: invalid }, 400);
    const outcome = await run(request);
    if (!outcome.ok) return c.json({ error: outcome.error }, outcome.status);
    return c.json(outcome.answer as object, 200, { 'Cache-Control': 'no-store' });
  };

export function pagesRoutes(app: Hono<Env>, { asker, copies, records, journal }: PagesServices): void {
  app.get('/api/pages/mentions', c => {
    const query = parseMentionsQuery(c.req.query('type'), c.req.query('ids'));
    if (!query) return c.json({ error: 'Requête invalide' }, 400);
    const answer: MentionsResponse = { places: pagesMentioning(records, query.type, query.ids) };
    return c.json(answer, 200, { 'Cache-Control': 'no-store' });
  });
  app.post('/api/pages/ask', bodyLimit({ maxSize: PAGES_LIMIT, onError: tooLarge }), answer(parsePagesAskRequest, 'Question invalide', request => asker.ask(request)));
  app.post(FROM_EVENT_PATH, bodyLimit({ maxSize: 64 * 1024, onError: tooLarge }), answer(parseFromEventRequest, 'Demande de page invalide', async request => ({ ok: true, answer: journal.fromEvent(request) })));
  app.post(DAILY_PATH, bodyLimit({ maxSize: 4 * 1024, onError: tooLarge }), answer(parseDailyRequest, 'Jour invalide', async request => ({ ok: true, answer: journal.daily(request) })));
  app.post('/api/pages/copies', bodyLimit({ maxSize: JSON_LIMIT, onError: tooLarge }), answer(parseCopyRequest, 'Demande de copie invalide', request => copies.make(request)));
}
