/**
 * What the spotlight searches of Pages (`searchIndex`): every live page as a document, its blocks
 * (its headings apart, files and what a block points at as meta). Nothing in the bin. Carnet's
 * documents are `@unlease/notes/services/spotlight`.
 */
import type { BlockKind, BlockTarget } from '../models/blocks';
import { containingPage, isInBin, type BlockMap, type ChildIndex } from './blocks';
import { pageContent } from './pageSearch';
import { spotKey, type SpotMeta } from '@unlease/core/services/spotlight';
import type { PartRole, SearchDoc, SearchPart } from '@unlease/core/services/searchIndex';

export const PAGES_SPOT_TYPES = ['page'] as const;

export type PagesSpotType = (typeof PAGES_SPOT_TYPES)[number];

/** Pages' library as its clients hold it. */
export interface PagesSpotLibrary {
  readonly blocks: BlockMap;
  readonly blocksByParent: ChildIndex;
}

const HEADINGS: ReadonlySet<BlockKind> = new Set(['h1', 'h2', 'h3', 'h4']);
const POINTERS: ReadonlySet<BlockKind> = new Set(['image', 'video', 'pdf', 'file', 'bookmark', 'embed']);

function blockRole(kind: BlockKind): PartRole {
  return HEADINGS.has(kind) ? 'heading' : POINTERS.has(kind) ? 'meta' : 'body';
}

/** Every live page as a document; `label` names what a mention or a bookmark points at. */
export function pagesSpotlightDocs(library: PagesSpotLibrary, label: (target: BlockTarget) => string): SearchDoc<SpotMeta>[] {
  const docs: SearchDoc<SpotMeta>[] = [];
  for (const page of Object.values(library.blocks)) {
    if (page.kind !== 'page' || page.deletedAt !== null || isInBin(library.blocks, page.id)) continue;
    const content = pageContent(page, library.blocks, library.blocksByParent, label);
    const parts = content.parts.map((part): SearchPart => ({ text: part.text, role: blockRole(part.kind), ref: part.blockId }));
    docs.push({
      key: spotKey('page', page.id),
      title: page.text.trim(),
      parts,
      editedAt: content.editedAt,
      meta: { type: 'page', id: page.id, labelIds: [], archived: false, within: containingPage(library.blocks, page.id) },
    });
  }
  return docs;
}
