import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INBOX_ID } from '@unlease/notes/models/entities';
import { KIND_TEMPLATES, type TemplateField } from '@unlease/notes/models/templates';
import { kindTemplateId, presetFields, presetNames, promptFieldLines, templateSignature } from '@unlease/notes/services/templates';
import { linkTemplateFields } from '@unlease/notes/sync/entities';
import { TEMPLATE_TRY_PATH } from '@unlease/notes/sync/templateTry';
import { buildRequest } from '../src/apps/notes/analysis/model';
import { SYSTEM_PROMPT } from '../src/apps/notes/analysis/prompt';
import { TRIES_PER_HOUR } from '../src/apps/notes/analysis/templateTry';
import { AUTH, analysisOf, claudeMessage, createTestServer, FakeClaude, FakeFetcher, fixture, linkFields, listNote, pendingLink, rec, T0, type TestServer } from './helpers';

const WINE = 'https://www.cave-exemple.fr/vins/chateau-lumiere-2018';
const RECIPE = 'https://cuisine.example/tarte-poireaux';
const HTML = { 'content-type': 'text/html; charset=utf-8' };
const PAGES = { [WINE]: { headers: HTML, body: fixture('shop-product.html') }, [RECIPE]: { headers: HTML, body: fixture('restaurant.html') } };

const field = (id: string, name: string, type: TemplateField['type'] = 'text', hint = ''): TemplateField => ({ id, name, type, hint });

const WINE_FIELDS: TemplateField[] = [
  field('domaine', 'Domaine', 'text', 'Le domaine ou le château qui le produit'),
  field('millesime', 'Millésime', 'number'),
  field('cepages', 'Cépages', 'list'),
  field('region', 'Région'),
  field('accords', 'Accords', 'text', 'Les plats avec lesquels le boire'),
  field('garde', 'Garde', 'duration'),
  field('bio', 'Bio', 'yesno'),
  field('degre', 'Degré', 'number'),
];
const RECIPE_FIELDS: TemplateField[] = [...presetFields('recipe'), field('vegetarien', 'Végétarien', 'yesno', 'Sans viande ni poisson')];

const wineAnswer = {
  title: 'Château Lumière 2018',
  site: 'Cave Exemple',
  kind: 'product',
  summary: 'Un bordeaux rouge du Médoc, assemblage classique, élevé dix-huit mois en barrique.',
  price: { amount: 32, currency: 'EUR' },
  // Out of order, in another case, with one Claude added on its own: the link keeps the template's.
  attributes: [
    { label: 'Millésime', value: '2018' },
    { label: 'domaine', value: 'Château Lumière' },
    { label: 'Marque', value: 'Lumière' },
    { label: 'Cépages', value: 'Merlot, cabernet sauvignon' },
    { label: 'Région', value: 'Médoc' },
    { label: 'Accords', value: 'Viandes rouges, fromages' },
    { label: 'Garde', value: '10 ans' },
    { label: 'Bio', value: 'Oui' },
    { label: 'Degré', value: '13,5 %' },
  ],
  imageIndex: null,
  listId: null,
  pageRead: true,
};

const recipeAnswer = {
  title: 'Tarte aux poireaux',
  site: 'Cuisine Exemple',
  kind: 'recipe',
  summary: 'Une tarte salée aux poireaux fondus et à la crème.',
  price: null,
  attributes: [
    { label: 'Végétarien', value: 'Oui' },
    { label: 'Temps total', value: '1 h 10' },
    { label: 'Portions', value: '6 personnes' },
  ],
  imageIndex: null,
  listId: null,
  pageRead: true,
};

let server: TestServer;
beforeEach(() => {
  server = createTestServer();
});
afterEach(() => server.close());

/** A template as a device writes it: whole, at one clock. */
function pushTemplate(id: string, name: string, kind: string | null, fields: readonly TemplateField[], wall = T0 - 60_000): void {
  server.sync.push([rec('linkTemplate', id, linkTemplateFields({ name, kind: kind as never, fields, createdAt: wall, deletedAt: null }), wall)]);
}

/** « Vins » reads its links with « Vin »; « Films » and « Caves » by kind, then « Caves » takes « Vin » too. */
function pushShelves(): void {
  pushTemplate('t-vin', 'Vin', null, WINE_FIELDS);
  server.sync.push([
    listNote(INBOX_ID, 'Non classé', T0 - 90_000, { position: 'a0' }),
    listNote('vins', 'Vins', T0 - 90_000, { position: 'a1', templateId: 't-vin' }),
    listNote('films', 'Films', T0 - 90_000, { position: 'a2' }),
    listNote('caves', 'Caves', T0 - 90_000, { position: 'a3' }),
  ]);
}

describe('the prompt', () => {
  it('lists every kind’s preset, French / English, from the presets themselves', () => {
    for (const [kind, presets] of Object.entries(KIND_TEMPLATES)) {
      if (presets.length === 0) continue;
      expect(SYSTEM_PROMPT).toContain(`    ${kind}: ${presets.map(preset => `${presetNames(preset).fr} / ${presetNames(preset).en}`).join(', ')}\n`);
    }
    expect(SYSTEM_PROMPT).toContain('recipe: Temps total / Total time, Portions / Servings, Difficulté / Difficulty');
    expect(SYSTEM_PROMPT).toContain('film: Réalisateur / Director, Année / Year, Durée / Length, Genre / Genre, Note / Rating');
    expect(SYSTEM_PROMPT).not.toMatch(/^ {4}other:/m);
  });

  it('stays the same whatever fields a link is read with: only the message changes', () => {
    const base = { url: WINE, digest: 'URL: x', lists: null, lang: 'fr' as const, webFetch: null, image: null, imageCount: 0 };
    const plain = buildRequest(base, 'claude-opus-5-5', 'low');
    const own = buildRequest({ ...base, templates: { fields: WINE_FIELDS, kinds: [] } }, 'claude-opus-5-5', 'low');
    const kinds = buildRequest({ ...base, templates: { fields: null, kinds: [{ kind: 'recipe', fields: RECIPE_FIELDS }] } }, 'claude-opus-5-5', 'low');
    expect(own.system).toEqual(plain.system);
    expect(kinds.system).toEqual(plain.system);
    expect(own.output_config).toEqual(plain.output_config);
    expect(JSON.stringify(plain.system)).not.toContain('Millésime');
    expect(JSON.stringify(plain.messages)).not.toContain('<fields>');
  });
});

describe('a link read with its collection’s template', () => {
  it('asks for exactly its fields, keeps them in their order under their names, eight at most, and says which version read it', async () => {
    pushShelves();
    const claude = new FakeClaude().reply(claudeMessage(wineAnswer));
    const { queue } = analysisOf(server, { fetcher: new FakeFetcher(PAGES), claude });
    server.sync.push([pendingLink('l1', WINE, T0 - 1000, { noteId: 'vins' })]);
    await queue.idle();

    const text = claude.userText();
    expect(text).toContain('Fill exactly these fields');
    expect(text).toContain(`<fields>\n${promptFieldLines(WINE_FIELDS).join('\n')}\n</fields>`);
    expect(text).toContain('- Domaine (a few words): Le domaine ou le château qui le produit');
    expect(text).not.toContain('<kinds>');
    // The person's fields come before the page, after the language.
    expect(text.indexOf('<fields>')).toBeLessThan(text.indexOf('<page>'));

    const fields = linkFields(server, 'l1');
    expect(fields.attributes).toEqual([
      { label: 'Domaine', value: 'Château Lumière' },
      { label: 'Millésime', value: '2018' },
      { label: 'Cépages', value: 'Merlot, cabernet sauvignon' },
      { label: 'Région', value: 'Médoc' },
      { label: 'Accords', value: 'Viandes rouges, fromages' },
      { label: 'Garde', value: '10 ans' },
      { label: 'Bio', value: 'Oui' },
      { label: 'Degré', value: '13,5 %' },
    ]);
    expect(fields.readWith).toBe(templateSignature(WINE_FIELDS));
    // Written with the rest of the reading, at the server's clock.
    const stored = server.records.get('link', 'l1')!;
    expect(stored.clocks.readWith).toBe(stored.clocks.status);
  });

  it('asks for no fact when its template has no field', async () => {
    pushTemplate('t-vide', 'Vide', null, []);
    server.sync.push([listNote('vide', 'Vide', T0 - 90_000, { templateId: 't-vide' })]);
    const claude = new FakeClaude().reply(claudeMessage(wineAnswer));
    const { queue } = analysisOf(server, { fetcher: new FakeFetcher(PAGES), claude });
    server.sync.push([pendingLink('l1', WINE, T0 - 1000, { noteId: 'vide' })]);
    await queue.idle();
    expect(claude.userText()).toContain('asks for none: answer an empty attributes list');
    expect(linkFields(server, 'l1')).toMatchObject({ status: 'ready', attributes: [], readWith: templateSignature([]) });
  });

  it('reads by kind again once its template is deleted', async () => {
    pushShelves();
    server.sync.push([rec('linkTemplate', 't-vin', { deletedAt: T0 - 500 }, T0 - 500, 'web001')]);
    const claude = new FakeClaude().reply(claudeMessage(wineAnswer));
    const { queue } = analysisOf(server, { fetcher: new FakeFetcher(PAGES), claude });
    server.sync.push([pendingLink('l1', WINE, T0 - 1000, { noteId: 'vins' })]);
    await queue.idle();
    expect(claude.userText()).not.toContain('<fields>');
    const fields = linkFields(server, 'l1');
    expect(fields.readWith).toBe('preset');
    // A product's preset: its facts first in the preset's order, six at most.
    expect((fields.attributes as { label: string }[]).map(attribute => attribute.label)).toEqual(['Marque', 'Millésime', 'domaine', 'Cépages', 'Région', 'Accords']);
  });
});

describe('a link read by its kind', () => {
  it('reads the presets from the prompt alone, written « preset »', async () => {
    const claude = new FakeClaude().reply(claudeMessage(recipeAnswer));
    const { queue } = analysisOf(server, { fetcher: new FakeFetcher(PAGES), claude });
    server.sync.push([pendingLink('l1', RECIPE, T0 - 1000)]);
    await queue.idle();
    expect(claude.userText()).not.toMatch(/<fields>|<kinds>/);
    expect(linkFields(server, 'l1')).toMatchObject({ readWith: 'preset', attributes: [recipeAnswer.attributes[1], recipeAnswer.attributes[2], recipeAnswer.attributes[0]] });
  });

  it('gives the kinds the person changed in the message, and reads with them', async () => {
    pushTemplate(kindTemplateId('recipe'), '', 'recipe', RECIPE_FIELDS);
    pushTemplate(kindTemplateId('film'), '', 'film', []);
    // Set back to its preset: it reads from the prompt again.
    pushTemplate(kindTemplateId('book'), '', 'book', [field('f1', 'Éditeur')]);
    server.sync.push([rec('linkTemplate', kindTemplateId('book'), { deletedAt: T0 - 100 }, T0 - 100, 'web001')]);
    const claude = new FakeClaude().reply(claudeMessage(recipeAnswer));
    const { queue } = analysisOf(server, { fetcher: new FakeFetcher(PAGES), claude });
    server.sync.push([pendingLink('l1', RECIPE, T0 - 1000)]);
    await queue.idle();

    const text = claude.userText();
    expect(text).toContain(`The person's own fields for these kinds replace the lists above`);
    expect(text).toContain(`<kinds>\nfilm: no fields (an empty attributes list)\nrecipe:\n${promptFieldLines(RECIPE_FIELDS).join('\n')}\n</kinds>`);
    expect(text).not.toContain('book');
    const fields = linkFields(server, 'l1');
    expect(fields.attributes).toEqual([
      { label: 'Temps total', value: '1 h 10' },
      { label: 'Portions', value: '6 personnes' },
      { label: 'Végétarien', value: 'Oui' },
    ]);
    expect(fields.readWith).toBe(templateSignature(RECIPE_FIELDS));
  });

  it('takes a preset field Claude named in the other language under the person’s name for it', async () => {
    pushTemplate(kindTemplateId('recipe'), '', 'recipe', RECIPE_FIELDS);
    const claude = new FakeClaude().reply(claudeMessage({ ...recipeAnswer, attributes: [{ label: 'Total time', value: '70 min' }, { label: 'Servings', value: '6' }] }));
    const { queue } = analysisOf(server, { fetcher: new FakeFetcher(PAGES), claude });
    server.sync.push([pendingLink('l1', RECIPE, T0 - 1000, { lang: 'en' })]);
    await queue.idle();
    expect(linkFields(server, 'l1').attributes).toEqual([
      { label: 'Temps total', value: '70 min' },
      { label: 'Portions', value: '6' },
    ]);
  });
});

describe('a link Claude files', () => {
  it('shows the lists their fields, and reads a link filed into one with them', async () => {
    pushShelves();
    const claude = new FakeClaude().reply(claudeMessage({ ...wineAnswer, listId: 'vins' }));
    const { queue } = analysisOf(server, { fetcher: new FakeFetcher(PAGES), claude });
    server.sync.push([pendingLink('l1', WINE, T0 - 1000, { autoFile: true })]);
    await queue.idle();

    const text = claude.userText();
    expect(text).toContain(`{"id":"vins","title":"Vins","fields":${JSON.stringify(promptFieldLines(WINE_FIELDS).map(line => line.slice(2)))}}`);
    expect(text).toContain('{"id":"films","title":"Films"}');
    expect(text).toContain('A list with fields reads its links with them');
    expect(text).not.toContain('<fields>');
    const fields = linkFields(server, 'l1');
    expect(fields).toMatchObject({ noteId: 'vins', filedBy: 'claude', readWith: templateSignature(WINE_FIELDS) });
    expect(fields.attributes).toHaveLength(8);
  });

  it('reads one filed by kind with its kind’s fields', async () => {
    pushShelves();
    const claude = new FakeClaude().reply(claudeMessage({ ...recipeAnswer, listId: 'films' }));
    const { queue } = analysisOf(server, { fetcher: new FakeFetcher(PAGES), claude });
    server.sync.push([pendingLink('l1', RECIPE, T0 - 1000, { autoFile: true })]);
    await queue.idle();
    expect(linkFields(server, 'l1')).toMatchObject({ noteId: 'films', readWith: 'preset' });
  });
});

describe('the readings kept', () => {
  it('answer a link only when it was read with the template the link would be read with now', async () => {
    pushShelves();
    const claude = new FakeClaude().reply(claudeMessage(wineAnswer), claudeMessage(wineAnswer), claudeMessage(wineAnswer));
    const fetcher = new FakeFetcher(PAGES);
    const { queue } = analysisOf(server, { fetcher, claude });
    server.sync.push([pendingLink('l1', WINE, T0 - 5000, { noteId: 'vins' })]);
    await queue.idle();
    expect(claude.requests).toHaveLength(1);

    // « Films » reads by kind: the page is read again, with the presets.
    server.sync.push([pendingLink('l2', WINE, T0 - 4000, { noteId: 'films' })]);
    await queue.idle();
    expect(claude.requests).toHaveLength(2);
    expect(linkFields(server, 'l2').readWith).toBe('preset');

    // « Caves » takes « Vin » too: the first reading serves, its version with it.
    server.sync.push([rec('note', 'caves', { templateId: 't-vin' }, T0 - 3500, 'web001'), pendingLink('l3', WINE, T0 - 3000, { noteId: 'caves' })]);
    await queue.idle();
    expect(claude.requests).toHaveLength(2);
    expect(linkFields(server, 'l3')).toMatchObject({ status: 'ready', readWith: templateSignature(WINE_FIELDS), attributes: linkFields(server, 'l1').attributes });

    // « Vin » changed: a reading made with its older version is never served for it.
    const changed = WINE_FIELDS.slice(0, 3);
    pushTemplate('t-vin', 'Vin', null, changed, T0 - 2500);
    server.sync.push([pendingLink('l4', WINE, T0 - 2000, { noteId: 'vins' })]);
    await queue.idle();
    expect(claude.requests).toHaveLength(3);
    expect(linkFields(server, 'l4')).toMatchObject({ readWith: templateSignature(changed), attributes: [
      { label: 'Domaine', value: 'Château Lumière' },
      { label: 'Millésime', value: '2018' },
      { label: 'Cépages', value: 'Merlot, cabernet sauvignon' },
    ] });
  });

  it('serve a reading kept before templates as one read with the presets', async () => {
    server.usage.record('read', {
      linkId: 'old',
      url: RECIPE,
      usage: null,
      ok: true,
      error: null,
      durationMs: 1,
      result: { title: 'Tarte', summary: '', kind: 'recipe', price: null, currency: null, attributes: [], siteName: 'Cuisine', imageUrl: null, imageUrls: [], imageIds: [], listTitle: null, lang: 'fr' },
    });
    const claude = new FakeClaude().reply(claudeMessage(recipeAnswer));
    const { queue } = analysisOf(server, { fetcher: new FakeFetcher(PAGES), claude });
    server.sync.push([pendingLink('l1', RECIPE, T0 - 1000)]);
    await queue.idle();
    expect(claude.requests).toHaveLength(0);
    expect(linkFields(server, 'l1')).toMatchObject({ title: 'Tarte', readWith: 'preset' });

    // Once the recipe's template is changed, it no longer serves.
    pushTemplate(kindTemplateId('recipe'), '', 'recipe', RECIPE_FIELDS);
    server.sync.push([pendingLink('l2', RECIPE, T0 - 500)]);
    await queue.idle();
    expect(claude.requests).toHaveLength(1);
  });
});

describe('POST /api/notes/template-try', () => {
  const FIELDS = WINE_FIELDS.slice(0, 4);

  async function post(body: unknown, on: TestServer = server) {
    const response = await on.app.request(TEMPLATE_TRY_PATH, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  }

  function serverWith(fetcher: FakeFetcher, options: Parameters<typeof createTestServer>[0] = {}): TestServer {
    server.close();
    server = createTestServer({ fetcher, ...options });
    return server;
  }

  it('reads the page with the fields given, answers by field id with its cost, and writes nothing', async () => {
    const fetcher = new FakeFetcher(PAGES);
    serverWith(fetcher);
    server.claude.reply(claudeMessage(wineAnswer));
    const before = server.records.maxSeq();
    const { status, body } = await post({ url: WINE, lang: 'fr', fields: FIELDS });

    expect(status).toBe(200);
    expect(body).toEqual({
      title: 'Château Lumière 2018',
      values: { domaine: 'Château Lumière', millesime: '2018', cepages: 'Merlot, cabernet sauvignon', region: 'Médoc' },
      costUsd: (3000 * 4 + 500 * 20 + 1500 * 0.2) / 1e6,
    });
    expect(server.records.maxSeq()).toBe(before);
    const text = server.claude.userText();
    expect(text).toContain(`<fields>\n${promptFieldLines(FIELDS).join('\n')}\n</fields>`);
    expect(text).toContain('Filing is not asked for');
    expect(server.claude.requests[0]!.system).toEqual(buildRequest({ url: WINE, digest: '', lists: null, lang: 'fr', webFetch: null, image: null, imageCount: 0 }, 'claude-opus-5-5', 'low').system);
    // Billed within the month's spending, not counted as a link read.
    expect(server.db.prepare('SELECT task, ok FROM analyses').all()).toEqual([{ task: 'template', ok: 1 }]);
    const usage = (await (await server.app.request('/api/usage', { headers: AUTH })).json()) as { monthToDate: { analyses: number; costUsd: number } };
    expect(usage.monthToDate.analyses).toBe(0);
    expect(usage.monthToDate.costUsd).toBeGreaterThan(0);
  });

  it('answers the same try again for nothing, and reads the page once for a few minutes', async () => {
    const fetcher = new FakeFetcher(PAGES);
    serverWith(fetcher);
    server.claude.reply(claudeMessage(wineAnswer), claudeMessage(wineAnswer));
    const first = await post({ url: WINE, lang: 'fr', fields: FIELDS });
    const fetches = fetcher.calls.length;
    const again = await post({ url: `${WINE}?utm_source=x`, lang: 'fr', fields: FIELDS.map(each => ({ ...each, id: `${each.id}2` })) });
    expect(again.body).toEqual({ title: first.body.title, values: { domaine2: 'Château Lumière', millesime2: '2018', cepages2: 'Merlot, cabernet sauvignon', region2: 'Médoc' }, costUsd: 0 });
    expect(server.claude.requests).toHaveLength(1);

    // Another field: Claude again, the page not fetched again.
    const more = await post({ url: WINE, lang: 'fr', fields: [...FIELDS, field('bio', 'Bio', 'yesno')] });
    expect(more.body.values).toMatchObject({ bio: 'Oui' });
    expect(more.body.costUsd).toBeGreaterThan(0);
    expect(server.claude.requests).toHaveLength(2);
    expect(fetcher.calls.length).toBe(fetches);
    // In English, it is another try.
    server.claude.reply(claudeMessage(wineAnswer));
    server.time.value = T0 + 11 * 60_000;
    await post({ url: WINE, lang: 'en', fields: FIELDS });
    expect(server.claude.requests).toHaveLength(3);
    expect(fetcher.calls.length).toBeGreaterThan(fetches);
  });

  it('answers from a link already read with these very fields, for nothing', async () => {
    serverWith(new FakeFetcher(PAGES));
    pushShelves();
    const { queue } = analysisOf(server, { fetcher: new FakeFetcher(PAGES), claude: new FakeClaude().reply(claudeMessage(wineAnswer)) });
    server.sync.push([pendingLink('l1', WINE, T0 - 1000, { noteId: 'vins' })]);
    await queue.idle();
    const { body } = await post({ url: WINE, lang: 'fr', fields: WINE_FIELDS });
    expect(body).toMatchObject({ title: 'Château Lumière 2018', costUsd: 0, values: { domaine: 'Château Lumière', degre: '13,5 %' } });
    expect(server.claude.requests).toHaveLength(0);
  });

  it('refuses what is not a try, in French', async () => {
    serverWith(new FakeFetcher(PAGES));
    for (const body of ['{', { url: WINE, lang: 'fr', fields: [] }, { url: 'ftp://x.example', lang: 'fr', fields: FIELDS }, { url: WINE, lang: 'de', fields: FIELDS }]) {
      const answer = await post(body);
      expect(answer.status).toBe(400);
    }
    expect((await post({ url: WINE, lang: 'fr', fields: [] })).body).toEqual({ error: 'Invalid template try' });
    expect(server.claude.requests).toHaveLength(0);
  });

  it('says why when Claude cannot read: no key, the budget spent, a page gone', async () => {
    serverWith(new FakeFetcher(PAGES), { envApiKey: null });
    expect(await post({ url: WINE, lang: 'fr', fields: FIELDS })).toEqual({ status: 409, body: { error: 'Claude is not reading links: add a key in Administration.' } });

    const fetcher = new FakeFetcher(PAGES);
    serverWith(fetcher);
    server.settings.update({ budgetUsd: 0 });
    expect(await post({ url: WINE, lang: 'fr', fields: FIELDS })).toEqual({ status: 409, body: { error: 'Monthly budget reached' } });

    server.settings.update({ budgetUsd: 15 });
    const gone = await post({ url: 'https://www.cave-exemple.fr/disparu', lang: 'fr', fields: FIELDS });
    expect(gone.status).toBe(502);
    expect(gone.body.error).toMatch(/^Page introuvable/);
    expect(server.claude.requests).toHaveLength(0);
  });

  it('passes on Claude’s failure, billed, and keeps nothing of it', async () => {
    serverWith(new FakeFetcher(PAGES));
    server.claude.reply(claudeMessage('{"title": 3}'), claudeMessage(wineAnswer));
    const failed = await post({ url: WINE, lang: 'fr', fields: FIELDS });
    expect(failed).toEqual({ status: 502, body: { error: 'Unreadable answer from Claude' } });
    expect((await post({ url: WINE, lang: 'fr', fields: FIELDS })).body.costUsd).toBeGreaterThan(0);
    expect(server.db.prepare('SELECT task, ok FROM analyses ORDER BY id').all()).toEqual([
      { task: 'template', ok: 0 },
      { task: 'template', ok: 1 },
    ]);
  });

  it('asks Claude a few dozen times an hour at most', async () => {
    serverWith(new FakeFetcher(PAGES));
    for (let index = 0; index <= TRIES_PER_HOUR; index++) server.claude.reply(claudeMessage(wineAnswer));
    for (let index = 0; index < TRIES_PER_HOUR; index++) expect((await post({ url: WINE, lang: 'fr', fields: [field('domaine', 'Domaine', 'text', `Essai ${index}`)] })).status).toBe(200);
    expect(await post({ url: WINE, lang: 'fr', fields: [field('domaine', 'Domaine', 'text', 'Encore')] })).toEqual({ status: 409, body: { error: 'Too many tries: try again in a moment.' } });
    // A try kept still answers.
    expect((await post({ url: WINE, lang: 'fr', fields: [field('domaine', 'Domaine', 'text', 'Essai 0')] }))).toMatchObject({ status: 200, body: { costUsd: 0 } });
    server.time.value = T0 + 61 * 60_000;
    expect((await post({ url: WINE, lang: 'fr', fields: [field('domaine', 'Domaine', 'text', 'Encore')] })).status).toBe(200);
  });
});
