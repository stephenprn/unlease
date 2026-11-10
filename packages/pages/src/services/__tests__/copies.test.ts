import { parseCopyResponse } from '../../sync/copies';

describe('a copy of an article', () => {
  it('reads the drafts of a copy, leaving out what does not parse', () => {
    const copy = parseCopyResponse({
      title: 'Article',
      drafts: [
        { kind: 'h2', text: 'Titre' },
        { kind: 'table', text: 'non' },
        { kind: 'image', text: '', extra: { fileId: 'img1', mime: 'image/webp', width: 10, height: 10, bytes: 99 } },
        { kind: 'image', text: '', extra: { fileId: '../x', mime: 'image/webp', width: 10, height: 10, bytes: 99 } },
        { kind: 'bullet', text: 'Un', children: [{ kind: 'bullet', text: 'Deux' }] },
        { kind: 'code', text: 'x = 1', language: 'Python!' },
      ],
    });
    expect(copy?.drafts).toEqual([
      { kind: 'h2', text: 'Titre' },
      { kind: 'image', text: '', extra: { fileId: 'img1', fileName: '', mime: 'image/webp', bytes: 99, width: 10, height: 10, uploaded: true } },
      { kind: 'bullet', text: 'Un', children: [{ kind: 'bullet', text: 'Deux' }] },
      { kind: 'code', text: 'x = 1' },
    ]);
    expect(parseCopyResponse({ title: 'Vide', drafts: [{ kind: 'table', text: 'x' }] })).toBeNull();
  });
});
