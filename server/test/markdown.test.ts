import { describe, expect, it } from 'vitest';

import { noteFromRecord, noteFields, blockFields, blockFromRecord } from '@unlease/notes/sync/entities';
import { serializeStrokes } from '@unlease/notes/services/drawing';
import { layoutLibrary, type Library } from '../src/apps/notes/files';
import { libraryMarkdown } from '../src/apps/notes/markdown';

const note = (id: string, over: Record<string, unknown>) =>
  noteFromRecord({
    type: 'note',
    id,
    fields: { ...noteFields({ kind: 'text', title: '', body: '', color: null, pinned: false, archived: false, trashedAt: null, labelIds: [], position: 'a0', reminderAt: null, code: '', hint: '', createdAt: 0, deletedAt: null }), ...over },
    clocks: {},
  });

const drawing = serializeStrokes([{ id: '000000001aaaa', tool: 'pen', size: 1, ink: 'blue', points: [10, 10, 200, 40] }]);

describe('a backup’s Markdown', () => {
  it('writes a formatted note as Markdown, and a drawing beside its note as an SVG it shows', () => {
    const library: Library = {
      records: [],
      notes: [note('n1', { title: 'Courses', body: '# Marché\n{b:tomates}', rich: true }), note('n2', { kind: 'drawing', title: 'Plan', drawing })],
      checks: [],
      links: [],
      labels: [],
      attachments: [],
      blocks: [
        blockFromRecord({ type: 'block', id: 'p1', fields: blockFields({ parentId: null, position: 'a0', kind: 'page', text: 'Maison', createdAt: 0 }), clocks: {} }),
        blockFromRecord({ type: 'block', id: 'd1', fields: blockFields({ parentId: 'p1', position: 'a0', kind: 'drawing', caption: 'Le salon', drawing, createdAt: 0 }), clocks: {} }),
      ],
    };
    const files = libraryMarkdown(library, layoutLibrary(library, { kept: true }));
    const byPath = new Map(files.map(file => [file.path, file.text]));
    const courses = [...byPath.entries()].find(([path]) => path.endsWith('Courses.md'))![1];
    expect(courses).toContain('# Marché\n**tomates**');
    const plan = [...byPath.entries()].find(([path]) => path.endsWith('Plan.md'))![1];
    expect(plan).toContain('type: "dessin"');
    expect(plan).toMatch(/!\[\]\(<\.\.\/\.\.\/Carnet\/Notes\/Plan\.svg>\)/);
    const svg = [...byPath.entries()].find(([path]) => path.endsWith('Plan.svg'))![1];
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="1000" height="750"/);
    expect(svg).toContain('stroke="#2F5D8C"');
    const page = [...byPath.entries()].find(([path]) => path.endsWith('Maison.md'))![1];
    expect(page).toMatch(/!\[Le salon\]\(<\.\.\/\.\.\/Carnet\/Pages\/Maison\.dessin-1\.svg>\)/);
    expect([...byPath.keys()].some(path => path.endsWith('Maison.dessin-1.svg'))).toBe(true);
  });
});
