/** « Note du jour » found on the device: the day's page under « Journal », by the day its first line names. */
import type { Block, BlockKind } from '../../models/blocks';
import { blockFields, blockFromRecord } from '../../sync/entities';
import { dailyPageOf } from '../dailyPage';

function block(id: string, kind: BlockKind, parentId: string | null, extra: Partial<Block> = {}): Block {
  return blockFromRecord({ type: 'block', id, fields: blockFields({ parentId, position: 'a0', kind, createdAt: 0, ...extra }), clocks: {} });
}

const map = (blocks: Block[]): Record<string, Block> => Object.fromEntries(blocks.map(each => [each.id, each]));

describe('the day’s page', () => {
  const journal = [
    block('journal', 'page', null, { text: 'Journal' }),
    block('day9', 'page', 'journal', { text: 'Lundi 9 novembre 2026' }),
    block('intro9', 'text', 'day9', { text: 'Note du jour · {@date=2026-11-09}' }),
    block('day8', 'page', 'journal', { text: 'Dimanche 8 novembre 2026' }),
    block('intro8', 'text', 'day8', { text: 'Note du jour · {@date=2026-11-08}' }),
  ];

  it('is found under « Journal » by the day it names', () => {
    expect(dailyPageOf(map(journal), '2026-11-09')).toBe('day9');
    expect(dailyPageOf(map(journal), '2026-11-08')).toBe('day8');
    expect(dailyPageOf(map(journal), '2026-11-10')).toBeNull();
  });

  it('is not a page elsewhere naming the day, nor one in the bin', () => {
    const elsewhere = [block('notes', 'page', null, { text: 'Réunions' }), block('r', 'page', 'notes', { text: 'Réunion' }), block('l', 'text', 'r', { text: 'Le {@date=2026-11-09}' })];
    expect(dailyPageOf(map(elsewhere), '2026-11-09')).toBeNull();
    const binned = journal.map(each => (each.id === 'day9' ? { ...each, trashedAt: 5 } : each));
    expect(dailyPageOf(map(binned), '2026-11-09')).toBeNull();
    const english = journal.map(each => (each.id === 'journal' ? { ...each, text: ' journal ' } : each));
    expect(dailyPageOf(map(english), '2026-11-09')).toBe('day9');
    // Its first line taken out, its title still names the day (in either language), as the server finds it.
    const untouched = journal.filter(each => each.id !== 'intro9').map(each => (each.id === 'day9' ? { ...each, text: 'Monday 9 November 2026' } : each));
    expect(dailyPageOf(map(untouched), '2026-11-09')).toBe('day9');
  });
});
