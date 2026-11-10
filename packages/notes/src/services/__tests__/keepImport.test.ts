/**
 * Google Keep import, against notes shaped as Takeout writes them (synthetic content): every field
 * a Keep note's JSON can carry, and what it becomes.
 */
import { parseHlc } from '@unlease/core/sync/hlc';
import type { SyncRecord } from '@unlease/core/sync/record';

import { INBOX_ID, type Label, type LinkItem } from '../../models/entities';
import { linkFromRecord, noteFromRecord } from '../../sync/entities';
import { TEXT_LIMITS } from '../../sync/types';
import { htmlLines, keepFormattedLines } from '../keepHtml';
import {
  alreadyImported,
  keepFileFinder,
  keepId,
  keepNoteId,
  keepPlanToRecords,
  keepReportLines,
  linkListNotes,
  parseKeepLabels,
  parseKeepNote,
  planKeepImport,
  singleLinkNotes,
  type ImportOptions,
  type KeepLibrary,
  type KeepPlan,
} from '../keepImport';
import { bodyText, noteLines } from '../noteBody';

const CREATED = 1_690_000_000_123_456;
const EDITED = 1_700_000_000_654_321;

/** A note as Takeout writes it, fields in Takeout's order. */
const keep = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    color: 'DEFAULT',
    isTrashed: false,
    isPinned: false,
    isArchived: false,
    textContent: '',
    title: '',
    userEditedTimestampUsec: EDITED,
    createdTimestampUsec: CREATED,
    ...over,
  });

const SPAN = (style: string, words: string) =>
  `<span style="font-size:7.2pt;font-family:'Google Sans';color:#000000;background-color:transparent;${style};font-variant:normal;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">${words}</span>`;
const P = (...spans: string[]) => `<p dir="ltr" style="line-height:1.38;margin-top:0.0pt;margin-bottom:0.0pt;">${spans.join('')}</p>`;
const PLAIN = 'font-weight:400;font-style:normal;text-decoration:none';

const emptyLibrary: KeepLibrary = { notes: {}, noteOrder: [], labels: {}, labelOrder: [], links: {}, linksByNote: {} };

function options(over: Partial<ImportOptions> = {}): ImportOptions {
  return {
    node: 'import01',
    now: 1_800_000_000_000,
    library: emptyLibrary,
    known: () => false,
    reading: true,
    singleLinks: true,
    collections: new Set(),
    findFile: path => path,
    ...over,
  };
}

const ofType = (records: readonly SyncRecord[], type: string) => records.filter(record => record.type === type);
const notesOf = (records: readonly SyncRecord[]) => ofType(records, 'note').map(noteFromRecord);
const linksOf = (records: readonly SyncRecord[]) => ofType(records, 'link').map(linkFromRecord);
const parsed = (json: string) => {
  const note = parseKeepNote('n.json', json);
  if (note === null || typeof note === 'string') throw new Error(`not a note: ${String(note)}`);
  return note;
};

describe('reading a Keep note', () => {
  it('keeps the title, text, colour, pin, archive, labels and both dates', () => {
    const note = parsed(
      keep({
        title: ' Idées vacances ',
        textContent: 'Louer un vélo\nVoir la mer 🌊\n\n',
        color: 'YELLOW',
        isPinned: true,
        isArchived: false,
        labels: [{ name: 'Perso' }, { name: '  ' }, { name: 'Voyages ✈️' }],
        sharees: [{ isOwner: true, type: 'WRITER', email: 'someone@example.org' }],
      }),
    );
    expect(note).toMatchObject({
      kind: 'text',
      title: 'Idées vacances',
      body: 'Louer un vélo\nVoir la mer 🌊',
      rich: false,
      color: 'yellow',
      pinned: true,
      archived: false,
      labelNames: ['Perso', 'Voyages ✈️'],
      createdAt: 1_690_000_000_123,
      editedAt: 1_700_000_000_654,
      links: null,
    });
  });

  it('maps every Keep colour to a pigment, and an unknown one to none', () => {
    const colours: Record<string, string | null> = {
      DEFAULT: null,
      RED: 'red',
      ORANGE: 'orange',
      YELLOW: 'yellow',
      GREEN: 'green',
      TEAL: 'sky',
      BLUE: 'blue',
      CERULEAN: 'violet',
      PURPLE: 'lilac',
      PINK: 'pink',
      BROWN: 'brown',
      GRAY: 'grey',
      SOMETHING_NEW: null,
    };
    for (const [keepColour, pigment] of Object.entries(colours)) {
      expect(parsed(keep({ textContent: 'x', color: keepColour })).color).toBe(pigment);
    }
  });

  it('reads checklists with their ticks, dropping empty items', () => {
    const note = parsed(
      keep({
        title: 'Courses',
        textContent: '',
        listContent: [
          { textHtml: '<p>lait</p>', text: 'lait', isChecked: false },
          { textHtml: '<p>pain</p>', text: 'pain ', isChecked: true },
          { text: '   ', isChecked: false },
          { isChecked: true },
        ],
      }),
    );
    expect(note.kind).toBe('checklist');
    expect(note.checks).toEqual([
      { text: 'lait', checked: false },
      { text: 'pain', checked: true },
    ]);
    expect(note.body).toBe('');
  });

  it('keeps photos and drawings, counts recordings and other files apart', () => {
    const note = parsed(
      keep({
        textContent: 'Transcription du mémo vocal',
        attachments: [
          { filePath: '1a2b.1700.jpeg', mimetype: 'image/jpeg' },
          { filePath: 'dessin.png', mimetype: 'image/png' },
          { filePath: 'old.jpg', mimetype: 'image/jpg' },
          { filePath: 'memo.3gp', mimetype: 'audio/3gpp' },
          { filePath: 'memo.m4a', mimetype: 'audio/mp4' },
          { filePath: 'doc.pdf', mimetype: 'application/pdf' },
        ],
      }),
    );
    expect(note.attachments).toEqual([
      { filePath: '1a2b.1700.jpeg', mime: 'image/jpeg' },
      { filePath: 'dessin.png', mime: 'image/png' },
      { filePath: 'old.jpg', mime: 'image/jpeg' },
    ]);
    expect(note.audio).toBe(2);
    expect(note.otherFiles).toBe(1);
    expect(note.body).toBe('Transcription du mémo vocal');
  });

  it('reads Keep’s formatting: bold, italic, underline and headings, on the plain text’s words', () => {
    const html = [
      `<h1 dir="ltr">${SPAN('font-weight:400', 'Menu')}</h1>`,
      P(SPAN(PLAIN, 'Acheter du '), SPAN('font-weight:700;font-style:normal', 'pain'), SPAN(PLAIN, ' et '), SPAN('font-weight:400;font-style:italic', 'du lait')),
      `<p dir="ltr"><br></p>`,
      P(SPAN('font-weight:400;text-decoration:underline', 'Important'), SPAN(PLAIN, ' &amp; urgent')),
    ].join('');
    const note = parsed(keep({ textContent: 'Menu\nAcheter du pain et du lait\n\nImportant & urgent', textContentHtml: html }));
    expect(note.rich).toBe(true);
    const lines = noteLines(note.body, true);
    expect(lines[0]!.heading).toBe(1);
    expect(bodyText(note)).toBe('Menu\nAcheter du pain et du lait\n\nImportant & urgent');
    expect(note.body).toContain('# Menu');
    expect(lines[1]!.runs).toEqual([
      { kind: 'text', text: 'Acheter du ', marks: {} },
      { kind: 'text', text: 'pain', marks: { b: true } },
      { kind: 'text', text: ' et ', marks: {} },
      { kind: 'text', text: 'du lait', marks: { i: true } },
    ]);
    expect(lines[3]!.runs[0]).toEqual({ kind: 'text', text: 'Important', marks: { u: true } });
  });

  it('stays plain when the HTML adds nothing, or holds other words than the text', () => {
    expect(parsed(keep({ textContent: 'Rien de spécial', textContentHtml: P(SPAN(PLAIN, 'Rien de spécial')) })).rich).toBe(false);
    const other = parsed(keep({ textContent: 'Le texte de Keep', textContentHtml: P(SPAN('font-weight:700', 'Autre chose')) }));
    expect(other).toMatchObject({ rich: false, body: 'Le texte de Keep' });
    expect(keepFormattedLines('a', '<b>a')).not.toBeNull();
    expect(htmlLines('<p>a<br>b</p><div>c</div>').map(line => line.runs.map(run => (run.kind === 'text' ? run.text : '')).join(''))).toEqual(['a', 'b', 'c']);
  });

  it('adds a link preview’s address the text lost, and keeps its page title', () => {
    const note = parsed(
      keep({
        title: '',
        textContent: 'À lire ce week-end',
        annotations: [{ description: 'Un article', source: 'WEBLINK', title: 'Le grand article', url: 'https://example.org/article?utm_source=keep' }],
      }),
    );
    expect(note.body).toBe('À lire ce week-end\nhttps://example.org/article?utm_source=keep');
    const shared = parsed(
      keep({
        title: 'Recette',
        textContent: 'https://example.org/tarte',
        annotations: [{ description: '', source: 'WEBLINK', title: 'Tarte aux pommes', url: 'https://example.org/tarte' }],
      }),
    );
    expect(shared.body).toBe('https://example.org/tarte');
    expect(shared.links).toEqual([{ url: 'https://example.org/tarte', comment: '', title: 'Tarte aux pommes', done: false }]);
  });

  it('skips the bin and empty notes; flags what it cannot read', () => {
    expect(parseKeepNote('t.json', keep({ isTrashed: true, textContent: 'x' }))).toBe('trashed');
    expect(parseKeepNote('e.json', keep())).toBe('empty');
    expect(parseKeepNote('bad.json', '{nope')).toBeNull();
    expect(parseKeepNote('list.json', '[1, 2]')).toBeNull();
    expect(parseKeepNote('other.json', '{"kind":"something else"}')).toBeNull();
    // Fields of the wrong type read as absent.
    expect(parsed(keep({ title: 42, textContent: 'ok', labels: 'Perso', listContent: undefined, isPinned: 'yes' }))).toMatchObject({ title: '', body: 'ok', labelNames: [], pinned: false });
  });

  it('reads Labels.txt, and a JSON list of labels', () => {
    expect(parseKeepLabels('﻿Perso\r\nTravail\n\n Recettes 🍰 \n')).toEqual(['Perso', 'Travail', 'Recettes 🍰']);
    expect(parseKeepLabels('[{"name":"Perso"},"Travail"]')).toEqual(['Perso', 'Travail']);
  });
});

describe('notes made of links', () => {
  it('recognises a list of addresses, keeping the words beside each one', () => {
    const note = parsed(
      keep({
        title: 'Films à voir',
        textContent: 'Dune – https://example.org/dune\n- https://example.org/alien?utm_source=x\n\nhttps://example.org/dune deuxième fois\nexample.com/brazil',
        annotations: [{ source: 'WEBLINK', title: 'Alien (1979)', url: 'https://example.org/alien' }],
      }),
    );
    expect(note.links).toEqual([
      { url: 'https://example.org/dune', comment: 'Dune\ndeuxième fois', title: '', done: false },
      { url: 'https://example.org/alien?utm_source=x', comment: '', title: 'Alien (1979)', done: false },
      { url: 'https://example.com/brazil', comment: '', title: '', done: false },
    ]);
  });

  it('recognises a checklist of addresses, a ticked item a done link', () => {
    const note = parsed(
      keep({
        title: 'Cadeaux',
        listContent: [
          { text: 'Lampe https://example.org/lampe', isChecked: true },
          { text: 'https://example.org/livre', isChecked: false },
        ],
      }),
    );
    expect(note.links).toEqual([
      { url: 'https://example.org/lampe', comment: 'Lampe', title: '', done: true },
      { url: 'https://example.org/livre', comment: '', title: '', done: false },
    ]);
  });

  it('leaves prose with addresses, and notes with photos, as notes', () => {
    expect(parsed(keep({ textContent: 'Penser à appeler le garage\nhttps://example.org/garage' })).links).toBeNull();
    expect(parsed(keep({ textContent: 'https://example.org/a', attachments: [{ filePath: 'p.png', mimetype: 'image/png' }] })).links).toBeNull();
  });
});

describe('the plan of an export', () => {
  it('counts every kind of file, and gathers labels from notes and Labels.txt', () => {
    const plan = planKeepImport([
      { name: 'Courses.json', text: keep({ title: 'Courses', listContent: [{ text: 'lait', isChecked: false }], labels: [{ name: 'perso' }] }) },
      { name: 'Lien.json', text: keep({ textContent: 'https://example.org/a', createdTimestampUsec: CREATED + 1 }) },
      { name: 'Films.json', text: keep({ title: 'Films', textContent: 'https://example.org/b\nhttps://example.org/c', createdTimestampUsec: CREATED + 2 }) },
      { name: 'Corbeille.json', text: keep({ isTrashed: true, textContent: 'x' }) },
      { name: 'Vide.json', text: keep({ createdTimestampUsec: CREATED + 3 }) },
      { name: 'cassé.json', text: '{nope' },
      { name: 'Labels.txt', text: 'Perso\nJamais utilisé' },
      { name: 'Courses.html', text: '<html></html>' },
    ]);
    expect(plan.notes).toHaveLength(3);
    expect(plan).toMatchObject({ trashed: 1, empty: 1, unreadable: ['cassé.json'] });
    expect([...plan.labelNames].sort()).toEqual(['Jamais utilisé', 'perso']);
    expect(singleLinkNotes(plan).map(note => note.source)).toEqual(['Lien.json']);
    expect(linkListNotes(plan).map(note => note.source)).toEqual(['Films.json']);
  });

  it('names each Keep note the same in every export, and two notes of the same instant apart', () => {
    const a = planKeepImport([{ name: 'a.json', text: keep({ textContent: 'un' }) }]).notes[0]!;
    const again = planKeepImport([{ name: 'renamed.json', text: keep({ textContent: 'un, modifié' }) }]).notes[0]!;
    expect(keepNoteId(a)).toBe(keepNoteId(again));
    expect(keepNoteId(a)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // Its time is the note's creation, so it sorts as created.
    expect(parseInt(keepNoteId(a).replace(/-/g, '').slice(0, 12), 16)).toBe(1_690_000_000_123);
    const twins = planKeepImport([
      { name: 'x.json', text: keep({ textContent: 'x' }) },
      { name: 'y.json', text: keep({ textContent: 'y' }) },
    ]).notes;
    expect(new Set(twins.map(keepNoteId)).size).toBe(2);
    expect(keepId(5, 'a')).not.toBe(keepId(5, 'b'));
  });

  it('finds a photo by name, case aside, or under Takeout’s other extension', () => {
    const find = keepFileFinder(['Takeout/Keep/1A2B.1700.jpg', 'Takeout/Keep/dessin.png', 'Takeout/Keep/Idée.json']);
    expect(find('1a2b.1700.jpeg')).toBe('Takeout/Keep/1A2B.1700.jpg');
    expect(find('dessin.png')).toBe('Takeout/Keep/dessin.png');
    expect(find('absente.png')).toBeNull();
  });
});

describe('into records', () => {
  const library = (over: Partial<KeepLibrary> = {}): KeepLibrary => ({ ...emptyLibrary, ...over });

  const exportFiles = () =>
    planKeepImport([
      { name: 'Courses.json', text: keep({ title: 'Courses', listContent: [{ text: 'lait', isChecked: false }, { text: 'pain', isChecked: true }], labels: [{ name: 'perso' }], isPinned: true, color: 'GREEN' }) },
      { name: 'Idée.json', text: keep({ title: 'Idée', textContent: 'Un vélo cargo', isArchived: true, labels: [{ name: 'Projets' }], createdTimestampUsec: CREATED + 1, userEditedTimestampUsec: EDITED + 1_000_000_000 }) },
      { name: 'Lien.json', text: keep({ title: 'Mon canapé', textContent: 'https://example.org/canape?utm_source=keep', createdTimestampUsec: CREATED + 2, annotations: [{ source: 'WEBLINK', title: 'Canapé 3 places', url: 'https://example.org/canape' }] }) },
      { name: 'Films.json', text: keep({ title: 'Films à voir', color: 'RED', textContent: 'Dune https://example.org/dune\nhttps://example.org/alien', createdTimestampUsec: CREATED + 3 }) },
      { name: 'Photo.json', text: keep({ title: 'Balcon', createdTimestampUsec: CREATED + 4, attachments: [{ filePath: 'balcon.jpeg', mimetype: 'image/jpeg' }, { filePath: 'perdue.png', mimetype: 'image/png' }] }) },
      { name: 'Labels.txt', text: 'Perso\nProjets\nJamais utilisé' },
    ]);

  it('writes notes, checklists, labels and photos with Keep’s dates as their clocks', () => {
    const plan = exportFiles();
    const existing: Label = { id: 'L1', name: 'Perso', color: 'blue', position: 'a0', createdAt: 1, deletedAt: null };
    const find = keepFileFinder(['Takeout/Keep/balcon.jpg']);
    const result = keepPlanToRecords(plan, options({ library: library({ labels: { L1: existing }, labelOrder: ['L1'] }), singleLinks: false, findFile: find }));
    const labels = ofType(result.records, 'label').map(record => record.fields.name);
    expect(labels.sort()).toEqual(['Jamais utilisé', 'Projets']);
    const notes = notesOf(result.records);
    const courses = notes.find(note => note.title === 'Courses')!;
    expect(courses).toMatchObject({ kind: 'checklist', pinned: true, color: 'green', labelIds: ['L1'], createdAt: 1_690_000_000_123 });
    expect(courses.editedAt).toBe(1_700_000_000_654);
    const checks = ofType(result.records, 'check').filter(record => record.fields.noteId === courses.id);
    expect(checks.map(record => [record.fields.text, record.fields.checked])).toEqual([
      ['lait', false],
      ['pain', true],
    ]);
    expect(String(checks[0]!.fields.position) < String(checks[1]!.fields.position)).toBe(true);
    const idea = notes.find(note => note.title === 'Idée')!;
    expect(idea).toMatchObject({ archived: true, body: 'Un vélo cargo' });
    // Pinned first, then newest first.
    expect(notes[0]!.title).toBe('Courses');
    expect(notes[1]!.title).toBe('Idée');
    // The single-link note stays a note when asked; the list stays a note when not chosen.
    expect(notes.find(note => note.title === 'Mon canapé')?.body).toBe('https://example.org/canape?utm_source=keep');
    expect(notes.find(note => note.title === 'Films à voir')).toMatchObject({ kind: 'text', color: 'red' });
    // One photo found (under .jpg), one missing: no record left waiting for bytes that never come.
    expect(result.uploads).toEqual([{ attachmentId: expect.any(String), file: 'Takeout/Keep/balcon.jpg', mime: 'image/jpeg' }]);
    expect(ofType(result.records, 'attachment')).toHaveLength(1);
    expect(result.report).toMatchObject({ notes: 5, checklists: 1, collections: 0, links: 0, labels: 2, photos: 1, missingPhotos: 1 });
    expect(parseHlc(ofType(result.records, 'note')[0]!.clocks.title!)?.wall).toBe(1_700_000_000_654);
  });

  it('makes the chosen link lists collections, and one-address notes links Claude files', () => {
    const plan = exportFiles();
    const result = keepPlanToRecords(plan, options({ collections: new Set(['Films.json']) }));
    const films = notesOf(result.records).find(note => note.title === 'Films à voir')!;
    expect(films).toMatchObject({ kind: 'links', color: 'red', code: 'F', body: '' });
    expect(films.emblem).not.toBeNull();
    const links = linksOf(result.records);
    const inFilms = links.filter(link => link.noteId === films.id);
    expect(inFilms.map(link => [link.url, link.comment, link.filedBy, link.status, link.autoFile])).toEqual([
      ['https://example.org/dune', 'Dune', 'person', 'pending', false],
      ['https://example.org/alien', '', 'person', 'pending', false],
    ]);
    const canape = links.find(link => link.noteId === INBOX_ID)!;
    expect(canape).toMatchObject({ url: 'https://example.org/canape', title: 'Canapé 3 places', comment: 'Mon canapé', autoFile: true, filedBy: null, status: 'pending', createdAt: 1_690_000_000_123 });
    expect(notesOf(result.records).some(note => note.title === 'Mon canapé')).toBe(false);
    expect(result.report).toMatchObject({ notes: 3, collections: 1, links: 3 });
  });

  it('keeps links plain where they land when the server does not read them', () => {
    const result = keepPlanToRecords(exportFiles(), options({ reading: false, collections: new Set(['Films.json']) }));
    for (const link of linksOf(result.records)) expect(link).toMatchObject({ status: 'skipped', autoFile: false });
    // A note's title names its link, once: it stays, as nobody reads the page.
    const lamp = planKeepImport([{ name: 'Lampe.json', text: keep({ title: 'Lampe', textContent: 'https://example.org/lampe' }) }]);
    expect(linksOf(keepPlanToRecords(lamp, options({ reading: false })).records)[0]).toMatchObject({ title: 'Lampe', comment: '' });
    // Read by Claude, its title will change: the note's is kept in the comment.
    expect(linksOf(keepPlanToRecords(lamp, options()).records)[0]).toMatchObject({ title: 'Lampe', comment: 'Lampe' });
  });

  it('adds an address once: one already saved is not added again, and its reading is copied', () => {
    const read: LinkItem = linkFromRecord({
      type: 'link',
      id: 'K1',
      fields: { noteId: 'C1', url: 'https://example.org/dune', status: 'ready', title: 'Dune (2021)', summary: 'Un film', kind: 'film', analyzedAt: 5, position: 'a0' },
      clocks: {},
    });
    const canapeSaved = linkFromRecord({ type: 'link', id: 'K2', fields: { noteId: 'C1', url: 'https://example.org/canape', status: 'ready', position: 'a1' }, clocks: {} });
    const collection = noteFromRecord({ type: 'note', id: 'C1', fields: { kind: 'links', title: 'Cinéma', position: 'a0' }, clocks: {} });
    const result = keepPlanToRecords(
      exportFiles(),
      options({ library: library({ notes: { C1: collection }, noteOrder: ['C1'], links: { K1: read, K2: canapeSaved }, linksByNote: { C1: ['K1', 'K2'] } }), collections: new Set(['Films.json']) }),
    );
    const links = linksOf(result.records);
    expect(links.find(link => link.url === 'https://example.org/dune')).toMatchObject({ status: 'ready', title: 'Dune (2021)', kind: 'film', comment: 'Dune' });
    // Filed by Claude, an address any collection holds is not added: it would land beside itself.
    expect(links.some(link => link.url === 'https://example.org/canape')).toBe(false);
    expect(result.report.linksKnown).toBe(1);
    // Imported notes go before the first one on the board.
    const first = notesOf(result.records)[0]!;
    expect(first.position < 'a0').toBe(true);
  });

  it('skips what an earlier import brought, the second time', () => {
    const plan = exportFiles();
    const firstRun = keepPlanToRecords(plan, options({ collections: new Set(['Films.json']) }));
    const ids = new Set(firstRun.records.map(record => `${record.type}:${record.id}`));
    const known = (type: string, id: string) => ids.has(`${type}:${id}`);
    expect(alreadyImported(plan, known)).toBe(4);
    const secondRun = keepPlanToRecords(plan, options({ known, collections: new Set(['Films.json']), library: library({ labels: Object.fromEntries(ofType(firstRun.records, 'label').map(record => [record.id, { id: record.id, name: String(record.fields.name), color: 'blue', position: String(record.fields.position), createdAt: 1, deletedAt: null } as Label])), labelOrder: ofType(firstRun.records, 'label').map(record => record.id) }) }));
    expect(secondRun.records).toHaveLength(0);
    expect(secondRun.report).toMatchObject({ notes: 0, links: 0, labels: 0, already: 5 });
  });

  it('cuts what is longer than a field holds', () => {
    const long = 'é'.repeat(TEXT_LIMITS.note.body + 10);
    const plan = planKeepImport([{ name: 'long.json', text: keep({ title: 't'.repeat(2000), textContent: long }) }]);
    const note = notesOf(keepPlanToRecords(plan, options()).records)[0]!;
    expect(note.title).toHaveLength(TEXT_LIMITS.note.title);
    expect(note.body).toHaveLength(TEXT_LIMITS.note.body);
  });

  it('sums it up: what came in, what was left out and why', () => {
    const plan: KeepPlan = planKeepImport([
      { name: 'a.json', text: keep({ title: 'Courses', listContent: [{ text: 'lait', isChecked: false }] }) },
      { name: 'b.json', text: keep({ textContent: 'Mémo', createdTimestampUsec: CREATED + 1, attachments: [{ filePath: 'm.3gp', mimetype: 'audio/3gpp' }] }) },
      { name: 'c.json', text: keep({ isTrashed: true }) },
      { name: 'd.json', text: '{' },
    ]);
    const { report } = keepPlanToRecords(plan, options());
    const lines = keepReportLines(report);
    expect(lines.imported).toEqual(['2 notes importées, dont 1 liste']);
    expect(lines.skipped).toEqual(['1 note de la corbeille de Keep', '1 enregistrement vocal : seul le texte transcrit est importé', '1 fichier illisible']);
  });
});

