/**
 * An Immich block (`immich`: an album, or photos picked one by one, `@unlease/core/sync/immich`) in
 * words, where the photos cannot be shown: a copy, the backups' Markdown, what Claude reads. Its
 * `fileName` keeps the album's name as it was picked (a plain field: `text` merges as typed), so it
 * reads without Immich.
 */
import { immichPlace } from '@unlease/core/sync/immich';
import type { Block } from '../models/blocks';

export type ImmichBlockFields = Pick<Block, 'fileName' | 'immichAlbumId' | 'immichAssetIds'>;

/** « Immich album "Lisbon" », « Immich: 3 photos »; the same in every language, as the rest of a page's Markdown. */
export function immichBlockWords(block: ImmichBlockFields): string {
  if (block.immichAlbumId) return block.fileName.trim() ? `Immich album "${block.fileName.trim()}"` : 'Immich album';
  const count = block.immichAssetIds.length;
  return count === 1 ? 'Immich: 1 photo' : `Immich: ${count} photos`;
}

/** The block as a Markdown line: a link into Immich when its address is known (the server's backups), else its words. */
export function immichBlockMarkdown(block: ImmichBlockFields, base: string | null): string {
  const words = immichBlockWords(block);
  if (!base) return words;
  if (block.immichAlbumId) return `[${words}](${immichPlace(base, 'album', block.immichAlbumId)})`;
  const links = block.immichAssetIds.map((id, index) => `[${index + 1}](${immichPlace(base, 'asset', id)})`);
  return links.length > 0 ? `${words}: ${links.join(' ')}` : words;
}
