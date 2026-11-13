/**
 * The logins of the calendars read over CalDAV, by calendar id: the server's alone. They are never
 * synced (a `calendarFeed` record holds only the account's name), never in an archive (a restored
 * server asks for them again: its calendars say so), and leave with their calendar. A login kept for a
 * calendar no device wrote within a day (a form left before its record came) is let go.
 */
import { readMeta, writeMeta, type Database } from '../../db/database';

const KEY = 'calendar.feedLogins';
/** How long a login waits for its calendar's record. */
export const UNCLAIMED_MS = 24 * 3_600_000;

export interface FeedLogin {
  readonly username: string;
  readonly password: string;
  /** When it was given. */
  readonly at: number;
}

export class FeedLogins {
  constructor(private readonly db: Database) {}

  private all(): Record<string, FeedLogin> {
    const stored = readMeta(this.db, KEY);
    if (typeof stored !== 'string') return {};
    try {
      const parsed = JSON.parse(stored) as unknown;
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, FeedLogin>) : {};
    } catch {
      return {};
    }
  }

  private write(logins: Record<string, FeedLogin>): void {
    writeMeta(this.db, KEY, JSON.stringify(logins));
  }

  get(id: string): FeedLogin | null {
    const login = this.all()[id];
    return login && typeof login.username === 'string' && typeof login.password === 'string' ? login : null;
  }

  set(id: string, login: FeedLogin): void {
    this.write({ ...this.all(), [id]: login });
  }

  delete(id: string): void {
    const logins = this.all();
    if (!Object.hasOwn(logins, id)) return;
    delete logins[id];
    this.write(logins);
  }

  /** Lets go of the logins whose calendar is gone, or never came. */
  prune(isLive: (id: string) => boolean | null, now: number): void {
    const logins = this.all();
    let changed = false;
    for (const [id, login] of Object.entries(logins)) {
      const live = isLive(id);
      if (live === true || (live === null && now - login.at < UNCLAIMED_MS)) continue;
      delete logins[id];
      changed = true;
    }
    if (changed) this.write(logins);
  }
}
