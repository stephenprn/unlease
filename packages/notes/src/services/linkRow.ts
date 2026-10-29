/**
 * What a link's row says, the same on both clients: where it comes from, what it is, and two
 * facts worth a glance, as values without their labels. What Claude read comes first; a link
 * nobody read still reads as a thing (its address made readable), never as a raw URL.
 */
import type { LinkAttribute, LinkItem, LinkKind } from '../models/entities';
import { foldText } from '@unlease/core/services/search';
import { siteDomain, slugTitle } from '@unlease/core/services/url';

export interface LinkRowText {
  /** The site as people name it ("Komono"), else its domain; empty when the title already says it. */
  readonly source: string;
  readonly title: string;
  /** At most two values ("Argent et noir", "Acier inoxydable"). */
  readonly facts: readonly string[];
}

/** The labels Claude writes for each kind (server/src/apps/notes/analysis/prompt.ts), in the order they are worth a glance. */
export const FACT_LABELS: Record<LinkKind, readonly string[]> = {
  product: ['Marque', 'Brand', 'Disponibilité', 'Availability', 'Couleur', 'Colour', 'Color', 'Matière', 'Material', 'Modèle', 'Model', 'Taille', 'Size'],
  film: ['Réalisateur', 'Director', 'Année', 'Year', 'Durée', 'Running time'],
  series: ['Création', 'Created by', 'Saisons', 'Seasons', 'Année', 'Year'],
  book: ['Auteur', 'Author', 'Année', 'Year'],
  music: ['Artiste', 'Artist', 'Album', 'Année', 'Year'],
  game: ['Plateformes', 'Platforms', 'Éditeur', 'Publisher', 'Année', 'Year'],
  restaurant: ['Cuisine', 'Prix moyen', 'Average price', 'Adresse', 'Address'],
  place: ['Type', 'Adresse', 'Address'],
  recipe: ['Temps total', 'Total time', 'Portions', 'Servings'],
  article: ['Auteur', 'Author', 'Temps de lecture', 'Reading time', 'Date'],
  video: ['Chaîne', 'Channel', 'Durée', 'Length'],
  event: ['Date', 'Lieu', 'Venue'],
  other: [],
};

/** Said elsewhere on the row or on the link's page: never a fact of its own. */
const NEVER_FACTS = new Set(['source', 'site', 'prix', 'price']);
const UNAVAILABLE = /[ée]puis[ée]|rupture|indisponible|plus disponible|sold out|out of stock/i;
const GENERIC_SITE = /^(?:home|accueil|homepage|welcome|bienvenue|official (?:site|store|shop|website)|site officiel|boutique(?: officielle| en ligne)?|shop|store)$/i;

/** Folded words in any script, "&" and "and" alike: "Ask & Embla" is "Ask and Embla". */
const wordsOf = (value: string): string[] =>
  foldText(value)
    .replace(/&|\b(?:and|et)\b/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
const squash = (value: string): string => wordsOf(value).join('');

/**
 * A site name fit for the row, or null when the domain says it better: no tagline, no
 * "(formerly …)", no handle or host ("fr.eryone3d"). A single shouted word is quietened (only the
 * stamp shouts), unless it is short enough to be an acronym (IKEA, COS); names of several words or
 * signs (THE KOOPLES, A.P.C., ZADIG&VOLTAIRE) keep the case they chose.
 */
export function cleanSiteName(raw: string | null | undefined): string | null {
  let name = (raw ?? '').replace(/\s+/g, ' ').trim().replace(/\s*\([^)]*\)$/, '');
  if (name.length > 24) name = name.split(/\s+[|\-\u2013\u2014\u00b7:]\s+/)[0]!;
  if (!name || name.length > 32 || GENERIC_SITE.test(name)) return null;
  if (!name.includes(' ') && name === name.toLowerCase() && /[.\d_]/.test(name)) return null;
  if (name.length > 4 && !/[\s&.]/.test(name) && name === name.toUpperCase() && /\p{L}/u.test(name)) {
    const lower = name.toLocaleLowerCase('fr');
    name = lower.charAt(0).toLocaleUpperCase('fr') + lower.slice(1);
  }
  return name;
}

function labelMatches(label: string, wanted: string): boolean {
  // "Taille(s)" and "Tailles" are "Taille".
  return foldText(label).startsWith(foldText(wanted));
}

function factsOf(attributes: readonly LinkAttribute[], kind: LinkKind, source: string, title: string): string[] {
  const said = new Set([...wordsOf(source), ...wordsOf(title)]);
  const worth = ({ label, value }: LinkAttribute): boolean => {
    if (NEVER_FACTS.has(foldText(label))) return false;
    if (labelMatches(label, 'Disponibilité') && !UNAVAILABLE.test(value)) return false;
    // A value the source or the title already says, word for word ("Verre" under "Brique de verre"); signs alone ("€€€") stay.
    const words = wordsOf(value);
    return words.length > 0 ? !words.every(word => said.has(word)) : value.trim().length > 0;
  };
  const ordered = [
    ...FACT_LABELS[kind].flatMap(wanted => attributes.filter(attribute => labelMatches(attribute.label, wanted))),
    ...attributes,
  ];
  const facts: string[] = [];
  for (const attribute of ordered) {
    if (facts.length === 2) break;
    if (worth(attribute) && !facts.includes(attribute.value)) facts.push(attribute.value);
  }
  return facts;
}

export function linkRowText(link: Pick<LinkItem, 'url' | 'title' | 'siteName' | 'kind' | 'attributes'>): LinkRowText {
  const domain = siteDomain(link.url);
  const title = link.title.trim() || slugTitle(link.url) || domain;
  let source = cleanSiteName(link.siteName) ?? domain;
  // A home page is named like its site: the domain says where it is instead.
  if (squash(source) !== '' && squash(source) === squash(title)) source = squash(domain) === squash(title) ? '' : domain;
  return { source, title, facts: factsOf(link.attributes, link.kind, source, title) };
}
