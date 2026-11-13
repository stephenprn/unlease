/**
 * CalDAV (RFC 4791) as Agenda reads it, without the network: the requests' bodies, and what the
 * answers say. A calendar behind a login (an Open-Xchange mailbox's, Nextcloud's, Fastmail's,
 * iCloud's) is found from the address people paste, whatever it points at: the calendar itself, the
 * account's principal, its calendars' home, or the server's root (`/.well-known/caldav`). Its events
 * are asked for with one REPORT (`calendar-query`), from `FEED_PAST_DAYS` back; each object comes as
 * its own small iCalendar, read by `parseIcs` and laid side by side.
 *
 * The XML read here is WebDAV's multistatus: elements are named by their local name (the prefix a
 * server picks varies, the namespaces never collide among the few properties read), text and CDATA
 * are decoded, and nothing else (no DTD, no entity of its own) is honoured.
 */
import { parseIcs, type IcsCalendar, type IcsEvent } from './ics';

export interface XmlElement {
  /** Its local name, without the namespace's prefix (`multistatus`, `calendar-data`). */
  readonly name: string;
  /** Its attributes by their local name, values decoded. */
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlElement[];
  /** Its own text, decoded (CDATA included), children's left out. */
  readonly text: string;
}

const NAMED: Readonly<Record<string, string>> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED[entity.toLowerCase()] ?? whole;
  });
}

const localName = (qualified: string): string => qualified.slice(qualified.indexOf(':') + 1);

interface Building {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: XmlElement[];
  text: string;
}

const ATTRIBUTE = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function readAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const [, name, double, single] of source.matchAll(ATTRIBUTE)) attributes[localName(name!)] = decodeEntities(double ?? single ?? '');
  return attributes;
}

const TOKEN = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>|([^<]+)|</g;

/** An XML document's root element, or null when there is none. Forgiving: an unclosed element closes at the end. */
export function parseXml(text: string): XmlElement | null {
  const root: Building = { name: '', attributes: {}, children: [], text: '' };
  const stack: Building[] = [root];
  for (const match of text.matchAll(TOKEN)) {
    const top = stack[stack.length - 1]!;
    const [, cdata, closing, qualified, attributes, selfClosing, chars] = match;
    if (cdata !== undefined) top.text += cdata;
    else if (chars !== undefined) top.text += decodeEntities(chars);
    else if (qualified !== undefined) {
      const name = localName(qualified);
      if (closing) {
        // Closes the nearest element of that name (and any left open inside it).
        const at = stack.map(element => element.name).lastIndexOf(name);
        if (at > 0) stack.length = at;
      } else {
        const element: Building = { name, attributes: readAttributes(attributes ?? ''), children: [], text: '' };
        top.children.push(element);
        if (!selfClosing) stack.push(element);
      }
    }
  }
  return root.children[0] ?? null;
}

/** The first child of that name. */
export const childNamed = (element: XmlElement | undefined | null, name: string): XmlElement | undefined => element?.children.find(child => child.name === name);

/** Every element of that name under `element`, at any depth. */
export function descendantsNamed(element: XmlElement, name: string): XmlElement[] {
  const found: XmlElement[] = [];
  const walk = (node: XmlElement): void => {
    for (const child of node.children) {
      if (child.name === name) found.push(child);
      walk(child);
    }
  };
  walk(element);
  return found;
}

/** One resource of a multistatus: its address, and the properties it served (a propstat other than 2xx is left out). */
export interface DavResource {
  readonly href: string;
  readonly props: ReadonlyMap<string, XmlElement>;
}

const statusCode = (element: XmlElement | undefined): number | null => {
  const match = element ? /\s(\d{3})\s?/.exec(` ${element.text.trim()} `) : null;
  return match ? Number(match[1]) : null;
};

/** What a 207 Multi-Status says, resource by resource; [] for anything else. */
export function readMultistatus(xml: string): DavResource[] {
  const root = parseXml(xml);
  if (!root || root.name !== 'multistatus') return [];
  return root.children
    .filter(child => child.name === 'response')
    .flatMap((response): DavResource[] => {
      const href = childNamed(response, 'href')?.text.trim() ?? '';
      if (!href) return [];
      const props = new Map<string, XmlElement>();
      for (const propstat of response.children.filter(child => child.name === 'propstat')) {
        const code = statusCode(childNamed(propstat, 'status'));
        if (code !== null && (code < 200 || code >= 300)) continue;
        for (const prop of childNamed(propstat, 'prop')?.children ?? []) props.set(prop.name, prop);
      }
      return [{ href, props }];
    });
}

/** An address a resource names (`<d:href>`), made whole against the one asked. */
export function davHref(href: string, base: string): string | null {
  try {
    return new URL(href.trim(), base).toString();
  } catch {
    return null;
  }
}

const sameResource = (a: string, b: string): boolean => a.replace(/\/+$/, '') === b.replace(/\/+$/, '');

const XML_HEAD = '<?xml version="1.0" encoding="utf-8"?>';

/** PROPFIND's body: what a resource is, its name, and where its account's calendars are. */
export const PROPFIND_BODY = `${XML_HEAD}
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:resourcetype/>
    <d:displayname/>
    <d:current-user-principal/>
    <c:calendar-home-set/>
    <c:supported-calendar-component-set/>
  </d:prop>
</d:propfind>`;

/** A day (`2026-11-02`) as CalDAV's UTC time at its midnight (`20261102T000000Z`). */
export const davTime = (day: string): string => `${day.replace(/-/g, '')}T000000Z`;

/**
 * REPORT's body: every event's calendar data, those that end before `since` (a day) left out when
 * it is given (a repeating one still running comes whole).
 */
export function calendarQueryBody(since: string | null): string {
  const range = since ? `<c:time-range start="${davTime(since)}"/>` : '';
  return `${XML_HEAD}
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">${range}</c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;
}

/** A calendar found on a CalDAV server: its address and its name there. */
export interface DavCalendar {
  readonly url: string;
  readonly name: string;
}

/** Whether a resource is a calendar that holds events (one that lists the components it takes must name VEVENT: not a list of tasks). */
function holdsEvents(resource: DavResource): boolean {
  const type = resource.props.get('resourcetype');
  if (!type || !type.children.some(child => child.name === 'calendar')) return false;
  const components = resource.props.get('supported-calendar-component-set');
  const listed = components ? components.children.filter(child => child.name === 'comp') : [];
  return listed.length === 0 || listed.some(comp => (comp.attributes.name ?? '').toUpperCase() === 'VEVENT');
}

/** The calendars of a PROPFIND's answer (Depth 0 on a calendar, Depth 1 on a home), with their names. `base` is the address asked. */
export function davCalendars(resources: readonly DavResource[], base: string): DavCalendar[] {
  const found: DavCalendar[] = [];
  for (const resource of resources) {
    if (!holdsEvents(resource)) continue;
    const url = davHref(resource.href, base);
    if (!url || found.some(calendar => sameResource(calendar.url, url))) continue;
    found.push({ url, name: resource.props.get('displayname')?.text.trim() ?? '' });
  }
  return found;
}

/** Where to look next when the address is no calendar: the calendars' home, or the principal that names it. */
export function davPointers(resources: readonly DavResource[], base: string): { readonly home: string | null; readonly principal: string | null } {
  const pointer = (prop: string): string | null => {
    for (const resource of resources) {
      const href = childNamed(resource.props.get(prop), 'href')?.text.trim();
      if (href) return davHref(href, base);
    }
    return null;
  };
  return { home: pointer('calendar-home-set'), principal: pointer('current-user-principal') };
}

/** The resource an answer gives for the address asked itself (Depth 0, or the first of Depth 1). */
export function davSelf(resources: readonly DavResource[], base: string): DavResource | undefined {
  return resources.find(resource => {
    const url = davHref(resource.href, base);
    return url !== null && sameResource(url, base);
  });
}

/** Every event of a REPORT's answer, as one calendar: each object's iCalendar read on its own (its zones with it). */
export function calendarFromReport(resources: readonly DavResource[]): IcsCalendar {
  const events: IcsEvent[] = [];
  for (const resource of resources) {
    const data = resource.props.get('calendar-data')?.text;
    if (data && /BEGIN:VCALENDAR/i.test(data)) events.push(...parseIcs(data).events);
  }
  return { name: '', events };
}
