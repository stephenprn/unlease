/**
 * The Administration's words, shared by the phone and the web: its sections, what the server holds,
 * where the backups and the files stand, what a restore did.
 *
 * The Administration is an app of the suite of its own (the web's `/admin`, each phone's `Admin`
 * screen): a home that lists its sections, each with its state in one line, and a page per section.
 * The sections every app shares come first (`SHARED_ADMIN_SECTIONS`), then each app's own, under its
 * name (Carnet's Seerr, Pages' questions), as each app brings them.
 */
import { APPS, type AppId } from '../apps';
import { localized, t, tc, tx } from '../i18n';
import type { AdminStatus, BackupSnapshot, BackupStatus, DriveStatus, RestoreReport } from '../sync/admin';
import { CLAUDE_MODEL_NAMES, type BackupRecurrence, type BackupSettings, type DriveSettings, type ServerSettings } from '../sync/settings';
import { formatClock, formatDay, formatRelative, formatUsd, plural, formatBytes } from './format';

/** The sections every app shares, in the Administration's order. Their ids are addresses (`/admin/server`, the phone's `Admin` screen's `section`): never rename one. */
export const SHARED_ADMIN_SECTIONS = ['apps', 'server', 'reading', 'backup', 'drive', 'immich'] as const;
export type SharedAdminSection = (typeof SHARED_ADMIN_SECTIONS)[number];

export function isSharedAdminSection(value: unknown): value is SharedAdminSection {
  return typeof value === 'string' && (SHARED_ADMIN_SECTIONS as readonly string[]).includes(value);
}

/** Their titles; Claude's is its name, the same in every language. */
export const SHARED_ADMIN_TITLES: Record<SharedAdminSection, string> = localized({
  apps: tx('Apps'),
  server: tx('Server'),
  reading: 'Claude',
  backup: tx('Backup to S3'),
  drive: tx('Files on Seafile'),
  immich: tx('Photos on Immich'),
});

/** The sections that need a connected server to mean anything: without one the home lists them greyed. */
export const SERVER_ONLY_SECTIONS: readonly SharedAdminSection[] = ['backup', 'drive', 'immich'];

/** The dot beside a status: fine, under way, failed, or nothing set. */
export type StatusTone = 'ok' | 'waiting' | 'danger' | 'off';

export interface StatusLine {
  readonly tone: StatusTone;
  readonly title: string;
  readonly meta: string;
}

/** The frequency's segmented control. */
export const BACKUP_RECURRENCE_SHORT: Record<BackupRecurrence, string> = localized({ off: tx('Never'), '6h': tx('6 h'), daily: tx('Day'), weekly: tx('Week') });

/** "Version 0.1.0 · 1 234 notes · 56 pages · 87 contacts · 342 fichiers (1,2 Mo)" (no contacts said while there are none). */
export function serverFacts(server: AdminStatus['server']): string {
  const parts = [server.version ? t('Version {version}', { version: server.version }) : null, plural(server.notes, 'note'), plural(server.pages, 'page'), server.contacts > 0 ? plural(server.contacts, 'contact') : null, server.events > 0 ? plural(server.events, 'event') : null, `${plural(server.files, 'file')} (${formatBytes(server.fileBytes)})`];
  return parts.filter(Boolean).join(' · ');
}

/** « Applications » in one line: the apps the server runs, by name. */
export function appsLine(settings: ServerSettings | null): StatusLine {
  if (!settings) return { tone: 'off', title: t('Server apps'), meta: t('Connect a server to choose the apps it runs.') };
  const names = settings.apps.enabled.map((id: AppId) => APPS[id].name).join(' · ');
  return { tone: 'ok', title: names, meta: t('On on the server, for all your devices') };
}

/** « Serveur » in one line: its address and what it holds, that it does not answer (`unreachable`), or that this device keeps everything. */
export function serverLine(url: string | null, status: AdminStatus | null, unreachable = false): StatusLine {
  if (!url) return { tone: 'off', title: t('No server connected'), meta: t('Your data stays on this device.') };
  const host = url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!status) return unreachable ? { tone: 'danger', title: host, meta: t('The server isn’t answering for now.') } : { tone: 'waiting', title: host, meta: t('Reading the server’s state…') };
  return { tone: 'ok', title: host, meta: serverFacts(status.server) };
}

/** « Claude » in one line: its key, model and budget, or that nothing is asked of it. */
export function claudeLine(analysis: ServerSettings['analysis'] | null): StatusLine {
  if (!analysis?.enabled) return { tone: 'off', title: t('No Claude key'), meta: t('Without a key, nothing is asked of Claude: the apps work without it.') };
  const key = analysis.keyHint ? t('Key {hint}', { hint: analysis.keyHint }) : t('Server’s key');
  return { tone: 'ok', title: `${key} · ${CLAUDE_MODEL_NAMES[analysis.model]}`, meta: t('Budget of {budget} a month', { budget: formatUsd(analysis.budgetUsd) }) };
}

/** "26 oct. à 03:00". */
export function formatMoment(time: number, now: number): string {
  return t('{day} at {time}', { day: formatDay(time, now), time: formatClock(time) });
}

export function backupLine(settings: BackupSettings, status: BackupStatus | null, now: number): StatusLine {
  if (!settings.configured) return { tone: 'off', title: t('Backup off'), meta: t('Set up S3 storage to keep a copy of your data off the server.') };
  if (status?.running) return { tone: 'waiting', title: t('Backing up…'), meta: t('To {bucket}', { bucket: settings.bucket }) };
  const next = status?.nextAt ? t('Next on {moment}', { moment: formatMoment(status.nextAt, now) }) : settings.recurrence === 'off' ? t('No automatic backup') : '';
  const last = status?.last;
  if (last && !last.ok) return { tone: 'danger', title: t('The last backup failed'), meta: [last.error ? t(last.error) : t('Unknown error'), next].filter(Boolean).join(' · ') };
  if (!last || last.finishedAt === null) return { tone: 'off', title: t('No backup yet'), meta: next || t('To {bucket}', { bucket: settings.bucket }) };
  return {
    tone: 'ok',
    title: t('Last backup {when}', { when: formatRelative(last.finishedAt, now) }),
    // A run that left out files it could not read still succeeded, and says so.
    meta: [formatBytes(last.bytes), last.filesSent > 0 ? plural(last.filesSent, 'file sent', 'files sent') : null, last.error ? t(last.error) : null, next].filter(Boolean).join(' · '),
  };
}

export function driveLine(settings: DriveSettings, status: DriveStatus | null, now: number): StatusLine {
  if (settings.leaving) {
    return { tone: 'waiting', title: t('Bringing the files back to the server…'), meta: status ? `${plural(status.waiting, 'file left', 'files left')}${status.error ? ` · ${t(status.error)}` : ''}` : '' };
  }
  if (!settings.provider) return { tone: 'off', title: t('Files kept on the server'), meta: t('Connect a Seafile folder to keep your photos, videos and documents in it.') };
  const where = `${settings.library ? t('“{library}”', { library: settings.library }) : 'Seafile'}, ${settings.folder}`;
  if (!status) return { tone: 'off', title: where, meta: '' };
  if (status.error) return { tone: 'danger', title: t('Sync stopped'), meta: t(status.error) };
  const held = `${plural(status.files, 'file')} (${formatBytes(status.bytes)})`;
  if (status.running || status.waiting > 0) return { tone: 'waiting', title: tc('admin', 'Syncing…'), meta: `${held} · ${t('{count} waiting', { count: status.waiting })}` };
  return { tone: 'ok', title: where, meta: `${held}${status.lastPassAt ? ` · ${t('synced {when}', { when: formatRelative(status.lastPassAt, now) })}` : ''}` };
}

/** « Photos sur Immich » in one line: its address, or what it would bring. */
export function immichLine(settings: ServerSettings['immich'] | null): StatusLine {
  if (!settings?.url) return { tone: 'off', title: t('Immich not linked'), meta: t('Link your Immich to show its albums in pages and give contacts a face it knows.') };
  return { tone: 'ok', title: settings.url.replace(/^https?:\/\//, ''), meta: settings.keyHint ? t('Key {hint}', { hint: settings.keyHint }) : '' };
}

/** "Sauvegarde restaurée : 1 234 éléments, 56 fichiers (2 introuvables)", and what waits for Seafile. */
export function restoreSummary(report: RestoreReport): string {
  const held = plural(report.files, 'file');
  const files = report.missingFiles > 1 ? t('{files} ({count} not found)', { files: held, count: report.missingFiles }) : report.missingFiles === 1 ? tc('one', '{files} ({count} not found)', { files: held, count: 1 }) : held;
  const restored = t('Backup restored: {records}, {files}', { records: plural(report.records, 'item'), files });
  const later = [
    report.needDrive > 0 ? t('{files} in Seafile: connect it, then restore again', { files: plural(report.needDrive, 'file is', 'files are') }) : null,
    report.coldFiles > 0 ? t('{files} out of Glacier: restore again in a few hours', { files: plural(report.coldFiles, 'file is coming', 'files are coming') }) : null,
  ].filter(Boolean);
  return later.length > 0 ? `${restored}. ${later.join('. ')}` : restored;
}

/** A snapshot's line under its moment: its size, and where S3 keeps it cold, that it must come out first. */
export function snapshotMeta(snapshot: Pick<BackupSnapshot, 'bytes' | 'cold'>): string {
  return snapshot.cold ? t('{size} · in Glacier', { size: formatBytes(snapshot.bytes) }) : formatBytes(snapshot.bytes);
}

/** A restore that found its snapshot cold (Glacier): S3 is bringing it out, to be restored again later. */
export function thawingLine(): { readonly title: string; readonly meta: string } {
  return { title: t('The backup is coming out of Glacier'), meta: t('S3 makes it readable within a few hours: then run the restore again.') };
}

/** Something runs on the server, so the Administration asks again shortly. */
export function adminBusy(status: AdminStatus | null, drive: DriveSettings | null): boolean {
  if (!status) return false;
  const driveOn = drive !== null && (drive.provider !== null || drive.leaving);
  return status.backup.running || status.restore.running || status.drive.running || (driveOn && status.drive.waiting > 0 && !status.drive.error);
}

/** A snapshot's name as a moment: `carnet-2026-10-26T03-00-00Z.tar.gz`, else the time S3 gives. */
export function snapshotTime(name: string, fallback: number): number {
  const match = /(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z/.exec(name);
  if (!match) return fallback;
  const time = Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`);
  return Number.isFinite(time) ? time : fallback;
}
