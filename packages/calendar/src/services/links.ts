/**
 * An event's web link: kept as Carnet keeps a link (its tracking taken off, `cleanUrl`), and shown on
 * one line, the site's name then the rest of its address.
 */
import { cleanUrl, displayHost, extractUrls, isHttpUrl, parseUrl } from '@unlease/core/services/url';

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

/**
 * The web address an event's place holds, when it is one (a video call: « https://meet.google.com/… »,
 * « Zoom : https://zoom.us/j/… », a bare « meet.google.com/abc-defg-hij »): the place opens it, never
 * a map. Null for a place a map can look for. A bare domain counts only as the whole place, so words
 * are never a link.
 */
export function placeLink(place: string): string | null {
  return extractUrls(place.trim())[0] ?? null;
}

/**
 * A place that is only a way to meet without going anywhere, in French or English (« Visio »,
 * « Video call », « En ligne », « Teams »…), accents and case aside: the whole place, so « Zoom Café,
 * Lyon » is still somewhere to go.
 */
const NOWHERE_TO_GO = /^(?:visio(?:conference)?|video(?: ?call)?|appel(?: video)?|call|en ligne|online|remote|a distance|distanciel|teletravail|telephone|phone(?: call)?|teams|zoom|meet|google meet|skype|webex|jitsi|whereby|discord|slack|facetime|whatsapp)$/;

/**
 * Where « Y aller » leads from an event's place (its reminders' button, the lists' maps button): the
 * place on one line, or '' when there is none, it is a web address (a video call opens, never a map)
 * or it only says the meeting is online.
 */
export function directionsTo(place: string): string {
  const line = place.replace(/\s+/g, ' ').trim();
  if (!line || placeLink(line)) return '';
  const words = line.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[.!]+$/, '');
  return NOWHERE_TO_GO.test(words) ? '' : line;
}
