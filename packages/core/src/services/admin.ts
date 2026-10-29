/**
 * The Administration's words, shared by the phone and the web: what the server holds, where the
 * backups and the files stand, what a restore did.
 */
import { localized, t, tx } from '../i18n';
import type { AdminStatus, BackupStatus, DriveStatus, RestoreReport } from '../sync/admin';
import type { BackupRecurrence, BackupSettings, DriveSettings } from '../sync/settings';
import { formatClock, formatDay, formatRelative, plural, formatBytes } from './format';

/** The dot beside a status: fine, under way, failed, or nothing set. */
export type StatusTone = 'ok' | 'waiting' | 'danger' | 'off';

export interface StatusLine {
  readonly tone: StatusTone;
  readonly title: string;
  readonly meta: string;
}

/** The frequency's segmented control. */
export const BACKUP_RECURRENCE_SHORT: Record<BackupRecurrence, string> = localized({ off: tx('Jamais'), '6h': tx('6 h'), daily: tx('Jour'), weekly: tx('Semaine') });

/** "Version 0.1.0 · 1 234 notes · 56 pages · 342 fichiers (1,2 Mo)". */
export function serverFacts(server: AdminStatus['server']): string {
  const parts = [server.version ? t('Version {version}', { version: server.version }) : null, plural(server.notes, 'note'), plural(server.pages, 'page'), `${plural(server.files, 'fichier')} (${formatBytes(server.fileBytes)})`];
  return parts.filter(Boolean).join(' · ');
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
  return report.needDrive > 0 ? `${restored}. ${t('{files} dans Seafile : reliez-le, puis restaurez à nouveau', { files: plural(report.needDrive, 'fichier est', 'fichiers sont') })}` : restored;
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
