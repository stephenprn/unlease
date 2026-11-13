/**
 * CalDAV over the suite's guarded reader (public addresses only, the login sent to the address's own
 * origin only, over https only): the calendar found from whatever address people paste (the
 * calendar's, the account's, the server's root through `/.well-known/caldav`), and its events read
 * with one REPORT. What the answers say is read by `@unlease/calendar/services/caldav`. A problem
 * comes as a `CalDavProblem`, in the words the apps show (French, translated there); the reader's own
 * failures (`FetchError`) go through as they are.
 */
import {
  calendarFromReport,
  calendarQueryBody,
  davCalendars,
  davPointers,
  davSelf,
  PROPFIND_BODY,
  readMultistatus,
  type DavCalendar,
  type DavResource,
} from '@unlease/calendar/services/caldav';
import type { IcsCalendar } from '@unlease/calendar/services/ics';
import type { Fetcher } from '../../reading/fetcher';

export interface DavLogin {
  readonly username: string;
  readonly password: string;
}

export class CalDavProblem extends Error {
  /** `refused`: the login was turned down; `missing`: none is kept; `other`: anything else. */
  constructor(
    message: string,
    readonly kind: 'refused' | 'missing' | 'other' = 'other',
  ) {
    super(message);
  }
}

export const LOGIN_REFUSED = 'Login or password refused';
export const LOGIN_MISSING = 'Login to enter again';
export const PLAIN_HTTP = 'A password only travels over https://';
const NOT_CALDAV = 'No CalDAV calendar at this address';
const GONE = 'This calendar no longer exists at this address';

const TIMEOUT_MS = 30_000;
const PROPFIND_MAX = 1024 * 1024;
const USER_AGENT = 'Mozilla/5.0 (compatible; calendar subscription)';

interface DavAnswer {
  readonly status: number;
  /** After redirects: the base its hrefs are read against. */
  readonly url: string;
  readonly resources: readonly DavResource[];
  readonly truncated: boolean;
}

export class CalDavClient {
  constructor(
    private readonly fetcher: Fetcher,
    private readonly maxBytes: number,
  ) {}

  private async ask(url: string, login: DavLogin, method: 'PROPFIND' | 'REPORT', depth: 0 | 1, body: string, maxBytes = PROPFIND_MAX): Promise<DavAnswer> {
    if (!/^https:/i.test(url)) throw new CalDavProblem(PLAIN_HTTP);
    const response = await this.fetcher.fetch(url, {
      method,
      body,
      login,
      headers: { 'user-agent': USER_AGENT, 'content-type': 'application/xml; charset=utf-8', depth: String(depth), prefer: 'return-minimal' },
      maxBytes,
      timeoutMs: TIMEOUT_MS,
    });
    if (response.status === 401) throw new CalDavProblem(LOGIN_REFUSED, 'refused');
    const resources = response.status === 207 && !response.truncated ? readMultistatus(response.body.toString('utf8')) : [];
    return { status: response.status, url: response.url, resources, truncated: response.truncated };
  }

  private propfind(url: string, login: DavLogin, depth: 0 | 1): Promise<DavAnswer> {
    return this.ask(url, login, 'PROPFIND', depth, PROPFIND_BODY);
  }

  /** The calendars of events that address and login open: the calendar itself when it is one. */
  async find(address: string, login: DavLogin): Promise<DavCalendar[]> {
    const first = await this.propfind(address, login, 0);
    if (first.status === 404 || first.status === 410) throw new CalDavProblem(GONE);
    if (first.status === 207) {
      const self = davSelf(first.resources, first.url) ?? first.resources[0];
      const itself = self ? davCalendars([self], first.url) : [];
      if (itself.length > 0) return itself;
      const found = await this.fromPointers(first, login);
      if (found.length > 0) return found;
      // Perhaps the calendars' home itself, which says nothing of its own.
      const listed = await this.propfind(first.url, login, 1);
      const calendars = listed.status === 207 ? davCalendars(listed.resources, listed.url) : [];
      if (calendars.length > 0) return calendars;
    }
    // The server's root, or a page that is no WebDAV: where its CalDAV says it lives.
    const known = new URL('/.well-known/caldav', address).toString();
    if (known !== address) {
      const root = await this.propfind(known, login, 0);
      if (root.status === 207) {
        const found = await this.fromPointers(root, login);
        if (found.length > 0) return found;
      }
    }
    throw new CalDavProblem(NOT_CALDAV);
  }

  /** The calendars an answer points at: its calendars' home, or its principal's. */
  private async fromPointers(answer: DavAnswer, login: DavLogin): Promise<DavCalendar[]> {
    let { home, principal } = davPointers(answer.resources, answer.url);
    if (!home && principal) {
      const owner = await this.propfind(principal, login, 0);
      if (owner.status === 207) home = davPointers(owner.resources, owner.url).home;
    }
    if (!home) return [];
    const listed = await this.propfind(home, login, 1);
    return listed.status === 207 ? davCalendars(listed.resources, listed.url) : [];
  }

  /** A calendar's events from `since` (a day) on; a server that refuses the time range is asked for all of them. */
  async read(url: string, login: DavLogin, since: string): Promise<IcsCalendar> {
    let answer = await this.ask(url, login, 'REPORT', 1, calendarQueryBody(since), this.maxBytes);
    if ([400, 403, 415, 422, 501].includes(answer.status)) answer = await this.ask(url, login, 'REPORT', 1, calendarQueryBody(null), this.maxBytes);
    if (answer.truncated) throw new CalDavProblem('Calendar too large (over 10 MB)');
    if (answer.status === 404 || answer.status === 410) throw new CalDavProblem(GONE);
    if (answer.status !== 207) throw new CalDavProblem(`Le calendrier ne répond pas (HTTP ${answer.status})`);
    return calendarFromReport(answer.resources);
  }
}
