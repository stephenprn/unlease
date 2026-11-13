import { setLocale } from '@unlease/core/i18n';
import type { Fields } from '@unlease/core/sync/record';
import { isValidField } from '@unlease/core/sync/schema';
import { FR_TEMPLATES } from '../../i18n/fr/templates';
import { SUGGESTED_COLLECTIONS } from '../../models/collections';
import { INBOX_ID, LINK_KINDS, type LinkItem, type Note } from '../../models/entities';
import { KIND_TEMPLATES, TEMPLATE_FIELD_TYPES, TEMPLATE_LIMITS, type LinkTemplate, type TemplateField } from '../../models/templates';
import { linkFromRecord, linkTemplateFields, linkTemplateFromRecord, noteFromRecord } from '../../sync/entities';
import {
  changedKindTemplate,
  collectionsOfTemplate,
  collectionTemplate,
  hasProblems,
  isTemplateFields,
  kindFields,
  kindOfTemplateId,
  kindTemplateId,
  linkFields,
  linksOfTemplate,
  linksReadBefore,
  linkTemplateSource,
  newFieldId,
  parseTemplateFields,
  presetFields,
  presetNames,
  promptFieldLines,
  readingSignature,
  sameFields,
  shownFieldType,
  startingFacts,
  starterFacts,
  starterTemplateId,
  suggestedFields,
  templateProblems,
  templateSignature,
  type Templates,
} from '../templates';

afterEach(() => setLocale('fr'));

const line = (id: string, fields: Fields = {}): Note => noteFromRecord({ type: 'note', id, fields: { kind: 'links', title: id, position: 'a0', ...fields }, clocks: {} });
const link = (id: string, fields: Fields = {}): LinkItem =>
  linkFromRecord({ type: 'link', id, fields: { noteId: 'vins', url: `https://exemple.fr/${id}`, status: 'ready', kind: 'other', createdAt: 1, deletedAt: null, ...fields }, clocks: {} });
const byId = <T extends { id: string }>(items: readonly T[]): Record<string, T> => Object.fromEntries(items.map(item => [item.id, item]));

const field = (id: string, name: string, extra: Partial<TemplateField> = {}): TemplateField => ({ id, name, type: 'text', hint: '', ...extra });
const template = (id: string, extra: Partial<LinkTemplate> = {}): LinkTemplate => ({ id, name: '', kind: null, fields: [], createdAt: 1, deletedAt: null, ...extra });

const VIN = template('t-vin', {
  name: 'Vin',
  fields: [field('domaine', 'Domaine', { hint: 'Le domaine ou le château' }), field('millesime', 'Millésime', { type: 'number' }), field('cepages', 'Cépages', { type: 'list' })],
});
const RECIPE = template(kindTemplateId('recipe'), { kind: 'recipe', fields: [...presetFields('recipe'), field('vegetarien', 'Végétarien', { type: 'yesno' })] });

describe('the kinds’ templates', () => {
  it('keep a changed kind under a fixed id, and read it back', () => {
    expect(kindTemplateId('recipe')).toBe('template-recipe');
    for (const kind of LINK_KINDS) expect(kindOfTemplateId(kindTemplateId(kind))).toBe(kind);
    expect(kindOfTemplateId('template-nothing')).toBeNull();
    expect(kindOfTemplateId('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')).toBeNull();
  });

  it('give every kind but « other » its preset, with ids unique within it', () => {
    for (const kind of LINK_KINDS) {
      const ids = KIND_TEMPLATES[kind].map(each => each.id);
      expect(new Set(ids).size, kind).toBe(ids.length);
      expect(ids.length, kind).toBeLessThanOrEqual(TEMPLATE_LIMITS.fields);
      expect(ids.length > 0, kind).toBe(kind !== 'other');
    }
    // The ids are what a stored field may use.
    expect(isTemplateFields(LINK_KINDS.flatMap(kind => presetFields(kind)).slice(0, TEMPLATE_LIMITS.fields))).toBe(true);
  });

  it('show a preset in the interface’s language, a contextual name read through its context', () => {
    expect(presetFields('film').map(each => each.name)).toEqual(['Réalisateur', 'Année', 'Durée', 'Genre', 'Note']);
    setLocale('en');
    expect(presetFields('film').map(each => each.name)).toEqual(['Director', 'Year', 'Length', 'Genre', 'Rating']);
    expect(presetFields('event')[1]).toEqual({ id: 'venue', name: 'Venue', type: 'text', hint: 'The venue or the address' });
  });

  it('name each preset in French and English for the prompt, whatever the interface’s language', () => {
    const rating = KIND_TEMPLATES.film.find(each => each.id === 'rating')!;
    expect(presetNames(rating)).toEqual({ fr: 'Note', en: 'Rating' });
    setLocale('en');
    expect(presetNames(KIND_TEMPLATES.product[0]!)).toEqual({ fr: 'Marque', en: 'Brand' });
    // Every preset has its English: the prompt never lists « Marque / Marque » by mistake.
    for (const kind of LINK_KINDS) {
      for (const preset of KIND_TEMPLATES[kind]) {
        expect(Object.hasOwn(FR_TEMPLATES, preset.name), preset.name).toBe(true);
        expect(Object.hasOwn(FR_TEMPLATES, preset.hint), preset.hint).toBe(true);
      }
    }
  });

  it('name the types and the shape of their values', () => {
    expect(shownFieldType('duration')).toEqual({ name: 'Durée', hint: 'Un temps : 1 h 30' });
    setLocale('en');
    expect(TEMPLATE_FIELD_TYPES.map(type => shownFieldType(type).name)).toEqual(['Text', 'Number', 'Date', 'Length', 'List', 'Yes or no']);
  });
});

describe('stored fields', () => {
  it('read each field checked: the first of two ids or names kept, an unknown type as text, at most eight', () => {
    const parsed = parseTemplateFields([
      { id: 'a', name: '  Domaine ', type: 'text', hint: ' Le château ' },
      { id: 'a', name: 'Autre', type: 'text', hint: '' },
      { id: 'b', name: 'DOMAINE', type: 'text', hint: '' },
      { id: 'c', name: 'Région', type: 'colour', hint: 3 },
      { id: 'bad id', name: 'Accords', type: 'text', hint: '' },
      { id: 'd', name: '   ', type: 'text', hint: '' },
      'nothing',
      null,
      ...Array.from({ length: 10 }, (_, index) => ({ id: `x${index}`, name: `Champ ${index}`, type: 'number', hint: '' })),
    ]);
    expect(parsed.slice(0, 2)).toEqual([
      { id: 'a', name: 'Domaine', type: 'text', hint: 'Le château' },
      { id: 'c', name: 'Région', type: 'text', hint: '' },
    ]);
    expect(parsed).toHaveLength(TEMPLATE_LIMITS.fields);
    expect(parseTemplateFields('fields')).toEqual([]);
    expect(parseTemplateFields([{ id: 'a', name: 'x'.repeat(80), type: 'text', hint: 'y'.repeat(300) }])[0]).toMatchObject({ name: 'x'.repeat(40), hint: 'y'.repeat(200) });
  });

  it('pass the sync’s check only as what the parse keeps whole, a newer client’s type included', () => {
    expect(isTemplateFields([])).toBe(true);
    expect(isTemplateFields(VIN.fields)).toBe(true);
    expect(isTemplateFields([{ id: 'a', name: 'Note', type: 'stars', hint: '' }])).toBe(true);
    expect(isTemplateFields([{ id: 'a', name: 'x'.repeat(41), type: 'text', hint: '' }])).toBe(false);
    expect(isTemplateFields([{ id: 'a', name: 'Note', type: 'text', hint: 'y'.repeat(201) }])).toBe(false);
    expect(isTemplateFields([{ id: 'a-b', name: 'Note', type: 'text', hint: '' }])).toBe(false);
    expect(isTemplateFields([{ id: 'a', name: 'Note', type: 'Text', hint: '' }])).toBe(false);
    expect(isTemplateFields(Array.from({ length: 9 }, (_, index) => field(`f${index}`, `Champ ${index}`)))).toBe(false);
    expect(isTemplateFields({ 0: field('a', 'A') })).toBe(false);
  });

  it('go through the sync whole, a template as one write', () => {
    const fields = linkTemplateFields(VIN);
    for (const [name, value] of Object.entries(fields)) expect(isValidField('linkTemplate', name, value), name).toBe(true);
    expect(linkTemplateFromRecord({ type: 'linkTemplate', id: VIN.id, fields, clocks: {} })).toEqual(VIN);
    expect(linkTemplateFromRecord({ type: 'linkTemplate', id: RECIPE.id, fields: linkTemplateFields(RECIPE), clocks: {} }).kind).toBe('recipe');
    expect(linkTemplateFromRecord({ type: 'linkTemplate', id: 'x', fields: { kind: 'plant', fields: 'none' }, clocks: {} })).toMatchObject({ kind: null, fields: [], name: '' });
  });

  it('give a new field an id no other has', () => {
    expect(newFieldId([])).toBe('f1');
    expect(newFieldId([field('f2', 'A'), field('f3', 'B')])).toBe('f4');
    expect(newFieldId([field('f1', 'A'), field('year', 'B')])).toBe('f3');
  });
});

describe('where a link’s fields come from', () => {
  const notes = byId([line(INBOX_ID, { templateId: VIN.id }), line('vins', { templateId: VIN.id }), line('recettes'), line('caves', { templateId: 'gone' }), line('mixte', { templateId: RECIPE.id })]);
  const templates: Templates = byId([VIN, RECIPE]);

  it('is the collection’s own template first, never « Non classé »’s, nor a kind’s or a deleted one', () => {
    expect(collectionTemplate(templates, notes.vins)).toBe(VIN);
    expect(collectionTemplate(templates, notes.recettes)).toBeNull();
    expect(collectionTemplate(templates, notes.caves)).toBeNull();
    expect(collectionTemplate(templates, notes.mixte)).toBeNull();
    expect(collectionTemplate({ ...templates, [VIN.id]: { ...VIN, deletedAt: 5 } }, notes.vins)).toBeNull();
    expect(collectionTemplate(templates, undefined)).toBeNull();

    expect(linkTemplateSource(templates, link('a', { noteId: 'vins', kind: 'product' }), notes)).toEqual({ from: 'collection', template: VIN });
    expect(linkTemplateSource(templates, link('b', { noteId: INBOX_ID, kind: 'recipe' }), notes)).toEqual({ from: 'kind', kind: 'recipe', template: RECIPE });
    expect(linkTemplateSource(templates, link('c', { noteId: 'recettes', kind: 'film' }), notes)).toEqual({ from: 'kind', kind: 'film', template: null });
  });

  it('is the kind’s changed template, else its preset', () => {
    expect(changedKindTemplate(templates, 'recipe')).toBe(RECIPE);
    expect(changedKindTemplate({ ...templates, [RECIPE.id]: { ...RECIPE, deletedAt: 9 } }, 'recipe')).toBeNull();
    expect(kindFields(templates, 'recipe')).toBe(RECIPE.fields);
    expect(kindFields({}, 'recipe')).toEqual(presetFields('recipe'));
    expect(kindFields({}, 'other')).toEqual([]);
    expect(linkFields(templates, link('a', { noteId: 'vins', kind: 'recipe' }), notes)).toBe(VIN.fields);
    expect(linkFields(templates, link('b', { noteId: 'recettes', kind: 'recipe' }), notes)).toBe(RECIPE.fields);
    expect(linkFields(templates, link('c', { noteId: 'recettes', kind: 'book' }), notes)).toEqual(presetFields('book'));
  });
});

describe('a template’s version', () => {
  it('signs what Claude is asked: names, types and hints in order, never the ids; a preset signs « preset »', () => {
    const signature = templateSignature(VIN.fields);
    expect(signature).toMatch(/^t[0-9a-z]{1,7}$/);
    expect(signature.length).toBeLessThanOrEqual(40);
    expect(templateSignature(VIN.fields.map(each => ({ ...each, id: `${each.id}2` })))).toBe(signature);
    expect(templateSignature([...VIN.fields].reverse())).not.toBe(signature);
    expect(templateSignature(VIN.fields.map((each, index) => (index === 0 ? { ...each, hint: 'Le château' } : each)))).not.toBe(signature);
    expect(templateSignature(VIN.fields.map((each, index) => (index === 1 ? { ...each, type: 'text' as const } : each)))).not.toBe(signature);
    expect(templateSignature(null)).toBe('preset');
    expect(templateSignature([])).not.toBe('preset');
  });

  it('is the one a link read now would carry', () => {
    expect(readingSignature({ from: 'collection', template: VIN })).toBe(templateSignature(VIN.fields));
    expect(readingSignature({ from: 'kind', kind: 'recipe', template: RECIPE })).toBe(templateSignature(RECIPE.fields));
    expect(readingSignature({ from: 'kind', kind: 'film', template: null })).toBe('preset');
  });
});

describe('a template’s links and collections', () => {
  const notes = byId([line(INBOX_ID), line('vins', { templateId: VIN.id, position: 'a2' }), line('caves', { templateId: VIN.id, position: 'a1' }), line('recettes'), line('jetee', { templateId: VIN.id, trashedAt: 3 }), line('note', { kind: 'text', templateId: VIN.id })]);
  const templates: Templates = byId([VIN, RECIPE]);
  const vin = templateSignature(VIN.fields);
  const recipe = templateSignature(RECIPE.fields);
  const links = [
    link('fresh', { noteId: 'vins', readWith: vin }),
    link('old', { noteId: 'caves', readWith: 'tolder' }),
    link('never', { noteId: 'vins' }),
    link('waiting', { noteId: 'vins', status: 'pending' }),
    link('binned', { noteId: 'jetee' }),
    link('deleted', { noteId: 'vins', deletedAt: 4 }),
    link('tarte', { noteId: 'recettes', kind: 'recipe', readWith: recipe }),
    link('soupe', { noteId: INBOX_ID, kind: 'recipe' }),
    link('film', { noteId: 'recettes', kind: 'film' }),
    // In a collection with a template: not the recipe kind's.
    link('cru', { noteId: 'vins', kind: 'recipe', readWith: vin }),
  ];

  it('are the live links it reads, and those read with another version', () => {
    expect(linksOfTemplate(VIN, links, notes, templates).map(each => each.id)).toEqual(['fresh', 'old', 'never', 'waiting', 'cru']);
    expect(linksReadBefore(VIN, links, notes, templates).map(each => each.id)).toEqual(['old', 'never']);
    expect(linksOfTemplate(RECIPE, links, notes, templates).map(each => each.id)).toEqual(['tarte', 'soupe']);
    expect(linksReadBefore(RECIPE, links, notes, templates).map(each => each.id)).toEqual(['soupe']);
    // A kind never changed: what was read before templates was read with its preset.
    const film = { id: kindTemplateId('film'), kind: 'film' as const };
    expect(linksReadBefore(film, links, notes, templates)).toEqual([]);
    expect(linksReadBefore(film, [link('lu', { noteId: 'recettes', kind: 'film', readWith: recipe })], notes, templates).map(each => each.id)).toEqual(['lu']);
  });

  it('are the live links collections that picked it, by their place on the board', () => {
    expect(collectionsOfTemplate(VIN.id, notes).map(note => note.id)).toEqual(['caves', 'vins']);
    expect(collectionsOfTemplate('nothing', notes)).toEqual([]);
  });
});

describe('a template being shaped', () => {
  it('needs a name of its own (a kind’s needs none) and fields named once each', () => {
    const others = [VIN, template('t-plante', { name: 'Plante', deletedAt: 5 }), RECIPE];
    expect(templateProblems({ name: ' ', kind: null, fields: [] }, others)).toEqual({ name: 'Donnez-lui un nom.', fields: {} });
    expect(templateProblems({ name: ' vin', kind: null, fields: [] }, others).name).toBe('Un modèle porte déjà ce nom.');
    // A deleted one leaves its name, and the template being edited does not clash with itself.
    expect(hasProblems(templateProblems({ name: 'Plante', kind: null, fields: [] }, others))).toBe(false);
    expect(hasProblems(templateProblems({ id: VIN.id, name: 'Vin', kind: null, fields: VIN.fields }, others))).toBe(false);
    expect(templateProblems({ name: '', kind: 'recipe', fields: RECIPE.fields }, others).name).toBeNull();

    const problems = templateProblems({ name: 'Bière', kind: null, fields: [field('a', 'Brasserie'), field('b', ''), field('c', 'brasserie'), field('d', 'Style')] }, others);
    expect(problems).toEqual({ name: null, fields: { b: 'Nommez cette information.', c: 'Une autre information porte ce nom.' } });
    expect(hasProblems(problems)).toBe(true);
    setLocale('en');
    expect(templateProblems({ name: '', kind: null, fields: [] }, []).name).toBe('Give it a name.');
  });

  it('is offered the presets’ fields once each, less those it has, with ids it does not use', () => {
    const all = suggestedFields([]);
    expect(all[0]).toEqual({ id: 'brand', name: 'Marque', type: 'text', hint: 'La marque ou le fabricant' });
    expect(new Set(all.map(each => each.name)).size).toBe(all.length);
    expect(new Set(all.map(each => each.id)).size).toBe(all.length);
    expect(all.filter(each => each.name === 'Année')).toHaveLength(1);

    // « Année » renamed « Millésime » keeps the id `year`: « Année » is offered again under another id.
    const current = [field('year', 'Millésime', { type: 'number' }), field('f2', 'Marque')];
    const offered = suggestedFields(current);
    expect(offered.map(each => each.name)).not.toContain('Marque');
    const year = offered.find(each => each.name === 'Année')!;
    expect(year.id).not.toBe('year');
    expect(parseTemplateFields([...current, ...offered.slice(0, 6)])).toHaveLength(TEMPLATE_LIMITS.fields);
    expect(new Set([...current, ...offered].map(each => each.id)).size).toBe(current.length + offered.length);
  });

  it('tells a kind’s template set back to its preset', () => {
    expect(sameFields(presetFields('recipe'), presetFields('recipe').map(each => ({ ...each, id: `x${each.id}` })))).toBe(true);
    expect(sameFields(RECIPE.fields, presetFields('recipe'))).toBe(false);
    expect(sameFields(presetFields('recipe'), presetFields('recipe').map((each, index) => (index === 0 ? { ...each, hint: '' } : each)))).toBe(false);
  });
});

describe('the fields Claude reads', () => {
  it('are one line each: the name as the label, the type’s shape in English, the person’s hint', () => {
    expect(promptFieldLines(VIN.fields)).toEqual([
      '- Domaine (a few words): Le domaine ou le château',
      '- Millésime (a number, with its unit when it has one)',
      '- Cépages (several values separated by commas)',
    ]);
    expect(promptFieldLines([field('a', 'Accords', { type: 'yesno', hint: 'Avec quoi\n  le boire,\nsi la page le dit' })])).toEqual(['- Accords (yes or no, in the message’s language): Avec quoi le boire, si la page le dit']);
    expect(promptFieldLines([])).toEqual([]);
  });
});

describe('the starter collections’ own facts', () => {
  const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

  it('give every starter a list it can keep: within the limits, ids and names once each, known types', () => {
    for (const starter of SUGGESTED_COLLECTIONS) {
      const facts = starter.facts;
      expect(facts.length > 0, starter.id).toBe(true);
      expect(facts.length, starter.id).toBeLessThanOrEqual(TEMPLATE_LIMITS.fields);
      expect(new Set(facts.map(each => each.id)).size, starter.id).toBe(facts.length);
      expect(new Set(facts.map(each => fold(each.name))).size, starter.id).toBe(facts.length);
      for (const fact of facts) expect(TEMPLATE_FIELD_TYPES, fact.id).toContain(fact.type);
      // What the sync keeps, whole, in either language.
      expect(isTemplateFields(starterFacts(starter.id)), starter.id).toBe(true);
      expect(parseTemplateFields(starterFacts(starter.id))).toEqual(starterFacts(starter.id));
      setLocale('en');
      expect(isTemplateFields(starterFacts(starter.id)), starter.id).toBe(true);
      setLocale('fr');
    }
  });

  it('reuse a kind’s words where they share its id, so facts already read keep matching', () => {
    const kinds = new Map(LINK_KINDS.flatMap(kind => KIND_TEMPLATES[kind]).map(preset => [preset.id, preset.name] as const));
    for (const starter of SUGGESTED_COLLECTIONS) {
      for (const fact of starter.facts) if (kinds.has(fact.id)) expect(fact.name, `${starter.id} ${fact.id}`).toBe(kinds.get(fact.id));
    }
  });

  it('have every name and hint in English', () => {
    for (const starter of SUGGESTED_COLLECTIONS) {
      for (const fact of starter.facts) {
        expect(Object.hasOwn(FR_TEMPLATES, fact.name), fact.name).toBe(true);
        expect(Object.hasOwn(FR_TEMPLATES, fact.hint), fact.hint).toBe(true);
      }
    }
    expect(starterFacts('line-restos')!.slice(0, 2).map(each => each.name)).toEqual(['Cuisine', 'Quartier']);
    setLocale('en');
    expect(starterFacts('line-restos')!.slice(0, 2)).toEqual([
      { id: 'cuisine', name: 'Cuisine', type: 'text', hint: 'The kind of food' },
      { id: 'neighbourhood', name: 'Neighbourhood', type: 'text', hint: 'The neighbourhood and the city' },
    ]);
    expect(starterFacts('line-films')!.find(each => each.id === 'rating')!.name).toBe('Rating');
  });

  it('are kept under a fixed id of their own, never a kind’s, and only a starter has them', () => {
    expect(starterTemplateId('line-restos')).toBe('facts-line-restos');
    for (const starter of SUGGESTED_COLLECTIONS) {
      expect(isValidField('note', 'templateId', starterTemplateId(starter.id))).toBe(true);
      expect(kindOfTemplateId(starterTemplateId(starter.id))).toBeNull();
    }
    expect(starterFacts('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')).toBeNull();
    expect(starterFacts(INBOX_ID)).toBeNull();
  });

  it('are what a starter’s own list starts from, whatever its links; any other collection starts from its kind’s', () => {
    expect(startingFacts({}, ['product'], 'line-voyages')).toEqual(starterFacts('line-voyages'));
    expect(startingFacts({}, ['film'], 'vins')).toEqual(presetFields('film'));
    expect(startingFacts({}, [])).toEqual([]);
  });
});
