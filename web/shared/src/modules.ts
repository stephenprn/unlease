/**
 * What an app brings to the shell. Each app of the suite is a web app of its own (`notes/`,
 * `pages/`), on the shell they share (`shared/`: boot, storage, the sync, the router, the setup, the
 * Réglages and the Administration, the app launcher, the spotlight's frame, the navigation's
 * frame): its entry installs its module (`installApp`), with its records (`data`) and those of the
 * apps it reads (Pages: Carnet's notes, collections and links, `AppData`). The shell knows the app
 * only through these: it imports none.
 *
 * Every hook is optional but the id, the routes and the screen: an app with no overlay draws none,
 * one with no Administration section adds none.
 */
import type { ComponentType } from 'react';

import { APPS, type AppId } from '@unlease/core/apps';
import type { StatusLine } from '@unlease/core/services/admin';
import type { ErasePart } from '@unlease/core/services/erase';
import type { Matcher, SearchDoc, SearchPart } from '@unlease/core/services/searchIndex';
import type { SettingsPage, SettingsPlace } from '@unlease/core/services/settingsSearch';
import type { SpotMeta } from '@unlease/core/services/spotlight';
import type { ServerSettings } from '@unlease/core/sync/settings';
import type { LineColor } from '@unlease/design/colors';
import type { GlyphName } from '@unlease/design/glyphs';

import { registerProjection, type Projection } from './app/store/records';
import type { ServerConfig } from './app/store/settings';
import type { Usage } from './app/sync/transport';
import { setAppStorage, setOwnApp } from './app/env';
import { suitePlace } from './app/suitePlaces';
import { registerRoutes, setAppHome, type Arrival, type Route, type RouteName, type RouteParser } from './ui/router';

/** A file kept in this browser until the server has it (a note's photo, a page's file): what the sync's upload needs. */
export interface FileOwner {
  /** Gone or sent already: the copy here can go. */
  readonly done: boolean;
  readonly mime: string;
  /** Sent as a picture (`/api/blobs`, with its previews), else as a file (`/api/files`). */
  readonly image: boolean;
  /** Sent: the records that hold it say so. */
  readonly mark: () => void;
}

/**
 * An app's own section of the Administration (and of the setup's « Votre serveur »): a row of the
 * Administration's home under the app's name, and a page of its own (`/notes/admin/<id>`).
 */
export interface AdminSection {
  /** Its address (`/notes/admin/seerr`): unique across the suite, never renamed. */
  readonly id: string;
  /** The app it belongs to: listed under its name. */
  readonly app: AppId;
  /** Its title, in the interface's language (read where shown). */
  readonly title: () => string;
  /** Its mark, in the Administration's navigation and on its home. */
  readonly glyph: GlyphName;
  /** Its state in one line, on the Administration's home. */
  readonly line: (settings: ServerSettings) => StatusLine;
  /** What the « i » beside the title explains (French, `tx`). */
  readonly info?: string;
  readonly Body: ComponentType<{ readonly server: ServerConfig; readonly settings: ServerSettings }>;
  /** Shown too in the setup's Claude form (Pages' questions). */
  readonly claude?: boolean;
  /** The setup task (`seerr`) it is the form of, in « Votre serveur ». */
  readonly task?: string;
}

/** A piece of the Réglages, the app's own (Carnet's section, the Keep import). */
export interface SettingsSection {
  readonly id: string;
  readonly Body: ComponentType;
  /**
   * Where it goes (DESIGN's order): `data` first in « Données » (cleaning the links saved); `last`
   * after « Données » (an import, done once); else a section of its own at the page's top, before
   * « Apparence » (the settings an app's own are those set most: Carnet's board, Agenda's calendar).
   */
  readonly place?: 'data' | 'last';
}

/** What an app's import wizard is handed: on Réglages' page, or as a step of the first run (`embedded`). */
export interface ImportWizardProps {
  /** In the first run: its title is the setup's, its foot the setup's once it is done or not begun. */
  readonly embedded?: boolean;
  /** It left its first step (true), or came back to it or ended (false): the first run hides its own foot meanwhile. */
  readonly onFlow?: (inFlow: boolean) => void;
  /** Something was written: the first run's step counts as done. */
  readonly onImported?: () => void;
}

/**
 * An app's import (`core/services/importFlow`): its wizard, opened from Réglages › Données
 * (`/<app>/settings/import`) and offered by the first run while the app holds nothing.
 */
export interface AppImporter {
  /** What it reads, named (« Google Keep »), for the first run's lead. */
  readonly source: () => string;
  /** Réglages › Données' row: its line under « Importer ». */
  readonly meta: () => string;
  readonly Wizard: ComponentType<ImportWizardProps>;
}

/**
 * « Effacer des données » (`core/services/erase`): the app's parts, counted from its records as they
 * are now, and the batch that erases those ticked.
 */
export interface AppErase {
  readonly parts: () => readonly ErasePart[];
  /** Writes the tombstones of the parts chosen, as one batch; how many records went. */
  readonly run: (chosen: ReadonlySet<string>) => number;
}

/** One kind of spotlight document, the app's own (`note`, `collection`, `link`, `page`). */
export interface SpotKind {
  readonly type: string;
  /** The scope's chip: « Pages », « Notes »… */
  readonly label: string;
  /** Its documents, built again only when what they read changed (`revision`). */
  readonly docs: () => readonly SearchDoc<SpotMeta>[];
  /** The title shown: a note's first line when it has none, « Sans titre »… */
  readonly title: (doc: SearchDoc<SpotMeta>) => string;
  /** What it is and where it sits, as a row's second line says it. */
  readonly facts: (doc: SearchDoc<SpotMeta>) => string[];
  readonly href: (doc: SearchDoc<SpotMeta>, part: SearchPart | null) => string;
  readonly open: (doc: SearchDoc<SpotMeta>, part: SearchPart | null) => void;
  readonly Mark: ComponentType<{ readonly doc: SearchDoc<SpotMeta>; readonly large?: boolean }>;
  /** What the preview pane shows of it, its matches marked. */
  readonly Preview?: ComponentType<{ readonly doc: SearchDoc<SpotMeta>; readonly matcher: Matcher }>;
}

/** A label the spotlight filters by (`#`): Carnet's, on its notes. */
export interface SpotLabel {
  readonly id: string;
  readonly name: string;
  readonly color: LineColor;
  /** How many live notes wear it. */
  readonly notes: number;
}

/** Something the spotlight or a key can do (« Nouvelle note »). */
export interface AppCommand {
  readonly title: string;
  readonly icon: GlyphName;
  readonly run: () => void;
  /** Its single key, when the board has one (`c`; making the app's thing is C in every app). */
  readonly key?: string;
  /** Other single keys that run it too, left out of the help (Pages' P, from before C made a page everywhere). */
  readonly aliases?: readonly string[];
  /** False: a key alone, not offered in the spotlight. */
  readonly spotlight?: boolean;
}

/** In a shortcut's keys, ⌘ on a Mac and Ctrl elsewhere, named where shown. */
export const MOD_KEY = 'Mod';

/**
 * A row of the shortcuts dialog: the keys pressed together, then what they do (English, `tx`, read
 * where shown). A key is shown as written (`J`, `↑`, `#`), but for `MOD_KEY`
 * and a key's name (`tx('Shift')`, `tx('Backspace')`), read where shown.
 */
export type ShortcutRow = readonly [keys: readonly string[], what: string];

/** An app's own group of the shortcuts dialog (`AppModule.shortcuts`). */
export interface ShortcutGroup {
  /** Where its keys work (French, `tx`: « Sur une note »); none: its rows join « Partout », after the commands' keys. */
  readonly title?: string;
  readonly rows: readonly ShortcutRow[];
}

/** What the spotlight offers to make from what was typed (« Créer la page « Lisbonne » »). */
export interface SpotCreate {
  /** The scope it belongs to (the type of what it makes). */
  readonly type: string;
  readonly title: (typed: string) => string;
  readonly icon: GlyphName;
  readonly run: (typed: string) => void;
}

/** An app's records as another app's web app holds them too (Carnet's in Pages'): its state, and what keeps it. */
export interface AppData {
  readonly id: AppId;
  /** Its render state, fed by the shell's records. */
  readonly projection: Projection;
  /** Before the records load: what this browser remembers of it (folded sections, the last page). */
  readonly load?: () => void;
  /** Once the records are in memory: what every device seeds (« Non classé »). */
  readonly boot?: () => void;
  /** Test seam: back to nothing. */
  readonly reset?: () => void;
  /** A file kept here waiting for its upload, if it is this app's. */
  readonly fileOwner?: (id: string) => FileOwner | null;
  /** What a reference into this app points at: a page's address (`page` -> `/pages/<id>`). */
  readonly refPaths?: Readonly<Record<string, (id: string) => string>>;
}

export interface AppModule {
  readonly id: AppId;
  /** Where it opens (`/notes`): every place of its own is under it, the Réglages and the Administration too (`/notes/settings`). */
  readonly home: string;
  /** Its records and what keeps them. */
  readonly data: AppData;
  /** Once everything is loaded, before the first render: what the address asks of it (Carnet's capture links). */
  readonly start?: () => void;

  // ── places ──────────────────────────────────────────────────────────────
  readonly routes: { readonly names: readonly RouteName[]; readonly parse: RouteParser };
  /** Draws its places. */
  readonly Screen: ComponentType<{ readonly route: Route }>;
  /** An overlay route (a note over the board): the page drawn under it; null for a plain page. */
  readonly pageUnder?: (route: Route, background: string | undefined) => Route | null;
  /** The address of one of its pages, for the history and the last place visited. */
  readonly pathOf: (route: Route) => string;
  /** Its homes, where a phone-sized window keeps the search header (the board, the pages' home). */
  readonly isHome: (route: Route) => boolean;
  /** Back from one of its pages on a phone-sized window, when there is no history. */
  readonly backTo?: (route: Route) => string;
  /** A page whose top bar lies over its head (a collection's), on a phone-sized window. */
  readonly overHead?: (route: Route) => boolean;
  /** Its page (or the overlay over it) as the tab names it; null for its name alone. */
  readonly useTitle: (page: Route, overlay: Route) => string | null;
  /** Whether a place of it is still there (a page in the bin is not), for « back to where it was ». */
  readonly stillThere?: (route: Route) => boolean;
  /** The spotlight key of what is open (a note, a page), for « Récents ». */
  readonly opened?: (route: Route) => string | null;
  /** The page's own selection ends when it changes (Carnet's picked notes). */
  readonly onPageChange?: () => void;
  /** What it draws over every page while it is the app on screen, or always (`global`): its editors, dialogs, panels. */
  readonly Overlays?: ComponentType<{ readonly route: Route; readonly pagePath: string }>;

  // ── the frame ───────────────────────────────────────────────────────────
  /** The navigation's middle: its places. */
  readonly Nav: ComponentType<{ readonly route: Route; readonly onNavigate: () => void }>;
  /** The navigation's foot, above the shell's Réglages and Administration: its archive, its bin. */
  readonly NavFoot?: ComponentType<{ readonly route: Route; readonly onNavigate: () => void }>;
  /** Réglages' pages its navigation marks itself (Agenda's « Importer un agenda »): there, Réglages' row is not marked too. */
  readonly navMarks?: readonly SettingsPage[];
  /** The header's actions beside the search, wide (« Classer un lien », « Nouvelle page »). */
  readonly HeaderActions?: ComponentType<{ readonly route: Route }>;
  /** What the search strip holds on a phone-sized window, before the sync's dot (the board's layout). */
  readonly NarrowTools?: ComponentType<{ readonly route: Route }>;
  /** What lies over the search strip while it is covered (Carnet's selection bar). */
  readonly HeaderCover?: ComponentType<{ readonly route: Route }>;
  /** The strip is covered: out of reach. */
  readonly useHeaderCovered?: () => boolean;
  /** A phone-sized window's bottom bar, on the pages that have one. */
  readonly BottomBar?: ComponentType<{ readonly route: Route; readonly enter: Arrival | null }>;
  /** Where the search's results are shown (its home), when it shows them. The search box's words are its `APP_WORDS[id].search`. */
  readonly searchHome?: string;

  // ── the spotlight and the keys ──────────────────────────────────────────
  readonly spotKinds?: readonly SpotKind[];
  /** The labels its documents wear (`SpotMeta.labelIds`), live ones. */
  readonly spotLabels?: () => readonly SpotLabel[];
  /** The spotlight's actions, and their single keys on the board. */
  readonly commands?: readonly AppCommand[];
  readonly spotCreates?: readonly SpotCreate[];
  /** A paste or a drop outside any field, on one of its pages: true when it took it. */
  readonly onPaste?: (data: DataTransfer, route: Route) => boolean;
  readonly onDropFiles?: (files: readonly File[], route: Route) => boolean;
  /** Keys of its own (a card's X, E, #); true when it took the key. */
  readonly onKey?: (event: KeyboardEvent, route: Route) => boolean;
  /** Its keys in the shortcuts dialog (« ? ») beyond its commands' (which « Partout » lists already): its pages' own, in groups. */
  readonly shortcuts?: readonly ShortcutGroup[];

  // ── settings ────────────────────────────────────────────────────────────
  readonly settingsSections?: readonly SettingsSection[];
  /** Empties its bin for good (Réglages > « Vider la corbeille »): how many went. */
  readonly emptyBin?: () => number;
  /** How many things its bin holds: Réglages' « Vider la corbeille » says so, with nothing to press while it is empty. */
  readonly binCount?: () => number;
  /** Its import: Réglages' row and page, and the first run's step. */
  readonly importer?: AppImporter;
  /** « Effacer des données », at the foot of Réglages › Données. */
  readonly erase?: AppErase;
  /** Its own sections of the Administration, after the shared ones. */
  readonly adminSections?: readonly AdminSection[];
  /** Its own places of the Réglages and the Administration a search finds (its package's: Carnet's board layout, Seerr), after every app's (`core/services/settingsSearch`). */
  readonly settingsPlaces?: readonly SettingsPlace<GlyphName>[];
  /** What follows Claude's own settings in the Claude form (Carnet's links read this month and not read yet), as on the phone (`ClaudeExtra`); `usage` null until read. */
  readonly ClaudeExtras?: ComponentType<{ readonly server: ServerConfig; readonly settings: ServerSettings; readonly usage: Usage | null }>;
}

let installed: AppModule | null = null;
let read: readonly AppData[] = [];

/**
 * The app this web app is, and the data of those it reads (Pages: Carnet's): their projections and
 * the app's routes start at once, its places (and the shell's) under its home.
 */
export function installApp(module: AppModule, reads: readonly AppData[] = []): void {
  installed = module;
  read = reads;
  setAppHome(module.home);
  // Its own database and keys (`carnet`, `pages`); the demo and the tests set their own after.
  setAppStorage(APPS[module.id].slug);
  setOwnApp(module.id);
  for (const data of appData()) registerProjection(data.projection);
  registerRoutes(module.routes.parse);
}

/** The app of this web app. */
export function theApp(): AppModule {
  if (!installed) throw new Error('No app installed: its entry calls installApp first.');
  return installed;
}

/** Whether an app is installed yet (the tests' helpers run before). */
export function appInstalled(): boolean {
  return installed !== null;
}

/** Every app's data this web app holds: those it reads, then its own. */
export function appData(): readonly AppData[] {
  return installed ? [...read, installed.data] : read;
}

/** The app, when the place is one of its own; null for the shell's (`/notes/settings`, `/notes/admin`). */
export function moduleOfRoute(route: Route): AppModule | null {
  return installed?.routes.names.includes(route.name) ? installed : null;
}

/**
 * The address of what a reference points at (`page`, an id): from the app whose data is here, else
 * in the app that has it (`suitePlaces`), whose own page opens it; null for a type no app knows.
 */
export function pathOfRef(type: string, id: string): string | null {
  for (const data of appData()) {
    const path = data.refPaths?.[type];
    if (path) return path(id);
  }
  return suitePlace(type, id);
}
