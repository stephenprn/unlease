import { describe, expect, it } from 'vitest';
import { immichPicturePath, immichPlace, orderImmichPeople, parseImmichAlbum, parseImmichAsset, parseImmichAssets, type ImmichPerson } from '../immich';

const person = (n: number, name: string): ImmichPerson => ({ id: `00000000-0000-4000-8000-00000000000${n}`, name });

describe('Immich', () => {
  it('reads Immich’s answers and the server’s alike', () => {
    const album = parseImmichAlbum({ id: '0a1b2c3d-1111-4222-8333-444455556666', albumName: 'Lisbonne', assetCount: 3, albumThumbnailAssetId: null, startDate: '2026-07-14T09:00:00.000Z' });
    expect(album).toEqual({ id: '0a1b2c3d-1111-4222-8333-444455556666', name: 'Lisbonne', count: 3, coverId: null, start: '2026-07-14', end: null });
    expect(parseImmichAlbum(album)).toEqual(album);
    expect(parseImmichAlbum({ id: '../x', albumName: 'x' })).toBeNull();
    // Its size on the asset (2.x), else in its EXIF; a video says so.
    expect(parseImmichAsset({ id: '0a1b2c3d-aaaa-4bbb-8ccc-ddddeeeeffff', type: 'VIDEO', exifInfo: { exifImageWidth: 1920, exifImageHeight: 1080 }, localDateTime: '2026-07-14T10:30:00.000Z' })).toMatchObject({ video: true, width: 1920, height: 1080, takenAt: Date.UTC(2026, 6, 14, 10, 30) });
    expect(parseImmichAssets({ assets: [{ id: 'nope!' }, { id: '0a1b2c3d-aaaa-4bbb-8ccc-ddddeeeeffff' }], next: 2 })).toMatchObject({ assets: [{ id: '0a1b2c3d-aaaa-4bbb-8ccc-ddddeeeeffff' }], next: 2 });
  });

  it('names the server’s pictures and Immich’s own pages', () => {
    expect(immichPicturePath('asset', 'abc12345', 'preview')).toBe('/api/immich/assets/abc12345/preview');
    expect(immichPicturePath('person', 'abc12345')).toBe('/api/immich/people/abc12345/thumbnail');
    expect(immichPlace('https://photos.example.org/', 'album', 'abc12345')).toBe('https://photos.example.org/albums/abc12345');
    expect(immichPlace('https://photos.example.org', 'asset', 'abc12345')).toBe('https://photos.example.org/photos/abc12345');
  });

  it('puts the people matching the contact first, then the named ones, the faces without a name last', () => {
    const people = [person(1, ''), person(2, 'Tom Garnier'), person(3, 'Léa Martin'), person(4, 'Léa Dubois'), person(5, 'Anne')];
    expect(orderImmichPeople(people, '', 'Lea Martin').map(entry => entry.name)).toEqual(['Léa Martin', 'Léa Dubois', 'Anne', 'Tom Garnier', '']);
    // What is typed wins over the contact's name, and only the matches stay.
    expect(orderImmichPeople(people, 'gar', 'Lea Martin').map(entry => entry.name)).toEqual(['Tom Garnier']);
    expect(orderImmichPeople(people, '', '').map(entry => entry.name)).toEqual(['Anne', 'Léa Dubois', 'Léa Martin', 'Tom Garnier', '']);
  });
});
