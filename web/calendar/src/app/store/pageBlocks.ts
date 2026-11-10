/**
 * Pages' blocks as Agenda holds them: the days written in pages (its « Pages » layer) and the pages
 * its events mention, named. Its own small projection of the `block` records (Agenda syncs Pages'
 * types: `APPS.calendar.reads`), so nothing of Pages' web app loads here.
 */
import { create } from 'zustand';

import type { Block } from '@unlease/pages/models/blocks';
import { blockFromRecord } from '@unlease/pages/sync/entities';
import { PAGES_TYPES } from '@unlease/pages/sync/types';

import type { AppData } from '@shared/modules';
import type { Projection } from '@shared/app/store/records';

export interface PageBlocksState {
  readonly blocks: Readonly<Record<string, Block>>;
  readonly revision: number;
}

const EMPTY: PageBlocksState = { blocks: {}, revision: 0 };

export const usePageBlocksStore = create<PageBlocksState>(() => EMPTY);

const projection: Projection = {
  types: PAGES_TYPES,
  apply(changed, fresh) {
    usePageBlocksStore.setState(state => {
      const base = fresh ? EMPTY : state;
      let blocks = base.blocks;
      for (const record of changed) {
        if (record.type !== 'block') continue;
        if (blocks === base.blocks) blocks = { ...base.blocks };
        (blocks as Record<string, Block>)[record.id] = blockFromRecord(record);
      }
      return { blocks, revision: base.revision + 1 };
    }, true);
  },
  clear() {
    usePageBlocksStore.setState(EMPTY, true);
  },
};

/** Pages' records in Agenda's web app: read only, their places in Pages' own web app (`suitePlace`). */
export const pageBlocksData: AppData = { id: 'pages', projection };

/** A page's title now; null when it is gone or in the bin; '' untitled. */
export function pageTitle(id: string): string | null {
  const block = usePageBlocksStore.getState().blocks[id];
  return block && block.kind === 'page' && block.deletedAt === null ? block.text.trim() : null;
}
