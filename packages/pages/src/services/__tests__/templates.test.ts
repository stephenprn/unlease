import { parseRich, richToPlain } from '@unlease/core/services/richText';
import { isValidField } from '@unlease/core/sync/schema';
import type { Block, BlockKind, TableColumn } from '../../models/blocks';
import { blockFields, blockFromRecord } from '../../sync/entities';
import { dailyPageLines, dayTitle } from '../../sync/journal';
import { ROOT, type ChildIndex } from '../blocks';
import type { BlockDraft } from '../pageText';
import { blocksToMarkdown } from '../pageText';
import { isBlankPage, PAGE_TEMPLATES, pageTemplate, TEMPLATE_CHOICES } from '../templates';

const DAY = '2026-11-09';

function block(id: string, kind: BlockKind, parentId: string | null, extra: Partial<Block> = {}): Block {
  return blockFromRecord({ type: 'block', id, fields: blockFields({ parentId, position: 'a0', kind, createdAt: 0, ...extra }), clocks: {} });
}

function library(list: readonly Block[]) {
  const blocks = Object.fromEntries(list.map(entry => [entry.id, entry]));
  const children: Record<string, string[]> = {};
  for (const entry of list) (children[entry.parentId ?? ROOT] ??= []).push(entry.id);
  return { blocks, children: children as ChildIndex };
}

/** Every draft, depth first. */
const flat = (drafts: readonly BlockDraft[]): BlockDraft[] => drafts.flatMap(draft => [draft, ...flat(draft.children ?? [])]);

describe('page templates', () => {
  it('offers each template once, by a glyph and a name', () => {
    expect(TEMPLATE_CHOICES.map(choice => choice.key)).toEqual([...PAGE_TEMPLATES]);
    expect(TEMPLATE_CHOICES.map(choice => choice.label)).toEqual(['Journal du jour', 'Réunion', 'Voyage', 'Liste de lecture', 'Projet']);
  });

  it('writes blocks every device takes: each field passes the schema', () => {
    for (const lang of ['fr', 'en'] as const) {
      for (const key of PAGE_TEMPLATES) {
        const template = pageTemplate(key, DAY, lang);
        expect(template.drafts.length).toBeGreaterThan(0);
        expect(template.writeAt).toBeLessThan(template.drafts.length);
        for (const draft of flat(template.drafts)) {
          const fields = blockFields({ ...(draft.extra as Partial<Block>), kind: draft.kind, text: draft.text, parentId: 'p', position: 'a0', createdAt: 1, ...(draft.checked !== undefined ? { checked: draft.checked } : {}) });
          for (const [field, value] of Object.entries(fields)) expect([key, field, isValidField('block', field, value)]).toEqual([key, field, true]);
        }
        if (template.icon) expect(isValidField('block', 'icon', template.icon)).toBe(true);
      }
    }
  });

  it('is the day’s page Agenda’s « Note du jour » makes, for « Journal du jour »', () => {
    const journal = pageTemplate('journal', DAY, 'fr');
    expect(journal.title).toBe('Lundi 9 novembre 2026');
    expect(journal.title).toBe(dayTitle(DAY, 'fr'));
    expect(journal.drafts).toEqual(dailyPageLines(DAY, 'fr'));
    expect(journal.drafts[0]!.text).toBe('Note du jour · {@date=2026-11-09}');
    expect(journal.icon).toBeNull();
    expect(pageTemplate('journal', DAY, 'en').title).toBe('Monday 9 November 2026');
  });

  it('writes in the device’s language, today as a date where it says when', () => {
    const fr = pageTemplate('meeting', DAY, 'fr');
    const en = pageTemplate('meeting', DAY, 'en');
    expect(parseRich(fr.drafts[0]!.text)).toEqual([
      { kind: 'text', text: 'Date : ', marks: {} },
      { kind: 'date', date: DAY, time: null },
    ]);
    expect(richToPlain(parseRich(en.drafts[1]!.text))).toBe('Attendees: ');
    expect(fr.drafts.filter(draft => draft.kind === 'h2').map(draft => richToPlain(parseRich(draft.text)))).toEqual(['Ordre du jour', 'Notes', 'Décisions', 'Actions']);
    expect(en.drafts.filter(draft => draft.kind === 'h2').map(draft => richToPlain(parseRich(draft.text)))).toEqual(['Agenda', 'Notes', 'Decisions', 'Action items']);
    expect(blocksToMarkdown(pageTemplate('trip', DAY, 'en').drafts, () => '')).toContain('- [ ] Passport or ID');
  });

  it('types its tables’ columns, with choices where a value is one of a few', () => {
    const tableOf = (key: 'trip' | 'reading' | 'project'): BlockDraft => pageTemplate(key, DAY, 'fr').drafts.find(draft => draft.kind === 'table')!;
    const columns = (key: 'trip' | 'reading' | 'project'): TableColumn[] => tableOf(key).extra!.columns as TableColumn[];
    expect(columns('trip').map(column => column.type)).toEqual(['date', 'text', 'text', 'checkbox']);
    expect(columns('reading').map(column => [column.name, column.type])).toEqual([
      ['Titre', 'text'],
      ['Auteur', 'text'],
      ['Statut', 'select'],
      ['Note', 'number'],
    ]);
    expect(columns('reading')[2]!.options!.map(option => option.name)).toEqual(['À lire', 'En cours', 'Lu']);
    expect(columns('project').find(column => column.type === 'select')!.options!.map(option => option.name)).toEqual(['À faire', 'En cours', 'Fait']);
    // Rows to fill, under the table.
    expect(tableOf('project').children!.map(row => row.kind)).toEqual(['row', 'row', 'row']);
  });

  it('gives an icon to the pages that wear one, a callout its own', () => {
    expect(pageTemplate('reading', DAY, 'fr').icon).toBe('📚');
    expect(pageTemplate('project', DAY, 'fr').drafts[0]).toMatchObject({ kind: 'callout', extra: { icon: '🎯' } });
  });
});

describe('a blank page', () => {
  it('holds nothing but empty paragraphs: its title and icon do not count', () => {
    const { blocks, children } = library([block('p', 'page', null, { text: 'Voyage', icon: '🧳' }), block('a', 'text', 'p'), block('b', 'text', 'p')]);
    expect(isBlankPage(blocks, children, 'p')).toBe(true);
    expect(isBlankPage(library([block('p', 'page', null)]).blocks, {}, 'p')).toBe(true);
  });

  it('is no longer blank once a word, another kind or a sub-page is in it', () => {
    expect(isBlankPage(...args([block('p', 'page', null), block('a', 'text', 'p', { text: 'Bonjour' })]))).toBe(false);
    expect(isBlankPage(...args([block('p', 'page', null), block('a', 'h2', 'p')]))).toBe(false);
    expect(isBlankPage(...args([block('p', 'page', null), block('a', 'page', 'p')]))).toBe(false);
    // A sub-page in the bin is hidden: the page reads as blank.
    expect(isBlankPage(...args([block('p', 'page', null), block('a', 'page', 'p', { trashedAt: 5 })]))).toBe(true);
  });
});

function args(list: readonly Block[]): [ReturnType<typeof library>['blocks'], ChildIndex, string] {
  const { blocks, children } = library(list);
  return [blocks, children, 'p'];
}
