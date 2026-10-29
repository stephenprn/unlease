/**
 * URLs as people share them: found inside prose, stripped of the tracking parameters
 * that make two shares of one product look like two products.
 */

const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>"'«»“”]+/gi;
/** Trailing characters that belong to the sentence, not the link. */
const TRAILING = /[.,;:!?'"»”…]$/;
/** A closing bracket ends the sentence only when the link did not open it: « (voir https://x.fr/a) », but « …/The_Bear_(TV_series) ». */
const BRACKETS: Readonly<Record<string, string>> = { ')': '(', ']': '[', '}': '{' };

function trimTrailing(candidate: string): string {
  let end = candidate.length;
  while (end > 0) {
    const last = candidate[end - 1]!;
    const opener = BRACKETS[last];
    if (opener) {
      const kept = candidate.slice(0, end);
      if (kept.split(opener).length >= kept.split(last).length) break;
    } else if (!TRAILING.test(last)) break;
    end -= 1;
  }
  return candidate.slice(0, end);
}

/** Parameters that only say where a click came from, on any site. */
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'gclsrc',
  'gbraid',
  'wbraid',
  'dclid',
  'gad_source',
  'gad_campaignid',
  '_ga',
  '_gl',
  'msclkid',
  'yclid',
  'twclid',
  'ttclid',
  'li_fat_id',
  'epik',
  'rb_clickid',
  's_cid',
  's_kwcid',
  'ef_id',
  'irclickid',
  'irgwc',
  'cjevent',
  'cjdata',
  'awc',
  'ranmid',
  'raneaid',
  'ransiteid',
  'ocid',
  'wt_mc',
  'wt_zmc',
  'igshid',
  'igsh',
  'mc_cid',
  'mc_eid',
  'mc_tc',
  'mkt_tok',
  '_hsenc',
  '_hsmi',
  '__hssc',
  '__hstc',
  '__hsfp',
  'hsctatracking',
  '_kx',
  'ml_subscriber',
  'ml_subscriber_hash',
  'ck_subscriber_id',
  'vgo_ee',
  '_branch_match_id',
  '_branch_referrer',
  'fb_action_ids',
  'fb_action_types',
  'fb_ref',
  'fb_source',
  'action_object_map',
  'action_type_map',
  'action_ref_map',
  'spjobid',
  'spmailingid',
  'spreportid',
  'spuserid',
  'soc_src',
  'soc_trk',
  '_openstat',
  'ref_src',
  'ref_url',
  'spm',
  'scm',
  'si',
  'share_id',
  'shareid',
  'sharer',
  'feature',
  'srsltid',
  'trk',
  'trkcampaign',
  'cmpid',
  'campaign',
  'xtor',
  'at_medium',
  'at_campaign',
  'ns_campaign',
  'ns_source',
  'ns_mchannel',
  'ns_linkname',
  'oly_anon_id',
  'oly_enc_id',
  'vero_id',
  'wickedid',
  '__twitter_impression',
  'tt_medium',
  'tt_content',
  'is_from_webapp',
  'sender_device',
  'web_id',
]);

/** Families of trackers: Google Analytics, Matomo, HubSpot ads, Listrak… */
const TRACKING_PREFIXES = ['utm_', 'pk_', 'mtm_', 'matomo_', 'piwik_', 'hsa_', 'oft_', 'itm_', 'hmb_', 'trk_', '_bta_'];

interface SiteRule {
  readonly hosts: RegExp;
  /** Parameters that only track on this site. */
  readonly params?: readonly string[];
  readonly prefixes?: readonly string[];
  /** Paths the path alone names: every parameter goes. */
  readonly bare?: RegExp;
  /** Removes a tracking segment from the path (Amazon's `/ref=…`). */
  readonly path?: (path: string) => string;
}

const site = (domain: string): RegExp => new RegExp(`(^|\\.)${domain.replace(/\./g, '\\.')}$`);
/** Every country site: amazon.fr, amazon.co.uk… */
const anyTld = (name: string): RegExp => new RegExp(`(^|\\.)${name}\\.[a-z]{2,3}(\\.[a-z]{2})?$`);

const SITE_RULES: readonly SiteRule[] = [
  {
    hosts: anyTld('amazon'),
    path: path => {
      const product = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?=\/|$)/i.exec(path);
      return product ? `/dp/${product[1]!.toUpperCase()}` : path.replace(/\/ref=[^/]*$/, '');
    },
    bare: /^\/dp\/[A-Z0-9]{10}$/,
    params: ['ref', 'ref_', 'content-id', 'crid', 'sprefix', 'qid', 'sr', 'dib', 'dib_tag', '_encoding', 'psc', 'th', 'linkcode', 'linkid', 'tag', 'ascsubtag', 'camp', 'creative', 'creativeasin', 'social_share', 'smid', 'spia', 'sbo', 'starsleft', 'skiptwisterog'],
    prefixes: ['pf_rd_', 'pd_rd_'],
  },
  { hosts: /(^|\.)(youtube\.com|youtu\.be)$/, params: ['pp', 'ab_channel', 'embeds_referring_euri', 'source_ve_path'] },
  { hosts: site('open.spotify.com'), bare: /^\/(intl-[a-z-]+\/)?(track|album|playlist|episode|show|artist)\// },
  { hosts: site('instagram.com'), params: ['ig_rid', 'ig_mid'] },
  { hosts: site('tiktok.com'), bare: /\/video\/\d+/ },
  { hosts: /(^|\.)(twitter\.com|x\.com)$/, bare: /\/status\/\d+/, params: ['s', 't', 'src', 'cn', 'refsrc'] },
  { hosts: /(^|\.)(facebook\.com|fb\.com|fb\.watch)$/, params: ['mibextid', 'rdid', 'share_url', 'sfnsn', 'ref', '_rdr', '__tn__', 'paipv', 'eav', 'extid', '__xts__'], prefixes: ['__cft__'] },
  { hosts: site('linkedin.com'), params: ['trackingid', 'refid', 'lipi', 'lici', 'midtoken', 'midsig', 'trkemail', 'eid', 'otptoken', 'originalsubdomain', 'rcm'] },
  { hosts: site('reddit.com'), params: ['rdt', 'ref', 'ref_source', '$deep_link', 'correlation_id', 'post_index'] },
  {
    hosts: anyTld('aliexpress'),
    bare: /^\/item\//,
    params: ['pvid', 'sk', 'terminal_id', 'afsmartredirect', 'gatewayadapt', 'srcsns', 'spreadtype', 'biztype', 'social_params', 'tt', 'ws_ab_test', 'sourcetype', 'btsid', 'mall_affr'],
    prefixes: ['algo_', 'aff_', 'pdp_', '_randl_', 'utparam'],
  },
  { hosts: anyTld('ebay'), params: ['_trkparms', '_trksid', 'hash', 'amdata', 'mkevt', 'mkcid', 'mkrid', 'campid', 'toolid', 'customid', '_from'] },
  { hosts: site('etsy.com'), params: ['ref', 'click_key', 'click_sum', 'pro', 'frs', 'sts', 'organic_search_click', 'plkey', 'sr_prefetch', 'pf_from', 'bes', 'content_source', 'logging_key'], prefixes: ['ga_'] },
  { hosts: site('booking.com'), params: ['aid', 'label', 'sid', 'srpvid', 'srepoch', 'all_sr_blocks', 'highlighted_blocks', 'hpos', 'hapos', 'sr_order', 'matching_block_id', 'sr_pri_blocks', 'ucfs', 'arphpl'] },
  { hosts: anyTld('airbnb'), params: ['source_impression_id', 'previous_page_section_name', 'federated_search_id'] },
  { hosts: anyTld('vinted'), params: ['referrer', 'homepage_session_id', 'search_id'] },
  { hosts: anyTld('zalando'), params: ['_rfl'] },
  { hosts: anyTld('google'), params: ['ved', 'ei', 'sa', 'usg', 'gs_lcp', 'gs_lp', 'gs_ssp', 'sclient', 'aqs', 'sourceid', 'oq', 'uact', 'bih', 'biw', 'iflsig', 'rlz', 'sxsrf', 'dpr'] },
];

function isTrackingParam(lower: string, rule: SiteRule | undefined): boolean {
  if (TRACKING_PARAMS.has(lower) || TRACKING_PREFIXES.some(prefix => lower.startsWith(prefix))) return true;
  if (!rule) return false;
  return (rule.params?.includes(lower) ?? false) || (rule.prefixes?.some(prefix => lower.startsWith(prefix)) ?? false);
}

/** In order, without duplicates. */
export function extractUrls(text: string): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  for (const match of text.matchAll(URL_IN_TEXT)) {
    const candidate = trimTrailing(match[0]);
    if (isHttpUrl(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      found.push(candidate);
    }
  }
  if (found.length === 0) {
    // A bare domain ("zara.com/fr") counts only as the whole text, so prose is never a link.
    const trimmed = text.trim();
    if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(trimmed)) {
      const withScheme = `https://${trimmed}`;
      if (isHttpUrl(withScheme)) found.push(withScheme);
    }
  }
  return found;
}

export function isHttpUrl(value: string): boolean {
  const parsed = parseUrl(value);
  return parsed !== null && (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.includes('.');
}

interface ParsedUrl {
  protocol: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
}

/** Hand-rolled: Hermes's `URL` has incomplete `searchParams` and setters. */
export function parseUrl(value: string): ParsedUrl | null {
  const match = /^([a-z][a-z0-9+.-]*:)\/\/(?:[^@/?#\s]*@)?(\[[^\]]+\]|[^:/?#\s]+)(?::(\d+))?([^?#\s]*)(\?[^#\s]*)?(#\S*)?$/i.exec(
    value.trim(),
  );
  if (!match) return null;
  return {
    protocol: match[1]!.toLowerCase(),
    hostname: match[2]!.toLowerCase(),
    port: match[3] ?? '',
    pathname: match[4] || '/',
    search: match[5] ?? '',
    hash: match[6] ?? '',
  };
}

export interface CleanedUrl {
  readonly url: string;
  /** What came off, by name: tracking parameters, and `ref` for a tracking path segment. */
  readonly removed: readonly string[];
}

/** Lowercase host, no default port, no tracking, no fragment unless a route (`#/item/3`). */
export function cleanUrl(value: string): CleanedUrl {
  const parsed = parseUrl(value);
  if (!parsed) return { url: value.trim(), removed: [] };
  const port =
    parsed.port && !((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80'))
      ? `:${parsed.port}`
      : '';
  const rule = SITE_RULES.find(candidate => candidate.hosts.test(parsed.hostname));
  const removed: string[] = [];
  const pathname = rule?.path ? rule.path(parsed.pathname) : parsed.pathname;
  if (pathname !== parsed.pathname && /\/ref=/.test(parsed.pathname)) removed.push('ref');
  const bare = rule?.bare?.test(pathname) ?? false;
  const kept: string[] = [];
  for (const pair of parsed.search.replace(/^\?/, '').split('&')) {
    if (pair.length === 0) continue;
    const name = decodeSafe(pair.split('=')[0] ?? '').toLowerCase();
    if (bare || isTrackingParam(name, rule)) removed.push(name);
    else kept.push(pair);
  }
  const search = kept.length > 0 ? `?${kept.join('&')}` : '';
  const hash = parsed.hash.startsWith('#/') || parsed.hash.startsWith('#!') ? parsed.hash : '';
  return { url: `${parsed.protocol}//${parsed.hostname}${port}${pathname}${search}${hash}`, removed: [...new Set(removed)] };
}

export function normalizeUrl(value: string): string {
  return cleanUrl(value).url;
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** A title for an unread link: "zara.com/fr/veste-laine". */
export function prettyUrl(value: string, max = 64): string {
  const parsed = parseUrl(value);
  if (!parsed) return value;
  const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
  const pretty = `${displayHost(value)}${decodeSafe(path)}`;
  return pretty.length > max ? `${pretty.slice(0, max - 1)}…` : pretty;
}

/** "zara.com" for https://www.zara.com/fr/…: what a person calls the site. */
export function displayHost(value: string): string {
  const parsed = parseUrl(value);
  if (!parsed) return value;
  return parsed.hostname.replace(/^(www\d?|m|mobile|amp)\./, '');
}

/** Public suffixes of two labels common enough to meet ("bbc.co.uk", not "co.uk"). */
const TWO_LABEL_SUFFIX = /\.(?:co|com|org|net|gov|gouv|ac|edu|ne|or|go|asso|nom|ltd|plc|sch|mil)\.[a-z]{2}$/;
/** Hosts that give each site a subdomain of its own: there the subdomain is the site. */
const SHARED_HOST = /\.(?:bandcamp\.com|substack\.com|github\.io|gitlab\.io|blogspot\.com|wordpress\.com|tumblr\.com|myshopify\.com|notion\.site|vercel\.app|netlify\.app|pages\.dev|wixsite\.com|carrd\.co|over-blog\.com|canalblog\.com)$/;

/** The site's own domain, without any subdomain: "eryone3d.com" for fr.eryone3d.com. */
export function siteDomain(value: string): string {
  const parsed = parseUrl(value);
  if (!parsed) return value;
  const host = parsed.hostname.replace(/\.+$/, '').replace(/^www\d?\./, '');
  if (host.startsWith('[') || /^\d+(\.\d+){3}$/.test(host)) return host;
  return host
    .split('.')
    .slice(SHARED_HOST.test(host) || TWO_LABEL_SUFFIX.test(host) ? -3 : -2)
    .join('.');
}

/** Words that name a section, a language or a route, never the thing: "produits", "fr-fr", "dp", "watch"… */
const ROUTE_WORD =
  /^(?:[a-z]|[a-z]{2}(?:[-_][a-z]{2})?|intl[-_][a-z]{2}|products?|produits?|productpage|dp|gp|items?|itm|shop|store|boutique|collections?|category|categories|catalog|status|watch|shorts|reels?|videos?|tracks?|albums?|playlists?|artists?|title|rooms?|pins?|search|recherche|share|channel|user|maps|place|events?|article|articles|posts?|blog|news|index|default|home|accueil)$/i;
/** A figure, or letters around one: what sits around a reference at either end of a slug ("i034992", "01", "47"). */
const FIGURE_WORD = /^[a-z]{0,3}\d[a-z\d]*$/i;
/** A reference: four figures or more in a row ("9899", "tt1234567", "p4512"). */
const REFERENCE = /\d{4}/;

/** Drops the run of figures at the end of a slug when a reference is in it ("…-washed-i034992-01-47"), not a short number of the name ("air-max-90"). */
function dropReferences(words: string[]): string[] {
  let end = words.length;
  while (end > 0 && FIGURE_WORD.test(words[end - 1]!)) end -= 1;
  return words.slice(end).some(word => REFERENCE.test(word)) ? words.slice(0, end) : words;
}

/** One word of letters and figures, or of capitals inside, is an id: "B08N5WRWNW", "dQw4w9WgXcQ". */
const isId = (word: string): boolean => (/\d/.test(word) && /\p{L}/u.test(word)) || /\p{Ll}\p{Lu}.*\p{Ll}\p{Lu}/u.test(word);

/** A readable name from the address of a page nobody read: "Alpha sv jacket" for …/shop/mens/alpha-sv-jacket-9899; null when the address names nothing. */
export function slugTitle(value: string): string | null {
  const parsed = parseUrl(value);
  if (!parsed) return null;
  const segments = decodeSafe(parsed.pathname).split('/').filter(Boolean).reverse();
  for (const raw of segments) {
    // Map data and coordinates ("data=!3m1…", "@48.85,2.29,17z").
    if (/[=!,;]/.test(raw)) continue;
    const segment = raw.replace(/\.(?:s?html?|php|aspx?|jsp|cfm)$/i, '').replace(/\.[a-z]{2}$/i, '');
    if (ROUTE_WORD.test(segment)) continue;
    const words = dropReferences(dropReferences(segment.split(/[-_+.\s]+/).filter(Boolean)).reverse()).reverse();
    if (words.length === 1 && isId(words[0]!)) continue;
    if (words.every(word => ROUTE_WORD.test(word)) || !words.some(word => /\p{L}{3,}/u.test(word))) continue;
    const text = words.join(' ');
    return text.charAt(0).toLocaleUpperCase('fr') + text.slice(1);
  }
  return null;
}
