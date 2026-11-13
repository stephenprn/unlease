/**
 * Lists of addresses: which lines of a note (or items of a checklist) hold an address, the words
 * beside each, and the lines that hold none. Shared by the Keep import (a note made of links can
 * become a collection, `services/keepImport`) and « Transformer en collection »
 * (`services/listToCollection`), so the two read a list alike.
 *
 * - A line's words beside its address become the link's comment, bullets and dashes aside.
 * - The same address twice is one link, both comments kept; it is done only when both lines were.
 * - A line without an address is a stray: where it sits among the lines, and the link it follows,
 *   are kept, so it can join that link's comment or become a link of its own in its place.
 */
import { t } from '@unlease/core/i18n';
import { extractUrls, normalizeUrl } from '@unlease/core/services/url';

import { labelKey } from '../models/entities';

/** One line of a note, or one item of a checklist. */
export interface ListLine {
  readonly text: string;
  /** A ticked item. */
  readonly done: boolean;
}

/** One address of a list, as it becomes a link. */
export interface ListLink {
  readonly url: string;
  /** The words beside it on its line or item: the link's comment. */
  readonly comment: string;
  /** Keep's own preview of the page (its `WEBLINK` annotation), shown until Claude reads it; empty without. */
  readonly title: string;
  /** A ticked item: the link is done. */
  readonly done: boolean;
}

/** A line of a list that holds no address. */
export interface StrayLine {
  /** Its words, trimmed. */
  readonly text: string;
  /** A ticked item. */
  readonly done: boolean;
  /** Its place among the list's filled lines, from 0: it names the line across a session. */
  readonly line: number;
  /** The link whose comment it joins: the one on the nearest line above it, else the first (an index in `links`). */
  readonly link: number;
  /** It comes before every link: it joins the first one's comment at its start. */
  readonly before: boolean;
  /** How many links come before it: a link put in its place goes there. */
  readonly at: number;
}

/** What a list holds, read line by line. */
export interface ListLinks {
  readonly links: readonly ListLink[];
  readonly strays: readonly StrayLine[];
  /** How many filled lines hold an address. */
  readonly linkLines: number;
  /** How many lines hold anything. */
  readonly filled: number;
}

/** What may sit between an address and the words beside it: bullets, dashes, colons. */
const SEPARATORS = /^[\s\-–—:|•·*>→]+|[\s\-–—:|•·*<←]+$/g;

/** The addresses of one line, and its words without them; null without an address. */
export function lineLinks(line: string): { readonly urls: readonly string[]; readonly words: string } | null {
  const urls = extractUrls(line);
  if (urls.length === 0) return null;
  let words = line;
  for (const url of urls) words = words.split(url).join(' ');
  // A bare domain is the whole line: no words beside it.
  if (!/:\/\//.test(line)) words = '';
  return { urls, words: words.replace(/\s+/g, ' ').replace(SEPARATORS, '').trim() };
}

/**
 * The links of a list and its lines without an address, in its order; null when no line holds an
 * address. `previews` names a page by its normalized address (Keep's link previews).
 */
export function listLinks(lines: readonly ListLine[], previews: ReadonlyMap<string, string> = new Map()): ListLinks | null {
  const filled = lines.map(line => ({ text: line.text.trim(), done: line.done })).filter(line => line.text.length > 0);
  const links: ListLink[] = [];
  const strays: StrayLine[] = [];
  const byUrl = new Map<string, number>();
  let linkLines = 0;
  /** The link on the nearest line above, once there is one. */
  let last: number | null = null;
  filled.forEach((line, index) => {
    const found = lineLinks(line.text);
    if (!found) {
      strays.push({ text: line.text, done: line.done, line: index, link: last ?? 0, before: last === null, at: links.length });
      return;
    }
    linkLines += 1;
    for (const url of found.urls) {
      const address = normalizeUrl(url);
      const at = byUrl.get(address);
      if (at !== undefined) {
        // The same address twice: one link, both comments.
        const kept = links[at]!;
        const comment = [kept.comment, found.words].filter(Boolean).join('\n');
        links[at] = { ...kept, comment, done: kept.done && line.done };
        last = at;
        continue;
      }
      byUrl.set(address, links.length);
      last = links.length;
      links.push({ url, comment: found.words, title: previews.get(address) ?? '', done: line.done });
    }
  });
  if (links.length === 0) return null;
  return { links, strays, linkLines, filled: filled.length };
}

/**
 * Whether a list whose lines do not all hold an address is still a list of links: two lines with
 * one at least, two lines in three. One line among fifty is a heading or a reminder, not prose.
 */
export function mostlyLinks(found: Pick<ListLinks, 'strays' | 'linkLines' | 'filled' | 'links'>): boolean {
  if (found.strays.length === 0) return true;
  return found.links.length >= 2 && found.linkLines >= 2 && found.linkLines * 3 >= found.filled * 2;
}

/** The address a link put in a stray's place is given, or null when what was typed is none. */
export function typedAddress(typed: string): string | null {
  const value = typed.trim();
  if (!value || /\s/.test(value)) return null;
  const urls = extractUrls(value);
  return urls.length === 1 ? urls[0]! : null;
}

/** What is wrong with the address typed for a link (null: it is one). */
export function typedAddressProblem(typed: string): string | null {
  if (!typed.trim()) return t('Enter the link’s address.');
  return typedAddress(typed) ? null : t('A page address starting with https://, like https://example.org/page.');
}

/** A list's name when it has no title: the first words beside a link, else the first link's page or address. */
export function listName(links: readonly ListLink[]): string {
  const first = links.find(link => link.comment)?.comment ?? links[0]?.title ?? '';
  if (first) return first.split('\n')[0]!.slice(0, 80);
  return links[0] ? links[0].url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60) : '';
}

/** A list's line as a choice names it: its first words, cut. */
export function shortLine(text: string, max = 60): string {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}

/** `title`, or `title 2`, `title 3`… when another of `taken` goes by it already (case and accents aside). */
export function freeTitle(title: string, taken: Iterable<string>, limit: number): string {
  const used = new Set([...taken].map(labelKey));
  const base = title.trim().slice(0, limit);
  if (!used.has(labelKey(base))) return base;
  for (let n = 2; ; n += 1) {
    const suffix = ` ${n}`;
    const candidate = `${base.slice(0, limit - suffix.length)}${suffix}`;
    if (!used.has(labelKey(candidate))) return candidate;
  }
}
