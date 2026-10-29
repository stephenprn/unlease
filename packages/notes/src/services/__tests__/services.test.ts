import { comparePositions, isValidKey, keyBetween, keysBetween } from '@unlease/core/services/fractionalIndex';
import { cleanUrl, displayHost, extractUrls, normalizeUrl, prettyUrl, siteDomain, slugTitle } from '@unlease/core/services/url';
import { cleanSiteName, linkRowText } from '../linkRow';
import { formatDay, formatEdited, formatPrice, formatRelative, formatReminder, plural, totalPrice } from '@unlease/core/services/format';
import { foldText, matchRanges, searchDocuments } from '@unlease/core/services/search';
import { textWidth, wrapLines } from '@unlease/design/textWrap';
import { footerShowsLabelNames, layoutCard, MAX_THUMB, packWall, thumbSize, type CardShape, type WallMetrics } from '../wall';
import { createId } from '@unlease/core/services/ids';
import type { Note } from '../../models/entities';
import { nextLineColor } from '@unlease/design/colors';
import { buildDocument } from '../noteSearch';

describe('fractional index', () => {
  it('always finds a key between two keys, and sorts as strings', () => {
    const first = keyBetween(null, null);
    const before = keyBetween(null, first);
    const after = keyBetween(first, null);
    const middle = keyBetween(first, after);
    expect([after, middle, before, first].sort()).toEqual([before, first, middle, after]);
  });

  it('keeps keys short when a list grows at one end', () => {
    let top: string | null = null;
    for (let i = 0; i < 2000; i += 1) top = keyBetween(null, top);
    expect(top!.length).toBeLessThan(8);
    expect(isValidKey(top!)).toBe(true);
  });

  it('spreads n keys and orders ties by id', () => {
    const keys = keysBetween('a0', 'a1', 5);
    expect([...keys].sort()).toEqual(keys);
    expect(keys.every(key => key > 'a0' && key < 'a1')).toBe(true);
    expect(comparePositions({ position: 'a0', id: 'b' }, { position: 'a0', id: 'a' })).toBe(1);
  });
});

describe('urls', () => {
  it('finds the link inside shared text', () => {
    expect(extractUrls('Regarde ça ! https://www.zara.com/fr/veste-p123.html?utm_source=ig. Trop bien')).toEqual([
      'https://www.zara.com/fr/veste-p123.html?utm_source=ig',
    ]);
    expect(extractUrls('zara.com/fr/veste')).toEqual(['https://zara.com/fr/veste']);
    expect(extractUrls('rien à voir. vraiment')).toEqual([]);
  });

  it('keeps the brackets a link opened, drops the sentence’s', () => {
    expect(extractUrls('https://en.wikipedia.org/wiki/The_Bear_(TV_series)')).toEqual(['https://en.wikipedia.org/wiki/The_Bear_(TV_series)']);
    expect(extractUrls('(voir https://en.wikipedia.org/wiki/The_Bear_(TV_series)).')).toEqual(['https://en.wikipedia.org/wiki/The_Bear_(TV_series)']);
    expect(extractUrls('(voir https://example.org/a).')).toEqual(['https://example.org/a']);
    expect(extractUrls('[lien](https://example.org/a)')).toEqual(['https://example.org/a']);
  });

  it('strips tracking but keeps what identifies the page', () => {
    expect(normalizeUrl('HTTPS://WWW.Example.com:443/a?utm_source=x&id=4&fbclid=y#top')).toBe('https://www.example.com/a?id=4');
    expect(normalizeUrl('https://youtu.be/abc?si=TRACK&t=42')).toBe('https://youtu.be/abc?t=42');
    expect(normalizeUrl('https://app.example.com/#/item/3')).toBe('https://app.example.com/#/item/3');
  });

  it('keeps unknown parameters and says which trackers came off', () => {
    expect(cleanUrl('https://shop.fr/p?id=4&color=red&gad_source=1&_gl=1*abc&utm_medium=social')).toEqual({
      url: 'https://shop.fr/p?id=4&color=red',
      removed: ['gad_source', '_gl', 'utm_medium'],
    });
    expect(cleanUrl('https://shop.fr/p?id=4').removed).toEqual([]);
  });

  it('knows the sites that pile trackers on a link', () => {
    const amazon = cleanUrl('https://www.amazon.fr/Bouilloire-Electrique/dp/B08xyz1234/ref=sr_1_3?crid=2X&keywords=bouilloire&qid=1&sr=8-3&th=1');
    expect(amazon.url).toBe('https://www.amazon.fr/dp/B08XYZ1234');
    expect(amazon.removed).toEqual(['ref', 'crid', 'keywords', 'qid', 'sr', 'th']);
    expect(normalizeUrl('https://www.amazon.fr/s?k=bouilloire&ref=nb_sb_noss&crid=2X')).toBe('https://www.amazon.fr/s?k=bouilloire');
    expect(normalizeUrl('https://www.tiktok.com/@chef/video/7301234567890?is_from_webapp=1&sender_device=pc&lang=fr')).toBe('https://www.tiktok.com/@chef/video/7301234567890');
    expect(normalizeUrl('https://www.youtube.com/watch?v=abc&t=42&pp=ygU&ab_channel=Chef')).toBe('https://www.youtube.com/watch?v=abc&t=42');
    expect(normalizeUrl('https://x.com/chef/status/123?s=20&t=abc')).toBe('https://x.com/chef/status/123');
    expect(normalizeUrl('https://www.booking.com/hotel/fr/x.html?aid=1&label=y&checkin=2026-11-01&checkout=2026-11-03&sid=z')).toBe(
      'https://www.booking.com/hotel/fr/x.html?checkin=2026-11-01&checkout=2026-11-03',
    );
    expect(normalizeUrl('https://open.spotify.com/intl-fr/track/4u7?si=abc&context=x')).toBe('https://open.spotify.com/intl-fr/track/4u7');
  });

  it('turns an unread link into a readable title', () => {
    expect(prettyUrl('https://www.tissage-lent.fr/chemise-en-lin/?utm_source=x')).toBe('tissage-lent.fr/chemise-en-lin');
    expect(prettyUrl('https://example.com/')).toBe('example.com');
    expect(prettyUrl(`https://example.com/${'a'.repeat(100)}`, 20)).toHaveLength(20);
  });

  it('names the site the way a person would', () => {
    expect(displayHost('https://www.lemonde.fr/x')).toBe('lemonde.fr');
    expect(displayHost('https://m.imdb.com/title/tt1')).toBe('imdb.com');
  });

  it('finds the site’s own domain under its subdomains', () => {
    expect(siteDomain('https://fr.eryone3d.com/products/advanced-silk-pla')).toBe('eryone3d.com');
    expect(siteDomain('https://www.leroymerlin.fr/produits/x.html')).toBe('leroymerlin.fr');
    expect(siteDomain('https://www.bbc.co.uk/news')).toBe('bbc.co.uk');
    expect(siteDomain('https://www.service-public.gouv.fr/x')).toBe('service-public.gouv.fr');
    expect(siteDomain('http://192.168.1.20:8080/x')).toBe('192.168.1.20');
    expect(siteDomain('https://www.gov.uk/x')).toBe('gov.uk');
    expect(siteDomain('https://artiste.bandcamp.com/album/x')).toBe('artiste.bandcamp.com');
    expect(siteDomain('https://example.com./x')).toBe('example.com');
  });

  it('reads a title out of an address nobody read', () => {
    expect(slugTitle('https://arcteryx.com/fr/fr/shop/mens/alpha-sv-jacket-9899')).toBe('Alpha sv jacket');
    expect(slugTitle('https://www.leroymerlin.fr/produits/brique-de-verre-orange-cuivre-brillant-66735655.html')).toBe('Brique de verre orange cuivre brillant');
    expect(slugTitle('https://edwin-europe.com/fr-en/oshino-uniform-jacket-victory-blue-denim-100-cotton-12-4oz-blue-light-stone-washed-i034992-01-47')).toBe(
      'Oshino uniform jacket victory blue denim 100 cotton 12 4oz blue light stone washed',
    );
    expect(slugTitle('https://twitter.com/fille_du_web/status/1568277327431303168')).toBe('Fille du web');
    expect(slugTitle('https://www.youtube.com/watch?v=abc')).toBeNull();
    expect(slugTitle('https://theposterclub.com/')).toBeNull();
    // Ids and routes name nothing: the domain is the title then.
    for (const url of [
      'https://www.amazon.fr/dp/B08N5WRWNW',
      'https://amzn.eu/d/7mT9xYz',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.imdb.com/title/tt1234567/',
      'https://www.airbnb.fr/rooms/12345678',
      'https://open.spotify.com/intl-fr/track/4u7EnebtmKWzUH433cf5Qv',
      'https://www2.hm.com/fr_fr/productpage.1234567001.html',
      'https://example.com/index.html',
    ]) {
      expect(slugTitle(url)).toBeNull();
    }
    expect(slugTitle('https://www.apple.com/fr/iphone-15')).toBe('Iphone 15');
    expect(slugTitle('https://www.nike.com/fr/t/chaussure-air-max-90')).toBe('Chaussure air max 90');
    expect(slugTitle('https://www.vinted.fr/items/4567891234-robe-zara-noire')).toBe('Robe zara noire');
    expect(slugTitle('https://www.booking.com/hotel/fr/le-grand-hotel.fr.html')).toBe('Le grand hotel');
    expect(slugTitle('https://www.google.com/maps/place/Tour+Eiffel/@48.8583701,2.2944813,17z/data=!3m1!4b1')).toBe('Tour Eiffel');
  });
});

describe('link rows', () => {
  const link = (fields: Partial<Parameters<typeof linkRowText>[0]>) => linkRowText({ url: 'https://example.com/', title: '', siteName: '', kind: 'other', attributes: [], ...fields });

  it('says where a link comes from as people name the site', () => {
    expect(cleanSiteName('KOMONO')).toBe('Komono');
    expect(cleanSiteName('IKEA')).toBe('IKEA');
    expect(cleanSiteName('X (formerly Twitter)')).toBe('X');
    expect(cleanSiteName('Leroy Merlin - Bricolage, déco, maison, jardin')).toBe('Leroy Merlin');
    expect(cleanSiteName('fr.eryone3d')).toBeNull();
    // Several words or signs keep the case they chose.
    expect(cleanSiteName('THE KOOPLES')).toBe('THE KOOPLES');
    expect(cleanSiteName('ZADIG&VOLTAIRE')).toBe('ZADIG&VOLTAIRE');
    expect(cleanSiteName('A.P.C.')).toBe('A.P.C.');
    expect(cleanSiteName('Accueil')).toBeNull();
    expect(link({ url: 'https://fr.eryone3d.com/products/advanced-silk-pla', siteName: 'fr.eryone3d' }).source).toBe('eryone3d.com');
    // A home page named like its site shows its domain instead.
    expect(link({ url: 'https://theposterclub.com/', title: 'The Poster Club', siteName: 'The Poster Club' }).source).toBe('theposterclub.com');
  });

  it('keeps two facts worth a glance, without what the row already says', () => {
    const watch = link({
      url: 'https://komono.com/fr-fr/products/max-flower-silver-black',
      title: 'Max Flower Silver Black',
      siteName: 'KOMONO',
      kind: 'product',
      attributes: [
        { label: 'Marque', value: 'KOMONO' },
        { label: 'Couleur', value: 'Argent et noir' },
        { label: 'Matière', value: 'Acier inoxydable' },
        { label: 'Disponibilité', value: 'En stock' },
      ],
    });
    expect(watch).toEqual({ source: 'Komono', title: 'Max Flower Silver Black', facts: ['Argent et noir', 'Acier inoxydable'] });
    const brick = link({
      title: 'Brique de verre orange / cuivré brillant',
      kind: 'product',
      attributes: [
        { label: 'Couleur', value: 'Orange / cuivré brillant' },
        { label: 'Dimensions', value: '19 × 19 × 8 cm' },
        { label: 'Matière', value: 'Verre' },
        { label: 'Poids', value: '2,25 kg' },
      ],
    });
    expect(brick.facts).toEqual(['19 × 19 × 8 cm', '2,25 kg']);
    const earrings = link({ title: 'Synthesis Earrings', siteName: 'Ask and Embla', kind: 'product', attributes: [{ label: 'Marque', value: 'Ask & Embla' }, { label: 'Disponibilité', value: 'Épuisé' }, { label: 'Couleur', value: 'Or' }] });
    expect(earrings.facts).toEqual(['Épuisé', 'Or']);
    // Any script, and signs alone, are facts too.
    const ramen = link({ title: 'ラーメン一蘭', siteName: '一蘭', kind: 'restaurant', attributes: [{ label: 'Cuisine', value: 'ラーメン' }, { label: 'Prix moyen', value: '€€' }] });
    expect(ramen).toEqual({ source: '一蘭', title: 'ラーメン一蘭', facts: ['ラーメン', '€€'] });
  });

  it('gives an unread link a readable title, never its address', () => {
    expect(link({ url: 'https://arcteryx.com/fr/fr/shop/mens/alpha-sv-jacket-9899' })).toEqual({ source: 'arcteryx.com', title: 'Alpha sv jacket', facts: [] });
    expect(link({ url: 'https://www.theposterclub.com/' })).toEqual({ source: '', title: 'theposterclub.com', facts: [] });
  });
});

describe('french formatting', () => {
  const now = new Date(2026, 9, 18, 15, 0).getTime();
  it('formats prices the French way', () => {
    expect(formatPrice(49.9, 'EUR')).toBe('49,90 €');
    expect(formatPrice(1299, 'EUR')).toBe('1 299 €');
    expect(formatPrice(12, 'USD')).toBe('12 $ US');
    expect(totalPrice([{ price: 10, currency: 'EUR' }, { price: null, currency: null }, { price: 5.5, currency: 'EUR' }])).toEqual({ amount: 15.5, currency: 'EUR', count: 2 });
    expect(totalPrice([{ price: 10, currency: 'EUR' }, { price: 5, currency: 'USD' }])).toBeNull();
  });

  it('says when, in French', () => {
    expect(formatRelative(now - 30_000, now)).toBe('à l’instant');
    expect(formatRelative(now - 5 * 60_000, now)).toBe('il y a 5 min');
    expect(formatRelative(new Date(2026, 9, 17, 9).getTime(), now)).toBe('hier');
    expect(formatDay(new Date(2025, 0, 3).getTime(), now)).toBe('3 janv. 2025');
    expect(formatEdited(new Date(2026, 9, 18, 9, 5).getTime(), now)).toBe('Modifiée à 09:05');
    expect(formatReminder(new Date(2026, 9, 19, 9, 0).getTime(), now)).toBe('Demain, 09:00');
    expect(formatReminder(new Date(2026, 9, 22, 18, 30).getTime(), now)).toBe('Jeudi, 18:30');
    expect(plural(0, 'lien')).toBe('0 lien');
    expect(plural(3, 'lien')).toBe('3 liens');
  });
});

describe('search', () => {
  const base: Note = {
    id: 'n1', kind: 'text', title: 'Café du coin', body: 'Le meilleur croissant de Belleville', rich: false, drawing: '', color: null, pattern: null, pinned: false, archived: false,
    trashedAt: null, labelIds: [], position: 'a0', reminderAt: null, code: '', emblem: null, hint: '', modules: null, createdAt: 0, deletedAt: null, editedAt: 10,
  };
  it('folds accents and case, requires every term, ranks titles first', () => {
    expect(foldText('Œuvre Élégante')).toBe('oeuvre elegante');
    const docs = [
      buildDocument(base, [], [], []),
      buildDocument({ ...base, id: 'n2', title: 'Liste', body: 'acheter du cafe', editedAt: 20 }, [], [], []),
    ];
    expect(searchDocuments(docs, 'cafe').map(h => h.noteId)).toEqual(['n1', 'n2']);
    expect(searchDocuments(docs, 'cafe belleville').map(h => h.noteId)).toEqual(['n1']);
    expect(searchDocuments(docs, '   ')).toEqual([]);
    expect(matchRanges('Café du coin', 'cafe coin')).toEqual([[0, 4], [8, 12]]);
  });
});

describe('the wall', () => {
  const metrics: WallMetrics = { columnWidth: 186, gap: 8, padding: 14, border: 1, fontSize: 15, lineHeight: 21, checkRow: 24, metaLine: 18, footer: 40, maxHeight: 384 };
  const shape = (over: Partial<CardShape>): CardShape => ({
    id: 'x', kind: 'text', title: '', body: '', paragraphs: null, drawing: null, openChecks: 0, hasCheckedSummary: false, hasPhoto: false, hasThumbs: false, hasFooter: false, ...over,
  });

  it('wraps on Signika widths: at spaces, after hyphens, a word too long cut where it overflows', () => {
    expect(wrapLines('', 156, 15)).toBe(0);
    expect(wrapLines('Court', 156, 15)).toBe(1);
    expect(wrapLines('a\n\nb', 156, 15)).toBe(3);
    expect(wrapLines('porte-monnaie', Math.max(textWidth('porte-', 15), textWidth('monnaie', 15)) + 1, 15)).toBe(2);
    expect(wrapLines('x'.repeat(60), 156, 15)).toBe(Math.ceil(textWidth('x'.repeat(60), 15) / 156));
    expect(wrapLines('mot '.repeat(200), 156, 15, 'regular', 16)).toBe(16);
  });

  it('sizes a card to exactly what it shows', () => {
    // Its edge, its padding and one line: no paper left under a short note.
    expect(layoutCard(shape({ title: 'Court' }), metrics)).toEqual({ height: 51, title: 1, body: 0 });
    expect(layoutCard(shape({ title: 'Court', hasFooter: true }), metrics).height).toBe(91);
    expect(layoutCard(shape({ kind: 'checklist', title: 'Courses', openChecks: 3, hasCheckedSummary: true }), metrics).height).toBe(147);
    expect(layoutCard(shape({ hasPhoto: true }), metrics).height).toBe(2 + Math.round(186 * 0.62));
    // The head is the stone (40), taller than one line of name.
    expect(layoutCard(shape({ kind: 'links', title: 'Films', hasThumbs: true }), metrics).height).toBe(2 + 14 + 40 + 12 + thumbSize(metrics) + 8 + 18 + 14);
  });

  it('stops a long body at the ceiling, in whole lines', () => {
    const card = layoutCard(shape({ title: 'Titre', body: 'mot '.repeat(800).trim() }), metrics);
    expect(card.height).toBeLessThanOrEqual(metrics.maxHeight);
    expect(card).toEqual({ height: 2 + 28 + 21 + 15 * 21, title: 1, body: 15 });
  });

  it('keeps a wide collection card’s pictures as thumbnails, and a narrow footer’s labels as tags', () => {
    expect(thumbSize({ ...metrics, columnWidth: 640 })).toBe(MAX_THUMB);
    expect(thumbSize(metrics)).toBeLessThan(MAX_THUMB);
    // A phone column (186): a reminder leaves no room for a label's name; alone, the label keeps it.
    expect(footerShowsLabelNames(metrics, true)).toBe(false);
    expect(footerShowsLabelNames(metrics, false)).toBe(true);
    expect(footerShowsLabelNames({ ...metrics, columnWidth: 270 }, true)).toBe(true);
  });

  it('packs into the shortest column', () => {
    const { placements, height } = packWall([{ id: 'a', height: 100 }, { id: 'b', height: 60 }, { id: 'c', height: 60 }, { id: 'd', height: 50 }], 2, 8);
    expect(placements.map(p => [p.id, p.column, p.top])).toEqual([['a', 0, 0], ['b', 1, 0], ['c', 1, 68], ['d', 0, 108]]);
    expect(height).toBe(166);
  });
});

describe('ids and colours', () => {
  it('mints UUIDv7 ids, unique, sorted by creation, in order within one millisecond', () => {
    const ids = Array.from({ length: 1000 }, () => createId(1_700_000_000_000));
    expect(new Set(ids).size).toBe(1000);
    expect([...ids].sort()).toEqual(ids);
    expect(createId(1) < createId(2)).toBe(true);
    expect(ids.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))).toBe(true);
    // The time it was made at, as RFC 9562 lays it out: the first 48 bits.
    expect(parseInt(ids[0]!.slice(0, 8) + ids[0]!.slice(9, 13), 16)).toBe(1_700_000_000_000);
    expect(createId(Date.UTC(2015, 0, 1), () => 0.5).startsWith('014aa2ca-b000-7')).toBe(true);
  });

  it('gives a new line the first unused colour, never grey', () => {
    expect(nextLineColor([])).toBe('yellow');
    expect(nextLineColor(['yellow', 'grey'])).toBe('orange');
  });
});
