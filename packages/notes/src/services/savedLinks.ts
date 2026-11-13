/**
 * An address is saved once per collection. Adding one the collection already holds adds nothing;
 * adding one another collection holds adds it with that link's reading, so the page is not read
 * twice, when both collections read their links with the same template (`services/templates`: the
 * same template of the person's own, or both by kind); otherwise it is read with its own. Filed by
 * Claude, an address any collection holds is not added: it would land beside itself.
 */
import { t } from '@unlease/core/i18n';
import { INBOX_ID, INBOX_SHOWN_TITLE, shownTitle, type LinkItem, type Note } from '../models/entities';
import { plural } from '@unlease/core/services/format';
import { cleanUrl } from '@unlease/core/services/url';
import { collectionTemplate, type Templates } from './templates';

/** What a link's reading wrote: a new link at the same address copies it, with the template version it was read with (`readWith`), when it has one. */
export type LinkReading = Pick<LinkItem, 'status' | 'title' | 'summary' | 'siteName' | 'kind' | 'price' | 'currency' | 'attributes' | 'imageIds' | 'imageUrl' | 'error' | 'analyzedAt' | 'readWith'>;

/** What tells which template a collection reads its links with: the templates and the collections, as the store keeps them. */
export interface ReadingTemplates {
  readonly templates: Templates;
  readonly notes: Readonly<Record<string, Note>>;
}

/** One address to save. */
export interface LinkPlan {
  /** Normalized, as it is stored. */
  readonly url: string;
  /** Tracking parameters taken off it. */
  readonly cleaned: number;
  /** The collections holding it already. */
  readonly savedIn: readonly string[];
  /** The saved link that makes adding it pointless; null: a new link is added. */
  readonly existing: string | null;
  /** For a new link: the reading of a saved one at the same address, when one succeeded. */
  readonly reading: LinkReading | null;
}

/** The live links of live collections ("Non classé" included), by normalized address. */
export function savedAddresses(links: Readonly<Record<string, LinkItem>>, notes: Readonly<Record<string, Note>>): Map<string, LinkItem[]> {
  const byAddress = new Map<string, LinkItem[]>();
  for (const link of Object.values(links)) {
    const line = notes[link.noteId];
    if (link.deletedAt !== null || line?.kind !== 'links' || line.deletedAt !== null || line.trashedAt !== null) continue;
    const address = cleanUrl(link.url).url;
    byAddress.set(address, [...(byAddress.get(address) ?? []), link]);
  }
  return byAddress;
}

/** The freshest reading that succeeded among saved links, or null. */
export function readingFrom(saved: readonly LinkItem[]): LinkReading | null {
  const read = saved.filter(link => link.status === 'ready').sort((a, b) => (b.analyzedAt ?? 0) - (a.analyzedAt ?? 0))[0];
  if (!read) return null;
  return {
    status: 'ready',
    title: read.title,
    summary: read.summary,
    siteName: read.siteName,
    kind: read.kind,
    price: read.price,
    currency: read.currency,
    attributes: read.attributes.map(({ label, value }) => ({ label, value })),
    imageIds: [...read.imageIds],
    imageUrl: read.imageUrl,
    error: null,
    analyzedAt: read.analyzedAt,
    ...(read.readWith ? { readWith: read.readWith } : {}),
  };
}

/** The template a collection reads its links with: one of the person's own (its id), or null, each link by its kind. */
function templateOf(collectionId: string, { templates, notes }: ReadingTemplates): string | null {
  return collectionId === INBOX_ID ? null : (collectionTemplate(templates, notes[collectionId])?.id ?? null);
}

/**
 * One plan per distinct address; `into` null when Claude files them. With `templates`, a reading is
 * copied only from a collection that reads with the same template as `into`: a page read for « Vins »
 * does not fill a collection that reads by kind (without it, from any collection, as before templates).
 */
export function planLinks(urls: readonly string[], into: string | null, saved: ReadonlyMap<string, readonly LinkItem[]>, templates?: ReadingTemplates): LinkPlan[] {
  const wanted = into !== null && templates ? templateOf(into, templates) : null;
  const readsAlike = (link: LinkItem): boolean => !templates || into === null || templateOf(link.noteId, templates) === wanted;
  const seen = new Set<string>();
  const plans: LinkPlan[] = [];
  for (const given of urls) {
    const { url, removed } = cleanUrl(given);
    if (seen.has(url)) continue;
    seen.add(url);
    const copies = saved.get(url) ?? [];
    const existing = into === null ? copies[0] : copies.find(link => link.noteId === into);
    plans.push({
      url,
      cleaned: removed.length,
      savedIn: [...new Set(copies.map(link => link.noteId))],
      existing: existing?.id ?? null,
      reading: existing ? null : readingFrom(copies.filter(readsAlike)),
    });
  }
  return plans;
}

/**
 * The most addresses one share saves (the phone's share sheet, the web app's share target and its
 * capture dialog): a page that offers thousands fills neither the board nor Claude's budget.
 */
export const MAX_SHARED_URLS = 20;

/** The first `MAX_SHARED_URLS` addresses of a share, and how many more it offered. */
export function capSharedUrls(urls: readonly string[]): { readonly urls: readonly string[]; readonly more: number } {
  return { urls: urls.slice(0, MAX_SHARED_URLS), more: Math.max(0, urls.length - MAX_SHARED_URLS) };
}

/** What a slip says of a share cut short: « 20 liens gardés sur les 25 partagés ». */
export function cappedMessage(more: number): string {
  return t('{kept} of the {offered} shared links kept', { kept: MAX_SHARED_URLS, offered: MAX_SHARED_URLS + more });
}

export interface AddedWording {
  /** Where new links went: the collection asked for, or "Non classé"; null while Claude files them (the transfer panel tells). */
  readonly into: string | null;
  /** The person is on that collection's page: "cette collection", "ici". */
  readonly here?: boolean;
  /** Also say where new links went and the trackers they lost, not only what was saved already. */
  readonly announce?: boolean;
}

/**
 * The tone of that slip, the same on both clients: some links added is done (success); all of them
 * saved already is news (info).
 */
export function addedTone(plans: readonly Pick<LinkPlan, 'existing'>[]): 'success' | 'info' {
  return plans.some(plan => plan.existing === null) ? 'success' : 'info';
}

/** The slip after adding links, or null when there is nothing to tell. */
export function addedMessage(plans: readonly Pick<LinkPlan, 'existing' | 'savedIn' | 'cleaned'>[], wording: AddedWording, notes: Readonly<Record<string, Note>>): string | null {
  const message = placementMessage(plans, wording, notes);
  const cleaned = wording.announce && wording.into !== null ? plans.reduce((sum, plan) => sum + (plan.existing === null ? plan.cleaned : 0), 0) : 0;
  return message && cleaned > 0 ? `${message} · ${plural(cleaned, 'tracker removed', 'trackers removed')}` : message;
}

function placementMessage(plans: readonly Pick<LinkPlan, 'existing' | 'savedIn'>[], wording: AddedWording, notes: Readonly<Record<string, Note>>): string | null {
  const { into, here = false, announce = false } = wording;
  const name = (id: string): string => {
    if (here && id === into) return t('this collection');
    const title = notes[id]?.title.trim();
    if (title) return shownTitle({ id, title });
    return id === INBOX_ID ? t(INBOX_SHOWN_TITLE) : t('Untitled');
  };
  const names = (ids: readonly string[]): string => {
    const unique = [...new Set(ids)];
    if (unique.length === 2) return t('{first} and {second}', { first: name(unique[0]!), second: name(unique[1]!) });
    return unique.length < 2 ? unique.map(name).join('') : plural(unique.length, 'collection');
  };
  // Not added: it was in the collection asked for, or, filed by Claude, anywhere.
  const heldBy = (plan: Pick<LinkPlan, 'savedIn'>): readonly string[] => (into !== null && plan.savedIn.includes(into) ? [into] : plan.savedIn);
  const kept = plans.filter(plan => plan.existing !== null);
  const added = plans.filter(plan => plan.existing === null);
  const twins = added.filter(plan => plan.savedIn.length > 0);

  if (plans.length === 1) {
    const plan = plans[0]!;
    if (plan.existing !== null) return t('This link is already in {names}', { names: names(heldBy(plan)) });
    if (plan.savedIn.length > 0) {
      const params = { names: names(plan.savedIn), collection: into === null ? '' : name(into) };
      if (here) return t('This link is already in {names}: added here too', params);
      return into === null ? t('This link is already in {names}: added too', params) : t('This link is already in {names}: also added to {collection}', params);
    }
    if (!announce || into === null) return null;
    return here ? t('Added here') : t('Added to {collection}', { collection: name(into) });
  }
  const parts: string[] = [];
  if (added.length > 0 && into !== null && (announce || twins.length > 0)) {
    const params = { links: plural(added.length, 'link added', 'links added'), collection: name(into), count: twins.length, names: names(twins.flatMap(plan => plan.savedIn)) };
    if (twins.length > 0) parts.push(here ? t('{links} here, {count} of them already in {names}', params) : t('{links} to {collection}, {count} of them already in {names}', params));
    else parts.push(here ? t('{links} here', params) : t('{links} to {collection}', params));
  }
  if (kept.length > 0) parts.push(t('{links} already in {names}', { links: plural(kept.length, 'link'), names: names(kept.flatMap(heldBy)) }));
  return parts.length > 0 ? parts.join(' · ') : null;
}
