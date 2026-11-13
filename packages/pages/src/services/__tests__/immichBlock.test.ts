import { describe, expect, it } from 'vitest';
import { immichBlockMarkdown, immichBlockWords } from '../immichBlock';
import { blocksToMarkdown } from '../pageText';

const ALBUM = '0a1b2c3d-1111-4222-8333-444455556666';
const PHOTO = '0a1b2c3d-aaaa-4bbb-8ccc-ddddeeeeffff';

describe('Immich block', () => {
  it('reads as words without Immich, and links into it where its address is known', () => {
    expect(immichBlockWords({ fileName: 'Lisbon', immichAlbumId: ALBUM, immichAssetIds: [] })).toBe('Immich album "Lisbon"');
    expect(immichBlockWords({ fileName: '', immichAlbumId: null, immichAssetIds: [PHOTO, PHOTO] })).toBe('Immich: 2 photos');
    expect(immichBlockMarkdown({ fileName: 'Lisbon', immichAlbumId: ALBUM, immichAssetIds: [] }, 'https://photos.example.org')).toBe(`[Immich album "Lisbon"](https://photos.example.org/albums/${ALBUM})`);
    expect(immichBlockMarkdown({ fileName: '', immichAlbumId: null, immichAssetIds: [PHOTO] }, 'https://photos.example.org')).toBe(`Immich: 1 photo: [1](https://photos.example.org/photos/${PHOTO})`);
  });

  it('copies as its words and its caption', () => {
    const markdown = blocksToMarkdown([{ kind: 'immich', text: '', extra: { fileName: 'Lisbon', immichAlbumId: ALBUM, immichAssetIds: [], caption: 'Summer 2026' } }], target => target.id);
    expect(markdown).toBe('Immich album "Lisbon"\n*Summer 2026*');
  });
});
