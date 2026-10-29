import { parseAskRequest, parseAskResponse } from '../../sync/ask';
import { parseCoverageResponse } from '../../sync/coverage';
import { parseSeerrResponse } from '../../sync/seerr';
import { parseRatingsResponse, parseRecapRequest, parseRecapResponse } from '../../sync/works';
import { ratingShare, ratingSource, ratingValue, recapStopWords } from '../works';

const brief = { id: 'l1', url: 'https://series.example/station-nord', title: 'Station Nord', site: 'Séries', kind: 'series', price: null, currency: null, facts: [], summary: 'Polar arctique.' };

describe('the works modules’ protocols', () => {
  it('asks for a recap up to a real season and episode', () => {
    expect(parseRecapRequest({ link: brief, season: 2, episode: 5, lang: 'en', fresh: true })).toMatchObject({ season: 2, episode: 5, lang: 'en', fresh: true, link: { summary: 'Polar arctique.' } });
    expect(parseRecapRequest({ link: brief, season: 2, episode: null, lang: 'fr' })).toMatchObject({ episode: null, fresh: false });
    expect(parseRecapRequest({ link: brief, season: 0, episode: null, lang: 'fr' })).toBeNull();
    expect(parseRecapRequest({ link: brief, season: 1.5, episode: 2, lang: 'fr' })).toBeNull();
    expect(parseRecapRequest({ link: brief, season: 1, episode: -3, lang: 'fr' })?.episode).toBeNull();
  });

  it('reads a recap’s paragraphs and named characters', () => {
    expect(parseRecapResponse({ recap: ' Un.\n\n\n Deux   mots. ', characters: [{ name: 'Hanna', note: 'Seule.' }, { note: 'Sans nom' }], stop: 'Fin de la saison 1.', searchedAt: 3 })).toEqual({
      recap: 'Un.\n\nDeux mots.',
      characters: [{ name: 'Hanna', note: 'Seule.' }],
      stop: 'Fin de la saison 1.',
      searchedAt: 3,
    });
    expect(parseRecapResponse({ recap: '', characters: [], stop: '', searchedAt: 3 })).toBeNull();
  });

  it('keeps ratings that hold within their scale', () => {
    const answer = parseRatingsResponse({
      work: 'Dune (2021)',
      ratings: [
        { source: 'IMDb', value: 8.04, scale: 10, url: 'https://www.imdb.com/title/tt1160419/' },
        { source: 'Trop', value: 12, scale: 10 },
        { source: 'Zéro', value: 3, scale: 0 },
        { source: 'Rotten Tomatoes', label: 'Critiques', value: 83, scale: 100, url: 'javascript:alert(1)' },
      ],
      searchedAt: 9,
    });
    expect(answer?.ratings).toEqual([
      { source: 'IMDb', label: '', value: 8, scale: 10, count: '', url: 'https://www.imdb.com/title/tt1160419/' },
      { source: 'Rotten Tomatoes', label: 'Critiques', value: 83, scale: 100, count: '', url: null },
    ]);
    expect(ratingValue({ value: 7.6, scale: 10 })).toBe('7,6 / 10');
    expect(ratingShare({ value: 83, scale: 100 })).toBe(0.83);
    expect(ratingSource({ source: 'Rotten Tomatoes', label: 'Public' })).toBe('Rotten Tomatoes · Public');
  });

  it('keeps the outlets that say how they tell the story', () => {
    const answer = parseCoverageResponse({
      story: 'La ville ralentit.',
      outlets: [
        { outlet: 'Le Monde', title: 'Paris ralentit', url: 'https://www.lemonde.fr/a', date: '2026-10-14', angle: 'Les chiffres', adds: '' },
        { outlet: 'Sans angle', angle: '' },
        { outlet: 'BBC', title: 'Slow', url: 'ftp://bbc.example/a', date: '2026-02-30', angle: 'Vu de Londres' },
      ],
      note: '',
      searchedAt: 4,
    });
    expect(answer?.outlets.map(outlet => [outlet.outlet, outlet.url, outlet.date])).toEqual([
      ['Le Monde', 'https://www.lemonde.fr/a', '2026-10-14'],
      ['BBC', null, null],
    ]);
  });

  it('asks a question that says something, and reads its answer’s sources once each', () => {
    expect(parseAskRequest({ link: brief, question: '  Combien de saisons ?  ', web: true, lang: 'fr' })).toMatchObject({ question: 'Combien de saisons ?', web: true });
    expect(parseAskRequest({ link: brief, question: '   ', lang: 'fr' })).toBeNull();
    expect(
      parseAskResponse({
        answer: 'Trois.\n\n\n- Une\n- Deux',
        sources: [{ title: 'A', url: 'https://a.example/' }, { title: 'A bis', url: 'https://a.example/' }, { url: 'https://b.example/x' }, { title: 'Pas une adresse', url: 'mailto:x@y.z' }],
      }),
    ).toEqual({ answer: 'Trois.\n\n- Une\n- Deux', sources: [{ title: 'A', url: 'https://a.example/' }, { title: 'https://b.example/x', url: 'https://b.example/x' }] });
  });

  it('reads Seerr’s answer, its state only when known', () => {
    expect(parseSeerrResponse({ url: 'https://seerr.example/movie/1', status: 'available', title: 'Dune (2021)' })).toEqual({ url: 'https://seerr.example/movie/1', status: 'available', title: 'Dune (2021)' });
    expect(parseSeerrResponse({ url: 'https://seerr.example/search?query=x', status: 'weird' })?.status).toBeNull();
    expect(parseSeerrResponse({ url: 'javascript:alert(1)' })).toBeNull();
    expect(parseSeerrResponse({ url: 'http://seerr:5055/movie/1', status: 'missing' })?.url).toBe('http://seerr:5055/movie/1');
    expect(recapStopWords(2, 5)).toBe('l’épisode 5 de la saison 2');
    expect(recapStopWords(2, null)).toBe('la saison 2');
  });
});
