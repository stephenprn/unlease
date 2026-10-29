/**
 * An article's text as page blocks, for "Garder une copie": the page's main content (its marked
 * article body, else the element holding the most paragraph text), as headings, paragraphs, lists,
 * quotes, code and pictures, with bold, italic, code and links kept. Navigation, forms, share bars,
 * newsletters and related links are left out. Pictures come back as addresses: the copier keeps
 * them as files.
 */
import type { AnyNode, Element } from 'domhandler';
import { isTag, isText, Text } from 'domhandler';
import { textContent } from 'domutils';
import { parseDocument } from 'htmlparser2';
import type { BlockKind } from '@unlease/notes/models/blocks';
import { concatRich, serializeRich, type FlagMark, type Marks, type Run } from '@unlease/core/services/richText';

export interface ArticleDraft {
  readonly kind: BlockKind;
  /** Markup for the rich kinds, the source for code. */
  readonly text: string;
  readonly language?: string;
  /** A picture to keep: its absolute address. */
  readonly image?: string;
  readonly children?: readonly ArticleDraft[];
}

export interface Article {
  readonly title: string;
  readonly byline: string;
  /** `2026-10-21`, when the page says. */
  readonly published: string | null;
  readonly drafts: readonly ArticleDraft[];
}

const LIMITS = { drafts: 1500, text: 150_000, images: 12, title: 300 } as const;

/** Never content: scripts, chrome, forms, embeds. */
const SKIPPED = new Set(['script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed', 'svg', 'canvas', 'form', 'button', 'input', 'select', 'textarea', 'label', 'nav', 'aside', 'footer', 'dialog', 'menu']);
/** What a class or an id says is not the article. */
const JUNK =
  /(?:^|[\s_-])(?:share|sharing|social|related|recommend|newsletter|subscribe|subscription|promo|advert|ads?|sponsor|cookie|consent|gdpr|comments?|disqus|breadcrumbs?|pagination|toolbar|sidebar|popup|modal|paywall|signup|outbrain|taboola)(?:$|[\s_-])/i;
const INLINE = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'font', 'i', 'ins', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr', 'br']);
const ICONISH = /(?:^|[/_.-])(?:logo|icon|sprite|avatar|favicon|pixel|spacer|blank|badge|flag|emoji)(?:[/_.-]|$)/i;

const collapse = (value: string): string => value.replace(/\s+/g, ' ');

/** Hidden, or a navigation or a sidebar by its role: what the element says of itself, not its class names. */
function isConcealed(element: Element): boolean {
  const { attribs } = element;
  if (attribs.hidden !== undefined || attribs['aria-hidden'] === 'true') return true;
  if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(attribs.style ?? '')) return true;
  return attribs.role === 'navigation' || attribs.role === 'complementary';
}

function isHidden(element: Element): boolean {
  return isConcealed(element) || JUNK.test(`${element.attribs.id ?? ''} ${element.attribs.class ?? ''}`);
}

function absolute(value: string | undefined, base: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('javascript:')) return null;
  try {
    const url = new URL(trimmed, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** The largest of a srcset, or its first when it gives no widths. */
function fromSrcset(srcset: string | undefined): string | undefined {
  if (!srcset) return undefined;
  let best: { url: string; width: number } | null = null;
  for (const part of srcset.split(',')) {
    const [url, size] = part.trim().split(/\s+/);
    if (!url) continue;
    const width = size?.endsWith('w') ? Number(size.slice(0, -1)) : 0;
    if (!best || width > best.width) best = { url, width };
  }
  return best?.url;
}

function imageAddress(element: Element, base: string): string | null {
  const { attribs } = element;
  const width = Number(attribs.width ?? 0);
  const height = Number(attribs.height ?? 0);
  if ((width > 0 && width < 80) || (height > 0 && height < 80)) return null;
  const raw = attribs['data-src'] ?? attribs['data-lazy-src'] ?? attribs['data-original'] ?? fromSrcset(attribs['data-srcset']) ?? fromSrcset(attribs.srcset) ?? attribs.src;
  const url = absolute(raw, base);
  if (!url || /\.svg(?:$|[?#])/i.test(new URL(url).pathname) || ICONISH.test(new URL(url).pathname)) return null;
  return url;
}

// ── finding the article ───────────────────────────────────────────────────

function elementsOf(nodes: readonly AnyNode[], test: (element: Element) => boolean, out: Element[] = []): Element[] {
  for (const node of nodes) {
    if (!isTag(node)) continue;
    if (test(node)) out.push(node);
    elementsOf(node.children, test, out);
  }
  return out;
}

const textLength = (element: Element): number => collapse(textContent(element)).trim().length;

function linkDensity(element: Element): number {
  const total = textLength(element);
  if (total === 0) return 1;
  const linked = elementsOf(element.children, node => node.name === 'a').reduce((sum, link) => sum + textLength(link), 0);
  return linked / total;
}

/**
 * Inside a footer, a sidebar or a navigation, or a hidden block, below the body: never the article. A
 * wrapper's class names are not asked (`content-sidebar-wrap` holds whole articles, a body's
 * `has-sidebar` the whole page), nor is a form (ASP.NET wraps every page in one).
 */
function buried(element: Element): boolean {
  for (let node = element.parent; node && isTag(node) && node.name !== 'body' && node.name !== 'html'; node = node.parent) {
    if ((SKIPPED.has(node.name) && node.name !== 'form') || isConcealed(node)) return true;
  }
  return false;
}

/** Readability's idea: each paragraph scores its parent, and half for its grandparent; the best-scored element, its links discounted, holds the article. */
function contentRoot(body: Element): Element | null {
  const marked = elementsOf(body.children, element => element.attribs.itemprop === 'articleBody' || element.attribs.itemprop === 'text');
  const best = marked.find(element => textLength(element) >= 200);
  if (best) return best;
  const scores = new Map<Element, number>();
  for (const paragraph of elementsOf(body.children, element => element.name === 'p' || element.name === 'pre')) {
    const length = textLength(paragraph);
    if (length < 25 || buried(paragraph)) continue;
    const score = 1 + Math.min(3, Math.floor(length / 100)) + (textContent(paragraph).match(/,/g)?.length ?? 0) * 0.1;
    const parent = paragraph.parent;
    if (parent && isTag(parent)) scores.set(parent, (scores.get(parent) ?? 0) + score);
    const grand = parent?.parent;
    if (grand && isTag(grand)) scores.set(grand, (scores.get(grand) ?? 0) + score / 2);
  }
  let root: Element | null = null;
  let top = 0;
  for (const [element, score] of scores) {
    // A body's classes speak of the whole page.
    if (element.name !== 'body' && isHidden(element)) continue;
    const weighted = score * (1 - linkDensity(element));
    if (weighted > top) {
      top = weighted;
      root = element;
    }
  }
  return root;
}

// ── the article as blocks ─────────────────────────────────────────────────

const MARKS_OF: Readonly<Record<string, FlagMark>> = { b: 'b', strong: 'b', i: 'i', em: 'i', cite: 'i', u: 'u', s: 's', del: 's', strike: 's', code: 'c', kbd: 'c', samp: 'c' };

/** An element's inline content as rich text runs, its spaces collapsed. */
function runsOf(nodes: readonly AnyNode[], base: string, marks: Marks = {}, out: Run[] = []): Run[] {
  for (const node of nodes) {
    if (isText(node)) {
      if (node.data) out.push({ kind: 'text', text: collapse(node.data), marks });
      continue;
    }
    if (!isTag(node) || SKIPPED.has(node.name) || isHidden(node)) continue;
    if (node.name === 'br') {
      out.push({ kind: 'text', text: ' ', marks });
      continue;
    }
    if (node.name === 'img') continue;
    const flag = MARKS_OF[node.name];
    let inner: Marks = flag ? { ...marks, [flag]: true } : marks;
    if (node.name === 'a') {
      const href = absolute(node.attribs.href, base);
      // Past this a mark no longer reads as one (`parseRich`): the words stay, unlinked.
      if (href && href.length <= 4000) inner = { ...inner, a: href };
    }
    // A block inside inline content (a card's lines inside its link) still ends its words: « Paris Devis », never « ParisDevis ».
    const block = !INLINE.has(node.name);
    if (block) out.push({ kind: 'text', text: ' ', marks: inner });
    runsOf(node.children, base, inner, out);
    if (block) out.push({ kind: 'text', text: ' ', marks: inner });
  }
  return out;
}

/** Runs as markup, one space between words across runs, trimmed at both ends; '' when nothing is left. */
function markup(runs: Run[]): string {
  const spaced: Run[] = [];
  let afterSpace = true;
  for (const run of runs) {
    if (run.kind !== 'text') {
      spaced.push(run);
      afterSpace = false;
      continue;
    }
    const words: string = afterSpace ? run.text.replace(/^ +/, '') : run.text;
    if (!words) continue;
    spaced.push({ ...run, text: words });
    afterSpace = words.endsWith(' ');
  }
  const last = spaced[spaced.length - 1];
  if (last?.kind === 'text') spaced[spaced.length - 1] = { ...last, text: last.text.replace(/ +$/, '') };
  const kept = concatRich(spaced.filter(run => run.kind !== 'text' || run.text.length > 0));
  return kept.length > 0 ? serializeRich(kept) : '';
}

const italic = (runs: Run[]): Run[] => runs.map(run => (run.kind === 'text' ? { ...run, marks: { ...run.marks, i: true as const } } : run));

const HEADINGS: Readonly<Record<string, BlockKind>> = { h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h4', h6: 'h4' };

class Builder {
  readonly drafts: ArticleDraft[] = [];
  private pending: AnyNode[] = [];
  private size = 0;
  private images = 0;

  constructor(
    private readonly base: string,
    private readonly title: string,
  ) {}

  get full(): boolean {
    return this.drafts.length >= LIMITS.drafts || this.size >= LIMITS.text;
  }

  private push(draft: ArticleDraft): void {
    if (this.full) return;
    this.size += draft.text.length;
    this.drafts.push(draft);
  }

  /** Loose inline content met between blocks: one paragraph, unless it is only links to several places (a row of cards or tags). */
  flush(): void {
    if (this.pending.length === 0) return;
    const runs = runsOf(this.pending, this.base);
    this.pending = [];
    const worded = runs.filter(run => run.kind !== 'text' || run.text.trim() !== '');
    const places = new Set(worded.map(run => (run.kind === 'text' ? run.marks.a : undefined)));
    if (worded.length > 0 && !places.has(undefined) && places.size >= 2) return;
    const text = markup(runs);
    if (text) this.push({ kind: 'text', text });
  }

  private image(element: Element): void {
    const url = imageAddress(element, this.base);
    if (!url || this.images >= LIMITS.images || this.drafts.some(draft => draft.image === url)) return;
    this.images += 1;
    this.push({ kind: 'image', text: '', image: url });
  }

  private list(element: Element, depth: number): ArticleDraft[] {
    const kind: BlockKind = element.name === 'ol' ? 'numbered' : 'bullet';
    const items: ArticleDraft[] = [];
    for (const item of element.children) {
      if (!isTag(item) || item.name !== 'li' || isHidden(item)) continue;
      const nested = item.children.filter((child): child is Element => isTag(child) && (child.name === 'ul' || child.name === 'ol'));
      const text = markup(runsOf(item.children.filter(child => !nested.includes(child as Element)), this.base));
      const children = depth < 2 ? nested.flatMap(child => this.list(child, depth + 1)) : [];
      // An item holding only a list: that list in its place.
      if (text) items.push({ kind, text, ...(children.length > 0 ? { children } : {}) });
      else items.push(...children);
    }
    return items;
  }

  walk(nodes: readonly AnyNode[]): void {
    for (const node of nodes) {
      if (this.full) return;
      if (isText(node)) {
        // A space between two inline elements keeps their words apart.
        if (node.data.trim() || this.pending.length > 0) this.pending.push(node);
        continue;
      }
      if (!isTag(node) || SKIPPED.has(node.name) || isHidden(node)) continue;
      const name = node.name;
      if (INLINE.has(name)) {
        // A picture inside a link or a span still counts as one, after the words before it.
        const images = elementsOf([node], element => element.name === 'img');
        if (images.length > 0) this.flush();
        for (const image of images) this.image(image);
        // Side by side with no space between, two elements would glue two words (chips a layout's gap keeps apart: « vitesse », « radars »).
        const last = this.pending[this.pending.length - 1];
        if (last && isTag(last) && /[\p{L}\p{N}]$/u.test(textContent(last)) && /^[\p{L}\p{N}]/u.test(textContent(node))) this.pending.push(new Text(' '));
        this.pending.push(node);
        continue;
      }
      this.flush();
      const heading = HEADINGS[name];
      if (heading) {
        const text = markup(runsOf(node.children, this.base));
        // The title is the page's own: not again as a heading.
        const words = collapse(textContent(node)).trim().toLowerCase();
        const title = this.title.toLowerCase();
        if (text && !(heading === 'h1' && words && title && (title.includes(words) || words.includes(title)))) this.push({ kind: heading, text });
      } else if (name === 'p') {
        for (const image of elementsOf([node], element => element.name === 'img')) this.image(image);
        const text = markup(runsOf(node.children, this.base));
        if (text) this.push({ kind: 'text', text });
      } else if (name === 'ul' || name === 'ol') {
        for (const item of this.list(node, 0)) this.push(item);
      } else if (name === 'blockquote') {
        const paragraphs = elementsOf(node.children, element => element.name === 'p');
        for (const part of paragraphs.length > 0 ? paragraphs : [node]) {
          const text = markup(italic(runsOf(part.children, this.base)));
          if (text) this.push({ kind: 'callout', text });
        }
      } else if (name === 'pre') {
        const source = textContent(node).replace(/\s+$/, '');
        const language = /(?:^|\s)(?:language|lang)-([a-z0-9+#-]{1,30})/i.exec(`${node.attribs.class ?? ''} ${elementsOf(node.children, element => element.name === 'code')[0]?.attribs.class ?? ''}`)?.[1]?.toLowerCase();
        if (source.trim()) this.push({ kind: 'code', text: source, ...(language ? { language } : {}) });
      } else if (name === 'img') {
        this.image(node);
      } else if (name === 'figcaption') {
        // A figure's other children (pictures, a table, a quote, code) go through the walk as anywhere.
        const text = markup(italic(runsOf(node.children, this.base)));
        if (text) this.push({ kind: 'text', text });
      } else if (name === 'table') {
        for (const row of elementsOf(node.children, element => element.name === 'tr')) {
          const cells = row.children.filter((cell): cell is Element => isTag(cell) && (cell.name === 'td' || cell.name === 'th')).map(cell => collapse(textContent(cell)).trim()).filter(Boolean);
          if (cells.length > 0) this.push({ kind: 'text', text: markup([{ kind: 'text', text: cells.join(' · '), marks: {} }]) });
        }
      } else if (name !== 'hr' && name !== 'header') {
        this.walk(node.children);
      }
    }
    this.flush();
  }
}

function metaContent(document: readonly AnyNode[], keys: readonly string[], accept: (content: string) => boolean = () => true): string | null {
  for (const element of elementsOf(document, node => node.name === 'meta')) {
    const key = (element.attribs.property ?? element.attribs.name ?? element.attribs.itemprop ?? '').trim().toLowerCase();
    const content = element.attribs.content?.trim();
    if (content && keys.includes(key) && accept(content)) return collapse(content);
  }
  return null;
}

/** A byline is a name: WordPress pages put the author's Facebook address in `article:author` first. */
const isName = (content: string): boolean => !/^(https?:)?\/\/|^www\./i.test(content);

/** The article in a page, or null when nothing reads like one. `title` is the page's own (its og:title, else its <title>). */
export function extractArticle(html: string, pageUrl: string, title: string): Article | null {
  const document = parseDocument(html, { decodeEntities: true });
  const body = elementsOf(document.children, element => element.name === 'body')[0];
  if (!body) return null;
  const root = contentRoot(body);
  if (!root) return null;
  const shortTitle = collapse(title).trim().slice(0, LIMITS.title);
  const builder = new Builder(pageUrl, shortTitle);
  builder.walk(root.children);
  const drafts = builder.drafts;
  if (!drafts.some(draft => draft.kind !== 'image')) return null;
  const published = metaContent(document.children, ['article:published_time', 'datepublished', 'date', 'pubdate'])?.slice(0, 10) ?? null;
  return {
    title: shortTitle,
    byline: (metaContent(document.children, ['author', 'article:author', 'byl'], isName) ?? '').slice(0, 200),
    published: published && /^\d{4}-\d{2}-\d{2}$/.test(published) ? published : null,
    drafts,
  };
}
