/**
 * What a web page says about itself: title, meta and Open Graph tags,
 * structured data, a readable excerpt of its text and its image candidates.
 */
import type { AnyNode, Element } from 'domhandler';
import { isTag, isText } from 'domhandler';
import { textContent } from 'domutils';
import { parseDocument } from 'htmlparser2';
import { foldText } from '@unlease/core/services/search';
import { parseJsonLd, parsePriceValue, parseRecipe, type Price, type RecipeData, type StructuredItem } from './jsonld';

export interface ImageCandidate {
  readonly url: string;
  /** Where it came from (og:image, json-ld...), shown to Claude. */
  readonly source: string;
}

export interface PageInfo {
  /** The document `<title>`. */
  readonly title: string | null;
  readonly description: string | null;
  readonly siteName: string | null;
  readonly canonical: string | null;
  readonly lang: string | null;
  /** Selected meta and Open Graph values, first occurrence of each. */
  readonly meta: Readonly<Record<string, string>>;
  /** From `product:price:amount` / `og:price:amount` (and currency). */
  readonly metaPrice: Price | null;
  readonly structured: readonly StructuredItem[];
  /** The lowest current offer in the structured data. */
  readonly structuredPrice: Price | null;
  /** A recipe's whole ingredient list, when its structured data gives one. */
  readonly recipe: RecipeData | null;
  readonly text: string;
  readonly images: readonly ImageCandidate[];
}

const TEXT_LIMIT = 6000;
const MAX_IMAGES = 6;

const KEPT_META = [
  'og:title',
  'og:description',
  'og:type',
  'og:site_name',
  'og:url',
  'og:locale',
  'twitter:title',
  'twitter:description',
  'description',
  'author',
  'application-name',
  'product:brand',
  'product:availability',
  'product:condition',
  'product:price:amount',
  'product:price:currency',
  'product:sale_price:amount',
  'product:sale_price:currency',
  'og:price:amount',
  'og:price:currency',
  'price',
  'pricecurrency',
  'article:published_time',
  'article:author',
  'article:section',
  'video:duration',
  'video:release_date',
  'music:musician',
  'book:author',
  'books:author',
  'book:isbn',
] as const;
const IMAGE_META = ['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src'];

const SKIPPED = new Set([
  'script',
  'style',
  'noscript',
  'svg',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  'template',
  'iframe',
  'button',
  'select',
  'canvas',
  'video',
  'audio',
  'object',
  'embed',
  'dialog',
  'head',
]);
const BLOCKS = new Set([
  'address',
  'article',
  'blockquote',
  'br',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'main',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'td',
  'th',
  'tr',
  'ul',
]);
/** Consent banners and newsletter pop-ups: present on every page, never what the page is about. */
const JUNK = /cookie|consent|gdpr|didomi|onetrust|newsletter/i;
const ICONISH = /(?:^|[/_.-])(?:logo|icon|sprite|avatar|favicon|pixel|spacer|blank|badge|flag)(?:[/_.-]|$)/i;

export function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** The body as text, in the charset the server or the page declares (UTF-8 otherwise). */
export function decodeHtml(body: Buffer, contentType: string | undefined): string {
  let charset = /charset\s*=\s*["']?([\w:.-]+)/i.exec(contentType ?? '')?.[1];
  if (!charset) {
    if (body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf) charset = 'utf-8';
    else if (body[0] === 0xff && body[1] === 0xfe) charset = 'utf-16le';
    else if (body[0] === 0xfe && body[1] === 0xff) charset = 'utf-16be';
    else charset = /<meta[^>]+charset\s*=\s*["']?\s*([\w:.-]+)/i.exec(body.subarray(0, 4096).toString('latin1'))?.[1];
  }
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}

interface Found {
  title: string | null;
  metas: Element[];
  links: Element[];
  base: string | null;
  lang: string | null;
  jsonLd: string[];
  mains: Element[];
  articles: Element[];
  body: Element | null;
}

function collect(nodes: AnyNode[]): Found {
  const found: Found = { title: null, metas: [], links: [], base: null, lang: null, jsonLd: [], mains: [], articles: [], body: null };
  const stack: { node: AnyNode; inSvg: boolean }[] = nodes.map(node => ({ node, inSvg: false })).reverse();
  while (stack.length > 0) {
    const { node, inSvg } = stack.pop()!;
    if (!isTag(node)) continue;
    const name = node.name;
    if (name === 'title' && !inSvg && found.title === null) found.title = collapse(textContent(node)) || null;
    else if (name === 'meta') found.metas.push(node);
    else if (name === 'link') found.links.push(node);
    else if (name === 'base' && found.base === null) found.base = node.attribs.href ?? null;
    else if (name === 'html' && found.lang === null) found.lang = node.attribs.lang?.trim() || null;
    else if (name === 'script' && /^application\/ld\+json/i.test(node.attribs.type?.trim() ?? '')) found.jsonLd.push(textContent(node));
    else if (name === 'main') found.mains.push(node);
    else if (name === 'article') found.articles.push(node);
    else if (name === 'body' && found.body === null) found.body = node;
    if (name === 'script' || name === 'style') continue;
    const childInSvg = inSvg || name === 'svg';
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: node.children[index]!, inSvg: childInSvg });
    }
  }
  return found;
}

function isHidden(element: Element): boolean {
  const { attribs } = element;
  if (attribs.hidden !== undefined || attribs['aria-hidden'] === 'true') return true;
  if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(attribs.style ?? '')) return true;
  return JUNK.test(`${attribs.id ?? ''} ${attribs.class ?? ''}`);
}

/** Readable text with block boundaries as line breaks; navigation, forms and scripts left out. */
function readableText(roots: readonly AnyNode[], limit: number): string {
  const parts: string[] = [];
  let size = 0;
  const stack: (AnyNode | '\n')[] = [...roots].reverse();
  while (stack.length > 0 && size < limit * 3) {
    const node = stack.pop()!;
    if (node === '\n') {
      parts.push('\n');
    } else if (isText(node)) {
      parts.push(node.data);
      size += node.data.length;
    } else if (isTag(node) && !SKIPPED.has(node.name) && !isHidden(node)) {
      if (BLOCKS.has(node.name)) {
        parts.push('\n');
        stack.push('\n');
      }
      for (let index = node.children.length - 1; index >= 0; index -= 1) stack.push(node.children[index]!);
    }
  }
  const lines: string[] = [];
  for (const raw of parts.join('').split('\n')) {
    const line = collapse(raw);
    if (line && line !== lines[lines.length - 1]) lines.push(line);
  }
  const text = lines.join('\n');
  if (text.length <= limit) return text;
  const cut = text.lastIndexOf(' ', limit - 1);
  return `${text.slice(0, cut > limit * 0.8 ? cut : limit - 1)}…`;
}

function textLength(element: Element): number {
  return readableText([element], 20_000).length;
}

function contentRoot(found: Found): Element | null {
  const main = found.mains.find(element => textLength(element) >= 200);
  if (main) return main;
  let best: Element | null = null;
  let bestLength = 0;
  for (const article of found.articles) {
    const length = textLength(article);
    if (length > bestLength) {
      best = article;
      bestLength = length;
    }
  }
  return bestLength >= 200 ? best : null;
}

function absolute(value: string | undefined | null, base: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('data:')) return null;
  try {
    const url = new URL(trimmed, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (/\.svg(?:$|[?#])/i.test(url.pathname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** The largest entry of a srcset, or its first when no widths are given. */
function fromSrcset(srcset: string | undefined): string | undefined {
  if (!srcset) return undefined;
  let best: { url: string; width: number } | undefined;
  for (const entry of srcset.split(',')) {
    const [url, descriptor] = entry.trim().split(/\s+/);
    if (!url) continue;
    const width = descriptor?.endsWith('w') ? Number(descriptor.slice(0, -1)) : descriptor?.endsWith('x') ? Number(descriptor.slice(0, -1)) * 1000 : 0;
    if (!best || width > best.width) best = { url, width };
  }
  return best?.url;
}

/** The first `<img>` in the content that looks like a photo rather than an icon. */
function firstLargeImage(root: Element, base: string): string | null {
  const stack: AnyNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (!isTag(node) || SKIPPED.has(node.name)) continue;
    if (node.name === 'img') {
      const { attribs } = node;
      const width = Number(attribs.width ?? 0);
      const height = Number(attribs.height ?? 0);
      const sized = width > 0 || height > 0;
      const big = !sized || (Math.max(width, height) >= 300 && Math.min(width || height, height || width) >= 150);
      const source =
        attribs['data-src'] ?? attribs['data-lazy-src'] ?? attribs['data-original'] ?? fromSrcset(attribs.srcset ?? attribs['data-srcset']) ?? attribs.src;
      const url = absolute(source, base);
      if (big && url && !ICONISH.test(new URL(url).pathname)) return url;
      continue;
    }
    for (let index = node.children.length - 1; index >= 0; index -= 1) stack.push(node.children[index]!);
  }
  return null;
}

function metaPrice(meta: ReadonlyMap<string, string[]>): Price | null {
  const pairs: [string, string][] = [
    ['product:sale_price:amount', 'product:sale_price:currency'],
    ['product:price:amount', 'product:price:currency'],
    ['og:price:amount', 'og:price:currency'],
    ['price', 'pricecurrency'],
  ];
  for (const [amountKey, currencyKey] of pairs) {
    const amount = parsePriceValue(meta.get(amountKey)?.[0]);
    if (amount === null || amount === 0) continue;
    const currency = meta.get(currencyKey)?.[0]?.trim().toUpperCase();
    return { amount, currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null };
  }
  return null;
}

const FETCHED_IMAGE_META = /^meta-(og:image(?::secure_url|:url)?|twitter:image(?::src)?):\s*(\S+)\s*$/gm;
const FETCHED_TITLE = /^(?:meta-og:title|title):\s*(.+)$/m;
/** `![alt](url "title")`, the alt with one level of brackets, the URL bare (parentheses balanced) or in `<…>`. */
const MARKDOWN_IMAGE = /!\[((?:[^[\]]|\[[^\]]*\])*)\]\(\s*(?:<([^>]+)>|((?:[^\s()]|\([^\s()]*\))+))/g;
const RASTER = /\.(?:jpe?g|png|webp|avif|gif)$/i;

/** Words of four letters or more, folded: what a picture's alt text shares with the page's title. */
const nameWords = (value: string): Set<string> => new Set(foldText(value).split(/[^\p{L}\p{N}]+/u).filter(word => word.length >= 4));

/**
 * The pictures of a page only Claude's web_fetch could read: its document opens with the page's
 * meta tags as front matter ("meta-og:image: …"), then the page as Markdown. The og:image comes
 * first; of the page's own images only those whose alt text names the page's subject ("Brique de
 * verre … - 2"), never menus, promotions or logos.
 */
export function fetchedImages(document: string, pageUrl: string): ImageCandidate[] {
  const images: ImageCandidate[] = [];
  const seen = new Set<string>();
  const add = (value: string, source: string) => {
    const url = absolute(value, pageUrl);
    if (!url || images.length >= MAX_IMAGES) return;
    const { origin, pathname } = new URL(url);
    // The same picture is often linked at several sizes (`media.jpg?width=650`): one per image file.
    const key = RASTER.test(pathname) ? origin + pathname : url;
    if (seen.has(key) || ICONISH.test(pathname)) return;
    seen.add(key);
    images.push({ url, source });
  };
  const front = /^---\n([\s\S]*?)\n---/.exec(document)?.[1] ?? '';
  for (const match of front.matchAll(FETCHED_IMAGE_META)) add(match[2]!, match[1]!);
  // The title without the site's name after it ("Brique de verre … | Leroy Merlin"): a logo's alt is the site's name.
  const subject = nameWords((FETCHED_TITLE.exec(front)?.[1] ?? '').split(/\s+[|\-\u2013\u2014\u00b7]\s+/)[0]!);
  for (const match of document.matchAll(MARKDOWN_IMAGE)) {
    const shared = [...nameWords(match[1]!)].filter(word => subject.has(word)).length;
    if (shared > 0 && shared >= Math.min(2, subject.size)) add(match[2] ?? match[3]!, 'web_fetch image');
  }
  return images;
}

export function parsePage(html: string, pageUrl: string): PageInfo {
  const document = parseDocument(html, { decodeEntities: true });
  const found = collect(document.children);
  const base = absolute(found.base, pageUrl) ?? pageUrl;

  const meta = new Map<string, string[]>();
  for (const element of found.metas) {
    const { attribs } = element;
    const key = (attribs.property ?? attribs.name ?? attribs.itemprop)?.trim().toLowerCase();
    const content = attribs.content;
    if (!key || content === undefined) continue;
    const value = collapse(content);
    if (!value) continue;
    const list = meta.get(key) ?? [];
    list.push(value);
    meta.set(key, list);
  }
  const first = (key: string): string | null => meta.get(key)?.[0] ?? null;

  let canonical: string | null = null;
  const images: ImageCandidate[] = [];
  const addImage = (value: string | null | undefined, source: string) => {
    const url = absolute(value, base);
    if (url && images.length < MAX_IMAGES && !images.some(image => image.url === url)) images.push({ url, source });
  };
  for (const key of IMAGE_META) for (const value of meta.get(key) ?? []) addImage(value, key);

  const structured = parseJsonLd(found.jsonLd);
  for (const image of structured.images) addImage(image, 'json-ld');
  for (const element of found.links) {
    const rel = (element.attribs.rel ?? '').toLowerCase().split(/\s+/);
    if (rel.includes('canonical') && !canonical) canonical = absolute(element.attribs.href, base);
    if (rel.includes('image_src')) addImage(element.attribs.href, 'link image_src');
  }
  const root = contentRoot(found);
  const imageRoot = root ?? found.body;
  if (imageRoot) addImage(firstLargeImage(imageRoot, base), 'page image');

  const kept: Record<string, string> = {};
  for (const key of KEPT_META) {
    const value = first(key);
    if (value) kept[key] = value.length > 500 ? `${value.slice(0, 499)}…` : value;
  }

  return {
    title: found.title,
    description: first('og:description') ?? first('description') ?? first('twitter:description'),
    siteName: first('og:site_name') ?? first('application-name'),
    canonical,
    lang: found.lang,
    meta: kept,
    metaPrice: metaPrice(meta),
    structured: structured.items,
    structuredPrice: structured.price,
    recipe: parseRecipe(found.jsonLd),
    text: readableText(root ? [root] : found.body ? [found.body] : document.children, TEXT_LIMIT),
    images,
  };
}
