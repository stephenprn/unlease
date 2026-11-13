/**
 * The suite's server in the page, for the dev demo only: `fetch` to the demo
 * address is answered here, so the real transport, sync loop and image cache
 * run unchanged. It merges and sequences records with core's own merge, holds
 * long-polls, and "reads" pending links after a pause, filing them on a line
 * by keyword, the way the real server's analysis writes its results. Sorting
 * (`/api/sort`) files by the words a collection's name and sentence share with a link; the link
 * modules pretend too: promo codes (`/api/coupons`), offers elsewhere (`/api/offers`), a recipe's
 * ingredients and method (`/api/recipe`), an article kept as a page (`/api/pages/copies`, which
 * makes the page here and points the link's `copy` at it, as the server does), ratings
 * (`/api/ratings`), a recap (`/api/recap`), other outlets (`/api/coverage`), answers
 * (`/api/ask`), a Seerr that has some films (`/api/seerr`), an Immich of drawn photos (`/api/immich`, `fakeImmich.ts`), « Vérifier le prix »
 * (`/api/notes/price-check`, a jumper that gets cheaper) and « Essayer » on a template
 * (`/api/notes/template-try`), all made up. A link's facts follow the template it is read with (its
 * collection's, else its kind's, `notes/services/templates`), with the version written in `readWith`.
 * Photos and a page's files (`/api/blobs`, `/api/files`) are kept in memory for the visit.
 * The Administration's routes (`/api/admin…`) pretend too: backups to an S3 that is a list in
 * memory, a Seafile that takes any long enough token, restores that report what the demo holds.
 * It runs the apps the setup or the Administration turns on (`/api/health`'s `apps`, `PUT
 * /api/settings { apps }`; an app off answers 404, as the server does), remembers when its setup is
 * done (`setupDone`), and a pull answers only the record types it names (`SyncRequest.types`).
 */
import { foldText } from '@unlease/core/services/search';
import { MAX_PULL, type SyncResponse } from '@unlease/core/sync/protocol';
import { parseSyncRequest } from '@unlease/core/sync/protocol';
import { parseSortRequest, type SortLink, type SortMove, type SortTarget } from '@unlease/notes/sync/sorting';
import { parseAskRequest } from '@unlease/notes/sync/ask';
import { parsePagesAskRequest, requestChars, type PagesAskResponse } from '@unlease/pages/sync/pagesAsk';
import { parseCopyRequest } from '@unlease/pages/sync/copies';
import { blockFields, type NewBlockFields } from '@unlease/pages/sync/entities';
import { parseCouponRequest } from '@unlease/notes/sync/coupons';
import { parseCoverageRequest } from '@unlease/notes/sync/coverage';
import { parseOfferRequest } from '@unlease/notes/sync/offers';
import { parseRecipeRequest } from '@unlease/notes/sync/recipe';
import { parseSeerrRequest } from '@unlease/notes/sync/seerr';
import { parseRatingsRequest, parseRecapRequest } from '@unlease/notes/sync/works';
import { seerrPageUrl, seerrSearchUrl } from '@unlease/notes/services/modules';
import { priceUpdate } from '@unlease/notes/services/priceWatch';
import { parsePriceCheckRequest, PRICE_CHECK_PATH } from '@unlease/notes/sync/priceWatch';
import { createClock, tick } from '@unlease/core/sync/hlc';
import { mergeRecord, writeFields, type Fields, type SyncRecord } from '@unlease/core/sync/record';
import { linkFields, linkFromRecord, linkTemplateFromRecord, noteFields, noteFromRecord } from '@unlease/notes/sync/entities';
import { KIND_TEMPLATES, type TemplateField, type TemplateFieldType } from '@unlease/notes/models/templates';
import { linkTemplateSource, presetNames, readingSignature, type Templates } from '@unlease/notes/services/templates';
import { parseTemplateTryRequest, TEMPLATE_TRY_PATH } from '@unlease/notes/sync/templateTry';
import type { Locale } from '@unlease/core/i18n';
import { GIFTS_PATH, parseGiftLinkRequest } from '@unlease/core/sync/gifts';
import { mentionMarkups, parseMentionsQuery, type MentionPlace } from '@unlease/core/sync/mentions';
import { INBOX_ID, LINK_KINDS, type LinkAttribute, type LinkKind } from '@unlease/notes/models/entities';
import { isRestoreMode, type AdminStatus, type BackupRun, type BackupSnapshot, type RestoreStatus } from '@unlease/core/sync/admin';
import { APPS, isReadyApp, type AppId } from '@unlease/core/apps';
import { createId } from '@unlease/core/services/ids';
import { keysBetween } from '@unlease/core/services/fractionalIndex';
import { parseEnabledApps, PAGES_ASK_DEFAULTS, PAGES_REACH_CHARS, BACKUP_KEEP_MAX, DRIVE_FOLDER_DEFAULT, isBackupRecurrence, isClaudeModel, isColdStorage, isPagesReach, isStorageClass, type BackupSettings, type DriveSettings, type PagesAskSettings, type SeerrSettings, type ImmichSettings, type ServerSettings, type CalendarSettings, parseCalendarPatch } from '@unlease/core/sync/settings';
import { immichRoute } from './fakeImmich';

import { CONTACT_PHOTO_PATH, isContactPhotoRequest } from '@unlease/contacts/sync/photos';
import { demoImage } from './demoImages';
import { calendarRoute, writeHolidays } from './fakeCalendar';
import { pageVersionsRoute } from './fakePageVersions';
import { PLACES_PATH } from '@unlease/core/sync/places';
import { fakePlaces } from './fakePlaces';

export const DEMO_SERVER = 'https://unlease.maison.example';

interface Stored {
  record: SyncRecord;
  seq: number;
}

/** What the pretend Claude writes of a page, in the link's language (`lang`), as Claude does. */
interface ReadWords {
  readonly title: string;
  readonly summary: string;
  readonly attributes: readonly LinkAttribute[];
}

interface Reading {
  readonly match: RegExp;
  readonly lineId: string | null;
  readonly kind: LinkKind;
  /** The site's own name, the demo's (in English, as its records). */
  readonly siteName: string;
  readonly price: number | null;
  readonly imageIds: readonly string[];
  readonly words: Readonly<Record<Locale, ReadWords>>;
}

/** A wine the pretend Claude reads (a cellar's page), filed in "Wines" with its template's facts. */
const WINE_READING: Reading = {
  match: /cave-|cellar|\/(vins?|wines?)\//,
  lineId: 'line-vins',
  kind: 'product',
  siteName: 'Hillside Cellar',
  price: 11.9,
  imageIds: [],
  words: {
    fr: {
      title: 'Côtes-du-Rhône Les Galets 2022',
      summary: 'Un rouge du sud gourmand et épicé, à ouvrir une heure avant.',
      attributes: [
        { label: 'Domaine', value: 'Domaine des Ormes' },
        { label: 'Millésime', value: '2022' },
        { label: 'Cépages', value: 'Grenache, syrah' },
        { label: 'Région', value: 'Côtes-du-Rhône' },
        { label: 'Accords', value: 'Grillades, fromages affinés' },
      ],
    },
    en: {
      title: 'Côtes-du-Rhône Les Galets 2022',
      summary: 'A rich, spicy southern red; open it an hour before.',
      attributes: [
        { label: 'Estate', value: 'Domaine des Ormes' },
        { label: 'Vintage', value: '2022' },
        { label: 'Grapes', value: 'Grenache, Syrah' },
        { label: 'Region', value: 'Côtes-du-Rhône' },
        { label: 'Pairings', value: 'Grilled meat, aged cheeses' },
      ],
    },
  },
};

/** What the pretend Claude reads, by URL. */
const READINGS: readonly Reading[] = [
  {
    match: /phares|lighthouse/,
    lineId: 'line-films',
    kind: 'film',
    siteName: 'Lumière Cinema',
    price: null,
    imageIds: ['demo-poster3'],
    words: {
      fr: {
        title: 'La Nuit des phares',
        summary: 'Un gardien de phare et sa fille, une tempête, une nuit entière pour rallumer la lanterne. Premier film d’une réalisatrice bretonne.',
        attributes: [
          { label: 'Durée', value: '1 h 48' },
          { label: 'Sortie', value: 'Novembre' },
        ],
      },
      en: {
        title: 'The Night of the Lighthouses',
        summary: 'A lighthouse keeper and his daughter, a storm, one whole night to light the lantern again. A first feature by a Breton director.',
        attributes: [
          { label: 'Running time', value: '1h 48m' },
          { label: 'Release', value: 'November' },
        ],
      },
    },
  },
  {
    match: /bonnet|beanie/,
    lineId: 'line-mode',
    kind: 'product',
    siteName: 'Knit & Purl',
    price: 39,
    imageIds: [],
    words: {
      fr: { title: 'Bonnet en côtes anglaises', summary: 'Bonnet en laine mérinos, maille côtes anglaises, revers large.', attributes: [{ label: 'Couleur', value: 'Gris chiné' }] },
      en: { title: 'Fisherman rib beanie', summary: 'A merino wool beanie in fisherman rib, with a wide turn-up.', attributes: [{ label: 'Colour', value: 'Heather grey' }] },
    },
  },
  {
    match: /lampe|luminaire|lamp/,
    lineId: 'line-maison',
    kind: 'product',
    siteName: 'Clair Home',
    price: 119,
    imageIds: ['demo-lamp-2'],
    words: {
      fr: { title: 'Applique murale en laiton', summary: 'Applique orientable en laiton brossé, abat-jour conique.', attributes: [{ label: 'Finition', value: 'Laiton brossé' }] },
      en: { title: 'Brass wall light', summary: 'An adjustable wall light in brushed brass, with a conical shade.', attributes: [{ label: 'Finish', value: 'Brushed brass' }] },
    },
  },
  WINE_READING,
];

const fold = (text: string): string => foldText(text).replace(/\s+/g, ' ').trim();

/** What the pretend Claude finds for a field no reading names: by its name for the demo's own, else by its type (a text the page does not give is left out). */
const CANNED: Readonly<Record<Locale, { readonly names: Readonly<Record<string, string>>; readonly types: Readonly<Partial<Record<TemplateFieldType, string>>> }>> = {
  fr: {
    names: { difficulte: 'Facile', vegetarien: 'Oui', domaine: 'Domaine des Ormes', millesime: '2022', cepages: 'Grenache, syrah', region: 'Vallée du Rhône', accords: 'Grillades, fromages' },
    types: { number: '4', date: '14 novembre 2026', duration: '45 min', list: 'Premier, second', yesno: 'Non' },
  },
  en: {
    names: { difficulte: 'Easy', difficulty: 'Easy', vegetarien: 'Yes', vegetarian: 'Yes', domaine: 'Domaine des Ormes', estate: 'Domaine des Ormes', millesime: '2022', vintage: '2022', cepages: 'Grenache, Syrah', grapes: 'Grenache, Syrah', region: 'Rhône Valley', accords: 'Grilled meat, cheese', pairings: 'Grilled meat, cheese' },
    types: { number: '4', date: '14 November 2026', duration: '45 min', list: 'First, second', yesno: 'No' },
  },
};

/** A preset's names in both languages, by its id: a field kept from a preset still finds the fact a reading named either way. */
const PRESET_NAMES = new Map(LINK_KINDS.flatMap(kind => KIND_TEMPLATES[kind]).map(preset => [preset.id, [fold(presetNames(preset).fr), fold(presetNames(preset).en)]] as const));

/** The fields filled from facts read (by the field's name, or its preset's), else from the canned values, in the fields' order. */
function filledFields(fields: readonly TemplateField[], facts: readonly LinkAttribute[], lang: Locale): LinkAttribute[] {
  const byLabel = new Map(facts.map(fact => [fold(fact.label), fact.value] as const));
  return fields.flatMap(field => {
    const named = [fold(field.name), ...(PRESET_NAMES.get(field.id) ?? [])].map(name => byLabel.get(name)).find(Boolean);
    const value = named ?? CANNED[lang].names[fold(field.name)] ?? CANNED[lang].types[field.type];
    return value ? [{ label: field.name, value }] : [];
  });
}

const delay = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });

/** Words long enough to mean something ("pour", "dans" do not), folded. */
const words = (text: string): string[] => foldText(text).split(/[^a-z0-9]+/).filter(word => word.length > 4);

/** The pretend Claude's idea of a fit: the link's reading by address, else a word of the collection's name or sentence in it. */
function fits(link: SortLink, target: SortTarget): boolean {
  const known = READINGS.find(entry => entry.match.test(link.url));
  if (known?.lineId) return known.lineId === target.id;
  const about = words(`${link.title} ${link.summary} ${link.site} ${link.facts.join(' ')}`);
  return words(`${target.title} ${target.hint}`).some(word => about.some(other => other.startsWith(word.slice(0, 5))));
}

/** What a key looks like; the real server asks Anthropic instead. */
const KEY_SHAPE = /^sk-ant-[A-Za-z0-9_-]{20,}$/;

const HOUR = 3_600_000;

const jsonResponse = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

const snapshotName = (time: number): string => `unlease-${new Date(time).toISOString().slice(0, 19).replace(/:/g, '-')}Z.tar.gz`;

const hint = (secret: string): string => `…${secret.slice(-4)}`;

export class FakeServer {
  /** Link reading: on, with a key set from the apps, unless the demo asks for it off. */
  private settings: ServerSettings['analysis'];
  /** Questions about the pages: on in the demo when it reads links, so they can be tried. */
  private pages: PagesAskSettings;

  /** The apps it runs, and whether its own first run is over. */
  private apps: AppId[];
  private setupDone: boolean;

  constructor({ reading = true, apps = ['notes', 'pages'], setupDone = true }: { reading?: boolean; apps?: readonly AppId[]; setupDone?: boolean } = {}) {
    this.apps = apps.filter(isReadyApp);
    this.setupDone = setupDone;
    this.settings = reading
      ? { enabled: true, keySource: 'app', keyHint: '…k3Xq', model: 'claude-opus-5-5', budgetUsd: 15 }
      : { enabled: false, keySource: null, keyHint: null, model: 'claude-opus-5-5', budgetUsd: 15 };
    this.pages = { ...PAGES_ASK_DEFAULTS, enabled: reading };
    this.calendar = { holidays: { country: 'FR', region: null }, publishPath: '/ical/demo-0123456789abcdef.ics', ask: reading };
  }

  /** Agenda's: the holidays (France), a published address, questions on when the demo reads links. */
  private calendar: CalendarSettings;

  /** Every record the server holds (Agenda's routes read them). */
  allRecords(): SyncRecord[] {
    return [...this.records.values()].map(row => row.record);
  }

  /** The holidays the server keeps for its country, as the real one fetches them. */
  seedHolidays(now: number = Date.now()): void {
    writeHolidays({ records: () => this.allRecords(), write: (type, id, patch) => this.write(type, id, patch) }, this.calendar.holidays.country, this.calendar.holidays.region, now);
  }

  private readonly records = new Map<string, Stored>();
  private seq = 0;
  private readonly waiters = new Set<() => void>();
  private readonly clock = createClock('demoserver');
  private readonly reading = new Set<string>();
  /** What was uploaded this visit, served back as the real server would. */
  private readonly uploads = new Map<string, Blob>();

  /** The Administration: an S3 already set, with a few snapshots; Seafile off. */
  private backup: BackupSettings = {
    configured: true,
    endpoint: 'https://s3.fr-par.scw.cloud',
    region: 'fr-par',
    bucket: 'home-backups',
    prefix: 'unlease/',
    accessKeyId: 'SCWDEMO7Q2K4M8XP1ZTA',
    secretHint: '…9f2c',
    recurrence: 'daily',
    keep: 30,
    storageClass: 'STANDARD',
  };
  private drive: DriveSettings = { provider: null, url: '', folder: DRIVE_FOLDER_DEFAULT, library: null, tokenHint: null, leaving: false };
  private seerr: SeerrSettings = { url: 'https://seerr.maison.example', keyHint: '…7d1e' };
  private immich: ImmichSettings = { url: 'https://photos.maison.example', keyHint: '…a3f9' };
  private snapshots: BackupSnapshot[] = [3, 27, 51].map(hours => {
    const at = Date.now() - hours * HOUR;
    return { name: snapshotName(at), at, bytes: 180_000 + hours * 1_200, cold: false };
  });
  private lastRun: BackupRun | null = { startedAt: Date.now() - 3 * HOUR - 40_000, finishedAt: Date.now() - 3 * HOUR, ok: true, error: null, snapshot: null, bytes: 183_600, filesSent: 4, trigger: 'schedule' };
  private backupRunning = false;
  private driveRunning = false;
  private driveFiles = 0;
  private driveLastPass: number | null = null;
  private restore: RestoreStatus = { running: false, startedAt: null, finishedAt: null, error: null, report: null, thawing: false };

  private notify(): void {
    for (const wake of [...this.waiters]) wake();
  }

  private put(record: SyncRecord): void {
    this.seq += 1;
    this.records.set(`${record.type}:${record.id}`, { record, seq: this.seq });
  }

  /** The server's own write (the analysis): one clock for the whole patch. */
  write(type: SyncRecord['type'], id: string, patch: Fields): void {
    const key = `${type}:${id}`;
    const current = this.records.get(key)?.record ?? { type, id, fields: {}, clocks: {} };
    this.put(writeFields(current, patch, tick(this.clock, Date.now())));
    this.notify();
  }

  push(records: readonly SyncRecord[]): void {
    let changed = false;
    for (const incoming of records) {
      const key = `${incoming.type}:${incoming.id}`;
      const merged = mergeRecord(this.records.get(key)?.record, incoming);
      if (merged.changed) {
        this.put(merged.record);
        changed = true;
      }
      const record = this.records.get(key)?.record;
      if (record?.type === 'link' && record.fields.status === 'pending' && record.fields.deletedAt === null) this.read(record.id);
    }
    if (changed) this.notify();
  }

  pull(since: number, types?: readonly string[]): SyncResponse {
    const rows = [...this.records.values()].filter(row => row.seq > since && (!types || types.includes(row.record.type))).sort((a, b) => a.seq - b.seq);
    const page = rows.slice(0, MAX_PULL);
    return {
      records: page.map(row => row.record),
      cursor: page.length > 0 ? page[page.length - 1]!.seq : since,
      more: rows.length > MAX_PULL,
      serverTime: Date.now(),
    };
  }

  private read(linkId: string): void {
    // Without a key nothing is read: links wait, and the apps mark new ones "skipped".
    if (!this.settings.enabled || this.reading.has(linkId)) return;
    const stored = this.records.get(`link:${linkId}`);
    if (!stored) return;
    const link = linkFromRecord(stored.record);
    // A link at a slow loom's address (or one that says "lent") stays in reading, for screenshots of that state.
    if (/slow-loom|lent/.test(link.url)) return;
    this.reading.add(linkId);
    setTimeout(() => {
      this.reading.delete(linkId);
      const current = linkFromRecord(this.records.get(`link:${linkId}`)!.record);
      if (current.status !== 'pending' || current.deletedAt !== null) return;
      if (/closed-shop|echec|fermee/.test(current.url)) {
        this.write('link', linkId, { status: 'failed', error: 'Page protected against robots', analyzedAt: Date.now() });
        return;
      }
      const found = READINGS.find(entry => entry.match.test(current.url));
      const said = found?.words[current.lang];
      const line = found?.lineId && this.records.has(`note:${found.lineId}`) ? found.lineId : null;
      // Read again (« Relire »), a link keeps what the demo cannot read better.
      const kind = found?.kind ?? current.kind;
      // Read with its collection's template (or the one Claude files it in), else its kind's: its facts are those fields, from what it held before or the canned reading.
      const into = current.autoFile ? (line ?? INBOX_ID) : current.noteId;
      const source = linkTemplateSource(this.templates(), { noteId: into, kind }, this.collections());
      const fields = source.from === 'collection' ? source.template.fields : (source.template?.fields ?? null);
      const facts = current.attributes.length > 0 ? current.attributes : (said?.attributes ?? []);
      const patch: Fields = {
        status: 'ready',
        title: current.title || said?.title || (current.lang === 'fr' ? 'Page sans titre' : 'Untitled page'),
        summary: current.summary || (said?.summary ?? ''),
        siteName: current.siteName || (found?.siteName ?? ''),
        kind,
        price: found?.price ?? current.price ?? null,
        currency: typeof (found?.price ?? current.price) === 'number' ? (current.currency ?? 'EUR') : null,
        attributes: (fields ? filledFields(fields, facts, current.lang) : facts).map(a => ({ label: a.label, value: a.value })),
        imageIds: [...(found?.imageIds ?? current.imageIds)],
        analyzedAt: Date.now(),
        error: null,
        readWith: readingSignature(source),
      };
      if (current.autoFile) {
        patch.autoFile = false;
        if (line) {
          patch.noteId = line;
          patch.filedBy = 'claude';
        }
      }
      this.write('link', linkId, patch);
    }, 3_200);
  }

  /** The templates links are read with, live and deleted, as the server keeps them. */
  private templates(): Templates {
    const out: Record<string, ReturnType<typeof linkTemplateFromRecord>> = {};
    for (const { record } of this.records.values()) if (record.type === 'linkTemplate') out[record.id] = linkTemplateFromRecord(record);
    return out;
  }

  /** The collections, by id. */
  private collections(): Record<string, ReturnType<typeof noteFromRecord>> {
    const out: Record<string, ReturnType<typeof noteFromRecord>> = {};
    for (const { record } of this.records.values()) if (record.type === 'note') out[record.id] = noteFromRecord(record);
    return out;
  }

  private async exchange(body: unknown, signal: AbortSignal | undefined): Promise<SyncResponse> {
    const { request } = parseSyncRequest(body);
    if (!request) throw new Error('bad request');
    await delay(90, signal);
    if (request.records.length > 0) this.push(request.records);
    let response = this.pull(request.since, request.types);
    if (response.records.length === 0 && request.wait) {
      await new Promise<void>((resolve, reject) => {
        const done = (): void => {
          clearTimeout(timer);
          this.waiters.delete(done);
          resolve();
        };
        const timer = setTimeout(done, request.wait);
        this.waiters.add(done);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          this.waiters.delete(done);
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
      response = this.pull(request.since, request.types);
    }
    return response;
  }

  /** `PUT /api/settings`: a key that does not look right is refused in French, as the server does. */
  private async updateSettings(body: Record<string, unknown>): Promise<Response> {
    await delay(450);
    if ('apps' in body) {
      const apps = parseEnabledApps(body.apps);
      if (!apps) return jsonResponse({ error: 'Choisissez au moins une application' }, 400);
      this.apps = apps;
    }
    if (body.setupDone === true) this.setupDone = true;
    const next = { ...this.settings };
    if ('anthropicApiKey' in body) {
      const key = body.anthropicApiKey;
      if (key === null) {
        if (next.keySource === 'app') Object.assign(next, { enabled: false, keySource: null, keyHint: null });
      } else if (typeof key === 'string' && KEY_SHAPE.test(key.trim())) {
        Object.assign(next, { enabled: true, keySource: 'app', keyHint: `…${key.trim().slice(-4)}` });
      } else {
        return new Response(JSON.stringify({ error: 'Anthropic refuse cette clé : vérifiez qu’elle est complète et toujours active.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    if (isClaudeModel(body.model)) next.model = body.model;
    if (typeof body.budgetUsd === 'number' && Number.isFinite(body.budgetUsd) && body.budgetUsd >= 0) next.budgetUsd = body.budgetUsd;
    const turnedOn = next.enabled && !this.settings.enabled;
    this.settings = next;
    // A key just set: whatever was waiting is read now.
    if (turnedOn) {
      for (const { record } of this.records.values()) {
        if (record.type === 'link' && record.fields.status === 'pending') this.read(record.id);
      }
    }
    if ('pages' in body) {
      const patch = body.pages as Record<string, unknown> | null;
      if (typeof patch !== 'object' || patch === null) return jsonResponse({ error: 'Invalid request' }, 400);
      const pages = { ...this.pages };
      for (const name of ['enabled', 'everywhere', 'web'] as const) {
        if (patch[name] === undefined) continue;
        if (typeof patch[name] !== 'boolean') return jsonResponse({ error: 'Invalid request' }, 400);
        pages[name] = patch[name];
      }
      if (patch.reach !== undefined) {
        if (!isPagesReach(patch.reach)) return jsonResponse({ error: 'Invalid request' }, 400);
        pages.reach = patch.reach;
      }
      this.pages = pages;
    }
    if ('backup' in body) {
      const refused = this.updateBackup(body.backup);
      if (refused) return jsonResponse({ error: refused }, 400);
    }
    if ('drive' in body) {
      const refused = this.updateDrive(body.drive);
      if (refused) return jsonResponse({ error: refused }, 400);
    }
    if ('calendar' in body) {
      const patch = parseCalendarPatch(body.calendar);
      if (!patch) return jsonResponse({ error: 'Setting refused' }, 400);
      if (patch.holidays) {
        this.calendar = { ...this.calendar, holidays: { country: patch.holidays.country, region: patch.holidays.region ?? null } };
        this.seedHolidays();
      }
      if (patch.publish !== undefined) this.calendar = { ...this.calendar, publishPath: patch.publish === false ? null : patch.publish === 'renew' || !this.calendar.publishPath ? `/ical/demo-${createId().replace(/-/g, '')}.ics` : this.calendar.publishPath };
      if (patch.ask !== undefined) this.calendar = { ...this.calendar, ask: patch.ask };
    }
    if ('seerr' in body) {
      const refused = this.updateSeerr(body.seerr);
      if (refused) return jsonResponse({ error: refused }, 400);
    }
    if ('immich' in body) {
      const refused = this.updateImmich(body.immich);
      if (refused) return jsonResponse({ error: refused }, 400);
    }
    return jsonResponse(this.settingsView());
  }

  private settingsView(): ServerSettings {
    return { apps: { enabled: [...this.apps] }, setup: { done: this.setupDone }, analysis: this.settings, pages: this.pages, calendar: this.calendar, backup: this.backup, drive: this.drive, seerr: this.seerr, immich: this.immich };
  }

  /** The Seerr part of `PUT /api/settings`: any http(s) address answers, any long enough key opens it. */
  private updateSeerr(patch: unknown): string | null {
    if (patch === null) {
      this.seerr = { url: '', keyHint: null };
      return null;
    }
    if (typeof patch !== 'object') return 'Invalid request';
    const raw = patch as { url?: unknown; apiKey?: unknown };
    let url = this.seerr.url;
    if (raw.url !== undefined) {
      if (typeof raw.url !== 'string' || !/^https?:\/\/[^\s/?#]+[^\s?#]*$/i.test(raw.url.trim())) return 'Invalid Seerr address';
      url = raw.url.trim().replace(/\/+$/, '');
    }
    if (!url) return 'Enter Seerr’s address';
    let keyHint = this.seerr.keyHint;
    if (raw.apiKey !== undefined) {
      const key = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : null;
      if (key === null || (key !== '' && !/^[!-~]{8,300}$/.test(key))) return 'Invalid API key';
      keyHint = key ? `…${key.slice(-4)}` : null;
    }
    this.seerr = { url, keyHint };
    return null;
  }

  /** The Immich part of `PUT /api/settings`: any http(s) address answers, any long enough key opens it. */
  private updateImmich(patch: unknown): string | null {
    if (patch === null) {
      this.immich = { url: '', keyHint: null };
      return null;
    }
    if (typeof patch !== 'object') return 'Invalid request';
    const raw = patch as { url?: unknown; apiKey?: unknown };
    let url = this.immich.url;
    if (raw.url !== undefined) {
      if (typeof raw.url !== 'string' || !/^https?:\/\/[^\s/?#]+[^\s?#]*$/i.test(raw.url.trim())) return 'Invalid Immich address';
      url = raw.url.trim().replace(/\/+$/, '');
    }
    if (!url) return 'Enter Immich’s address';
    let keyHint = this.immich.keyHint;
    if (raw.apiKey !== undefined) {
      const key = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '';
      if (!/^[!-~]{8,300}$/.test(key)) return 'Invalid API key';
      keyHint = `…${key.slice(-4)}`;
    }
    if (!keyHint) return 'Paste an Immich API key';
    this.immich = { url, keyHint };
    return null;
  }

  /** The S3 part of `PUT /api/settings`, checked as the server would (without asking any bucket). Returns the refusal, if any. */
  private updateBackup(patch: unknown): string | null {
    if (patch === null) {
      this.backup = { ...this.backup, configured: false, endpoint: '', region: '', bucket: '', prefix: '', accessKeyId: '', secretHint: null };
      return null;
    }
    if (typeof patch !== 'object') return 'Invalid request';
    const raw = patch as Record<string, unknown>;
    const next = { ...this.backup };
    for (const field of ['endpoint', 'region', 'bucket', 'prefix', 'accessKeyId'] as const) if (typeof raw[field] === 'string') next[field] = raw[field].trim();
    const secret = typeof raw.secretAccessKey === 'string' ? raw.secretAccessKey.trim() : '';
    if (!next.secretHint && !secret) return 'Secret key missing';
    if (next.endpoint && !/^https?:\/\/[^/]+$/.test(next.endpoint)) return 'Adresse du service invalide';
    if (secret) next.secretHint = hint(secret);
    if (isBackupRecurrence(raw.recurrence)) next.recurrence = raw.recurrence;
    if (raw.keep !== undefined) {
      if (typeof raw.keep !== 'number' || !Number.isInteger(raw.keep) || raw.keep < 1 || raw.keep > BACKUP_KEEP_MAX) return 'Invalid number of days to keep';
      next.keep = raw.keep;
    }
    if (raw.storageClass !== undefined) {
      if (!isStorageClass(raw.storageClass)) return 'Unknown storage class';
      next.storageClass = raw.storageClass;
    }
    next.configured = Boolean(next.endpoint && next.region && next.bucket && next.accessKeyId && next.secretHint);
    this.backup = next;
    return null;
  }

  /** The Seafile part: any token of ten characters or more opens the library "Documents". */
  private updateDrive(patch: unknown): string | null {
    if (patch === null) {
      if (this.drive.provider === null) return null;
      this.drive = { ...this.drive, leaving: true };
      setTimeout(() => {
        this.driveFiles = 0;
        this.drive = { provider: null, url: '', folder: DRIVE_FOLDER_DEFAULT, library: null, tokenHint: null, leaving: false };
      }, 2_500);
      return null;
    }
    if (typeof patch !== 'object') return 'Invalid request';
    const raw = patch as Record<string, unknown>;
    const token = typeof raw.token === 'string' ? raw.token.trim() : '';
    if (token && token.length < 10) return 'Token refused by Seafile';
    if (!this.drive.tokenHint && !token) return 'Token refused by Seafile';
    const url = typeof raw.url === 'string' ? raw.url.trim() : this.drive.url;
    if (!/^https?:\/\/./.test(url)) return 'Invalid Seafile address';
    this.drive = {
      provider: 'seafile',
      url,
      folder: typeof raw.folder === 'string' && raw.folder.trim() ? raw.folder.trim() : this.drive.folder,
      library: 'Documents',
      tokenHint: token ? hint(token) : this.drive.tokenHint,
      leaving: false,
    };
    this.drivePass();
    return null;
  }

  private drivePass(): void {
    if (this.driveRunning) return;
    this.driveRunning = true;
    setTimeout(() => {
      this.driveRunning = false;
      this.driveFiles = this.fileCount().files;
      this.driveLastPass = Date.now();
    }, 1_000);
  }

  private fileCount(): { files: number; bytes: number } {
    let files = 0;
    let bytes = 0;
    for (const { record } of this.records.values()) {
      const fields = record.fields;
      const live = fields.deletedAt === null || fields.deletedAt === undefined;
      if (live && (record.type === 'attachment' || (record.type === 'block' && typeof fields.fileId === 'string'))) {
        files += 1;
        bytes += typeof fields.bytes === 'number' ? fields.bytes : 0;
      }
    }
    return { files, bytes };
  }

  private adminStatus(): AdminStatus {
    let notes = 0;
    let pages = 0;
    let contacts = 0;
    let events = 0;
    for (const { record } of this.records.values()) {
      if (record.fields.deletedAt !== null && record.fields.deletedAt !== undefined) continue;
      if (record.type === 'note' && record.fields.kind !== 'links') notes += 1;
      if (record.type === 'block' && record.fields.kind === 'page') pages += 1;
      if (record.type === 'contact' && (record.fields.trashedAt === null || record.fields.trashedAt === undefined)) contacts += 1;
      if (record.type === 'calendarEvent' && record.fields.deletedAt === null && record.fields.trashedAt === null && (record.fields.feedId === null || record.fields.feedId === undefined)) events += 1;
    }
    const { files, bytes } = this.fileCount();
    const interval = { off: 0, '6h': 6 * HOUR, daily: 24 * HOUR, weekly: 7 * 24 * HOUR }[this.backup.recurrence];
    const lastAt = this.lastRun?.finishedAt ?? null;
    return {
      server: { version: 'demo', notes, pages, contacts, events, files, fileBytes: bytes },
      backup: {
        running: this.backupRunning,
        last: this.lastRun,
        lastSuccessAt: this.lastRun?.ok ? lastAt : null,
        nextAt: this.backup.configured && interval > 0 ? (lastAt ?? Date.now()) + interval : null,
      },
      drive: {
        running: this.driveRunning,
        files: this.drive.provider ? this.driveFiles : 0,
        bytes: this.drive.provider ? bytes : 0,
        waiting: this.drive.leaving ? this.driveFiles : this.drive.provider && this.driveRunning ? Math.max(0, files - this.driveFiles) : 0,
        lastPassAt: this.driveLastPass,
        error: null,
      },
      restore: this.restore,
    };
  }

  /** `/api/admin…`: the status, the backups, a pass over the drive, a restore; downloads cannot leave the page. */
  private async admin(url: URL, method: string, init: RequestInit | undefined): Promise<Response> {
    await delay(120);
    if (url.pathname === '/api/admin' && method === 'GET') return jsonResponse(this.adminStatus());
    if (url.pathname === '/api/admin/backups') {
      if (!this.backup.configured) return jsonResponse({ error: 'S3 backup not set up' }, 409);
      if (method === 'GET') return jsonResponse({ snapshots: [...this.snapshots].sort((a, b) => b.at - a.at) });
      if (method === 'POST') {
        if (!this.backupRunning) {
          this.backupRunning = true;
          const startedAt = Date.now();
          setTimeout(() => {
            const at = Date.now();
            const snapshot = { name: snapshotName(at), at, bytes: 184_000 + Math.round(Math.random() * 4_000), cold: isColdStorage(this.backup.storageClass) };
            // Kept `keep` days, the newest always.
            const cutoff = at - this.backup.keep * 24 * HOUR;
            this.snapshots = [snapshot, ...this.snapshots.filter(each => each.at >= cutoff)];
            this.lastRun = { startedAt, finishedAt: at, ok: true, error: null, snapshot: snapshot.name, bytes: snapshot.bytes, filesSent: 1, trigger: 'manual' };
            this.backupRunning = false;
          }, 1_500);
        }
        return jsonResponse(this.adminStatus(), 202);
      }
    }
    if (url.pathname === '/api/admin/drive/sync' && method === 'POST') {
      if (!this.drive.provider) return jsonResponse({ error: 'Seafile is not connected' }, 409);
      this.drivePass();
      return jsonResponse(this.adminStatus(), 202);
    }
    if (url.pathname === '/api/admin/restore' && method === 'POST') {
      const mode = url.searchParams.get('mode') ?? 'merge';
      if (!isRestoreMode(mode)) return jsonResponse({ error: 'Unknown restore mode' }, 400);
      if (this.restore.running) return jsonResponse({ error: 'A restore is already under way' }, 409);
      const named = typeof init?.body === 'string' ? (JSON.parse(init.body) as { snapshot?: unknown }).snapshot : undefined;
      const source = typeof named === 'string' ? named : init?.body instanceof File ? init.body.name : 'archive.tar.gz';
      const startedAt = Date.now();
      this.restore = { running: true, startedAt, finishedAt: null, error: null, report: null, thawing: false };
      setTimeout(() => {
        this.restore = { running: false, startedAt, finishedAt: Date.now(), error: null, report: { mode, source, records: this.records.size, files: this.fileCount().files, missingFiles: 0, needDrive: 0, coldFiles: 0 }, thawing: false };
      }, 1_000);
      return jsonResponse(this.adminStatus(), 202);
    }
    if (url.pathname === '/api/admin/downloads' && method === 'POST') return jsonResponse({ error: 'Téléchargement indisponible dans la démo' }, 501);
    return jsonResponse({ error: 'not found' }, 404);
  }

  /** `POST /api/sort`, after a pause; a review moves only what another collection takes and its own does not. */
  private async sort(body: unknown): Promise<Response> {
    const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
    const request = parseSortRequest(body);
    if (!request) return json({ error: 'Invalid sorting request' }, 400);
    if (!this.settings.enabled) return json({ error: 'Claude is not reading links: add a key in Administration.' }, 409);
    await delay(1_400);
    const current = request.targets.find(target => target.id === request.from);
    const moves: SortMove[] = [];
    for (const link of request.links) {
      if (current && fits(link, current)) continue;
      const target = request.targets.find(other => other.id !== request.from && fits(link, other));
      if (target) moves.push({ link: link.id, to: target.id });
    }
    return json({ moves });
  }

  /** `POST /api/coupons`, after a search's pause: two codes and a tip for the link's shop, in the language asked. */
  private async coupons(body: unknown): Promise<Response> {
    const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
    const request = parseCouponRequest(body);
    if (!request) return json({ error: 'Invalid promo code request' }, 400);
    if (!this.settings.enabled) return json({ error: 'Claude is not reading links: add a key in Administration.' }, 409);
    await delay(2_400);
    const english = request.lang === 'en';
    const shop = request.link.site || (english ? 'the shop' : 'la boutique');
    const code = foldText(shop).replace(/[^a-z0-9]/g, '').toUpperCase().slice(0, 8) || 'WELCOME';
    const until = new Date(Date.now() + 12 * 86_400_000).toISOString().slice(0, 10);
    return json({
      coupons: [
        { code: `${code}15`, benefit: english ? '15% off your first order' : '15 % sur la première commande', conditions: english ? 'New customers' : 'Nouveaux clients', kind: 'percent', value: 15, minimum: null, expires: until, confirmed: true, source: 'Code Corner', sourceUrl: 'https://codes.example/' },
        { code: 'FREESHIP', benefit: english ? 'Free delivery' : 'Livraison offerte', conditions: '', kind: 'shipping', value: null, minimum: 50, expires: null, confirmed: false, source: 'Deals & Co', sourceUrl: null },
      ],
      tips: [{ text: english ? `10% off for signing up to ${shop}'s newsletter.` : `10 % de remise en s’inscrivant à la lettre de ${shop}.`, url: null }],
      searchedAt: Date.now(),
    });
  }

  /** `POST /api/offers`, after a search's pause: three shops around the link's price, or second-hand listings under it. */
  private async offers(body: unknown): Promise<Response> {
    const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
    const request = parseOfferRequest(body);
    if (!request) return json({ error: 'Invalid offers request' }, 400);
    if (!this.settings.enabled) return json({ error: 'Claude is not reading links: add a key in Administration.' }, 409);
    await delay(2_200);
    const english = request.lang === 'en';
    const base = request.link.price ?? 120;
    const currency = request.link.currency ?? 'EUR';
    const round = (value: number): number => Math.round(value);
    if (request.market === 'new') {
      return json({
        offers: [
          { shop: 'Grand Bazar', title: '', price: round(base * 0.88), currency, shipping: 0, condition: 'new', details: english ? 'In stock' : 'En stock', url: 'https://grand-bazar.example/' },
          { shop: 'The Object Counter', title: '', price: round(base * 0.95), currency, shipping: 4.9, condition: 'new', details: '', url: 'https://object-counter.example/' },
          { shop: 'Durable Home', title: '', price: base + 10, currency, shipping: 0, condition: 'new', details: english ? 'Ships in a week' : 'Expédié sous une semaine', url: null },
        ],
        range: null,
        note: '',
        searchedAt: Date.now(),
      });
    }
    return json({
      offers: [
        { shop: 'The Attic', title: english ? `${request.link.title}, size M` : `${request.link.title}, taille M`, price: round(base * 0.5), currency, shipping: 5.5, condition: 'used', details: english ? 'Very good condition' : 'Très bon état', url: 'https://the-attic.example/' },
        { shop: 'Second Wind', title: '', price: round(base * 0.62), currency, shipping: 0, condition: 'refurbished', details: english ? '12-month warranty' : 'Garantie 12 mois', url: 'https://second-wind.example/' },
      ],
      range: { low: round(base * 0.45), high: round(base * 0.65), currency },
      note: '',
      searchedAt: Date.now(),
    });
  }

  /** `POST /api/recipe`: the demo's tart, read from its page, in its own words (English) whatever the language, as the server keeps a recipe. */
  private async recipe(body: unknown): Promise<Response> {
    const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
    const request = parseRecipeRequest(body);
    if (!request) return json({ error: 'Invalid ingredients request' }, 400);
    await delay(900);
    if (!/recette|recipe|tarte/.test(request.link.url)) return json({ error: 'No ingredients on this page' }, 502);
    return json({
      ingredients: ['1 sheet of puff pastry', '4 apples', '40 g butter', '3 tablespoons sugar', '1 sachet of vanilla sugar'],
      servings: '6 people',
      steps: [
        { section: '', text: 'Preheat the oven to 200 °C.' },
        { section: '', text: 'Unroll the pastry on a baking tray, prick it with a fork and chill it for 10 min.' },
        { section: 'The apples', text: 'Peel the apples, slice them thinly and lay them in a rosette on the pastry.' },
        { section: 'The apples', text: 'Dot with small pieces of butter, then sprinkle with the sugar and the vanilla sugar.' },
        { section: 'Baking', text: 'Bake for 25 to 30 minutes, until the edges are golden.' },
        { section: 'Baking', text: 'Leave to cool for 5 min before serving.' },
      ],
    });
  }

  /** `POST /api/ratings`, after a search's pause: the sites that rate the link's kind, a few made-up scores. */
  private async ratings(body: unknown): Promise<Response> {
    const request = parseRatingsRequest(body);
    if (!request) return jsonResponse({ error: 'Invalid ratings request' }, 400);
    if (!this.settings.enabled) return jsonResponse({ error: 'Claude is not reading links: add a key in Administration.' }, 409);
    await delay(2_000);
    const english = request.lang === 'en';
    const votes = (count: string): string => (english ? `${count} votes` : `${count.replace(',', ' ')} votes`);
    const sites: Record<string, readonly [string, string, number, number, string][]> = {
      film: [
        ['SensCritique', '', 7.4, 10, votes('8,200')],
        ['IMDb', '', 7.6, 10, votes('41,000')],
        ['Rotten Tomatoes', english ? 'Critics' : 'Critiques', 88, 100, english ? '96 reviews' : '96 critiques'],
        ['Rotten Tomatoes', english ? 'Audience' : 'Public', 81, 100, ''],
      ],
      book: [
        ['SensCritique', '', 7.8, 10, votes('3,100')],
        ['Babelio', '', 4.1, 5, english ? '2,400 reviews' : '2 400 critiques'],
        ['Goodreads', '', 4.2, 5, votes('58,000')],
      ],
      game: [
        ['SensCritique', '', 8.1, 10, votes('5,600')],
        ['Metacritic', 'Metascore', 89, 100, english ? '112 reviews' : '112 critiques'],
        ['OpenCritic', '', 90, 100, ''],
      ],
      music: [
        ['SensCritique', '', 7.2, 10, votes('1,900')],
        ['Metacritic', 'Metascore', 82, 100, english ? '21 reviews' : '21 critiques'],
      ],
    };
    const kind = request.link.kind === 'series' ? 'film' : request.link.kind;
    const found = sites[kind] ?? sites.film!;
    const slug = foldText(request.link.title).replace(/[^a-z0-9]+/g, '-');
    return jsonResponse({
      work: `${request.link.title} (2025)`,
      ratings: found.map(([source, label, value, scale, count]) => ({ source, label, value, scale, count, url: `https://${foldText(source).replace(/[^a-z]/g, '')}.example/${slug}` })),
      searchedAt: Date.now(),
    });
  }

  /** `POST /api/recap`, after a search's pause: the demo's polar up to the episode asked. */
  private async recap(body: unknown): Promise<Response> {
    const request = parseRecapRequest(body);
    if (!request) return jsonResponse({ error: 'Invalid recap request' }, 400);
    if (!this.settings.enabled) return jsonResponse({ error: 'Claude is not reading links: add a key in Administration.' }, 409);
    await delay(2_600);
    const english = request.lang === 'en';
    const { season, episode } = request;
    const before = english
      ? 'Season 1. At the Arctic research base, the death of a glaciologist looks like an accident. Inspector Hanna Lind is flown in, and finds the base hiding a lost drilling sample.'
      : 'Saison 1. Sur la base scientifique de l’Arctique, la mort d’une glaciologue a tout d’un accident. L’inspectrice Hanna Lind arrive par le dernier avion, et découvre que la base cache un carottage disparu.';
    const now = english
      ? `Season ${season}${episode ? `, up to episode ${episode}` : ''}. The polar night has set in and the base is cut off. Hanna suspects the station's director, whose alibi no longer holds, while the supply ship turns back in the storm.`
      : `Saison ${season}${episode ? `, jusqu’à l’épisode ${episode}` : ''}. La nuit polaire est tombée et la base est coupée du monde. Hanna soupçonne le directeur de la station, dont l’alibi ne tient plus, tandis que le navire de ravitaillement fait demi-tour dans la tempête.`;
    return jsonResponse({
      recap: season > 1 ? `${before}\n\n${now}` : now,
      characters: [
        { name: 'Hanna Lind', note: english ? 'The inspector, alone against everyone at the base.' : 'L’inspectrice, seule contre toute la base.' },
        { name: 'Erik Dahl', note: english ? 'The director, whose alibi has just fallen apart.' : 'Le directeur, dont l’alibi vient de tomber.' },
        { name: 'Mia Sund', note: english ? 'The radio operator, Hanna’s only ally.' : 'L’opératrice radio, seule alliée d’Hanna.' },
      ],
      stop: english ? `End of season ${season}${episode ? `, episode ${episode}` : ''}.` : episode ? `Fin de l’épisode ${episode} de la saison ${season}.` : `Fin de la saison ${season}.`,
      searchedAt: Date.now(),
    });
  }

  /** `POST /api/coverage`, after a search's pause: three outlets on the story, each with its angle. */
  private async coverage(body: unknown): Promise<Response> {
    const request = parseCoverageRequest(body);
    if (!request) return jsonResponse({ error: 'Invalid request for other takes' }, 400);
    if (!this.settings.enabled) return jsonResponse({ error: 'Claude is not reading links: add a key in Administration.' }, 409);
    await delay(2_400);
    const english = request.lang === 'en';
    const day = (ago: number): string => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10);
    return jsonResponse({
      story: english ? 'Ten years on, more and more towns are slowing their streets down.' : 'Dix ans après les premières, de plus en plus de villes ralentissent leurs rues.',
      outlets: [
        { outlet: 'The Morning Daily', title: 'Towns at 30: the figures', url: 'https://morning-daily.example/towns-at-30', date: day(3), angle: english ? 'The figures' : 'Les chiffres', adds: english ? 'Serious accidents down by a third in the towns studied.' : 'Les accidents graves ont baissé d’un tiers dans les villes étudiées.' },
        { outlet: 'Auto Magazine', title: '30 km/h: a good idea gone wrong?', url: 'https://auto-magazine.example/30-kmh', date: day(5), angle: english ? 'The drivers’ side' : 'Du côté des automobilistes', adds: english ? 'Says journeys got longer, which the saved article disputes.' : 'Parle de trajets rallongés, ce que l’article enregistré conteste.' },
        { outlet: 'City Lab Weekly', title: 'What French towns learned from slowing down', url: 'https://citylab-weekly.example/slow-towns', date: day(8), angle: english ? 'Seen from abroad' : 'Vu de l’étranger', adds: '' },
      ],
      note: english ? 'They agree on the fall in accidents; they differ on journey times.' : 'Tous s’accordent sur la baisse des accidents ; ils divergent sur les temps de trajet.',
      searchedAt: Date.now(),
    });
  }

  /** `POST /api/ask`, after a pause: an answer that says what it was asked, and a source when it may search. */
  private async ask(body: unknown): Promise<Response> {
    const request = parseAskRequest(body);
    if (!request) return jsonResponse({ error: 'Invalid question' }, 400);
    if (!this.settings.enabled) return jsonResponse({ error: 'Claude is not reading links: add a key in Administration.' }, 409);
    await delay(request.web ? 2_400 : 1_400);
    const english = request.lang === 'en';
    const about = request.link.title || request.link.url;
    return jsonResponse({
      answer: english
        ? `This is a demo, so here is a made-up answer about « ${about} ».\n\nOn a real server, Claude reads the page and answers « ${request.question} » from it${request.web ? ', and from the web' : ''}.`
        : `Ceci est une démo : voici une réponse inventée sur « ${about} ».\n\nSur un vrai serveur, Claude lit la page et répond à « ${request.question} » d’après elle${request.web ? ', et d’après le web' : ''}.`,
      sources: request.web ? [{ title: english ? 'A page found on the web' : 'Une page trouvée sur le web', url: 'https://source.example/' }] : [],
    });
  }

  /** `POST /api/pages/ask`, after a pause: a made-up answer citing the first words of the pages, so citations can be tried. */
  private async askPages(body: unknown): Promise<Response> {
    const request = parsePagesAskRequest(body);
    if (!request) return jsonResponse({ error: 'Invalid question' }, 400);
    if (!this.pages.enabled) return jsonResponse({ error: 'Questions about pages are turned off in the Administration' }, 409);
    if (request.scope === 'all' && !this.pages.everywhere) return jsonResponse({ error: 'Questions about all pages are turned off in the Administration' }, 409);
    if (requestChars(request.pages) > PAGES_REACH_CHARS[this.pages.reach]) return jsonResponse({ error: 'These pages are too long for one question: choose fewer pages' }, 409);
    if (!this.settings.enabled) return jsonResponse({ error: 'Claude has no key: add one in the Administration.' }, 409);
    const web = request.web && this.pages.web;
    await delay(web ? 2_400 : 1_400);
    const english = request.lang === 'en';
    const cited = request.pages.flatMap(page => page.blocks.slice(0, 1).map(block => ({ page, block }))).slice(0, 2);
    const answer: PagesAskResponse = {
      parts: [
        {
          text: english
            ? `This is a demo, so here is a made-up answer to « ${request.question} ». On a real server, Claude reads ${request.pages.length === 1 ? 'the page' : `these ${request.pages.length} pages`}${web ? ' and the web' : ''} and cites what it rests on`
            : `Ceci est une démo : voici une réponse inventée à « ${request.question} ». Sur un vrai serveur, Claude lit ${request.pages.length === 1 ? 'la page' : `ces ${request.pages.length} pages`}${web ? ' et le web' : ''} et cite ce sur quoi il s’appuie`,
          cites: [],
        },
        ...cited.map(({ page }, at) => ({ text: english ? `${at === 0 ? ', such as the start of' : ' and of'} « ${page.path} »` : `${at === 0 ? ', comme le début de' : ' et de'} « ${page.path} »`, cites: [at] })),
        { text: '.', cites: [] },
      ],
      citations: cited.map(({ page, block }) => ({ pageId: page.id, blockIds: [block.id], quote: block.text.slice(0, 200) })),
      sources: web ? [{ title: english ? 'A page found on the web' : 'Une page trouvée sur le web', url: 'https://source.example/' }] : [],
    };
    return jsonResponse(answer);
  }

  /**
   * `POST /api/notes/template-try`: « Essayer » on a template being shaped, after a reading's pause.
   * The fields are filled as `read` fills them (a page the demo knows, or a saved link at that
   * address, else canned values), nothing written, at a small made-up cost.
   */
  private async templateTry(body: unknown): Promise<Response> {
    const request = parseTemplateTryRequest(body);
    if (!request) return jsonResponse({ error: 'Invalid template try' }, 400);
    if (!this.settings.enabled) return jsonResponse({ error: 'Claude is not reading links: add a key in Administration.' }, 409);
    await delay(1_500);
    if (/closed-shop|echec|fermee/.test(request.url)) return jsonResponse({ error: 'Page protected against robots' }, 502);
    const found = READINGS.find(entry => entry.match.test(request.url));
    const said = found?.words[request.lang];
    const saved = [...this.records.values()]
      .map(row => row.record)
      .filter(record => record.type === 'link' && record.fields.url === request.url && record.fields.deletedAt === null)
      .map(linkFromRecord)
      .find(link => link.attributes.length > 0 || link.title);
    const filled = filledFields(request.fields, saved?.attributes ?? said?.attributes ?? [], request.lang);
    const values = Object.fromEntries(filled.map(fact => [request.fields.find(each => each.name === fact.label)!.id, fact.value]));
    return jsonResponse({ title: saved?.title || said?.title || (request.lang === 'fr' ? 'Page d’exemple' : 'Sample page'), values, costUsd: 0.004 });
  }

  /** When « Vérifier le prix » last read each link: once a minute, as the server. */
  private readonly priceChecks = new Map<string, number>();

  /**
   * `POST /api/notes/price-check`: the demo's shops keep their prices, but the merino jumper's drops
   * by ten euros the first time it is checked; the change is written as the server writes it
   * (`priceUpdate`), every reading here counted as the watch's own.
   */
  private async priceCheck(body: unknown): Promise<Response> {
    const request = parsePriceCheckRequest(body);
    if (!request) return jsonResponse({ error: 'Invalid price check request' }, 400);
    const record = this.records.get(`link:${request.linkId}`)?.record;
    if (!record || typeof record.fields.deletedAt === 'number') return jsonResponse({ error: 'Link not found' }, 404);
    const now = Date.now();
    const last = this.priceChecks.get(request.linkId);
    if (last !== undefined && now - last < 60_000) return jsonResponse({ error: 'Price checked a moment ago: try again in a minute.' }, 409);
    this.priceChecks.set(request.linkId, now);
    await delay(1_100);
    const link = linkFromRecord(record);
    if (link.price === null) return jsonResponse({ outcome: 'hidden', price: null, currency: null, before: null, by: null, note: 'Claude found no price on this page.' });
    const amount = /merino/.test(link.url) && link.priceBefore === null ? link.price - 10 : link.price;
    const update = priceUpdate({ ...link, priceCheckedAt: link.priceCheckedAt ?? link.createdAt, analyzedAt: null }, { amount, currency: link.currency }, now);
    this.write('link', link.id, { ...update.fields });
    const after = linkFromRecord(this.records.get(`link:${link.id}`)!.record);
    return jsonResponse({ outcome: update.outcome, price: after.price, currency: after.currency, before: after.priceBefore, by: 'page', note: '' });
  }

  /** `POST /api/seerr`: the demo's Seerr has the September film, nothing else yet. */
  private async seerrLookup(body: unknown): Promise<Response> {
    const request = parseSeerrRequest(body);
    if (!request) return jsonResponse({ error: 'Invalid Seerr request' }, 400);
    if (!this.seerr.url) return jsonResponse({ error: 'Seerr is not linked: add it in Administration.' }, 409);
    await delay(500);
    const { link } = request;
    if (!this.seerr.keyHint) return jsonResponse({ url: seerrSearchUrl(this.seerr.url, link) ?? this.seerr.url, status: null, title: '' });
    const there = /septembre|september/i.test(link.title);
    return jsonResponse({ url: seerrPageUrl(this.seerr.url, link.kind === 'series' ? 'tv' : 'movie', there ? 81_312 : 92_407), status: there ? 'available' : link.kind === 'series' ? 'partial' : 'missing', title: `${link.title} (2025)` });
  }

  /**
   * `POST /api/pages/copies`: Pages makes the article into a page, as the server would read it: the
   * link's card first, who wrote it and when, then a few blocks and its picture, in the article's own
   * words (the demo's, in English) whatever the language; the link's `copy` points at the page in the
   * same change.
   */
  private async copy(body: unknown): Promise<Response> {
    const request = parseCopyRequest(body);
    if (!request) return jsonResponse({ error: 'Invalid copy request' }, 400);
    await delay(1_200);
    const link = this.records.get(`link:${request.link.id}`)?.record;
    if (!link) return jsonResponse({ error: 'Ce lien n’existe pas sur le serveur' }, 404);
    const title = request.title || (typeof link.fields.title === 'string' && link.fields.title) || 'Article';
    const now = Date.now();
    const tops = [...this.records.values()]
      .map(row => row.record)
      .filter(record => record.type === 'block' && record.fields.parentId === null && record.fields.deletedAt === null)
      .map(record => String(record.fields.position))
      .sort();
    const pageId = createId(now);
    this.write('block', pageId, blockFields({ kind: 'page', parentId: null, position: keysBetween(tops[tops.length - 1] ?? null, null, 1)[0]!, createdAt: now, text: title, trashedAt: null }));
    const blocks: Omit<NewBlockFields, 'parentId' | 'position' | 'createdAt'>[] = [
      { kind: 'bookmark', target: { type: 'link', id: request.link.id } },
      { kind: 'text', text: '{i:Claire Martin · 14 October 2026}' },
      { kind: 'text', text: 'Ten years ago, slowing a city down passed for a fad. Today dozens of towns have taken the step, and the figures are starting to speak.' },
      { kind: 'h2', text: 'What changed' },
      { kind: 'text', text: 'Less noise, fewer serious accidents, and streets where {b:children walk to school on their own}.' },
      { kind: 'bullet', text: '30 km/h zones across the whole town' },
      { kind: 'bullet', text: 'School streets closed to cars at drop-off and pick-up times' },
      { kind: 'callout', text: '{i:“We gained calm without losing any time.”}' },
    ];
    const keys = keysBetween(null, null, blocks.length);
    blocks.forEach((block, at) => this.write('block', createId(now), blockFields({ ...block, parentId: pageId, position: keys[at]!, createdAt: now })));
    this.write('link', request.link.id, { copy: pageId });
    return jsonResponse({ pageId });
  }

  /**
   * `POST /api/contacts/photos`: the real server fetches the photo at the address; the demo cannot
   * reach the web, so it keeps a drawn face in its place, as an uploaded blob.
   */
  private async contactPhoto(body: unknown): Promise<Response> {
    if (!isContactPhotoRequest(body)) return jsonResponse({ error: 'Adresse de photo invalide' }, 400);
    await delay(400);
    const id = createId(Date.now());
    const faces = ['portrait', 'portrait2', 'portrait3'];
    const face = demoImage(`demo-${faces[body.url.length % faces.length]!}`);
    if (!face) return jsonResponse({ error: 'Photo introuvable' }, 502);
    this.uploads.set(id, face);
    return jsonResponse({ id, mime: face.type });
  }

  /** `POST /api/notes/gifts`: the link kept in Carnet's « Cadeaux » (made the first time), its people naming the contact (an older client's: its comment saying for whom). */
  private async gift(body: unknown): Promise<Response> {
    const request = parseGiftLinkRequest(body);
    if (!request) return jsonResponse({ error: 'Lien invalide' }, 400);
    await delay(250);
    const now = Date.now();
    const rows = [...this.records.values()].map(row => row.record);
    const collection = rows.find(record => record.type === 'note' && record.fields.kind === 'links' && record.fields.deletedAt === null && /^(cadeaux|gifts)$/i.test(String(record.fields.title).trim()));
    let collectionId = collection?.id ?? null;
    let created = false;
    if (!collectionId) {
      collectionId = createId(now);
      created = true;
      const last = rows.filter(record => record.type === 'note' && record.fields.deletedAt === null).map(record => String(record.fields.position)).sort().at(-1) ?? null;
      this.write(
        'note',
        collectionId,
        noteFields({ kind: 'links', title: request.lang === 'en' ? 'Gifts' : 'Cadeaux', body: '', color: 'red', emblem: 'coeur', pinned: false, archived: false, trashedAt: null, labelIds: [], position: keysBetween(last, null, 1)[0]!, reminderAt: null, code: '', hint: '', createdAt: now, deletedAt: null }),
      );
    }
    const contactId = request.contactId ?? null;
    const comment = contactId ? '' : request.lang === 'en' ? `For ${request.forName}` : `Pour ${request.forName}`;
    const same = rows.find(record => record.type === 'link' && record.fields.noteId === collectionId && record.fields.url === request.url && record.fields.deletedAt === null);
    if (same) {
      const people = Array.isArray(same.fields.contactIds) ? same.fields.contactIds.filter((id): id is string => typeof id === 'string') : [];
      if (contactId) {
        if (!people.includes(contactId)) this.write('link', same.id, { contactIds: [...people, contactId] });
      } else {
        const before = String(same.fields.comment ?? '');
        if (!before.includes(request.forName)) this.write('link', same.id, { comment: before ? `${before}\n${comment}` : comment });
      }
      return jsonResponse({ collectionId, linkId: same.id, existing: true, created });
    }
    const linkId = createId(now);
    const siblings = rows.filter(record => record.type === 'link' && record.fields.noteId === collectionId).map(record => String(record.fields.position)).sort();
    this.write(
      'link',
      linkId,
      linkFields({
        noteId: collectionId,
        url: request.url,
        status: this.settings.enabled ? 'pending' : 'skipped',
        autoFile: false,
        filedBy: 'person',
        lang: request.lang,
        title: '',
        summary: '',
        siteName: '',
        kind: 'other',
        price: null,
        currency: null,
        attributes: [],
        imageIds: [],
        imageUrl: null,
        done: false,
        doneAt: null,
        comment,
        position: keysBetween(siblings.at(-1) ?? null, null, 1)[0]!,
        error: null,
        analyzedAt: null,
        createdAt: now,
        deletedAt: null,
        copy: null,
        contactIds: contactId ? [contactId] : [],
      }),
    );
    this.read(linkId);
    return jsonResponse({ collectionId, linkId, existing: false, created });
  }

  /** `GET /api/<app>/mentions`: the pages or the notes whose text mentions one of the ids; for a person, Carnet's notes and links that name them among their people too. */
  private mentions(app: 'pages' | 'notes', url: URL): Response {
    const query = parseMentionsQuery(url.searchParams.get('type') ?? undefined, url.searchParams.get('ids') ?? undefined);
    if (!query) return jsonResponse({ error: 'Invalid request' }, 400);
    const markups = mentionMarkups(query.type, query.ids);
    const holds = (text: unknown): boolean => typeof text === 'string' && markups.some(markup => text.includes(markup));
    const record = (type: string, id: string): SyncRecord | undefined => this.records.get(`${type}:${id}`)?.record;
    const places: MentionPlace[] = [];
    const seen = new Set<string>();
    for (const { record: each } of this.records.values()) {
      if (each.fields.deletedAt !== null && each.fields.deletedAt !== undefined) continue;
      const named = query.type === 'contact' && Array.isArray(each.fields.contactIds) && each.fields.contactIds.some(id => typeof id === 'string' && query.ids.includes(id));
      if (app === 'notes' && each.type === 'note' && each.fields.trashedAt === null && (holds(each.fields.body) || holds(each.fields.title) || named)) {
        const mentioned = holds(each.fields.body) || holds(each.fields.title);
        places.push({ app: 'notes', type: 'note', id: each.id, title: String(each.fields.title ?? ''), within: '', icon: null, editedAt: 0, ...(named && !mentioned ? { linked: true } : {}) });
      }
      if (app === 'notes' && each.type === 'link' && named) {
        const collection = typeof each.fields.noteId === 'string' ? record('note', each.fields.noteId) : undefined;
        if (collection && collection.fields.deletedAt === null && collection.fields.trashedAt === null) {
          places.push({ app: 'notes', type: 'link', id: each.id, title: String(each.fields.title ?? '') || String(each.fields.url ?? ''), within: String(collection.fields.title ?? ''), icon: null, editedAt: 0, linked: true });
        }
      }
      if (app !== 'pages' || each.type !== 'block' || !holds(each.fields.text)) continue;
      // The page holding the block, and the pages above it.
      let page: SyncRecord | undefined = each;
      while (page && page.fields.kind !== 'page') page = typeof page.fields.parentId === 'string' ? record('block', page.fields.parentId) : undefined;
      if (!page || page.fields.trashedAt !== null || seen.has(page.id)) continue;
      seen.add(page.id);
      const above: string[] = [];
      for (let up = typeof page.fields.parentId === 'string' ? record('block', page.fields.parentId) : undefined; up; up = typeof up.fields.parentId === 'string' ? record('block', up.fields.parentId) : undefined) {
        if (up.fields.kind === 'page') above.unshift(String(up.fields.text ?? '').trim() || 'Sans titre');
      }
      places.push({ app: 'pages', type: 'page', id: page.id, title: String(page.fields.text ?? ''), within: above.join(' / '), icon: typeof page.fields.icon === 'string' ? page.fields.icon : null, editedAt: 0 });
    }
    return jsonResponse({ places });
  }

  /** An app's route, while the app is on; off, the server's own refusal. */
  private appRoute(app: AppId, run: () => Promise<Response>): Promise<Response> {
    return this.apps.includes(app) ? run() : Promise.resolve(jsonResponse({ error: `${APPS[app].name} n’est pas activé sur ce serveur` }, 404));
  }

  /** Answers `fetch` for the demo address; anything else goes to the network. */
  async handle(url: URL, init: RequestInit | undefined): Promise<Response> {
    const method = (init?.method ?? 'GET').toUpperCase();
    const json = (value: unknown): Response => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
    if (url.pathname === '/api/health') return json({ ok: true, version: 'demo', apiVersion: 1, apps: this.apps, setup: this.setupDone, analysis: this.settings.enabled });
    if (url.pathname === '/api/settings') {
      if (method === 'PUT') return this.updateSettings(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
      await delay(80);
      return json(this.settingsView());
    }
    if (url.pathname.startsWith('/api/admin')) return this.admin(url, method, init);
    if (url.pathname === PLACES_PATH && method === 'GET') return fakePlaces(url);
    if (url.pathname === '/api/usage') {
      return json({
        monthToDate: { analyses: 37, inputTokens: 0, outputTokens: 0, costUsd: 1.42 },
        total: { analyses: 212, inputTokens: 0, outputTokens: 0, costUsd: 8.37 },
        model: this.settings.model,
        budgetUsd: this.settings.budgetUsd,
      });
    }
    if (url.pathname === '/api/sync' && method === 'POST') {
      return json(await this.exchange(JSON.parse(String(init?.body ?? '{}')), init?.signal ?? undefined));
    }
    if (url.pathname === '/api/sort' && method === 'POST') return this.appRoute('notes', () => this.sort(JSON.parse(String(init?.body ?? '{}'))));
    if (url.pathname === '/api/coupons' && method === 'POST') return this.appRoute('notes', () => this.coupons(JSON.parse(String(init?.body ?? '{}'))));
    if (url.pathname === '/api/offers' && method === 'POST') return this.appRoute('notes', () => this.offers(JSON.parse(String(init?.body ?? '{}'))));
    if (url.pathname === '/api/recipe' && method === 'POST') return this.appRoute('notes', () => this.recipe(JSON.parse(String(init?.body ?? '{}'))));
    if (url.pathname === '/api/pages/copies' && method === 'POST') return this.appRoute('pages', () => this.copy(JSON.parse(String(init?.body ?? '{}'))));
    if (url.pathname === '/api/ratings' && method === 'POST') return this.appRoute('notes', () => this.ratings(JSON.parse(String(init?.body ?? '{}'))));
    if (url.pathname === '/api/recap' && method === 'POST') return this.appRoute('notes', () => this.recap(JSON.parse(String(init?.body ?? '{}'))));
    if (url.pathname === '/api/coverage' && method === 'POST') return this.appRoute('notes', () => this.coverage(JSON.parse(String(init?.body ?? '{}'))));
    if (url.pathname === '/api/ask' && method === 'POST') return this.appRoute('notes', () => this.ask(JSON.parse(String(init?.body ?? '{}'))));
    if (url.pathname === '/api/pages/ask' && method === 'POST') return this.appRoute('pages', () => this.askPages(JSON.parse(String(init?.body ?? '{}'))));
    if (url.pathname === GIFTS_PATH && method === 'POST') return this.appRoute('notes', () => this.gift(JSON.parse(String(init?.body ?? '{}'))));
    if (url.pathname === '/api/pages/mentions' && method === 'GET') return this.appRoute('pages', async () => this.mentions('pages', url));
    if (/^\/api\/pages\/[^/]+\/versions/.test(url.pathname)) return this.appRoute('pages', async () => pageVersionsRoute(() => this.allRecords(), url, method) ?? new Response('not found', { status: 404 }));
    if (url.pathname === '/api/notes/mentions' && method === 'GET') return this.appRoute('notes', async () => this.mentions('notes', url));
    if (url.pathname === CONTACT_PHOTO_PATH && method === 'POST') return this.appRoute('contacts', () => this.contactPhoto(JSON.parse(String(init?.body ?? '{}'))));
    const immich = immichRoute(url, method, this.immich.url !== '', (id, blob) => this.uploads.set(id, blob));
    if (immich) {
      await delay(120);
      return immich;
    }
    const agenda = calendarRoute({ records: () => this.allRecords(), write: (type, id, patch) => this.write(type, id, patch) }, url, method, method === 'GET' ? null : JSON.parse(String(init?.body ?? '{}')), this.apps);
    if (agenda) return agenda;
    if (url.pathname === '/api/seerr' && method === 'POST') return this.appRoute('notes', () => this.seerrLookup(JSON.parse(String(init?.body ?? '{}'))));
    if (url.pathname === PRICE_CHECK_PATH && method === 'POST') return this.appRoute('notes', () => this.priceCheck(JSON.parse(String(init?.body ?? '{}'))));
    if (url.pathname === TEMPLATE_TRY_PATH && method === 'POST') return this.appRoute('notes', () => this.templateTry(JSON.parse(String(init?.body ?? '{}'))));
    const blob = /^\/api\/(blobs|files)\/([^/]+)$/.exec(url.pathname);
    if (blob) {
      const id = decodeURIComponent(blob[2]!);
      if (method === 'PUT') {
        const file = init?.body instanceof FormData ? init.body.get('file') : null;
        if (file instanceof Blob) this.uploads.set(id, file);
        await delay(300);
        return json({ id, mime: file instanceof Blob ? file.type : 'application/octet-stream', width: 0, height: 0, bytes: file instanceof Blob ? file.size : 0 });
      }
      if (blob[1] === 'files') return new Response('not found', { status: 404 });
      await delay(60 + Math.random() * 140);
      const image = this.uploads.get(id) ?? demoImage(id);
      return image ? new Response(image, { headers: { 'Content-Type': image.type } }) : new Response('not found', { status: 404 });
    }
    return new Response('not found', { status: 404 });
  }
}
