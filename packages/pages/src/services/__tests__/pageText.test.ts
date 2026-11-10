import type { BlockTarget } from '../../models/blocks';
import { blocksFromText, blocksToMarkdown, tableDraft, tableRows, type BlockDraft } from '../pageText';
import { formatNumberCell } from '../table';

const label = (target: BlockTarget): string => `«${target.type}:${target.id}»`;

describe('pages as text', () => {
  it('reads Markdown as blocks: headings, nested lists, tasks, code and tables', () => {
    const drafts = blocksFromText('## Budget\n- vols\n  - aller\n- [x] hôtel\n```py\nprint(1)\n```\n| Poste | Montant |\n| --- | ---: |\n| Vols | 186 € |\n| Pipe \\| ici | **10** |\nAprès');
    expect(drafts.map(draft => draft.kind)).toEqual(['h2', 'bullet', 'todo', 'code', 'table', 'text']);
    expect(drafts[1]!.children?.map(child => child.text)).toEqual(['aller']);
    expect(drafts[2]).toMatchObject({ text: 'hôtel', checked: true });
    expect(drafts[3]).toMatchObject({ text: 'print(1)', language: 'python' });
    expect(tableRows(drafts[4]!)).toEqual({ head: ['Poste', 'Montant'], rows: [['Vols', '186 €'], ['Pipe | ici', '10']] });
  });

  it('writes blocks as Markdown: tables as tables, columns one after the other, files and cards by what they show', () => {
    const drafts: BlockDraft[] = [
      { kind: 'h1', text: 'Voyage' },
      { kind: 'todo', text: 'Réserver', extra: { checked: true } },
      { kind: 'callout', text: 'Prendre le {b:tram 28}' },
      {
        kind: 'columns',
        text: '',
        children: [
          { kind: 'column', text: '', children: [{ kind: 'text', text: 'Gauche' }] },
          { kind: 'column', text: '', children: [{ kind: 'text', text: 'Droite' }] },
        ],
      },
      tableDraft([['Ville', 'Pays'], ['Lisbonne', 'Portugal']])!,
      { kind: 'image', text: '', extra: { url: 'https://exemple.fr/a.jpg', fileName: 'a.jpg' } },
      { kind: 'bookmark', text: '', extra: { targetType: 'note', targetId: 'n1' } },
      { kind: 'text', text: 'Voir {@page=p1}' },
    ];
    expect(blocksToMarkdown(drafts, label)).toBe(
      ['# Voyage', '- [x] Réserver', '> Prendre le **tram 28**', 'Gauche', 'Droite', '| Ville | Pays |', '| --- | --- |', '| Lisbonne | Portugal |', '![a.jpg](https://exemple.fr/a.jpg)', '«note:n1»', 'Voir «page:p1»'].join('\n'),
    );
  });

  it('writes a caption in italics under its block, never under text', () => {
    const drafts: BlockDraft[] = [
      { kind: 'code', text: 'ls', language: 'bash', extra: { caption: ' Lister ' } },
      { ...tableDraft([['Ville'], ['Porto']])!, extra: { columns: [{ id: 'c0', name: 'Ville', type: 'text' }], caption: 'Étapes' } },
      { kind: 'image', text: '', extra: { url: 'https://exemple.fr/a.jpg', fileName: 'a.jpg', caption: 'Le port' } },
      { kind: 'text', text: 'Fin', extra: { caption: 'Jamais' } },
    ];
    expect(blocksToMarkdown(drafts, label)).toBe(['```bash', 'ls', '```', '*Lister*', '| Ville |', '| --- |', '| Porto |', '*Étapes*', '![a.jpg](https://exemple.fr/a.jpg)', '*Le port*', 'Fin'].join('\n'));
  });

  it('reads its own tables back, pipes in cells included', () => {
    const table = tableDraft([['Nom', 'Note'], ['A | B', '4/5']])!;
    const [back] = blocksFromText(blocksToMarkdown([table], label));
    expect(tableRows(back!)).toEqual(tableRows(table));
  });

  it('keeps a pasted table within a table’s limits', () => {
    const wide = tableRows(tableDraft([Array.from({ length: 40 }, (_, index) => `C${index}`), ['x'.repeat(20_000)]])!)!;
    expect(wide.head).toHaveLength(30);
    expect(wide.rows[0]![0]).toHaveLength(10_000);
    expect(tableDraft([])).toBeNull();
  });

  it('writes a number with its unit, a unit starting with a slash against it', () => {
    expect(formatNumberCell(12, '€')).toBe('12\u00a0€');
    expect(formatNumberCell(3.5, '/5')).toBe('3,5/5');
  });
});
