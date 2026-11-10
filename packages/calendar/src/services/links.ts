/**
 * An event's web link: kept as Carnet keeps a link (its tracking taken off, `cleanUrl`), and shown on
 * one line, the site's name then the rest of its address.
 */
import { cleanUrl, displayHost, isHttpUrl, parseUrl } from '@unlease/core/services/url';

/** A link as kept: trimmed, « https:// » before a bare « site.fr/… », its tracking off; what is not a web address stays as typed. */
export function cleanEventUrl(value: string): { readonly url: string; readonly removed: readonly string[] } {
  const typed = value.trim();
  if (!typed) return { url: '', removed: [] };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(typed) || !/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(typed) ? typed : `https://${typed}`;
  return isHttpUrl(withScheme) ? cleanUrl(withScheme) : { url: typed, removed: [] };
}

/**
 * Whether what was typed as an event's link reads as one once tidied: nothing, or an address with its
 * scheme (« visio.exemple.org » gets https://; « tel: », « mailto: » pass). Words with spaces do not.
 */
export function readsAsEventUrl(value: string): boolean {
  const typed = value.trim();
  return !typed || /^[a-z][a-z0-9+.-]*:\S+$/i.test(cleanEventUrl(typed).url);
}

/** « visitlisboa.com » and « /fr/agenda?mois=11 »: a link's site and the rest of its address. */
export function linkParts(url: string): { readonly host: string; readonly rest: string } {
  const parsed = parseUrl(url);
  if (!parsed) return { host: url, rest: '' };
  const path = `${parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '')}${parsed.search}`;
  try {
    return { host: displayHost(url), rest: decodeURI(path) };
  } catch {
    return { host: displayHost(url), rest: path };
  }
}
