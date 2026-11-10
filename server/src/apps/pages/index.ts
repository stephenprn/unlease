/**
 * Pages on the server: questions about pages and copies of articles (`routes.ts`, `ask.ts`,
 * `copies.ts`), its bin (`bin.ts`), and how its files and Markdown look in the drive and in
 * archives (`files.ts`, `markdown.ts`), all under its own folder there. Claude and the web reader
 * are the suite's (`claude/`, `reading/`); it reads Carnet's records (a copy's link, the names of
 * what a page mentions), as its package builds on Carnet's.
 */
import type { StatementSync } from 'node:sqlite';
import type { BlobStore } from '../../blobs/store';
import type { Database } from '../../db/database';
import type { SettingsStore } from '../../settings/store';
import type { RecordStore } from '../../sync/records';
import { reviveRule } from '../../sync/revive';
import type { PushRepair, PushRule, SyncService } from '../../sync/service';
import type { ClaudeContext } from '../../claude/provider';
import type { UsageStore } from '../../claude/usage';
import type { Fetcher } from '../../reading/fetcher';
import type { ServerApp } from '../types';
import { PagesAsker } from './ask';
import { emptyPagesBin } from './bin';
import { CopyMaker, PageCopier } from './copies';
import { JournalMaker } from './journal';
import { FOLDER, layoutPages, pagesFilesInUse, readBlocks } from './files';
import { pagesMarkdown } from './markdown';
import { pagesRoutes } from './routes';
import { descendantsOf, repairPagesTree, repairPageTree } from './tree';

/** Pages' rules for what a push brings (`SyncService`): a page the bin emptied that a device restores afterwards comes back, with what it held. */
export const PAGES_PUSH_RULES: readonly PushRule[] = [reviveRule('block', descendantsOf)];

/** Pages' look at each whole push (`SyncService`): its tree repaired where two devices' moves broke it (`tree.ts`). */
export const PAGES_PUSH_REPAIRS: readonly PushRepair[] = [repairPageTree];

export interface PagesAppOptions {
  readonly db: Database;
  readonly sync: SyncService;
  readonly records: RecordStore;
  readonly blobs: BlobStore;
  readonly settings: SettingsStore;
  /** Claude, its spending and the web reader: the suite's (`claude/`, `reading/`), made once by the registry. */
  readonly usage: UsageStore;
  readonly claude: () => ClaudeContext;
  readonly fetcher: Fetcher;
  readonly now?: () => number;
}

export interface PagesApp extends ServerApp {
  /** Makes the copies (the tests watch it). */
  readonly copies: CopyMaker;
  /** Makes the pages Agenda asks for. */
  readonly journal: JournalMaker;
}

export function createPagesApp(options: PagesAppOptions): PagesApp {
  const { db, sync, records, blobs, settings, usage, claude, fetcher } = options;
  const now = options.now ?? Date.now;
  const asker = new PagesAsker({ usage, claude, settings: () => settings.pages(), now });
  const copies = new CopyMaker({ reader: new PageCopier({ fetcher, blobs }), sync, records, now });
  const journal = new JournalMaker({ db, records, sync, now });
  const pageCount: StatementSync = db.prepare(`SELECT COUNT(*) AS count FROM records WHERE type = 'block' AND json_extract(fields, '$.kind') = 'page' AND json_extract(fields, '$.deletedAt') IS NULL`);
  return {
    id: 'pages',
    readme: `\`${FOLDER}/\` : une page par fichier Markdown, ses sous-pages dans un dossier à son nom, rangées comme dans l’application.`,
    copies,
    journal,
    routes: app => pagesRoutes(app, { asker, copies, records, journal }),
    chores: at => emptyPagesBin(db, sync, at) + repairPagesTree(db, sync),
    filesInUse: pagesFilesInUse,
    files: (all, filesOptions) => layoutPages(readBlocks(all), filesOptions).files,
    markdown: (all, filesOptions) => {
      const blocks = readBlocks(all);
      return pagesMarkdown(blocks, all, layoutPages(blocks, filesOptions));
    },
    counts: () => ({ pages: Number((pageCount.get() as { count: number }).count) }),
  };
}
