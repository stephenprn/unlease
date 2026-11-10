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
import { localized, t, tx } from '../i18n';
import type { AdminStatus, BackupSnapshot, BackupStatus, DriveStatus, RestoreReport } from '../sync/admin';
import { CLAUDE_MODEL_NAMES, type BackupRecurrence, type BackupSettings, type DriveSettings, type ServerSettings } from '../sync/settings';
import { formatClock, formatDay, formatRelative, formatUsd, plural, formatBytes } from './format';

/** The sections every app shares, in the Administration's order. Their ids are addresses (`/admin/server`, the phone's `Admin` screen's `section`): never rename one. */
export const SHARED_ADMIN_SECTIONS = ['apps', 'server', 'reading', 'backup', 'drive'] as const;
export type SharedAdminSection = (typeof SHARED_ADMIN_SECTIONS)[number];

export function isSharedAdminSection(value: unknown): value is SharedAdminSection {
  return typeof value === 'string' && (SHARED_ADMIN_SECTIONS as readonly string[]).includes(value);
}

/** Their titles; Claude's is its name, the same in every language. */
export const SHARED_ADMIN_TITLES: Record<SharedAdminSection, string> = localized({
  apps: tx('Applications'),
  server: tx('Serveur'),
  reading: 'Claude',
  backup: tx('Sauvegarde sur S3'),
  drive: tx('Fichiers sur Seafile'),
});

/** The sections that need a connected server to mean anything: without one the home lists them greyed. */
export const SERVER_ONLY_SECTIONS: readonly SharedAdminSection[] = ['backup', 'drive'];

/** The dot beside a status: fine, under way, failed, or nothing set. */
export type StatusTone = 'ok' | 'waiting' | 'danger' | 'off';

export interface StatusLine {
  readonly tone: StatusTone;
  readonly title: string;
  readonly meta: string;
}

/** The frequency's segmented control. */
export const BACKUP_RECURRENCE_SHORT: Record<BackupRecurrence, string> = localized({ off: tx('Jamais'), '6h': tx('6 h'), daily: tx('Jour'), weekly: tx('Semaine') });

/** "Version 0.1.0 · 1 234 notes · 56 pages · 87 contacts · 342 fichiers (1,2 Mo)" (no contacts said while there are none). */
export function serverFacts(server: AdminStatus['server']): string {
  const parts = [server.version ? t('Version {version}', { version: server.version }) : null, plural(server.notes, 'note'), plural(server.pages, 'page'), server.contacts > 0 ? plural(server.contacts, 'contact') : null, server.events > 0 ? plural(server.events, 'événement') : null, `${plural(server.files, 'fichier')} (${formatBytes(server.fileBytes)})`];
  return parts.filter(Boolean).join(' · ');
}

/** « Applications » in one line: the apps the server runs, by name. */
export function appsLine(settings: ServerSettings | null): StatusLine {
  if (!settings) return { tone: 'off', title: t('Applications du serveur'), meta: t('Reliez un serveur pour choisir les applications qu’il fait tourner.') };
  const names = settings.apps.enabled.map((id: AppId) => APPS[id].name).join(' · ');
  return { tone: 'ok', title: names, meta: t('Activées sur le serveur, pour tous vos appareils') };
}

/** « Serveur » in one line: its address and what it holds, that it does not answer (`unreachable`), or that this device keeps everything. */
export function serverLine(url: string | null, status: AdminStatus | null, unreachable = false): StatusLine {
  if (!url) return { tone: 'off', title: t('Aucun serveur relié'), meta: t('Vos données restent sur cet appareil.') };
  const host = url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!status) return unreachable ? { tone: 'danger', title: host, meta: t('Le serveur ne répond pas pour l’instant.') } : { tone: 'waiting', title: host, meta: t('Lecture de l’état du serveur…') };
  return { tone: 'ok', title: host, meta: serverFacts(status.server) };
}

/** « Claude » in one line: its key, model and budget, or that nothing is asked of it. */
export function claudeLine(analysis: ServerSettings['analysis'] | null): StatusLine {
  if (!analysis?.enabled) return { tone: 'off', title: t('Aucune clé Claude'), meta: t('Sans clé, rien n’est demandé à Claude : les applications marchent sans lui.') };
  const key = analysis.keyHint ? t('Clé {hint}', { hint: analysis.keyHint }) : t('Clé du serveur');
  return { tone: 'ok', title: `${key} · ${CLAUDE_MODEL_NAMES[analysis.model]}`, meta: t('Budget de {budget} par mois', { budget: formatUsd(analysis.budgetUsd) }) };
}

/** "26 oct. à 03:00". */
export function formatMoment(time: number, now: number): string {
  return t('{day} à {time}', { day: formatDay(time, now), time: formatClock(time) });
}

export function backupLine(settings: BackupSettings, status: BackupStatus | null, now: number): StatusLine {
  if (!settings.configured) return { tone: 'off', title: t('Sauvegarde désactivée'), meta: t('Renseignez un stockage S3 pour garder une copie de vos données hors du serveur.') };
  if (status?.running) return { tone: 'waiting', title: t('Sauvegarde en cours…'), meta: t('Vers {bucket}', { bucket: settings.bucket }) };
  const next = status?.nextAt ? t('Prochaine le {moment}', { moment: formatMoment(status.nextAt, now) }) : settings.recurrence === 'off' ? t('Aucune sauvegarde automatique') : '';
  const last = status?.last;
  if (last && !last.ok) return { tone: 'danger', title: t('La dernière sauvegarde a échoué'), meta: [last.error ? t(last.error) : t('Erreur inconnue'), next].filter(Boolean).join(' · ') };
  if (!last || last.finishedAt === null) return { tone: 'off', title: t('Aucune sauvegarde pour l’instant'), meta: next || t('Vers {bucket}', { bucket: settings.bucket }) };
  return {
    tone: 'ok',
    title: t('Dernière sauvegarde {when}', { when: formatRelative(last.finishedAt, now) }),
    // A run that left out files it could not read still succeeded, and says so.
    meta: [formatBytes(last.bytes), last.filesSent > 0 ? plural(last.filesSent, 'fichier envoyé', 'fichiers envoyés') : null, last.error ? t(last.error) : null, next].filter(Boolean).join(' · '),
  };
}

export function driveLine(settings: DriveSettings, status: DriveStatus | null, now: number): StatusLine {
  if (settings.leaving) {
    return { tone: 'waiting', title: t('Retour des fichiers sur le serveur…'), meta: status ? `${plural(status.waiting, 'fichier restant', 'fichiers restants')}${status.error ? ` · ${t(status.error)}` : ''}` : '' };
  }
  if (!settings.provider) return { tone: 'off', title: t('Fichiers gardés sur le serveur'), meta: t('Reliez un dossier Seafile pour y ranger vos photos, vidéos et documents.') };
  const where = `${settings.library ? t('« {library} »', { library: settings.library }) : 'Seafile'}, ${settings.folder}`;
  if (!status) return { tone: 'off', title: where, meta: '' };
  if (status.error) return { tone: 'danger', title: t('Synchronisation interrompue'), meta: t(status.error) };
  const held = `${plural(status.files, 'fichier')} (${formatBytes(status.bytes)})`;
  if (status.running || status.waiting > 0) return { tone: 'waiting', title: t('Synchronisation en cours…'), meta: `${held} · ${t('{count} en attente', { count: status.waiting })}` };
  return { tone: 'ok', title: where, meta: `${held}${status.lastPassAt ? ` · ${t('à jour {when}', { when: formatRelative(status.lastPassAt, now) })}` : ''}` };
}

/** "Sauvegarde restaurée : 1 234 éléments, 56 fichiers (2 introuvables)", and what waits for Seafile. */
export function restoreSummary(report: RestoreReport): string {
  const held = plural(report.files, 'fichier');
  const files = report.missingFiles > 1 ? t('{files} ({count} introuvables)', { files: held, count: report.missingFiles }) : report.missingFiles === 1 ? t('{files} ({count} introuvable)', { files: held, count: 1 }) : held;
  const restored = t('Sauvegarde restaurée : {records}, {files}', { records: plural(report.records, 'élément'), files });
  const later = [
    report.needDrive > 0 ? t('{files} dans Seafile : reliez-le, puis restaurez à nouveau', { files: plural(report.needDrive, 'fichier est', 'fichiers sont') }) : null,
    report.coldFiles > 0 ? t('{files} de Glacier : restaurez à nouveau dans quelques heures', { files: plural(report.coldFiles, 'fichier sort', 'fichiers sortent') }) : null,
  ].filter(Boolean);
  return later.length > 0 ? `${restored}. ${later.join('. ')}` : restored;
}

/** A snapshot's line under its moment: its size, and where S3 keeps it cold, that it must come out first. */
export function snapshotMeta(snapshot: Pick<BackupSnapshot, 'bytes' | 'cold'>): string {
  return snapshot.cold ? t('{size} · dans Glacier', { size: formatBytes(snapshot.bytes) }) : formatBytes(snapshot.bytes);
}

/** A restore that found its snapshot cold (Glacier): S3 is bringing it out, to be restored again later. */
export function thawingLine(): { readonly title: string; readonly meta: string } {
  return { title: t('La sauvegarde sort de Glacier'), meta: t('S3 la rend lisible d’ici quelques heures : relancez alors la restauration.') };
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
