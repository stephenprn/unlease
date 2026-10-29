/**
 * The first run, shared by the phone and the web, short on purpose: one decision (connect to the
 * server, or keep the notes on this device), how the app looks here (its own colours, kept with
 * "Passer": `isDefaultAppearance`), then the board. A device that finds its server holding nothing sets it up on the way:
 * "Votre serveur" lists what the Administration sets (bringing a backup back first, then Claude's
 * reading of links, the backup to S3, the Seafile folder, Seerr), each one optional and opened from
 * its row. A device joining a server already in use goes straight to the board.
 */
import { SUITE_SLUG } from '../apps';
import { localized, t, tx } from '../i18n';
import type { AdminStatus } from '../sync/admin';
import { BACKUP_RECURRENCE_NAMES, CLAUDE_MODEL_NAMES, type BackupPatch, type ServerSettings } from '../sync/settings';
import { restoreSummary } from './admin';

export type SetupStep = 'server' | 'appearance' | 'checklist';

/** What "Votre serveur" lists, each opened from its row. */
export type SetupTask = 'restore' | 'reading' | 'backup' | 'drive' | 'seerr';

export interface SetupStepWords {
  readonly title: string;
  /** In the progress row. */
  readonly short: string;
  readonly lead: string;
}

export const SETUP_WORDS: Record<SetupStep, SetupStepWords> = {
  server: localized({
    title: tx('Connexion'),
    short: tx('Connexion'),
    lead: tx('Vos notes, vos listes et vos liens, rangés sur votre propre serveur.'),
  }),
  appearance: localized({
    title: tx('Apparence'),
    short: tx('Apparence'),
    lead: tx('Les couleurs et le fond de l’application sur cet appareil. Gardez ceux d’origine ou choisissez les vôtres : ils se changent ensuite dans les Réglages.'),
  }),
  checklist: localized({
    title: tx('Votre serveur'),
    short: tx('Serveur'),
    lead: tx('Ce que votre serveur peut faire de plus. Tout est facultatif, et se règle aussi plus tard dans l’Administration.'),
  }),
};

export const SETUP_TASK_WORDS: Record<SetupTask, Omit<SetupStepWords, 'short'>> = {
  restore: localized({
    title: tx('Retrouver vos données'),
    lead: tx('Votre serveur est vide. S’il en remplace un autre, restaurez sa dernière sauvegarde : les notes et les pages reviennent de S3, les fichiers de Seafile. Sinon, commencez avec un carnet vide.'),
  }),
  reading: localized({
    title: tx('Lecture des liens par Claude'),
    lead: tx('Facultatif : avec une clé Claude, chaque lien enregistré est lu (titre, prix, résumé, images) et rangé dans la bonne collection.'),
  }),
  backup: localized({
    title: tx('Sauvegarde sur S3'),
    lead: tx('Une copie de vos notes et pages loin de chez vous, chez Scaleway, OVH, AWS… et de vos photos et fichiers, sauf si Seafile les garde. La clé est vérifiée (lecture, écriture, suppression) puis gardée sur votre serveur.'),
  }),
  drive: localized({
    title: tx('Fichiers sur Seafile'),
    lead: tx('Facultatif : vos photos, vidéos et documents rangés dans un dossier Seafile, classés par note et par page ; le serveur n’en garde que des aperçus. Sans Seafile, il les garde, et la sauvegarde S3 en a une copie.'),
  }),
  seerr: localized({
    title: tx('Films et séries avec Seerr'),
    lead: tx('Facultatif : votre Seerr (Jellyseerr, Overseerr), pour demander un film ou une série depuis son lien. Avec sa clé API, la bonne page s’ouvre et vous savez s’il est déjà là.'),
  }),
};

/** The server holds nothing yet: a new one, or one to bring back from a backup. */
export function serverEmpty(status: AdminStatus | null): boolean {
  return status !== null && status.server.notes === 0 && status.server.pages === 0 && status.server.files === 0;
}

/**
 * Whether the server started empty, read from its status when the setup resumes (the app reopened
 * mid-setup): a restore running on it counts, so its row stays.
 */
export function setupStartedEmpty(status: AdminStatus | null): boolean {
  return serverEmpty(status) || status?.restore.running === true;
}

/** A restore has come back well on the server. */
export function setupRestored(status: AdminStatus | null): boolean {
  return status !== null && !status.restore.running && status.restore.report !== null && status.restore.error === null;
}

/**
 * Whether this device sets the server up ("Votre serveur"): connected to a server that held nothing
 * when it came, or not known yet. A device joining a server in use skips it; the Administration
 * holds the rest.
 */
export function setupChecklistShown(connected: boolean, startedEmpty: boolean | null): boolean {
  return connected && startedEmpty !== false;
}

/** The steps, in order: the server (or this device alone), how the app looks here, then the server's own settings when this device sets it up. */
export function setupSteps(connected: boolean, checklist: boolean): SetupStep[] {
  return connected && checklist ? ['server', 'appearance', 'checklist'] : ['server', 'appearance'];
}

/** "Votre serveur"'s rows, in order: a backup to bring back first (only on a server that held nothing), then Claude's reading of links, S3, Seafile, Seerr. */
export function setupTasks(startedEmpty: boolean): SetupTask[] {
  return [...(startedEmpty ? (['restore'] as const) : []), 'reading', 'backup', 'drive', 'seerr'];
}

/** The task's setting is in place (a restore, once it came back well). */
export function setupTaskSet(task: SetupTask, settings: ServerSettings | null, status: AdminStatus | null): boolean {
  switch (task) {
    case 'restore':
      return setupRestored(status);
    case 'reading':
      return settings?.analysis.enabled === true;
    case 'backup':
      return settings?.backup.configured === true;
    case 'drive':
      return settings !== null && settings.drive.provider !== null;
    case 'seerr':
      return settings !== null && settings.seerr.url !== '';
  }
}

/** The forward button's words at the foot of a step: the last one starts the app. */
export function setupForward(set: boolean, last: boolean): string {
  if (last) return t('Commencer');
  return set ? t('Continuer') : t('Passer');
}

/** The forward button of a task opened from "Votre serveur": back to the list, done or left for later. */
export function setupTaskForward(set: boolean): string {
  return set ? t('Continuer') : t('Plus tard');
}

/** "Étape 2 sur 3". */
export function setupProgress(steps: readonly SetupStep[], step: SetupStep): string {
  return t('Étape {step} sur {count}', { step: steps.indexOf(step) + 1, count: steps.length });
}

/** The step after `step` (itself at the end). */
export function nextSetupStep(steps: readonly SetupStep[], step: SetupStep): SetupStep {
  const index = steps.indexOf(step);
  return steps[Math.min(steps.length - 1, index + 1)] ?? step;
}

/** The step before `step` (itself at the start). */
export function previousSetupStep(steps: readonly SetupStep[], step: SetupStep): SetupStep {
  const index = steps.indexOf(step);
  return steps[Math.max(0, index - 1)] ?? step;
}

/** Which field a failed connection points at: the token when the server refused it (or too many tries with it), else the address. */
export function connectFailureField(kind: string, status: number | null): 'address' | 'token' {
  return kind === 'unauthorized' || status === 429 ? 'token' : 'address';
}

/** A failed connection's words: when nothing answered at all, what to check comes with them. */
export function connectFailureMessage(kind: string, message: string): string {
  const silent = kind === 'network' && (message === t('Serveur injoignable') || message === t('Le serveur ne répond pas'));
  return silent ? t('{problem} : vérifiez l’adresse, et que le serveur est en marche.', { problem: message }) : message;
}

/** What the backup form starts from on a new setup: Scaleway in Paris, a folder named after the suite. */
export const SETUP_BACKUP_DRAFT: Pick<BackupPatch, 'endpoint' | 'region' | 'prefix'> = {
  endpoint: 'https://s3.fr-par.scw.cloud',
  region: 'fr-par',
  prefix: SUITE_SLUG,
};

/**
 * The region an S3 address names, for the region field: `fr-par` from `https://s3.fr-par.scw.cloud`,
 * `eu-west-3` from `https://s3.eu-west-3.amazonaws.com`, `gra` from `https://s3.gra.io.cloud.ovh.net`.
 */
export function regionOfEndpoint(endpoint: string): string | null {
  let host: string;
  try {
    host = new URL(endpoint.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
  const match = /^s3[.-]([a-z0-9-]+)\.(?:scw\.cloud|amazonaws\.com|io\.cloud\.ovh\.net|cloud\.ovh\.net)$/.exec(host);
  return match ? match[1]! : null;
}

/** A row of "Votre serveur": the task, what it holds now (or what it would do), and whether it is in place. */
export interface SetupTaskLine {
  readonly task: SetupTask;
  readonly title: string;
  readonly meta: string;
  readonly tone: 'ok' | 'off' | 'waiting';
}

/** What a task's row says, from the server's settings and status as they are now. */
export function setupTaskLine(task: SetupTask, settings: ServerSettings | null, status: AdminStatus | null): SetupTaskLine {
  const title = SETUP_TASK_WORDS[task].title;
  const set = setupTaskSet(task, settings, status);
  const line = (meta: string, tone: SetupTaskLine['tone'] = set ? 'ok' : 'off'): SetupTaskLine => ({ task, title, meta, tone });
  switch (task) {
    case 'restore':
      if (status?.restore.running) return line(t('Restauration en cours…'), 'waiting');
      return set && status?.restore.report ? line(restoreSummary(status.restore.report)) : line(t('Le serveur est vide : une sauvegarde de S3 ou une archive peut revenir.'));
    case 'reading':
      return set ? line(t('Lus par Claude {model}', { model: CLAUDE_MODEL_NAMES[settings!.analysis.model] })) : line(t('Chaque lien lu, résumé et rangé dans la bonne collection.'));
    case 'backup': {
      if (!set) return line(t('Une copie de tout, loin de chez vous.'));
      const { bucket, prefix, recurrence } = settings!.backup;
      return line(`${bucket}${prefix ? `/${prefix.replace(/\/$/, '')}` : ''} · ${BACKUP_RECURRENCE_NAMES[recurrence].toLowerCase()}`);
    }
    case 'drive': {
      if (!set) return line(t('Vos photos et fichiers dans un dossier Seafile.'));
      const { library, folder } = settings!.drive;
      return line(`${library ? t('Seafile « {library} »', { library }) : 'Seafile'}, ${folder}`);
    }
    case 'seerr':
      return set ? line(settings!.seerr.url.replace(/^https?:\/\//, '')) : line(t('Demander un film ou une série depuis son lien.'));
  }
}
