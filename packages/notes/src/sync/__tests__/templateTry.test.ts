import type { TemplateField } from '../../models/templates';
import { parseTemplateTryRequest, parseTemplateTryResponse, TEMPLATE_TRY_PATH, triedAttributes } from '../templateTry';

const FIELDS: TemplateField[] = [
  { id: 'domaine', name: 'Domaine', type: 'text', hint: 'Le domaine ou le château' },
  { id: 'millesime', name: 'Millésime', type: 'number', hint: '' },
  { id: 'f3', name: 'Cépages', type: 'list', hint: '' },
];

describe('« Essayer » on a link', () => {
  it('is Carnet’s route', () => {
    expect(TEMPLATE_TRY_PATH).toBe('/api/notes/template-try');
  });

  it('takes a web address, a language and the fields as they stand, checked', () => {
    expect(parseTemplateTryRequest({ url: ' https://cave.example/margaux-2015 ', lang: 'en', fields: FIELDS })).toEqual({ url: 'https://cave.example/margaux-2015', lang: 'en', fields: FIELDS });
    // A field the editor has not named yet is left out; a newer type reads as text.
    const request = parseTemplateTryRequest({ url: 'https://cave.example/a', lang: 'fr', fields: [...FIELDS, { id: 'f4', name: '', type: 'text', hint: '' }, { id: 'f5', name: 'Note', type: 'stars', hint: '' }] });
    expect(request?.fields.map(field => [field.id, field.type])).toEqual([
      ['domaine', 'text'],
      ['millesime', 'number'],
      ['f3', 'list'],
      ['f5', 'text'],
    ]);
  });

  it('refuses what is not a page to read, a language it does not know, no field or too many', () => {
    const base = { url: 'https://cave.example/a', lang: 'fr', fields: FIELDS };
    for (const body of [
      null,
      'https://cave.example/a',
      { ...base, url: 'ftp://cave.example/a' },
      { ...base, url: 'https://cave example/a' },
      { ...base, url: 'javascript:alert(1)' },
      { ...base, url: `https://cave.example/${'a'.repeat(4000)}` },
      { ...base, url: 42 },
      { ...base, lang: 'de' },
      { ...base, fields: [] },
      { ...base, fields: [{ id: 'x', name: '  ', type: 'text', hint: '' }] },
      { ...base, fields: 'Domaine' },
      { ...base, fields: Array.from({ length: 9 }, (_, index) => ({ id: `f${index}`, name: `Champ ${index}`, type: 'text', hint: '' })) },
    ]) {
      expect(parseTemplateTryRequest(body), JSON.stringify(body).slice(0, 80)).toBeNull();
    }
  });

  it('reads the answer: values by field id, trimmed and clipped, an empty one left out, the cost never negative', () => {
    expect(
      parseTemplateTryResponse({
        title: 'Château Margaux 2015',
        values: { domaine: ' Château Margaux ', millesime: '2015', f3: '   ', 'bad id': 'x', other: 4, long: 'v'.repeat(400) },
        costUsd: 0.0041,
      }),
    ).toEqual({ title: 'Château Margaux 2015', values: { domaine: 'Château Margaux', millesime: '2015', long: 'v'.repeat(300) }, costUsd: 0.0041 });
    expect(parseTemplateTryResponse({ title: 'x'.repeat(600), values: {}, costUsd: -1 })).toEqual({ title: 'x'.repeat(500), values: {}, costUsd: 0 });
    expect(parseTemplateTryResponse({ title: 'Margaux', values: {}, costUsd: Number.NaN })?.costUsd).toBe(0);
    expect(parseTemplateTryResponse({ title: 'Margaux', values: null, costUsd: 0 })).toBeNull();
    expect(parseTemplateTryResponse({ values: {}, costUsd: 0 })).toBeNull();
    expect(parseTemplateTryResponse('Margaux')).toBeNull();
  });

  it('shows the values as a link’s facts would: in the fields’ order, labelled with their names', () => {
    expect(triedAttributes(FIELDS, { f3: 'Cabernet sauvignon, merlot', domaine: 'Château Margaux', stray: 'x' })).toEqual([
      { label: 'Domaine', value: 'Château Margaux' },
      { label: 'Cépages', value: 'Cabernet sauvignon, merlot' },
    ]);
    expect(triedAttributes(FIELDS, {})).toEqual([]);
  });
});
