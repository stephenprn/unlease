/**
 * Pages made for Agenda (`POST /api/pages/from-event`, `POST /api/pages/daily`,
 * `@unlease/pages/sync/journal`): an event's notes, and the day's page under « Journal ». Written
 * under the server's clocks in one change each, as copies are, so Agenda's clients need no page
 * action and every device hears of them through the sync. Asked again, the page made before is
 * answered while it is there (not deleted, not in the bin): an event's is remembered by the event,
 * a day's by the day, the journal by itself (`meta`), a journal of the person's own found by its title.
 */
import type { Database } from '../../db/database';
import { readMeta, writeMeta } from '../../db/database';
import { createId } from '@unlease/core/services/ids';
import { comparePositions, placeAt, positionBetween, positionsBetween } from '@unlease/core/services/fractionalIndex';
import { dateRun, serializeRich, type Run } from '@unlease/core/services/richText';
import { foldText } from '@unlease/core/services/search';
import type { Fields } from '@unlease/core/sync/record';
import { blockFields, type NewBlockFields } from '@unlease/pages/sync/entities';
import { dailyPageLines, dayTitle, JOURNAL_WORDS, type DailyRequest, type FromEventRequest, type PageMade } from '@unlease/pages/sync/journal';
import type { RecordStore, StoredRecord } from '../../sync/records';
import type { ServerEdit, SyncService } from '../../sync/service';

export interface JournalMakerOptions {
  readonly db: Database;
  readonly records: RecordStore;
  readonly sync: SyncService;
  readonly now?: () => number;
}

const EVENT_KEY = (id: string): string => `pages.eventPage.${id}`;
const DAY_KEY = (day: string): string => `pages.dailyPage.${day}`;
const JOURNAL_KEY = 'pages.journal';

const isLivePage = (record: StoredRecord | undefined): boolean =>
  !!record && record.fields.kind === 'page' && typeof record.fields.deletedAt !== 'number' && typeof record.fields.trashedAt !== 'number';

const text = (value: string): Run => ({ kind: 'text', text: value, marks: {} });

export class JournalMaker {
  private readonly now: () => number;

  constructor(private readonly options: JournalMakerOptions) {
    this.now = options.now ?? Date.now;
  }

  /** A page remembered under a key, while it is there. */
  private remembered(key: string): string | null {
    const id = readMeta(this.options.db, key);
    return typeof id === 'string' && isLivePage(this.options.records.get('block', id)) ? id : null;
  }

  private blocks(): StoredRecord[] {
    return this.options.records.ofType('block').filter(record => typeof record.fields.deletedAt !== 'number');
  }

  /** The children of a container, in order. */
  private childrenOf(parentId: string | null): { id: string; position: string; fields: Fields }[] {
    return this.blocks()
      .filter(record => (record.fields.parentId ?? null) === parentId)
      .map(record => ({ id: record.id, position: typeof record.fields.position === 'string' ? record.fields.position : '', fields: record.fields }))
      .sort(comparePositions);
  }

  /** Writes a page and its blocks in one change: `place` gives its position (and the twins it moves). */
  private write(edits: ServerEdit[], page: NewBlockFields, lines: readonly Omit<NewBlockFields, 'parentId' | 'position' | 'createdAt'>[]): string {
    const now = page.createdAt;
    const pageId = createId(now);
    const fields = blockFields(page);
    edits.push({ type: 'block', id: pageId, create: true, patch: () => fields });
    const keys = positionsBetween(null, null, lines.length);
    lines.forEach((line, index) => {
      const written = blockFields({ ...line, parentId: pageId, position: keys[index]!, createdAt: now });
      edits.push({ type: 'block', id: createId(now), create: true, patch: () => written });
    });
    return pageId;
  }

  /** A top-level page's place: after every other, a later twin of the last one moved after it in the same change. */
  private lastTopLevel(edits: ServerEdit[]): string {
    const siblings = this.childrenOf(null);
    const { positions, moved } = placeAt(siblings, siblings.length);
    for (const twin of moved) edits.push({ type: 'block', id: twin.id, patch: () => ({ position: twin.position }) });
    return positions[0]!;
  }

  /** An event's notes: made once, found again while it is there. Synchronous from reading to the write. */
  fromEvent(request: FromEventRequest): PageMade {
    const kept = this.remembered(EVENT_KEY(request.eventId));
    if (kept) return { pageId: kept, created: false };
    const words = JOURNAL_WORDS[request.lang];
    const now = this.now();
    const edits: ServerEdit[] = [];
    const [day, time] = [request.start.slice(0, 10), request.start.length > 10 ? request.start.slice(11, 16) : null];
    const date = dateRun(day, time);
    const lines: Omit<NewBlockFields, 'parentId' | 'position' | 'createdAt'>[] = [];
    lines.push({ kind: 'text', text: serializeRich([text(`${words.event} : `), { kind: 'mention', target: { type: 'event', id: request.eventId } }, ...(date ? [text(' · '), date] : [])]) });
    if (request.contactIds.length > 0) {
      const people: Run[] = [text(`${words.with} `)];
      request.contactIds.forEach((id, index) => {
        if (index > 0) people.push(text(index === request.contactIds.length - 1 ? (request.lang === 'fr' ? ' et ' : ' and ') : ', '));
        people.push({ kind: 'mention', target: { type: 'contact', id } });
      });
      lines.push({ kind: 'text', text: serializeRich(people) });
    }
    lines.push({ kind: 'h2', text: serializeRich([text(words.notes)]) }, { kind: 'bullet', text: '' });
    const position = this.lastTopLevel(edits);
    const pageId = this.write(edits, { parentId: null, position, kind: 'page', text: request.title || words.untitled, icon: '🗓️', trashedAt: null, createdAt: now }, lines);
    this.options.sync.apply(edits);
    writeMeta(this.options.db, EVENT_KEY(request.eventId), pageId);
    return { pageId, created: true };
  }

  /** The day's page under « Journal »: the journal made the first time (or one of the person's found by its title), the day's page likewise. */
  daily(request: DailyRequest): PageMade {
    const words = JOURNAL_WORDS[request.lang];
    const now = this.now();
    const edits: ServerEdit[] = [];
    let journal = this.remembered(JOURNAL_KEY);
    if (!journal) {
      const found = this.childrenOf(null).find(page => page.fields.kind === 'page' && typeof page.fields.trashedAt !== 'number' && foldText(String(page.fields.text ?? '').trim()) === foldText(words.journal));
      journal = found?.id ?? null;
    }
    let made = false;
    if (!journal) {
      journal = this.write(edits, { parentId: null, position: this.lastTopLevel(edits), kind: 'page', text: words.journal, icon: '📔', trashedAt: null, createdAt: now }, []);
      made = true;
    }
    const title = dayTitle(request.day, request.lang);
    const kept = this.remembered(DAY_KEY(request.day)) ?? (made ? null : this.findDay(journal, request.day, title));
    if (kept) {
      writeMeta(this.options.db, JOURNAL_KEY, journal);
      return { pageId: kept, created: false };
    }
    // The newest day first, under the journal.
    const first = made ? null : this.childrenOf(journal)[0] ?? null;
    const pageId = this.write(
      edits,
      { parentId: journal, position: positionBetween(null, first?.position ?? null), kind: 'page', text: title, trashedAt: null, createdAt: now },
      dailyPageLines(request.day, request.lang),
    );
    this.options.sync.apply(edits);
    writeMeta(this.options.db, JOURNAL_KEY, journal);
    writeMeta(this.options.db, DAY_KEY(request.day), pageId);
    return { pageId, created: true };
  }

  /** A day's page already under the journal: by its title in either language, or holding the day's date. */
  private findDay(journal: string, day: string, title: string): string | null {
    const titles = new Set([foldText(title), foldText(dayTitle(day, 'fr')), foldText(dayTitle(day, 'en'))]);
    const marker = `{@date=${day}}`;
    for (const page of this.childrenOf(journal)) {
      if (page.fields.kind !== 'page' || typeof page.fields.trashedAt === 'number') continue;
      if (titles.has(foldText(String(page.fields.text ?? '').trim()))) return page.id;
      if (this.childrenOf(page.id).some(child => String(child.fields.text ?? '').includes(marker))) return page.id;
    }
    return null;
  }
}
