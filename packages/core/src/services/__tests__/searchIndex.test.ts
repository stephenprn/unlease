import { bestPart, buildIndex, highlight, isEmptyQuery, parseQuery, search, snippet, tokenize, type SearchDoc, type SearchPart } from '../searchIndex';

const NOW = Date.UTC(2026, 9, 27, 12);
const DAY = 86_400_000;

function doc(key: string, title: string, parts: readonly (string | SearchPart)[] = [], editedAt = NOW - DAY): SearchDoc<{ kind: string }> {
  return { key, title, parts: parts.map(part => (typeof part === 'string' ? { text: part, role: 'body' as const } : part)), editedAt, meta: { kind: key.split(':')[0]! } };
}

function find(docs: readonly SearchDoc<{ kind: string }>[], text: string, options: Parameters<typeof search<{ kind: string }>>[2] = {}) {
  return search(buildIndex(docs), parseQuery(text), { now: NOW, ...options });
}

const keys = (results: ReturnType<typeof find>): string[] => results.hits.map(hit => hit.doc.key);
const tiers = (results: ReturnType<typeof find>): string[] => results.hits.map(hit => `${hit.tier}:${hit.doc.key}`);

describe('words', () => {
  it('folds case, accents, ligatures and accents typed apart, keeping where each word lies', () => {
    expect(tokenize('Œuvre Élégante').map(token => [token.term, token.start, token.end])).toEqual([
      ['oeuvre', 0, 5],
      ['elegante', 6, 14],
    ]);
    // A decomposed « é » (as a macOS file name has it).
    expect(tokenize('café noir').map(token => token.term)).toEqual(['cafe', 'noir']);
    expect(tokenize('café noir')[1]).toMatchObject({ start: 6, end: 10 });
  });

  it('also reads words joined by a hyphen or an apostrophe as one', () => {
    const tokens = tokenize('un porte-monnaie, aujourd’hui');
    expect(tokens.filter(token => !token.joined).map(token => token.term)).toEqual(['un', 'porte', 'monnaie', 'aujourd', 'hui']);
    expect(tokens.filter(token => token.joined).map(token => [token.term, token.start, token.end])).toEqual([
      ['portemonnaie', 3, 16],
      ['aujourdhui', 18, 29],
    ]);
  });
});

describe('queries', () => {
  it('reads words, the one being typed, small words, "phrases" and exclusions', () => {
    const query = parseQuery('recette de "pâte brisée" -sucre tar');
    expect(query.words.map(word => [word.term, word.open, word.optional, word.exact])).toEqual([
      ['recette', false, false, false],
      ['de', false, true, false],
      ['pate', false, false, true],
      ['brisee', false, false, true],
      ['tar', true, false, false],
    ]);
    expect(query.phrases).toEqual([{ terms: ['pate', 'brisee'], open: false }]);
    expect(query.excluded).toEqual(['sucre']);
    expect(parseQuery('tarte ').words[0]!.open).toBe(false);
  });

  it('keeps small words when the query has nothing else, and grows a quote still open', () => {
    expect(parseQuery('le la').words.map(word => word.optional)).toEqual([false, false]);
    const open = parseQuery('« rue de la pa');
    expect(open.phrases).toEqual([{ terms: ['rue', 'de', 'la', 'pa'], open: true }]);
    expect(open.words.at(-1)).toMatchObject({ term: 'pa', open: true, exact: false });
    expect(isEmptyQuery(parseQuery('  '))).toBe(true);
    expect(isEmptyQuery(parseQuery('-sucre'))).toBe(false);
  });
});

describe('search', () => {
  const library = [
    doc('page:lisbonne', 'Lisbonne', ['Le meilleur restaurant de la ville, près du Tage.', 'Musée des azulejos']),
    doc('note:courses', 'Courses', ['Pain, beurre, lait', 'Pastéis de Lisbonne pour Marie']),
    doc('note:voyage', 'Voyage au Portugal', ['Une semaine à Lisbonne puis Porto']),
    doc('page:recettes', 'Recettes', ['Tarte aux pommes']),
    doc('note:cdc', 'Cahier des charges', ['Le projet Carnet']),
    doc('link:time-out', 'Time Out Market', [{ text: 'Restaurants', role: 'meta' }, 'Halle gourmande sur le quai, à Lisbonne']),
  ];

  it('puts the titles first, then the content, each best first', () => {
    const results = find(library, 'lisbonne');
    expect(tiers(results)[0]).toBe('title:page:lisbonne');
    expect(tiers(results).slice(1).sort()).toEqual(['content:link:time-out', 'content:note:courses', 'content:note:voyage']);
    // The shortest text holding the word comes first.
    expect(tiers(results)[1]).toBe('content:note:voyage');
  });

  it('finds a word by its start while it is typed, and a title that starts with it first', () => {
    expect(tiers(find(library, 'lis'))).toEqual(expect.arrayContaining(['title:page:lisbonne']));
    expect(keys(find(library, 'rec'))[0]).toBe('page:recettes');
    // « Voyage au Portugal » holds « portugal » but does not start with it; a title that does would come first.
    const titles = find([...library, doc('note:portugal', 'Portugal, été 2025')], 'portu').hits.filter(hit => hit.tier === 'title');
    expect(titles.map(hit => hit.doc.key)).toEqual(['note:portugal', 'note:voyage']);
  });

  it('finds titles by a short word’s start, but the content only by the whole short word', () => {
    expect(tiers(find(library, 'r'))).toEqual(['title:page:recettes']);
    const short = [doc('note:ia', 'Veille', ['Un outil d’IA', 'Iain Banks']), doc('note:iain', 'Iain Banks')];
    expect(tiers(find(short, 'ia'))).toEqual(['title:note:iain', 'content:note:ia']);
  });

  it('matches every word in any order, ignores small words, and finds the plural and the singular', () => {
    expect(keys(find(library, 'portugal voyage'))).toEqual(['note:voyage']);
    expect(keys(find(library, 'le voyage du portugal'))).toEqual(['note:voyage']);
    expect(keys(find(library, 'recette'))[0]).toBe('page:recettes');
    expect(keys(find([doc('note:a', 'Recette du jour')], 'recettes'))).toEqual(['note:a']);
  });

  it('allows a typo when the words as typed find little, and says so', () => {
    const results = find(library, 'lisbone');
    expect(results.typos).toBe(true);
    expect(results.hits[0]!.doc.key).toBe('page:lisbonne');
    expect(keys(find(library, 'restaurnat'))).toEqual(expect.arrayContaining(['page:lisbonne', 'link:time-out']));
    // A swap of two neighbours is one typo.
    expect(keys(find(library, 'lisbnone'))[0]).toBe('page:lisbonne');
    // A word being typed, with a typo in what is typed so far.
    expect(keys(find(library, 'recrtt'))[0]).toBe('page:recettes');
    expect(keys(find(library, 'reectt'))[0]).toBe('page:recettes');
    expect(keys(find(library, 'zzcett'))).toEqual([]);
  });

  it('keeps typos out while the words as typed find plenty', () => {
    const many = Array.from({ length: 10 }, (_, at) => doc(`note:pain${at}`, `Pain ${at}`));
    const results = find([...many, doc('note:main', 'Main courante')], 'pain');
    expect(results.typos).toBe(false);
    expect(keys(results)).not.toContain('note:main');
  });

  it('finds a word inside a longer one, but not as a title hit', () => {
    const results = find(library, 'bonne');
    expect(tiers(results).sort()).toEqual(['content:link:time-out', 'content:note:courses', 'content:note:voyage', 'content:page:lisbonne']);
  });

  it('finds a title by its initials', () => {
    expect(tiers(find(library, 'cdc'))).toEqual(['title:note:cdc']);
  });

  it('keeps "words in quotes" together, and leaves out -words', () => {
    const docs = [doc('note:a', 'Adresse', ['12 rue de la Paix']), doc('note:b', 'Paix', ['la rue est calme'])];
    expect(keys(find(docs, 'rue paix'))).toEqual(['note:b', 'note:a']);
    expect(keys(find(docs, '"rue de la paix"'))).toEqual(['note:a']);
    expect(keys(find(docs, '"rue de la pa'))).toEqual(['note:a']);
    expect(keys(find(library, 'lisbonne -musee')).sort()).toEqual(['link:time-out', 'note:courses', 'note:voyage']);
    expect(keys(find(library, 'lisbonne -pastei'))).not.toContain('note:courses');
  });

  it('when nothing holds every word, brings back what holds the most, saying what it lacks', () => {
    const results = find(library, 'Lisbonne Zanzibar');
    expect(results.hits.every(hit => hit.tier === 'partial')).toBe(true);
    expect(results.hits[0]).toMatchObject({ missing: ['Zanzibar'] });
    expect(keys(results)[0]).toBe('page:lisbonne');
  });

  it('ranks words side by side above words far apart', () => {
    const docs = [
      doc('note:far', 'Notes', ['Tarte', 'divers', 'et encore', 'aux pommes']),
      doc('note:near', 'Idées', ['une tarte aux pommes']),
    ];
    expect(keys(find(docs, 'tarte pommes'))).toEqual(['note:near', 'note:far']);
  });

  it('weighs a heading above the body, and a short text above a long one', () => {
    const docs = [doc('note:body', 'Un', ['jardin']), doc('note:head', 'Deux', [{ text: 'Jardin', role: 'heading' }])];
    expect(keys(find(docs, 'jardin'))).toEqual(['note:head', 'note:body']);
    const long = doc('note:long', 'Long', [`jardin ${'mot '.repeat(400)}`]);
    expect(keys(find([long, doc('note:short', 'Court', ['jardin fleuri'])], 'jardin'))).toEqual(['note:short', 'note:long']);
  });

  it('filters, lifts what the caller boosts within its tier, and sorts by date on demand', () => {
    expect(keys(find(library, 'lisbonne', { filter: entry => entry.meta.kind === 'note' }))).toEqual(['note:voyage', 'note:courses']);
    expect(keys(find(library, 'lisbonne', { boost: entry => (entry.key === 'note:courses' ? 1 : 0) })).slice(0, 2)).toEqual(['page:lisbonne', 'note:courses']);
    const dated = [doc('note:old', 'Jardin', [], NOW - 30 * DAY), doc('note:new', 'Jardin potager', [], NOW)];
    expect(keys(find(dated, 'jardin'))).toEqual(['note:old', 'note:new']);
    expect(keys(find(dated, 'jardin', { byDate: true }))).toEqual(['note:new', 'note:old']);
  });

  it('finds nothing in an empty query, and everything but the excluded with only exclusions', () => {
    expect(find(library, '').hits).toEqual([]);
    expect(keys(find(library, '-lisbonne'))).toEqual(['page:recettes', 'note:cdc']);
  });

  it('keeps the entry of a document whose words did not change', () => {
    const first = buildIndex(library);
    const moved = library.map(entry => (entry.key === 'note:cdc' ? { ...entry, meta: { kind: 'note' }, editedAt: NOW } : entry));
    const second = buildIndex(moved, first);
    expect(second.entries[4]).not.toBe(first.entries[4]);
    expect(second.entries[4]!.weights).toBe(first.entries[4]!.weights);
    expect(second.entries[4]!.doc).toBe(moved[4]);
    expect(second.entries[0]).toBe(first.entries[0]);
    const edited = buildIndex(library.map(entry => (entry.key === 'note:cdc' ? doc('note:cdc', 'Cahier des charges', ['Un autre projet']) : entry)), first);
    expect(edited.entries[4]!.weights).not.toBe(first.entries[4]!.weights);
  });
});

describe('showing the matches', () => {
  it('marks whole words, a word’s start where only its start was typed, over the text as written', () => {
    const { matcher } = find([doc('note:a', 'Œuvres complètes', ['Lisbonne'])], 'oeuv complete');
    // « oeuv » covers « Œu » and the « v »; « complete », typed, is the start of « complètes ».
    expect(highlight('Œuvres complètes', matcher)).toEqual([
      [0, 3],
      [7, 15],
    ]);
    const typo = find([doc('note:a', 'Lisbonne')], 'lisbone');
    expect(highlight('à Lisbonne.', typo.matcher)).toEqual([[2, 10]]);
  });

  it('marks words read as one whole, unless one of them matched alone', () => {
    const joined = find([doc('note:a', 'Mon porte-monnaie')], 'portemon');
    expect(highlight('Mon porte-monnaie', joined.matcher)).toEqual([[4, 17]]);
    const alone = find([doc('note:a', 'Mon porte-monnaie')], 'porte');
    expect(highlight('Mon porte-monnaie', alone.matcher)).toEqual([[4, 9]]);
  });

  it('picks the part holding the most query words, and cuts a snippet around them', () => {
    const page = doc('page:a', 'Voyage', ['Préparer les valises', 'Réserver le restaurant à Lisbonne', 'Lisbonne en mai']);
    const results = find([page], 'restaurant lisbonne');
    expect(bestPart(page, results.matcher)?.text).toBe('Réserver le restaurant à Lisbonne');
    const long = `${'Un mot. '.repeat(30)}Le restaurant favori à Lisbonne est fermé le lundi. ${'Encore. '.repeat(30)}`;
    const cut = snippet(long, results.matcher, 100);
    expect(cut.text.startsWith('…')).toBe(true);
    expect(cut.text.endsWith('…')).toBe(true);
    expect(cut.text).toContain('restaurant favori à Lisbonne');
    expect(cut.ranges.map(([from, to]) => cut.text.slice(from, to))).toEqual(['restaurant', 'Lisbonne']);
    expect(snippet('Court', results.matcher)).toEqual({ text: 'Court', ranges: [] });
  });
});
