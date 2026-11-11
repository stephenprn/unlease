import { INBOX_ID, type LinkItem } from '../../models/entities';
import { DEFAULT_MODULES, LINK_MODULES } from '../../models/modules';
import { linkFromRecord } from '../../sync/entities';
import { parseOfferRequest, parseOfferResponse } from '../../sync/offers';
import type { Fields } from '@unlease/core/sync/record';
import { parseRecipeResponse } from '../../sync/recipe';
import { directionsUrl, lineModules, linkModules, marketplaceSearches, moduleCost, moduleMissing, moduleOffered, seerrPageUrl, seerrSearchUrl, sensCritiqueUrl, withModule } from '../modules';
import { offerDetails, offerGap, rangeText } from '../offers';

const link = (fields: Fields = {}): LinkItem =>
  linkFromRecord({ type: 'link', id: 'l1', fields: { noteId: INBOX_ID, url: 'https://shop.example/item', status: 'ready', title: 'Veste', kind: 'product', price: 189, currency: 'EUR', createdAt: 1, deletedAt: null, ...fields }, clocks: {} });

describe('a collection’s modules', () => {
  it('keeps the defaults until picked, in the registry’s order, and a newer client’s keys', () => {
    expect(lineModules({ modules: null })).toEqual([...DEFAULT_MODULES]);
    expect(lineModules({ modules: ['archive', 'cheaper', 'futur'] })).toEqual(['cheaper', 'archive']);
    expect(withModule({ modules: null }, 'cheaper', true)).toEqual([...DEFAULT_MODULES, 'cheaper']);
    expect(withModule({ modules: ['futur', 'coupons'] }, 'coupons', false)).toEqual(['futur']);
  });

  it('shows a module only on the links it fits, and only where it works', () => {
    const all = { modules: ['coupons', 'cheaper', 'secondhand', 'groceries', 'directions', 'archive'] };
    const everything = { server: true, reading: true, seerr: false, pages: true, agenda: false };
    expect(linkModules(link(), all, everything)).toEqual(['coupons', 'cheaper', 'secondhand']);
    expect(linkModules(link({ done: true, doneAt: 3 }), all, everything)).toEqual([]);
    expect(linkModules(link({ kind: 'recipe', price: null, currency: null }), all, everything)).toEqual(['groceries']);
    expect(linkModules(link({ kind: 'restaurant', price: null, currency: null }), all, everything)).toEqual(['directions']);
    expect(linkModules(link({ kind: 'article', price: null, currency: null }), all, { server: true, reading: false, seerr: false, pages: true, agenda: false })).toEqual(['archive']);
    // Without a server, only what needs nothing.
    expect(linkModules(link({ kind: 'event', price: 30, currency: 'EUR', attributes: [{ label: 'Lieu', value: 'Salle Pleyel' }] }), all, { server: false, reading: false, seerr: false, pages: false, agenda: false })).toEqual(['directions']);
    expect(moduleMissing('cheaper', { server: true, reading: false, seerr: false, pages: true, agenda: false })).toBe('Il faut une clé Claude');
    expect(moduleMissing('archive', { server: false, reading: false, seerr: false, pages: false, agenda: false })).toBe('Il faut un serveur relié');
    expect(moduleCost('coupons', 'claude-opus-5-5', value => `${value} $`)).toBe('Environ 0.25 $ par recherche');
    expect(moduleCost('directions', 'claude-opus-5-5', String)).toBe('Gratuit');
  });

  it('shows the works modules on films, series, books, music and games, Seerr only once linked', () => {
    const works = { modules: ['ratings', 'recap', 'senscritique', 'seerr', 'coverage', 'ask', 'servings', 'cooking'] };
    const film = link({ kind: 'film', price: null, currency: null, title: 'Dune' });
    expect(linkModules(film, works, { server: true, reading: true, seerr: false, pages: true, agenda: false })).toEqual(['ratings', 'senscritique', 'ask']);
    expect(linkModules(film, works, { server: true, reading: true, seerr: true, pages: true, agenda: false })).toEqual(['ratings', 'senscritique', 'seerr', 'ask']);
    expect(linkModules(link({ kind: 'series', price: null, currency: null }), works, { server: true, reading: true, seerr: true, pages: true, agenda: false })).toEqual(['ratings', 'recap', 'senscritique', 'seerr', 'ask']);
    expect(linkModules(link({ kind: 'game', price: null, currency: null }), works, { server: true, reading: true, seerr: true, pages: true, agenda: false })).toEqual(['ratings', 'senscritique', 'ask']);
    expect(linkModules(link({ kind: 'article', price: null, currency: null }), works, { server: true, reading: true, seerr: true, pages: true, agenda: false })).toEqual(['coverage', 'ask']);
    expect(linkModules(link({ kind: 'recipe', price: null, currency: null }), works, { server: false, reading: false, seerr: false, pages: false, agenda: false })).toEqual(['servings']);
    expect(moduleMissing('seerr', { server: true, reading: true, seerr: false, pages: true, agenda: false })).toBe('Il faut relier Seerr dans l’administration');
    expect(moduleCost('ask', 'claude-opus-5-5', value => `${value} $`)).toBe('Environ 0.05 $ par question, davantage avec le web');
  });

  it('offers in « Modules » only what the Administration has set up: Claude’s and Seerr’s once they are', () => {
    const none = { reading: false, seerr: false };
    expect(LINK_MODULES.filter(module => moduleOffered(module, none))).toEqual(['pricewatch', 'servings', 'groceries', 'cooking', 'senscritique', 'directions', 'archive']);
    expect(moduleOffered('agenda', { reading: true, seerr: false })).toBe(true);
    expect(moduleOffered('seerr', { reading: true, seerr: false })).toBe(false);
    expect(LINK_MODULES.every(module => moduleOffered(module, { reading: true, seerr: true }))).toBe(true);
  });
});

describe('the works links', () => {
  it('opens SensCritique’s search and Seerr’s, as their own pages encode them', () => {
    expect(sensCritiqueUrl(link({ kind: 'film', title: 'La Haine' }))).toBe('https://www.senscritique.com/search?query=La%20Haine');
    expect(sensCritiqueUrl(link({ kind: 'film', title: '', url: 'https://www.allocine.fr/film/la-haine' }))).toContain('search?query=');
    expect(seerrSearchUrl('https://seerr.example/', link({ kind: 'film', title: 'Amélie (2001)' }))).toBe('https://seerr.example/search?query=Am%C3%A9lie%20%282001%29');
    expect(seerrSearchUrl('', link({ kind: 'film', title: 'Amélie' }))).toBeNull();
    expect(seerrPageUrl('https://seerr.example/', 'tv', 1396)).toBe('https://seerr.example/tv/1396');
  });
});

describe('modules that need no server', () => {
  it('goes to a place by its name and its address', () => {
    const place = link({ kind: 'restaurant', title: 'Chez Janou', attributes: [{ label: 'Adresse', value: '2 rue Roger Verlomme, 75003 Paris' }] });
    expect(directionsUrl(place)).toBe('https://www.google.com/maps/dir/?api=1&destination=Chez%20Janou%2C%202%20rue%20Roger%20Verlomme%2C%2075003%20Paris');
    expect(directionsUrl(link({ kind: 'event', title: 'Concert', attributes: [{ label: 'Lieu', value: 'Concert, salle Pleyel' }] }))).toContain('destination=Concert%2C%20salle%20Pleyel');
    // An event's name is no place: its venue alone, and no way there without one.
    expect(directionsUrl(link({ kind: 'event', title: 'Orelsan en concert', attributes: [{ label: 'Lieu', value: 'Zénith de Paris' }] }))).toContain('destination=Z%C3%A9nith%20de%20Paris');
    expect(directionsUrl(link({ kind: 'event', title: 'Nuit Blanche 2026', attributes: [] }))).toBeNull();
  });

  it('opens the resale sites of the item’s currency', () => {
    expect(marketplaceSearches(link(), 'fr').map(site => site.name)).toEqual(['Leboncoin', 'Vinted', 'Back Market', 'eBay']);
    expect(marketplaceSearches(link({ currency: 'GBP' }), 'fr')[0]!.url).toBe('https://www.vinted.co.uk/catalog?search_text=Veste');
    expect(marketplaceSearches(link({ price: null, currency: null }), 'en').map(site => site.name)).toEqual(['Back Market', 'eBay']);
  });

});

describe('the modules’ protocols', () => {
  const brief = { id: 'l1', url: 'https://shop.example/item', title: 'Veste', site: 'Shop', kind: 'product', price: null, currency: 'EUR', facts: [] };

  it('reads ingredients, leaving out what does not parse', () => {
    expect(parseRecipeResponse({ ingredients: ['2 œufs', '2 Œufs', '', 3, '  1 pincée   de sel '], servings: '4 personnes' })).toEqual({ ingredients: ['2 œufs', '1 pincée de sel'], servings: '4 personnes', steps: [] });
    expect(parseRecipeResponse({ ingredients: [], servings: '', steps: [{ section: 'Pâte', text: ' Mélanger. ' }, { text: '' }, 'Cuire.', { text: 'Servir.' }] })?.steps).toEqual([
      { section: 'Pâte', text: 'Mélanger.' },
      { section: '', text: 'Servir.' },
    ]);
  });

  it('asks for offers new only with a price', () => {
    expect(parseOfferRequest({ link: brief, market: 'used', lang: 'en', fresh: true })).toMatchObject({ market: 'used', lang: 'en', fresh: true, link: { price: null, currency: null } });
    expect(parseOfferRequest({ link: brief, market: 'new', lang: 'fr' })).toBeNull();
    expect(parseOfferRequest({ link: { ...brief, price: 10 }, market: 'cheap', lang: 'fr' })).toBeNull();
  });

  it('reads offers, the cheapest delivered first, each page once', () => {
    const answer = parseOfferResponse({
      offers: [
        { shop: 'B', price: 50, shipping: 10, currency: 'EUR', condition: 'used', url: 'https://b.example/1' },
        { shop: 'A', price: 55, shipping: 0, currency: 'EUR', condition: 'weird', url: 'https://a.example/1' },
        { shop: 'A bis', price: 55, url: 'https://a.example/1' },
        { shop: 'Rien', price: 0 },
      ],
      range: { low: 40, high: 30 },
      note: 'Bonne affaire.',
      searchedAt: 7,
    });
    expect(answer?.offers.map(offer => [offer.shop, offer.condition])).toEqual([
      ['A', 'new'],
      ['B', 'used'],
    ]);
    expect(answer).toMatchObject({ range: null, note: 'Bonne affaire.', searchedAt: 7 });
    const offer = answer!.offers[1]!;
    expect(offerDetails(offer, 'used')).toMatch(/^D’occasion · livraison 10\s€$/);
    expect(offerGap(offer, link())?.text).toMatch(/^129\s€ de moins$/);
    expect(offerGap({ ...offer, currency: 'USD' }, link())).toBeNull();
    expect(rangeText({ low: 30, high: 45, currency: 'EUR' })).toMatch(/^D’occasion, entre 30\s€ et 45\s€$/);
  });

});

describe('Ajouter à l’agenda', () => {
  it('shows on events and dated links, where Agenda and Claude run', () => {
    const can = { server: true, reading: true, seerr: false, pages: true, agenda: true };
    const event = link({ kind: 'event', price: null, currency: null });
    expect(linkModules(event, { modules: ['agenda'] }, can)).toEqual(['agenda']);
    expect(linkModules(event, { modules: ['agenda'] }, { ...can, agenda: false })).toEqual([]);
    expect(moduleMissing('agenda', { ...can, agenda: false })).toBe('Il faut activer Agenda sur le serveur');
    expect(moduleMissing('agenda', { ...can, reading: false })).toBe('Il faut une clé Claude');
    const flight = link({ kind: 'other', price: null, currency: null, attributes: [{ label: 'Départ', value: '12 mars 08:40' }] });
    expect(linkModules(flight, { modules: ['agenda'] }, can)).toEqual(['agenda']);
    expect(linkModules(link({ kind: 'other', price: null, currency: null }), { modules: ['agenda'] }, can)).toEqual([]);
  });
});
