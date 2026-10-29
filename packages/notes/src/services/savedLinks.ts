/**
 * An address is saved once per collection. Adding one the collection already holds adds nothing;
 * adding one another collection holds adds it with that link's reading, so the page is not read
 * twice. Filed by Claude, an address any collection holds is not added: it would land beside itself.
 */
import { t } from '@unlease/core/i18n';
import { INBOX_ID, INBOX_TITLE, shownTitle, type LinkItem, type Note } from '../models/entities';
import { plural } from '@unlease/core/services/format';
import { cleanUrl } from '@unlease/core/services/url';

/** What a link's reading wrote: a new link at the same address copies it. */
export type LinkReading = Pick<LinkItem, 'status' | 'title' | 'summary' | 'siteName' | 'kind' | 'price' | 'currency' | 'attributes' | 'imageIds' | 'imageUrl' | 'error' | 'analyzedAt'>;

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
  };
}

/** One plan per distinct address; `into` null when Claude files them. */
export function planLinks(urls: readonly string[], into: string | null, saved: ReadonlyMap<string, readonly LinkItem[]>): LinkPlan[] {
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
      reading: existing ? null : readingFrom(copies),
    });
  }
  return plans;
}

export interface AddedWording {
  /** Where new links went: the collection asked for, or "Non classé"; null while Claude files them (the transfer panel tells). */
  readonly into: string | null;
  /** The person is on that collection's page: "cette collection", "ici". */
  readonly here?: boolean;
  /** Also say where new links went and the trackers they lost, not only what was saved already. */
  readonly announce?: boolean;
}

/** The slip after adding links, or null when there is nothing to tell. */
export function addedMessage(plans: readonly Pick<LinkPlan, 'existing' | 'savedIn' | 'cleaned'>[], wording: AddedWording, notes: Readonly<Record<string, Note>>): string | null {
  const message = placementMessage(plans, wording, notes);
  const cleaned = wording.announce && wording.into !== null ? plans.reduce((sum, plan) => sum + (plan.existing === null ? plan.cleaned : 0), 0) : 0;
  return message && cleaned > 0 ? `${message} · ${plural(cleaned, 'traceur retiré', 'traceurs retirés')}` : message;
}

function placementMessage(plans: readonly Pick<LinkPlan, 'existing' | 'savedIn'>[], wording: AddedWording, notes: Readonly<Record<string, Note>>): string | null {
  const { into, here = false, announce = false } = wording;
  const name = (id: string): string => {
    if (here && id === into) return t('cette collection');
    const title = notes[id]?.title.trim();
    if (title) return shownTitle({ id, title });
    return id === INBOX_ID ? t(INBOX_TITLE) : t('Sans titre');
  };
  const names = (ids: readonly string[]): string => {
    const unique = [...new Set(ids)];
    if (unique.length === 2) return t('{first} et {second}', { first: name(unique[0]!), second: name(unique[1]!) });
    return unique.length < 2 ? unique.map(name).join('') : plural(unique.length, 'collection');
  };
  // Not added: it was in the collection asked for, or, filed by Claude, anywhere.
  const heldBy = (plan: Pick<LinkPlan, 'savedIn'>): readonly string[] => (into !== null && plan.savedIn.includes(into) ? [into] : plan.savedIn);
  const kept = plans.filter(plan => plan.existing !== null);
  const added = plans.filter(plan => plan.existing === null);
  const twins = added.filter(plan => plan.savedIn.length > 0);

  if (plans.length === 1) {
    const plan = plans[0]!;
    if (plan.existing !== null) return t('Ce lien est déjà dans {names}', { names: names(heldBy(plan)) });
    if (plan.savedIn.length > 0) {
      const params = { names: names(plan.savedIn), collection: into === null ? '' : name(into) };
      if (here) return t('Ce lien est déjà dans {names} : ajouté ici aussi', params);
      return into === null ? t('Ce lien est déjà dans {names} : ajouté aussi', params) : t('Ce lien est déjà dans {names} : ajouté aussi à {collection}', params);
    }
    if (!announce || into === null) return null;
    return here ? t('Ajouté ici') : t('Ajouté à {collection}', { collection: name(into) });
  }
  const parts: string[] = [];
  if (added.length > 0 && into !== null && (announce || twins.length > 0)) {
    const params = { links: plural(added.length, 'lien ajouté', 'liens ajoutés'), collection: name(into), count: twins.length, names: names(twins.flatMap(plan => plan.savedIn)) };
    if (twins.length > 0) parts.push(here ? t('{links} ici, dont {count} déjà dans {names}', params) : t('{links} à {collection}, dont {count} déjà dans {names}', params));
    else parts.push(here ? t('{links} ici', params) : t('{links} à {collection}', params));
  }
  if (kept.length > 0) parts.push(t('{links} déjà dans {names}', { links: plural(kept.length, 'lien'), names: names(kept.flatMap(heldBy)) }));
  return parts.length > 0 ? parts.join(' · ') : null;
}
