import { describe, expect, it } from 'vitest';
import { withoutSiteSuffix } from '../src/apps/notes/analysis/analyzer';
import { buildDigest } from '../src/apps/notes/analysis/digest';
import { decodeHtml, fetchedImages, parsePage } from '../src/apps/notes/analysis/html';
import { formatDuration, parsePriceValue } from '../src/apps/notes/analysis/jsonld';
import type { LinkRead } from '../src/apps/notes/analysis/reader';
import { imageCandidates } from '../src/apps/notes/analysis/reader';
import { fixture } from './helpers';

const SHOP_URL = 'https://www.maison-lucette.fr/fr/femme/vestes/veste-jean-oversize-delavee-p4512.html';

describe('a shop product page', () => {
  const page = parsePage(fixture('shop-product.html'), SHOP_URL);

  it('reads the title, meta tags and Open Graph', () => {
    expect(page.title).toBe('Veste en jean oversize délavée - Bleu | Maison Lucette');
    expect(page.meta['og:title']).toBe('Veste en jean oversize délavée');
    expect(page.meta['og:type']).toBe('product');
    expect(page.siteName).toBe('Maison Lucette');
    expect(page.description).toBe('Une veste en jean coupe oversize, en coton biologique.');
    expect(page.canonical).toBe(SHOP_URL);
    expect(page.lang).toBe('fr');
  });

  it('finds the meta price and the lowest structured offer', () => {
    expect(page.metaPrice).toEqual({ amount: 59.99, currency: 'EUR' });
    expect(page.structuredPrice).toEqual({ amount: 49.99, currency: 'EUR' });
  });

  it('keeps the useful fields of the Product and drops the rest of the graph', () => {
    expect(page.structured).toHaveLength(1);
    const product = page.structured[0]!;
    expect(product.type).toBe('Product');
    expect(product.data).toMatchObject({
      name: 'Veste en jean oversize délavée',
      brand: 'Maison Lucette',
      color: 'Bleu délavé',
      material: '100 % coton biologique',
      offers: { lowPrice: 49.99, highPrice: 59.99, priceCurrency: 'EUR', availability: 'InStock', offerCount: 4 },
      aggregateRating: '4.6/5 (128 votes)',
    });
    expect(product.data.description).toBe('Veste en jean coupe oversize, coton biologique, délavage moyen.');
    expect(product.data).not.toHaveProperty('review');
  });

  it('collects image candidates as absolute, de-duplicated URLs in priority order', () => {
    expect(page.images.map(image => [image.url, image.source])).toEqual([
      ['https://cdn.maison-lucette.fr/products/4512/veste-jean-face.jpg?w=1200', 'og:image'],
      ['https://www.maison-lucette.fr/products/4512/veste-jean-dos.jpg', 'og:image'],
      ['https://cdn.maison-lucette.fr/products/4512/veste-jean-porte.jpg', 'json-ld'],
      ['https://www.maison-lucette.fr/products/4512/veste-jean-face-1600.jpg', 'page image'],
    ]);
  });

  it('extracts the readable text of the main content only', () => {
    expect(page.text).toContain('Veste en jean oversize délavée');
    expect(page.text).toContain('atelier de Roubaix');
    expect(page.text).toContain('Matière : 100 % coton biologique');
    for (const noise of ['cookies', 'Soldes', 'Ajouter au panier', 'Vous aimerez aussi', 'tous droits réservés', 'gtag', 'font-weight']) {
      expect(page.text).not.toContain(noise);
    }
    expect(page.text.split('\n').length).toBeGreaterThan(3);
  });
});

describe('a film page', () => {
  const page = parsePage(fixture('film.html'), 'https://www.cinefiche.fr/film/grande-evasion-1963');

  it('reads the Movie structured data, with durations and people made readable', () => {
    const movie = page.structured.find(item => item.category === 'film')!;
    expect(movie.data).toMatchObject({
      name: 'La Grande Évasion',
      alternateName: 'The Great Escape',
      director: 'John Sturges',
      datePublished: '1963-07-04',
      duration: '2 h 52 min',
      genre: ['Guerre', 'Aventure', 'Drame'],
      countryOfOrigin: 'États-Unis',
      aggregateRating: '4,3/5 (15234 votes)',
      image: 'https://img.cinefiche.fr/affiches/grande-evasion-1963.jpg',
    });
    expect(movie.data.actor).toEqual(['Steve McQueen', 'James Garner', 'Richard Attenborough', 'Charles Bronson', 'James Coburn']);
  });

  it('uses the article as content and keeps the poster first', () => {
    expect(page.text).toContain('Tom, Dick et Harry');
    expect(page.text).not.toContain('Sorties de la semaine');
    expect(page.text).not.toContain('Les plus populaires');
    expect(page.images.map(image => image.url)).toEqual([
      'https://img.cinefiche.fr/affiches/grande-evasion-1963.jpg',
      'https://img.cinefiche.fr/photos/grande-evasion-moto.jpg',
    ]);
    expect(page.structuredPrice).toBeNull();
    expect(page.metaPrice).toBeNull();
  });
});

describe('a restaurant page', () => {
  const page = parsePage(fixture('restaurant.html'), 'https://www.bonnestables.fr/paris/le-petit-zinc');

  it('formats the address, cuisine and opening hours', () => {
    const restaurant = page.structured.find(item => item.category === 'restaurant')!;
    expect(page.structured).toHaveLength(1);
    expect(restaurant.data).toMatchObject({
      name: 'Le Petit Zinc',
      address: '12 rue des Martyrs, 75009 Paris, FR',
      servesCuisine: ['Française', 'Bistrot'],
      priceRange: '€€',
      telephone: '+33 1 42 00 00 00',
      acceptsReservations: true,
      openingHoursSpecification: ['Mo,Tu,We,Th,Fr 12:00-14:30', 'Th,Fr,Sa 19:00-22:30'],
      aggregateRating: '8.9/10 (342 votes)',
    });
    expect(page.images.map(image => image.url)).toEqual([
      'https://static.bonnestables.fr/resto/petit-zinc/salle.jpg',
      'https://static.bonnestables.fr/resto/petit-zinc/plat.jpg',
    ]);
    expect(page.text).toContain('pot-au-feu le jeudi');
  });
});

describe('a thin page', () => {
  it('yields nothing to describe rather than noise', () => {
    const page = parsePage(fixture('thin.html'), 'https://app.example.com/item/3');
    expect(page.title).toBeNull();
    expect(page.description).toBeNull();
    expect(page.structured).toEqual([]);
    expect(page.images).toEqual([]);
    expect(page.text).toBe('');
  });
});

describe('charsets', () => {
  it('decodes a page in the charset its server declares', () => {
    const body = Buffer.from([...Buffer.from('<title>Caf'), 0xe9, ...Buffer.from(' du coin</title>')]);
    expect(parsePage(decodeHtml(body, 'text/html; charset=windows-1252'), 'https://a.fr/').title).toBe('Café du coin');
  });

  it('falls back to the meta charset, then UTF-8', () => {
    const latin = Buffer.concat([Buffer.from('<meta charset="iso-8859-1"><title>No'), Buffer.from([0xeb]), Buffer.from('l</title>')]);
    expect(parsePage(decodeHtml(latin, 'text/html'), 'https://a.fr/').title).toBe('Noël');
    expect(parsePage(decodeHtml(Buffer.from('<title>Crème brûlée</title>'), undefined), 'https://a.fr/').title).toBe('Crème brûlée');
  });
});

describe('small parsers', () => {
  it('reads prices written the French and the English way', () => {
    expect(parsePriceValue('49,90')).toBe(49.9);
    expect(parsePriceValue('1 299,00 €')).toBe(1299);
    expect(parsePriceValue('1.299,90')).toBe(1299.9);
    expect(parsePriceValue('1,299.90')).toBe(1299.9);
    expect(parsePriceValue('59.99')).toBe(59.99);
    expect(parsePriceValue('1.299')).toBe(1299);
    expect(parsePriceValue(12)).toBe(12);
    expect(parsePriceValue('gratuit')).toBeNull();
  });

  it('turns ISO 8601 durations into French ones', () => {
    expect(formatDuration('PT2H52M')).toBe('2 h 52 min');
    expect(formatDuration('PT45M')).toBe('45 min');
    expect(formatDuration('PT3H')).toBe('3 h');
    expect(formatDuration('PT5400S')).toBe('1 h 30 min');
    expect(formatDuration('environ 2 heures')).toBe('environ 2 heures');
  });

  it('drops a site suffix only when it is the site name', () => {
    expect(withoutSiteSuffix('Veste en jean | Maison Lucette', 'Maison Lucette')).toBe('Veste en jean');
    expect(withoutSiteSuffix('Le Petit Zinc - Bonnes Tables', 'bonnestables.fr')).toBe('Le Petit Zinc');
    expect(withoutSiteSuffix('Star Wars : Un nouvel espoir', 'CinéFiche')).toBe('Star Wars : Un nouvel espoir');
  });
});

describe('the digest sent to Claude', () => {
  it('stays compact and carries what Claude needs, numbered images included', () => {
    const page = parsePage(fixture('shop-product.html'), SHOP_URL);
    const read: LinkRead = { url: SHOP_URL, finalUrl: SHOP_URL, page, oembed: null, image: null, error: null, fatal: false };
    const digest = buildDigest({ read, candidates: imageCandidates(read) });
    expect(digest.length).toBeLessThan(12_000);
    expect(digest).toContain(`URL: ${SHOP_URL}`);
    expect(digest).toContain('Site: Maison Lucette (maison-lucette.fr)');
    expect(digest).toContain('Price in meta tags: 59.99 EUR');
    expect(digest).toContain('Lowest offer in structured data: 49.99 EUR');
    expect(digest).toContain('- Product: {"name":"Veste en jean oversize délavée"');
    expect(digest).toContain('[0] https://cdn.maison-lucette.fr/products/4512/veste-jean-face.jpg?w=1200 (og:image)');
    expect(digest).toContain('[3] https://www.maison-lucette.fr/products/4512/veste-jean-face-1600.jpg (page image)');
    expect(digest).toContain('Page text (excerpt):');
  });

  it('caps a huge page', () => {
    const huge = `<title>Long</title><main>${'<p>Un paragraphe assez long pour remplir la page. </p>'.repeat(5000)}</main>`;
    const page = parsePage(huge, 'https://long.example.com/');
    expect(page.text.length).toBeLessThanOrEqual(6000);
    const read: LinkRead = { url: 'https://long.example.com/', finalUrl: 'https://long.example.com/', page, oembed: null, image: null, error: null, fatal: false };
    expect(buildDigest({ read, candidates: [] }).length).toBeLessThanOrEqual(12_000);
  });
});

describe('the pictures of a page only web_fetch could read', () => {
  const page = 'https://www.leroymerlin.fr/produits/brique-de-verre-orange-cuivre-brillant-66735655.html';
  const document = [
    '---',
    `canonical: ${page}`,
    'meta-og:image: https://media.adeo.com/media/1285337/media.jpg',
    'title: Brique de verre orange / cuivré brillant | Leroy Merlin',
    '---',
    '',
    '- [![](https://www.leroymerlin.fr/static/images/common/loader.svg) Terrasse et jardin](https://www.leroymerlin.fr/produits/terrasse-jardin/)',
    '![Promo : -20 % sur la peinture](https://media.adeo.com/media/999/promo.jpg)',
    '![Leroy Merlin](https://www.leroymerlin.fr/static/brands/leroy-merlin.png)',
    '![Brique de verre orange / cuivré brillant - 1](https://media.adeo.com/media/1285337/media.jpg?width=650&height=650)',
    '![Brique de verre orange [cuivré] - 2](https://media.adeo.com/media/837867/media.jpg?width=650 "Vue 2")',
    '![Brique de verre (cuivré) - 3](/media/Brique_(cuivre).jpg)',
    '![Brique de verre - 4](<https://media.adeo.com/media/brique verre 4.jpg>)',
  ].join('\n');

  it('takes the og:image first, then only the pictures whose alt names the page', () => {
    expect(fetchedImages(document, page).map(image => image.url)).toEqual([
      'https://media.adeo.com/media/1285337/media.jpg',
      // The same file at another size is left out; brackets in the alt, a title after the URL, parentheses in it and <…> are read.
      'https://media.adeo.com/media/837867/media.jpg?width=650',
      'https://www.leroymerlin.fr/media/Brique_(cuivre).jpg',
      'https://media.adeo.com/media/brique%20verre%204.jpg',
    ]);
  });

  it('keeps pictures served by one script under different queries apart', () => {
    const shop = ['---', 'title: Lampe champignon | Boutique', '---', '![Lampe champignon 1](/image.php?id=1)', '![Lampe champignon 2](/image.php?id=2)'].join('\n');
    expect(fetchedImages(shop, 'https://shop.example/lampe')).toHaveLength(2);
  });
});
