/**
 * The Administration's places: the sections every app shares (`SHARED_ADMIN_SECTIONS`: the apps on,
 * the server, Claude, the backups, the files, Immich), then the app's own, under its name, as its module
 * brings them (`AppModule.adminSections`: Carnet's Seerr in `notes/src/admin.tsx`, Pages' questions
 * in `pages/src/admin.tsx`). Its navigation, its home
 * and its pages all read this one list, so a section an app adds shows everywhere at once.
 */
import { APP_IDS, APPS, type AppId } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import { appsLine, backupLine, claudeLine, driveLine, immichLine, serverLine, SERVER_ONLY_SECTIONS, SHARED_ADMIN_SECTIONS, SHARED_ADMIN_TITLES, type SharedAdminSection, type StatusLine } from '@unlease/core/services/admin';
import type { AdminStatus } from '@unlease/core/sync/admin';
import type { ServerSettings } from '@unlease/core/sync/settings';
import type { GlyphName } from '@unlease/design/glyphs';

import { theApp, type AdminSection } from '../../../modules';
import { APPS_INFO } from '../settings/AppsSection';
import { BACKUP_INFO } from '../settings/BackupSection';
import { DRIVE_INFO } from '../settings/DriveSection';
import { IMMICH_INFO } from '../settings/ImmichSection';
import { SERVER_INFO } from '../settings/ServerSection';

/** What a section's line is read from. */
export interface AdminFacts {
  /** The server's address; null: this browser alone. */
  readonly url: string | null;
  readonly settings: ServerSettings | null;
  readonly status: AdminStatus | null;
  readonly now: number;
  /** The server does not answer: what its settings would say cannot be told. */
  readonly unavailable: boolean;
}

export interface AdminPlace {
  /** Its address: `/<app>/admin/<id>`. */
  readonly id: string;
  readonly title: string;
  readonly glyph: GlyphName;
  /** « How it works », French (`tx`): the page's first lines. */
  readonly info?: string;
  /** Means nothing without a server (the backups, the files, an app's own). */
  readonly needsServer: boolean;
  /** The app it belongs to; null: every app's. */
  readonly app: AppId | null;
  /** Its state in one line; null while it cannot be told. */
  readonly line: (facts: AdminFacts) => StatusLine | null;
  /** An app's section: what its page draws. */
  readonly own?: AdminSection;
}

export interface AdminGroup {
  /** null: the sections every app shares. */
  readonly app: AppId | null;
  readonly title: string;
  readonly places: readonly AdminPlace[];
}

const SHARED_GLYPHS: Record<SharedAdminSection, GlyphName> = { apps: 'apps', server: 'server', reading: 'sparkle', backup: 'cloud', drive: 'file', immich: 'image' };

const SHARED_INFO: Partial<Record<SharedAdminSection, string>> = { apps: APPS_INFO, server: SERVER_INFO, backup: BACKUP_INFO, drive: DRIVE_INFO, immich: IMMICH_INFO };

const SHARED_LINES: Record<SharedAdminSection, (facts: AdminFacts) => StatusLine | null> = {
  // With a server, nothing is said of its apps or of Claude before its settings are read (never « Aucune clé » while they load).
  apps: ({ url, settings }) => (url && !settings ? null : appsLine(settings)),
  server: ({ url, status, unavailable }) => serverLine(url, status, unavailable),
  reading: ({ url, settings }) => (url && !settings ? null : claudeLine(settings?.analysis ?? null)),
  backup: ({ settings, status, now }) => (settings ? backupLine(settings.backup, status?.backup ?? null, now) : null),
  drive: ({ settings, status, now }) => (settings ? driveLine(settings.drive, status?.drive ?? null, now) : null),
  immich: ({ settings }) => (settings ? immichLine(settings.immich) : null),
};

function sharedPlace(id: SharedAdminSection): AdminPlace {
  return { id, title: SHARED_ADMIN_TITLES[id], glyph: SHARED_GLYPHS[id], info: SHARED_INFO[id], needsServer: SERVER_ONLY_SECTIONS.includes(id), app: null, line: SHARED_LINES[id] };
}

function ownPlace(app: AppId, own: AdminSection): AdminPlace {
  return { id: own.id, title: own.title(), glyph: own.glyph, info: own.info, needsServer: true, app, line: ({ settings }) => (settings ? own.line(settings) : null), own };
}

/**
 * The Administration's sections, grouped: every app's first, then each app's own under its name,
 * in the suite's order, for the apps the server runs (`on`; every app until it says).
 */
export function adminGroups(on: readonly AppId[] | null): readonly AdminGroup[] {
  const shared: AdminGroup = { app: null, title: t('For every app'), places: SHARED_ADMIN_SECTIONS.map(sharedPlace) };
  const sections = theApp().adminSections ?? [];
  const owned = APP_IDS.filter(app => (on === null || on.includes(app)) && sections.some(own => own.app === app)).map(app => ({
    app,
    title: APPS[app].name,
    places: sections.filter(own => own.app === app).map(own => ownPlace(app, own)),
  }));
  return [shared, ...owned];
}

/** One section by its address; null when no app the server runs has it. */
export function adminPlace(id: string, on: readonly AppId[] | null): AdminPlace | null {
  for (const group of adminGroups(on)) {
    const found = group.places.find(place => place.id === id);
    if (found) return found;
  }
  return null;
}
