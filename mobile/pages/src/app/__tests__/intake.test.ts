/**
 * Text shared to Pages: a new page, titled by what the sending app named it or by its first line, the
 * rest its content as a paste is read; a shared link a paragraph linking to it. Once per share.
 */
import { parseRich } from '@unlease/core/services/richText';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { __emitShare, __queueShare, __reset } from '../../../../shared/__mocks__/NativeIntake';

import { listenForShares, sharedPage } from '../intake';
import { loadLibrary, resetLibrary, useLibraryStore } from '../store/libraryStore';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  __reset();
  closeDatabase();
  resetLibrary();
  openDatabase({ name: 'intake.sqlite' });
  loadLibrary();
});

describe('the page a share makes', () => {
  it('takes the title the sending app gave, the text as its content', () => {
    const page = sharedPage({ subject: 'Lisbonne en trois jours', text: 'Jour 1\n- Alfama\n- Belém' });
    expect(page?.title).toBe('Lisbonne en trois jours');
    expect(page?.drafts.map(draft => draft.kind)).toEqual(['text', 'bullet', 'bullet']);
  });

  it('takes the first line as its title without one', () => {
    const page = sharedPage({ subject: '', text: '# Idées\nUn carnet de voyage' });
    expect(page).toMatchObject({ title: 'Idées', drafts: [{ kind: 'text', text: 'Un carnet de voyage' }] });
  });

  it('keeps a link alone as a paragraph linking to it, the page untitled', () => {
    const page = sharedPage({ subject: '', text: 'https://example.org/article' });
    expect(page?.title).toBe('');
    const runs = parseRich(page?.drafts[0]?.text ?? '');
    expect(runs[0]).toMatchObject({ text: 'https://example.org/article', marks: { a: 'https://example.org/article' } });
  });

  it('makes nothing of nothing', () => {
    expect(sharedPage({ subject: ' ', text: '\n' })).toBeNull();
  });
});

describe('a share to Pages', () => {
  it('becomes a top-level page, opened, once', async () => {
    const opened: string[] = [];
    __queueShare({ id: 'share-1', subject: 'Recette', text: 'Farine, œufs, lait' });
    const stop = listenForShares(id => opened.push(id));
    await flush();
    __emitShare({ id: 'share-1', subject: 'Recette', text: 'Farine, œufs, lait' });
    expect(opened).toHaveLength(1);
    const { blocks } = useLibraryStore.getState();
    expect(blocks[opened[0]!]).toMatchObject({ kind: 'page', text: 'Recette', parentId: null });
    expect(Object.values(blocks).filter(block => block.parentId === opened[0])).toMatchObject([{ kind: 'text', text: 'Farine, œufs, lait' }]);
    stop();
  });
});
