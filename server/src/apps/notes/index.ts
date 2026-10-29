/**
 * Carnet on the server: its routes (`routes.ts`), the reading of links by Claude (`analysis/`), its
 * bin (`bin.ts`), and how its files and Markdown look in the drive and in archives (`files.ts`,
 * `markdown.ts`), all under its own folder there.
 */
import type { BlobStore } from '../../blobs/store';
import type { Effort } from '../../config';
import type { Database } from '../../db/database';
import { log } from '../../log';
import type { SettingsStore } from '../../settings/store';
import type { RecordStore } from '../../sync/records';
import type { PushRule, SyncService } from '../../sync/service';
import type { ServerApp } from '../types';
import { LinkAnalyzer } from './analysis/analyzer';
import { PageCopier } from './analysis/copies';
import { createFetcher, type Fetcher } from './analysis/fetcher';
import { PagesAsker } from './analysis/pagesAsk';
import { pendingIn, pendingLinkIds } from './analysis/pending';
import { LinkModelProvider } from './analysis/provider';
import { QuestionAsker } from './analysis/questions';
import { AnalysisQueue } from './analysis/queue';
import { RecipeReader } from './analysis/recipe';
import { LinkSearches } from './analysis/searches';
import { LinkSorter } from './analysis/sorter';
import { UsageStore } from './analysis/usage';
import { emptyBin, reviveNote } from './bin';
import { FOLDER, layoutLibrary, notesFilesInUse, readLibrary } from './files';
import { libraryMarkdown } from './markdown';
import { notesRoutes } from './routes';

/** Carnet's rules for what a push brings (`SyncService`): given to the sync before any app is made. */
export const NOTES_PUSH_RULES: readonly PushRule[] = [reviveNote];

export interface NotesAppOptions {
  readonly db: Database;
  readonly sync: SyncService;
  readonly records: RecordStore;
  readonly blobs: BlobStore;
  readonly settings: SettingsStore;
  /** How hard Claude thinks per link, and how many links are read at once. */
  readonly claudeEffort: Effort;
  readonly analysisConcurrency: number;
  /** What tests stand in for: how pages are fetched, how Claude is reached, how Seerr is called. */
  readonly fetcher?: Fetcher;
  readonly provider?: LinkModelProvider;
  readonly seerrFetch?: typeof fetch;
  readonly now?: () => number;
}

export interface NotesApp extends ServerApp {
  /** What Claude has cost, month by month (the Administration shows it). */
  readonly usage: UsageStore;
}

export function createNotesApp(options: NotesAppOptions): NotesApp {
  const { db, sync, records, blobs, settings } = options;
  const now = options.now ?? Date.now;
  const usage = new UsageStore(db, now);
  const provider = options.provider ?? new LinkModelProvider(settings, { effort: options.claudeEffort });
  const analysis = () => provider.current();
  const fetcher = options.fetcher ?? createFetcher();
  const services = {
    sorter: new LinkSorter({ usage, analysis, now }),
    searches: new LinkSearches({ usage, analysis, now }),
    recipes: new RecipeReader({ usage, analysis, fetcher, now }),
    copier: new PageCopier({ fetcher, blobs }),
    questions: new QuestionAsker({ usage, analysis, fetcher, now }),
    pagesAsker: new PagesAsker({ usage, analysis, settings: () => settings.pages(), now }),
  };
  let queue: AnalysisQueue | null = null;
  return {
    id: 'notes',
    readme: `\`${FOLDER}/\` : une note par fichier Markdown (titre, étiquettes, cases à cocher, photos), une collection par fichier avec ses liens, et les pages, rangées comme dans l’application.`,
    usage,
    routes: app => notesRoutes(app, { ...services, usage, settings, now, ...(options.seerrFetch ? { seerrFetch: options.seerrFetch } : {}) }),
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
    },
    stop: async () => {
      await queue?.stop();
    },
    chores: at => emptyBin(db, sync, at),
    filesInUse: notesFilesInUse,
    files: (all, filesOptions) => layoutLibrary(readLibrary(all), filesOptions).files,
    markdown: (all, filesOptions) => {
      const library = readLibrary(all);
      return libraryMarkdown(library, layoutLibrary(library, filesOptions));
    },
  };
}
