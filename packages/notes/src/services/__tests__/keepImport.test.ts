import { keepPlanToRecords, parseKeepNote, planKeepImport } from '../keepImport';
import { INBOX_ID } from '../../models/entities';

const keep = (over: Record<string, unknown>) =>
  JSON.stringify({
    color: 'DEFAULT', isTrashed: false, isPinned: false, isArchived: false, title: '', textContent: '',
    userEditedTimestampUsec: 1_700_000_000_000_000, createdTimestampUsec: 1_690_000_000_000_000, ...over,
  });

describe('Google Keep import', () => {
  it('reads text notes, checklists, labels, colours and images', () => {
    const text = parseKeepNote('a.json', keep({ title: 'Idées', textContent: 'Un vélo', color: 'YELLOW', isPinned: true, labels: [{ name: 'Perso' }] }));
    expect(text).toMatchObject({ kind: 'text', title: 'Idées', body: 'Un vélo', color: 'yellow', pinned: true, labelNames: ['Perso'], editedAt: 1_700_000_000_000 });
    const list = parseKeepNote('b.json', keep({ title: 'Courses', listContent: [{ text: 'lait', isChecked: false }, { text: 'pain', isChecked: true }, { text: '  ' }] }));
    expect(list).toMatchObject({ kind: 'checklist', checks: [{ text: 'lait', checked: false }, { text: 'pain', checked: true }] });
    const photo = parseKeepNote('c.json', keep({ attachments: [{ filePath: 'img.png', mimetype: 'image/png' }, { filePath: 'rec.3gp', mimetype: 'audio/3gpp' }] }));
    expect(photo).toMatchObject({ attachments: [{ filePath: 'img.png', mime: 'image/png' }] });
  });

  it('skips the bin, flags unreadable files, recognises link-only notes', () => {
    expect(parseKeepNote('t.json', keep({ isTrashed: true, textContent: 'x' }))).toBe('trashed');
    const plan = planKeepImport([
      { name: 'ok.json', text: keep({ textContent: 'https://www.allocine.fr/film/123?utm_source=keep' }) },
      { name: 'bad.json', text: '{nope' },
      { name: 'bin.json', text: keep({ isTrashed: true, textContent: 'x' }) },
      { name: 'Labels.txt', text: 'Perso' },
    ]);
    expect(plan.notes[0]!.onlyUrl).toBe('https://www.allocine.fr/film/123');
    expect(plan.unreadable).toEqual(['bad.json']);
    expect(plan.trashed).toBe(1);
  });

  it('turns a plan into records, reusing labels and filing links in Non classé', () => {
    const plan = planKeepImport([
      { name: 'a.json', text: keep({ title: 'Courses', listContent: [{ text: 'lait', isChecked: false }], labels: [{ name: 'perso' }] }) },
      { name: 'b.json', text: keep({ textContent: 'https://example.com/a' }) },
      { name: 'c.json', text: keep({ textContent: 'Note', labels: [{ name: 'Neuf' }], attachments: [{ filePath: 'p.jpg', mimetype: 'image/jpeg' }] }) },
    ]);
    const result = keepPlanToRecords(plan, {
      node: 'import01', now: 1_800_000_000_000, existingLabels: [{ id: 'L1', name: 'Perso' }],
      labelColors: ['blue'], firstPosition: null, convertLinks: true,
    });
    const byType = (type: string) => result.records.filter(r => r.type === type);
    expect(byType('label').map(r => r.fields.name)).toEqual(['Neuf']);
    expect(byType('note')).toHaveLength(2);
    expect(byType('note').some(r => (r.fields.labelIds as string[]).includes('L1'))).toBe(true);
    expect(byType('check')).toHaveLength(1);
    expect(byType('link')[0]!.fields).toMatchObject({ noteId: INBOX_ID, status: 'pending', autoFile: true, url: 'https://example.com/a' });
    expect(result.uploads).toHaveLength(1);
    // Clocks carry the Keep edit time, not the import time.
    expect(byType('note')[0]!.clocks.title!.startsWith((1_700_000_000_000).toString(36).padStart(9, '0'))).toBe(true);
  });
});
