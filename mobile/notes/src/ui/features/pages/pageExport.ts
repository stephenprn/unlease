/** A page as Markdown, to share from the phone (the web's « Exporter en Markdown »). */
import { t } from '@unlease/core/i18n';
import { UNTITLED_PAGE, type BlockKind } from '@unlease/notes/models/blocks';
import { blocksToMarkdown, type BlockDraft } from '@unlease/notes/services/pageText';
import { mentionLabel } from '@app/hooks/usePages';
import { getRecord, useLibraryStore } from '@app/store/libraryStore';

/** What a copy keeps of a block besides its kind and text: never its place, its dates or its bin. */
const KEPT = ['caption', 'checked', 'language', 'icon', 'color', 'columns', 'cells', 'fileId', 'fileName', 'mime', 'bytes', 'width', 'height', 'uploaded', 'url', 'targetType', 'targetId', 'view', 'viewColumns', 'showDone', 'ratio'];
const LIST_KINDS: ReadonlySet<BlockKind> = new Set(['bullet', 'numbered', 'todo', 'toggle']);

/** A block and what it holds; a sub-page is its title (its content is its own), and one in the bin is left out. */
function draftOf(id: string, depth = 0): BlockDraft | null {
  const { blocks, blocksByParent } = useLibraryStore.getState();
  const block = blocks[id];
  const record = getRecord('block', id);
  if (!block || !record || depth > 100) return null;
  if (block.kind === 'page') return block.trashedAt === null ? { kind: 'page', text: block.text.trim() || t(UNTITLED_PAGE) } : null;
  const extra: Record<string, unknown> = {};
  for (const field of KEPT) if (Object.hasOwn(record.fields, field)) extra[field] = record.fields[field];
  const children = (blocksByParent[id] ?? []).flatMap(child => draftOf(child, depth + 1) ?? []);
  return { kind: block.kind, text: block.text, extra, ...(children.length > 0 ? { children } : {}) };
}

/** Columns read one after the other, as in a document. */
const unColumned = (drafts: readonly BlockDraft[]): BlockDraft[] => drafts.flatMap(draft => (draft.kind === 'columns' || draft.kind === 'column' ? unColumned(draft.children ?? []) : [draft]));

/** Blocks as Markdown, a blank line between them (a list's items stay together). */
export function blocksMarkdown(ids: readonly string[]): string {
  const groups: BlockDraft[][] = [];
  for (const draft of unColumned(ids.flatMap(id => draftOf(id) ?? []))) {
    const group = groups[groups.length - 1];
    if (group && LIST_KINDS.has(draft.kind) && group[group.length - 1]!.kind === draft.kind) group.push(draft);
    else groups.push([draft]);
  }
  return groups
    .map(group => blocksToMarkdown(group, mentionLabel))
    .filter(text => text.trim() !== '')
    .join('\n\n');
}

/** A whole page: its title, then its blocks. */
export function pageMarkdown(pageId: string): string {
  const { blocks, blocksByParent } = useLibraryStore.getState();
  const title = blocks[pageId]?.text.trim() || t(UNTITLED_PAGE);
  const body = blocksMarkdown(blocksByParent[pageId] ?? []);
  return `${[`# ${title}`, body].filter(Boolean).join('\n\n')}\n`;
}
