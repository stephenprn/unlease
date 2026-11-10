import type { Block, BlockKind } from '../../models/blocks';
import { blockFields, blockFromRecord } from '../../sync/entities';
import { isWithin, ROOT, type ChildIndex } from '../blocks';
import { MOVE_RECENT, movePlaces, pageEditedAt, recentPages } from '../recentPages';

function block(id: string, kind: BlockKind, parentId: string | null, edited = 0, extra: Partial<Block> = {}): Block {
  const made = blockFromRecord({ type: 'block', id, fields: blockFields({ parentId, position: 'a0', kind, createdAt: 0, ...extra }), clocks: {} });
  return { ...made, editedAt: edited };
}

function library(list: readonly Block[]) {
  const blocks = Object.fromEntries(list.map(entry => [entry.id, entry]));
  const children: Record<string, string[]> = {};
  for (const entry of list) (children[entry.parentId ?? ROOT] ??= []).push(entry.id);
  return { blocks, children: children as ChildIndex };
}

/** Recettes > Pain (its text edited at 90) > Levain; then ten pages p0…p9, changed at 0…9. */
function shelf() {
  return library([
    block('recettes', 'page', null, 1, { text: 'Recettes' }),
    block('pain', 'page', 'recettes', 2, { text: 'Pain au levain' }),
    block('painText', 'text', 'pain', 90, { text: 'Farine' }),
    block('levain', 'page', 'pain', 3, { text: 'Levain' }),
    ...Array.from({ length: 10 }, (_, index) => block(`p${index}`, 'page', null, 10 + index, { text: `Page ${index}` })),
    block('binned', 'page', null, 500, { text: 'Jetée', trashedAt: 5 }),
  ]);
}

const options = { query: '', exclude: () => false, current: null, untitled: 'Sans titre' };

describe('the pages changed last', () => {
  it('counts a page’s content, never a sub-page’s', () => {
    const { blocks, children } = shelf();
    expect(pageEditedAt(blocks, children, 'pain')).toBe(90);
    expect(pageEditedAt(blocks, children, 'recettes')).toBe(1);
  });

  it('lists the latest first, out of the bin', () => {
    const { blocks, children } = shelf();
    expect(recentPages(blocks, children, 3)).toEqual(['pain', 'p9', 'p8']);
    expect(recentPages(blocks, children, 2, id => id !== 'pain')).toEqual(['p9', 'p8']);
  });
});

describe('« Déplacer vers »', () => {
  it('offers the pages changed last first, at most five, the one it is in left out', () => {
    const { blocks, children } = shelf();
    const places = movePlaces(blocks, children, { ...options, current: 'p9' });
    expect(places.recent.map(place => place.page.id)).toEqual(['pain', 'p8', 'p7', 'p6', 'p5']);
    expect(places.recent).toHaveLength(MOVE_RECENT);
    expect(places.recent[0]!.path).toBe('Recettes');
    // Every place still, by where it sits: the recent ones too, the one it is in too.
    expect(places.all.map(place => place.page.id)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'recettes', 'pain', 'levain']);
  });

  it('never offers a page the moved one would land inside', () => {
    const { blocks, children } = shelf();
    const places = movePlaces(blocks, children, { ...options, exclude: id => isWithin(blocks, id, 'pain') });
    expect(places.recent.map(place => place.page.id)).not.toContain('pain');
    expect(places.all.map(place => place.page.id)).not.toContain('levain');
  });

  it('keeps to the pages matching what is typed, with no « Récentes »', () => {
    const { blocks, children } = shelf();
    const places = movePlaces(blocks, children, { ...options, query: 'levaín' });
    expect(places.recent).toEqual([]);
    expect(places.all.map(place => [place.page.id, place.path])).toEqual([
      ['pain', 'Recettes'],
      ['levain', 'Recettes / Pain au levain'],
    ]);
  });

  it('shows a short list at a glance, with no « Récentes » to repeat it', () => {
    const { blocks, children } = library([block('a', 'page', null, 1, { text: 'A' }), block('b', 'page', null, 2, { text: 'B' }), block('c', 'page', null, 3)]);
    const places = movePlaces(blocks, children, options);
    expect(places.recent).toEqual([]);
    expect(places.all.map(place => place.page.text || 'Sans titre')).toEqual(['A', 'B', 'Sans titre']);
  });
});
