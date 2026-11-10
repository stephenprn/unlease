/**
 * Carnet on the server: its routes (`routes.ts`), the reading of links by Claude (`analysis/`), its
 * bin (`bin.ts`), and how its files and Markdown look in the drive and in archives (`files.ts`,
 * `markdown.ts`), all under its own folder there. Claude's client, its spending and the guarded
 * fetcher are the platform's (`claude/`, `reading/`), made once by the registry for every app.
 */
import type { StatementSync } from 'node:sqlite';
import type { BlobStore } from '../../blobs/store';
import type { Database } from '../../db/database';
import { log } from '../../log';
import type { SettingsStore } from '../../settings/store';
import type { RecordStore } from '../../sync/records';
import type { PushRule, SyncService } from '../../sync/service';
import type { ServerApp } from '../types';
import { LinkAnalyzer } from './analysis/analyzer';
import type { Fetcher } from '../../reading/fetcher';
import { shedPictureCopies } from './analysis/distinctPictures';
import { pendingIn, pendingLinkIds } from './analysis/pending';
import type { AnalysisContext } from './analysis/provider';
import { QuestionAsker } from './analysis/questions';
import { AnalysisQueue } from './analysis/queue';
import { RecipeReader } from './analysis/recipe';
import { LinkSearches } from './analysis/searches';
import { LinkSorter } from './analysis/sorter';
import { TemplateTrier } from './analysis/templateTry';
import type { UsageStore } from '../../claude/usage';
import { emptyBin, reviveNote } from './bin';
import { FOLDER, layoutLibrary, notesFilesInUse, readLibrary } from './files';
import { libraryMarkdown } from './markdown';
import { notesRoutes } from './routes';
import { GiftMaker } from './gifts';
import { setMentionNamer } from '@unlease/notes/services/noteMentions';
import { calendarNamer } from '../calendar/names';
import type { ClaudeContext } from '../../claude/provider';
import { PriceWatch, priceWatchRoutes } from './priceWatch';

/** Carnet's rules for what a push brings (`SyncService`): given to the sync before any app is made. */
export const NOTES_PUSH_RULES: readonly PushRule[] = [reviveNote];

export interface NotesAppOptions {
  readonly db: Database;
  readonly sync: SyncService;
  readonly records: RecordStore;
  readonly blobs: BlobStore;
  readonly settings: SettingsStore;
  /** How many links are read at once. */
  readonly analysisConcurrency: number;
  /** Claude's spending and the web reader: the suite's (`claude/`, `reading/`); `analysis` is Carnet's link model over the suite's Claude client. */
  readonly usage: UsageStore;
  readonly analysis: () => AnalysisContext;
  /** The suite's Claude client itself, for « Suivi des prix »'s short reading of a price (`priceWatch.ts`). */
  readonly claude: () => ClaudeContext;
  readonly fetcher: Fetcher;
  /** How Seerr is called (tests stand in for it). */
  readonly seerrFetch?: typeof fetch;
  readonly now?: () => number;
}

export type NotesApp = ServerApp;

export function createNotesApp(options: NotesAppOptions): NotesApp {
  const { db, sync, records, blobs, settings, usage, analysis, fetcher } = options;
  const now = options.now ?? Date.now;
  const services = {
    sorter: new LinkSorter({ usage, analysis, now }),
    searches: new LinkSearches({ usage, analysis, now }),
    recipes: new RecipeReader({ usage, analysis, fetcher, now }),
    questions: new QuestionAsker({ usage, analysis, fetcher, now }),
    templates: new TemplateTrier({ usage, analysis, fetcher, now }),
  };
  const noteCount: StatementSync = db.prepare(`SELECT COUNT(*) AS count FROM records WHERE type = 'note' AND COALESCE(json_extract(fields, '$.kind'), 'text') != 'links' AND json_extract(fields, '$.deletedAt') IS NULL`);
  let queue: AnalysisQueue | null = null;
  let shedding: { readonly stop: AbortController; readonly done: Promise<unknown> } | null = null;
  const gifts = new GiftMaker({ db, records, sync, now, read: ids => queue?.enqueue(ids) });
  // « Suivi des prix »: each watched link's price read once a day, and « Vérifier le prix ».
  const prices = new PriceWatch({ db, records, sync, usage, fetcher, claude: options.claude, now });
  return {
    id: 'notes',
    readme: `\`${FOLDER}/\` : une note par fichier Markdown (titre, étiquettes, cases à cocher, photos), une collection par fichier avec ses liens, rangées comme dans l’application.`,
    routes: app => {
      notesRoutes(app, { ...services, settings, records, gifts, ...(options.seerrFetch ? { seerrFetch: options.seerrFetch } : {}) });
      priceWatchRoutes(app, prices);
    },
    stored: stored => {
      const ids = pendingIn(stored);
      if (queue && ids.length > 0) queue.enqueue(ids);
    },
    start: () => {
      const analyzer = new LinkAnalyzer({ sync, records, blobs, usage, fetcher, analysis, now, requeue: id => queue?.enqueue([id]) });
      queue = new AnalysisQueue((id, signal) => analyzer.analyze(id, signal), options.analysisConcurrency);
      // Links left pending at the last stop: read now, or marked skipped when no key is set.
      const pending = pendingLinkIds(db);
      if (pending.length > 0) log.info('resuming pending links', { count: pending.length });
      queue.enqueue(pending);
      prices.start();
      // Once per server: links read before copies of one picture were told apart keep each picture once.
      if (!shedding) {
        const stop = new AbortController();
        const done = shedPictureCopies({ db, records, blobs, sync, signal: stop.signal }).catch((error: unknown) => log.warn('could not shed copies of saved links’ pictures', { error }));
        shedding = { stop, done };
      }
    },
    stop: async () => {
      const stopping = queue;
      queue = null;
      const tidying = shedding;
      shedding = null;
      tidying?.stop.abort();
      await Promise.all([stopping?.stop(), tidying?.done, prices.stop()]);
    },
    chores: at => emptyBin(db, sync, at),
    filesInUse: notesFilesInUse,
    files: (all, filesOptions) => layoutLibrary(readLibrary(all), filesOptions).files,
    markdown: (all, filesOptions) => {
      const library = readLibrary(all);
      // A note's mention of a contact or an event reads as its name (`noteMentions`), for this backup only.
      const namer = calendarNamer(all);
      setMentionNamer(target => (target.type === 'contact' || target.type === 'event' ? namer(target) : null));
      try {
        return libraryMarkdown(library, layoutLibrary(library, filesOptions));
      } finally {
        setMentionNamer(() => null);
      }
    },
    counts: () => ({ notes: Number((noteCount.get() as { count: number }).count) }),
  };
}
