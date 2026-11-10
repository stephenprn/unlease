/**
 * Where something is mentioned (`GET /api/<app>/mentions`): an app's server module lists its own
 * records that point at a reference (Pages' pages, Carnet's notes, Agenda's events), so another app
 * shows « Mentionné dans » without syncing them (Contacts, for a person; Pages and Carnet for an
 * event, Agenda for a page or a note). Several ids of one type: a contact and those
 * merged into it. The client asks each app the server runs, and opens each place in its app.
 */
import { isAppId, type AppId } from '../apps';
import { REF_TYPE_PATTERN } from '../refs';

export interface MentionPlace {
  /** The app it lives in (`pages`, `notes`). */
  readonly app: AppId;
  /** Its reference type there (`page`, `note`): where it opens (`suitePlace`). */
  readonly type: string;
  readonly id: string;
  /** Its title as people read it, '' for an untitled one (the client says « Sans titre »). */
  readonly title: string;
  /** Where it sits, as a path of titles (a page's pages above it); '' at the top. */
  readonly within: string;
  /** A page's emoji, when it has one. */
  readonly icon: string | null;
  readonly editedAt: number;
  /** An event's start as stored (`2026-11-02`, `2026-11-02T14:30`): the client shows it as its day. */
  readonly when?: string;
  /** It names the subject among its people (a note or a link of Carnet's « Cadeaux »), rather than in its words. */
  readonly linked?: boolean;
}

export interface MentionsResponse {
  readonly places: readonly MentionPlace[];
}

/** At most this many ids in one question, and this many places in one answer (the most recent first). */
export const MENTION_IDS_MAX = 50;
export const MENTION_PLACES_MAX = 200;

/** The route's address for one app. */
export function mentionsPath(app: AppId, type: string, ids: readonly string[]): string {
  return `/api/${app}/mentions?type=${encodeURIComponent(type)}&ids=${ids.map(encodeURIComponent).join(',')}`;
}

/** The query read by a server module: null when it is not one. */
export function parseMentionsQuery(type: string | undefined, ids: string | undefined): { readonly type: string; readonly ids: readonly string[] } | null {
  if (!type || !REF_TYPE_PATTERN.test(type) || !ids) return null;
  const list = [...new Set(ids.split(',').filter(id => /^[A-Za-z0-9_-]{1,64}$/.test(id)))];
  return list.length > 0 && list.length <= MENTION_IDS_MAX ? { type, ids: list } : null;
}

/** An answer read by a client: what is well formed of it. */
export function parseMentionsResponse(value: unknown): MentionsResponse {
  const raw = (value as { places?: unknown } | null)?.places;
  if (!Array.isArray(raw)) return { places: [] };
  const places = raw.flatMap((entry): MentionPlace[] => {
    const e = entry as Record<string, unknown> | null;
    if (!e || !isAppId(e.app) || typeof e.type !== 'string' || typeof e.id !== 'string') return [];
    return [
      {
        app: e.app,
        type: e.type,
        id: e.id,
        title: typeof e.title === 'string' ? e.title : '',
        within: typeof e.within === 'string' ? e.within : '',
        icon: typeof e.icon === 'string' && e.icon ? e.icon : null,
        editedAt: typeof e.editedAt === 'number' ? e.editedAt : 0,
        ...(typeof e.when === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(e.when) ? { when: e.when } : {}),
        ...(e.linked === true ? { linked: true } : {}),
      },
    ];
  });
  return { places };
}

/** The markup a mention of one of `ids` is written as in rich text (`{@contact=<id>}`). */
export function mentionMarkups(type: string, ids: readonly string[]): string[] {
  return ids.map(id => `{@${type}=${id}}`);
}
