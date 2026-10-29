/**
 * Which link modules show where (`notes/models/modules`): a collection's picks, the links each one
 * fits, what it needs; and the pieces of the modules that need no server (the way to a place, the
 * resale sites' searches, SensCritique's search, finding a link's kept copy).
 */
import { t, tx, type Locale } from '@unlease/core/i18n';
import type { LinkItem, LinkKind, Note } from '../models/entities';
import { DEFAULT_MODULES, isLinkModule, LINK_MODULES, MODULE_NEEDS, type LinkModule } from '../models/modules';
import { BRIEF_FACTS, type LinkBrief } from '../sync/brief';
import { CLAUDE_COST_PER_QUESTION, CLAUDE_COST_PER_WEB_SEARCH, type ClaudeModel } from '@unlease/core/sync/settings';
import { isInBin, type BlockMap, type ChildIndex } from './blocks';
import { cleanSiteName, linkRowText } from './linkRow';
import { foldText } from '@unlease/core/services/search';
import { siteDomain, slugTitle } from '@unlease/core/services/url';

/** A collection's modules, in the registry's order: its own picks, or the defaults while it has none. */
export function lineModules(line: Pick<Note, 'modules'> | null | undefined): LinkModule[] {
  const picked = line?.modules ?? DEFAULT_MODULES;
  return LINK_MODULES.filter(module => picked.includes(module));
}

/** The modules a collection keeps, `module` turned on or off: unknown keys (a newer client's) stay. */
export function withModule(line: Pick<Note, 'modules'>, module: LinkModule, on: boolean): string[] {
  const current = line.modules ?? DEFAULT_MODULES;
  const kept = current.filter(key => key !== module);
  return on ? [...kept, module] : kept;
}

const PLACE_KINDS: ReadonlySet<LinkKind> = new Set(['restaurant', 'place', 'event']);
/** Works people rate: what SensCritique and the ratings sites cover. */
const WORK_KINDS: ReadonlySet<LinkKind> = new Set(['film', 'series', 'book', 'music', 'game']);

/** Whether a module has something to do for this link: its kind, a price, an address. */
export function moduleFits(module: LinkModule, link: LinkItem): boolean {
  if (link.deletedAt !== null) return false;
  switch (module) {
    case 'coupons':
      return link.price !== null && !link.done;
    case 'cheaper':
      return link.kind === 'product' && link.price !== null && !link.done;
    case 'secondhand':
      return link.kind === 'product' && !link.done;
    case 'servings':
    case 'groceries':
    case 'cooking':
      return link.kind === 'recipe';
    case 'ratings':
    case 'senscritique':
      return WORK_KINDS.has(link.kind) && workTitle(link) !== '';
    case 'recap':
      return link.kind === 'series';
    case 'seerr':
      return (link.kind === 'film' || link.kind === 'series') && workTitle(link) !== '';
    case 'directions':
      return PLACE_KINDS.has(link.kind) && placeQuery(link) !== null;
    case 'archive':
    case 'coverage':
      return link.kind === 'article';
    case 'ask':
      return true;
  }
}

/** What this device can reach: a server (it reads pages), Claude through it, and Seerr when the server has it. */
export interface ModuleAbilities {
  readonly server: boolean;
  readonly reading: boolean;
  readonly seerr: boolean;
}

export function moduleWorks(module: LinkModule, can: ModuleAbilities): boolean {
  switch (MODULE_NEEDS[module]) {
    case 'nothing':
      return true;
    case 'server':
      return can.server;
    case 'claude':
      return can.reading;
    case 'seerr':
      return can.server && can.seerr;
  }
}

/** The modules a link shows: picked by its collection, fitting it, and working here. */
export function linkModules(link: LinkItem, line: Pick<Note, 'modules'> | null | undefined, can: ModuleAbilities): LinkModule[] {
  return lineModules(line).filter(module => moduleFits(module, link) && moduleWorks(module, can));
}

/** What a module costs, in a few words (« Environ 0,25 $ par recherche », « Gratuit »); `usd` writes dollars as the client does. */
export function moduleCost(module: LinkModule, model: ClaudeModel, usd: (value: number) => string): string {
  if (module === 'ask') return t('Environ {cost} par question, davantage avec le web', { cost: usd(CLAUDE_COST_PER_QUESTION[model]) });
  if (MODULE_NEEDS[module] === 'claude') return t('Environ {cost} par recherche', { cost: usd(CLAUDE_COST_PER_WEB_SEARCH[model]) });
  if (module === 'groceries') return t('Gratuit, ou Claude si la page ne donne pas ses ingrédients');
  if (module === 'cooking') return t('Gratuit, ou Claude si la page ne donne pas ses étapes');
  return t('Gratuit');
}

/** Why a module would not show here, or '' when it would. */
export function moduleMissing(module: LinkModule, can: ModuleAbilities): string {
  if (moduleWorks(module, can)) return '';
  if (MODULE_NEEDS[module] === 'server' || !can.server) return t('Il faut un serveur relié');
  return MODULE_NEEDS[module] === 'seerr' ? t('Il faut relier Seerr dans l’administration') : t('Il faut une clé Claude');
}

/** The keys a collection holds that this version knows. */
export function knownModules(keys: readonly string[]): LinkModule[] {
  return keys.filter(isLinkModule);
}

/** A link as the modules that ask Claude send it: what its reading found, without its pictures. */
export function linkBrief(link: LinkItem): LinkBrief {
  return {
    id: link.id,
    url: link.url,
    title: link.title,
    site: cleanSiteName(link.siteName) ?? siteDomain(link.url),
    kind: link.kind,
    price: link.price,
    currency: link.price === null ? null : link.currency,
    facts: link.attributes.slice(0, BRIEF_FACTS).map(fact => `${fact.label} : ${fact.value}`),
    summary: link.summary,
  };
}

/** A work's name as people search for it: what the reading called it, else its address made readable. */
export function workTitle(link: Pick<LinkItem, 'title' | 'url'>): string {
  return link.title.trim() || slugTitle(link.url) || '';
}

/** Questions to start from, by kind: the sort people ask of such a link. */
const ASK_SUGGESTIONS: Readonly<Record<LinkKind, readonly string[]>> = {
  product: [tx('Quelle taille choisir ?'), tx('Qu’en disent les acheteurs ?'), tx('Quelle garantie ?')],
  film: [tx('De quoi ça parle, sans rien dévoiler ?'), tx('Où le voir ?'), tx('Pour quel âge ?')],
  series: [tx('Combien de saisons, et finie ou pas ?'), tx('Où la voir ?'), tx('Pour quel âge ?')],
  book: [tx('Par quoi commencer de cet auteur ?'), tx('Combien de pages ?'), tx('Fait-il partie d’une série ?')],
  music: [tx('Quels morceaux écouter d’abord ?'), tx('Dans le même genre ?')],
  game: [tx('Sur quelles consoles ?'), tx('Combien d’heures pour le finir ?'), tx('Jouable à plusieurs ?')],
  restaurant: [tx('Faut-il réserver ?'), tx('Quels plats recommande-t-on ?'), tx('Des options végétariennes ?')],
  place: [tx('Quels horaires ?'), tx('Combien de temps prévoir ?'), tx('Comment y aller ?')],
  recipe: [tx('Par quoi remplacer le beurre ?'), tx('Se prépare-t-elle la veille ?'), tx('Quel vin servir avec ?')],
  article: [tx('Quels sont les chiffres clés ?'), tx('Résume-le en trois points'), tx('Qui l’a écrit ?')],
  video: [tx('Résume-la en trois points'), tx('Combien de temps dure-t-elle ?')],
  event: [tx('Quand et où exactement ?'), tx('Combien coûtent les places ?')],
  other: [tx('Résume cette page en trois points'), tx('À quoi ça sert ?')],
};

/** "Demander à Claude": a few questions to start from, for a link of this kind, in the interface's language. */
export const askSuggestions = (kind: LinkKind): readonly string[] => ASK_SUGGESTIONS[kind].map(text => t(text));

/** A search as Seerr's own pages encode it: `encodeURIComponent`, and `!'()*` too (its API refuses them bare). */
export const seerrQuery = (text: string): string => encodeURIComponent(text).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

/** A film or a series in Seerr's search, on the address the Administration gave. */
export function seerrSearchUrl(base: string, link: Pick<LinkItem, 'title' | 'url'>): string | null {
  const title = workTitle(link);
  return base && title ? `${base.replace(/\/+$/, '')}/search?query=${seerrQuery(title)}` : null;
}

/** A title's own page in Seerr (TMDB's id). */
export const seerrPageUrl = (base: string, mediaType: 'movie' | 'tv', id: number): string => `${base.replace(/\/+$/, '')}/${mediaType}/${id}`;

/** "SensCritique": the work in SensCritique's own search (its pages link searches as `/search?query=`). */
export function sensCritiqueUrl(link: Pick<LinkItem, 'title' | 'url'>): string | null {
  const title = workTitle(link);
  return title ? `https://www.senscritique.com/search?query=${encodeURIComponent(title)}` : null;
}

/** The shop or site as a module's sheet names it: « Komono », else its domain. */
export function linkShop(link: Pick<LinkItem, 'url' | 'title' | 'siteName' | 'kind' | 'attributes'>): string {
  return linkRowText(link).source || siteDomain(link.url);
}

const ADDRESS_LABELS = ['adresse', 'address', 'lieu', 'venue'];

/**
 * Where to go: the place's name with its address when the reading found one ("Chez Janou, 2 rue
 * Roger Verlomme, 75003 Paris"). An event's title is no place: its venue or address alone, else nowhere.
 */
export function placeQuery(link: Pick<LinkItem, 'title' | 'attributes' | 'url' | 'kind'>): string | null {
  const address = link.attributes.find(fact => ADDRESS_LABELS.some(label => foldText(fact.label).startsWith(label)))?.value.trim() ?? '';
  if (link.kind === 'event') return address || null;
  const name = link.title.trim() || slugTitle(link.url) || '';
  if (!address) return name || null;
  return name && !foldText(address).includes(foldText(name)) ? `${name}, ${address}` : address;
}

/** "Y aller": the way there in Google Maps, which its app opens when installed. */
export function directionsUrl(link: Pick<LinkItem, 'title' | 'attributes' | 'url' | 'kind'>): string | null {
  const query = placeQuery(link);
  return query ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}` : null;
}

export interface Marketplace {
  readonly name: string;
  readonly url: string;
}

const MARKETPLACES: Readonly<Record<'fr' | 'uk' | 'us', readonly { readonly name: string; readonly search: (query: string) => string }[]>> = {
  fr: [
    { name: 'Leboncoin', search: q => `https://www.leboncoin.fr/recherche?text=${q}` },
    { name: 'Vinted', search: q => `https://www.vinted.fr/catalog?search_text=${q}` },
    { name: 'Back Market', search: q => `https://www.backmarket.fr/fr-fr/search?q=${q}` },
    { name: 'eBay', search: q => `https://www.ebay.fr/sch/i.html?_nkw=${q}` },
  ],
  uk: [
    { name: 'Vinted', search: q => `https://www.vinted.co.uk/catalog?search_text=${q}` },
    { name: 'Back Market', search: q => `https://www.backmarket.co.uk/en-gb/search?q=${q}` },
    { name: 'eBay', search: q => `https://www.ebay.co.uk/sch/i.html?_nkw=${q}` },
  ],
  us: [
    { name: 'Back Market', search: q => `https://www.backmarket.com/en-us/search?q=${q}` },
    { name: 'eBay', search: q => `https://www.ebay.com/sch/i.html?_nkw=${q}` },
  ],
};

/** "Seconde main": the resale sites' own searches for the item, for its currency (else the language), to look further than Claude. */
export function marketplaceSearches(link: Pick<LinkItem, 'title' | 'url' | 'currency'>, lang: Locale): Marketplace[] {
  const name = link.title.trim() || slugTitle(link.url) || '';
  if (!name) return [];
  const region = link.currency === 'GBP' ? 'uk' : link.currency === 'USD' ? 'us' : link.currency === 'EUR' || lang === 'fr' ? 'fr' : 'us';
  const query = encodeURIComponent(name);
  return MARKETPLACES[region].map(site => ({ name: site.name, url: site.search(query) }));
}

/** The page "Garder une copie" made for a link: a live page whose first block is a bookmark of it. */
export function copyOf(linkId: string, blocks: BlockMap, children: ChildIndex): string | null {
  for (const block of Object.values(blocks)) {
    if (block.kind !== 'bookmark' || block.deletedAt !== null || block.target?.type !== 'link' || block.target.id !== linkId || !block.parentId) continue;
    const page = blocks[block.parentId];
    if (!page || page.kind !== 'page' || page.deletedAt !== null || isInBin(blocks, page.id)) continue;
    const first = (children[page.id] ?? []).find(id => blocks[id]?.deletedAt === null);
    if (first === block.id) return page.id;
  }
  return null;
}
