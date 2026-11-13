import { describe, expect, it } from 'vitest';

import { serializeStrokes } from '@unlease/notes/services/drawing';
import { blockFields, blockFromRecord } from '@unlease/pages/sync/entities';
import type { NewBlockFields } from '@unlease/pages/sync/entities';
import { layoutPages } from '../src/apps/pages/files';
import { pagesMarkdown } from '../src/apps/pages/markdown';
import type { StoredRecord } from '../src/sync/records';

const drawing = serializeStrokes([{ id: '000000001aaaa', tool: 'pen', size: 1, ink: 'blue', points: [10, 10, 200, 40] }]);

const record = (type: string, id: string, fields: Record<string, unknown>): StoredRecord => ({ type, id, fields, clocks: {}, seq: 1 });
const block = (id: string, fields: NewBlockFields) => record('block', id, blockFields(fields));

describe('Pages in a backup’s Markdown', () => {
  it('writes a page under Pages’ own folder, a drawing beside it as an SVG it shows, a sub-page in a folder named after it', () => {
    const all = [
      block('p1', { parentId: null, position: 'a0', kind: 'page', text: 'Maison', createdAt: 0 }),
      block('d1', { parentId: 'p1', position: 'a0', kind: 'drawing', caption: 'Le salon', drawing, createdAt: 0 }),
      block('s1', { parentId: 'p1', position: 'a1', kind: 'page', text: 'Cuisine', createdAt: 1 }),
    ];
    const blocks = all.map(blockFromRecord);
    const files = pagesMarkdown(blocks, all, layoutPages(blocks, { kept: true }));
    const byPath = new Map(files.map(file => [file.path, file.text]));
    expect([...byPath.keys()].sort()).toEqual(['Pages/Maison.dessin-1.svg', 'Pages/Maison.md', 'Pages/Maison/Cuisine.md']);
    const page = byPath.get('Pages/Maison.md')!;
    expect(page).toMatch(/!\[Le salon\]\(<\.\.\/Pages\/Maison\.dessin-1\.svg>\)/);
    expect(page).toContain('[Cuisine](<../Pages/Maison/Cuisine.md>)');
  });

  it('names what a page mentions in Carnet: a link, a note, or says it is gone', () => {
    const all = [
      record('note', 'n1', { kind: 'text', title: 'Courses', body: '', createdAt: 0, deletedAt: null }),
      record('link', 'l1', { noteId: 'n1', url: 'https://example.org/tarte', title: 'Tarte aux pommes', createdAt: 0, deletedAt: null }),
      block('p1', { parentId: null, position: 'a0', kind: 'page', text: 'Menu', createdAt: 0 }),
      block('b1', { parentId: 'p1', position: 'a0', kind: 'text', text: 'Voir {@link=l1} et {@note=n1}, pas {@note=gone}', createdAt: 0 }),
    ];
    const blocks = all.filter(one => one.type === 'block').map(blockFromRecord);
    const [menu] = pagesMarkdown(blocks, all, layoutPages(blocks, { kept: true }));
    expect(menu!.text).toContain('Voir @Tarte aux pommes et @Courses, pas @note supprimée');
  });

  it('names an event a page mentions, and writes a calendar block as the events it listed', () => {
    const now = Date.UTC(2026, 10, 2, 8);
    const all = [
      record('calendarEvent', 'e1', { title: 'Dîner chez Paul', start: '2026-11-04T20:00', end: '2026-11-04T22:00', timeZone: 'Europe/Paris', place: 'Lyon', createdAt: 0, deletedAt: null }),
      record('calendarEvent', 'e2', { title: 'Vieux', start: '2026-01-04', end: '2026-01-05', createdAt: 0, deletedAt: null }),
      block('p1', { parentId: null, position: 'a0', kind: 'page', text: 'Semaine', createdAt: 0 }),
      block('b1', { parentId: 'p1', position: 'a0', kind: 'text', text: 'Voir {@event=e1}, pas {@event=gone}', createdAt: 0 }),
      block('c1', { parentId: 'p1', position: 'a1', kind: 'calendar', calendarDays: 7, createdAt: 0 }),
    ];
    const blocks = all.filter(one => one.type === 'block').map(blockFromRecord);
    const [page] = pagesMarkdown(blocks, all, layoutPages(blocks, { kept: true }), now);
    expect(page!.text).toContain('Voir @Dîner chez Paul, pas @événement supprimé');
    expect(page!.text).toContain('Agenda, les 7 prochains jours :');
    expect(page!.text).toMatch(/- 2026-11-04 \d{2}:\d{2}–\d{2}:\d{2} Dîner chez Paul \(Lyon\)/);
    expect(page!.text).not.toContain('Vieux');
  });

  it('writes an Immich block as a link into Immich, with its caption', () => {
    const album = '0a1b2c3d-1111-4222-8333-444455556666';
    const all = [
      block('p1', { parentId: null, position: 'a0', kind: 'page', text: 'Vacances', createdAt: 0 }),
      block('i1', { parentId: 'p1', position: 'a0', kind: 'immich', fileName: 'Lisbonne', immichAlbumId: album, caption: 'Juillet', createdAt: 0 }),
    ];
    const blocks = all.map(blockFromRecord);
    const [page] = pagesMarkdown(blocks, all, layoutPages(blocks, { kept: true }), 0, 'http://192.168.1.20:2283');
    expect(page!.text).toContain(`[Immich album "Lisbonne"](http://192.168.1.20:2283/albums/${album})`);
    expect(page!.text).toContain('Juillet');
    const [plain] = pagesMarkdown(blocks, all, layoutPages(blocks, { kept: true }), 0);
    expect(plain!.text).toContain('Immich album "Lisbonne"');
  });
});
