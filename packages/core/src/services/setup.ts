/**
 * The first run, shared by every client of the suite (the web app, each phone app), short on purpose:
 *
 * 1. `server`: the language, and one decision: connect to the server (its address, filled in when the
 *    server serves this page or a sibling phone app knows it, and its token), or keep everything on this
 *    device.
 * 2. Only on a server whose own setup is not done (`ServerSettings.setup`), the server's steps, done
 *    once for every app and every device: `apps` (which apps it runs; announced ones shown, not
 *    tickable), then `checklist` (« Votre serveur »: what the Administration sets, only what the chosen
 *    apps use, each row optional and opened on its own: a backup to bring back first when the server
 *    holds nothing, Claude, S3, Seafile, Seerr). Finishing marks the server set up.
 * 3. `appearance`: this device's colours and ground (kept with « Garder l’apparence d’origine »:
 *    `isDefaultAppearance`; a phone app starts from its sibling's).
 *
 * A device joining a server already set up goes from its colours straight to its app.
 */
import { APP_IDS, APPS, SUITE_NAME, SUITE_SLUG, isReadyApp, type AppId } from '../apps';
import { APP_WORDS } from '../appWords';
import { localized, t, tx } from '../i18n';
import type { AdminStatus } from '../sync/admin';
import { BACKUP_RECURRENCE_NAMES, CLAUDE_MODEL_NAMES, type BackupPatch, type ServerSettings } from '../sync/settings';
import { restoreSummary } from './admin';

export type SetupStep = 'server' | 'apps' | 'checklist' | 'appearance';

/** What "Votre serveur" lists, each opened from its row. */
export type SetupTask = 'restore' | 'reading' | 'backup' | 'drive' | 'seerr' | 'holidays';

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
    lead: tx('Vos notes, vos pages, vos contacts et votre agenda, sur votre propre serveur.'),
  }),
  apps: localized({
    title: tx('Vos applications'),
    short: tx('Applications'),
    lead: tx('Choisissez ce que votre serveur fait tourner. Les applications partagent vos réglages, votre apparence et vos données ; vous en ajouterez ou en retirerez plus tard dans l’Administration.'),
  }),
  checklist: localized({
    title: tx('Votre serveur'),
    short: tx('Serveur'),
    lead: tx('Ce que votre serveur peut faire de plus, réglé une fois pour toutes les applications. Tout est facultatif, et se règle aussi plus tard dans l’Administration.'),
  }),
  appearance: localized({
    title: tx('Apparence'),
    short: tx('Apparence'),
    lead: tx('Les couleurs et le fond des applications sur cet appareil. Gardez ceux d’origine ou choisissez les vôtres : ils se changent ensuite dans les Réglages.'),
  }),
};

/** The welcome's line under the brand: the suite's on the web, the app's own on a phone app. */
export function setupWelcomeLead(app: AppId | null): string {
  return app ? APP_WORDS[app].description : SETUP_WORDS.server.lead;
}

/** What the connection's fields say under them: where each value comes from. */
export function setupFieldHelp(field: 'address' | 'served' | 'token'): string {
  switch (field) {
    case 'address':
      return t('L’adresse où vous avez installé {suite}, par exemple https://{slug}.exemple.fr.', { suite: SUITE_NAME, slug: SUITE_SLUG });
    case 'served':
      return t('L’adresse de cette page : c’est votre serveur qui la sert.');
    case 'token':
      return t('La valeur de UNLEASE_TOKEN, dans le fichier .env posé à côté de docker-compose.yml sur votre serveur.');
  }
}

export const SETUP_TASK_WORDS: Record<SetupTask, Omit<SetupStepWords, 'short'>> = {
  restore: localized({
    title: tx('Retrouver vos données'),
    lead: tx('Votre serveur est vide. S’il en remplace un autre, restaurez sa dernière sauvegarde : les données de toutes les applications reviennent de S3, les fichiers de Seafile. Sinon, commencez à neuf.'),
  }),
  reading: localized({
    title: tx('Claude'),
    lead: tx('Facultatif : une clé Claude, partagée par toutes les applications. Une clé se crée sur console.anthropic.com, rubrique API Keys ; le budget mensuel arrête tout une fois atteint.'),
  }),
  backup: localized({
    title: tx('Sauvegarde sur S3'),
    lead: tx('Une copie des données de toutes les applications loin de chez vous, chez Scaleway, OVH, AWS… et de vos photos et fichiers, sauf si Seafile les garde. La clé se crée dans la console de votre fournisseur (clés d’accès, ou IAM) ; elle est vérifiée (lecture, écriture, suppression) puis gardée sur votre serveur.'),
  }),
  drive: localized({
    title: tx('Fichiers sur Seafile'),
    lead: tx('Facultatif : les photos, vidéos et documents de toutes les applications rangés dans un dossier Seafile, chacune dans le sien ; le serveur n’en garde que des aperçus. Sans Seafile, il les garde, et la sauvegarde S3 en a une copie.'),
  }),
  holidays: localized({
    title: tx('Jours fériés'),
    lead: tx('Facultatif, pour Agenda : les jours fériés d’un pays (et de sa région, s’il en a), que le serveur va chercher sur Nager.Date et montre dans l’agenda de chaque appareil.'),
  }),
  seerr: localized({
    title: tx('Films et séries avec Seerr'),
    lead: tx('Facultatif, pour les collections de films et de séries : votre Seerr (Jellyseerr, Overseerr), pour demander un titre depuis son lien. Sa clé API est dans Seerr, Réglages, Général.'),
  }),
};

/** What « Retrouver vos données » says as it goes, the same on every client. */
export const SETUP_RESTORE_WORDS = localized({
  noStorage: tx('Pas de stockage S3'),
  noStorageMeta: tx('Ajoutez-le pour retrouver ses sauvegardes. Sans S3, une archive téléchargée auparavant peut tout de même revenir.'),
  addStorage: tx('Ajouter le stockage S3'),
  reading: tx('Lecture des sauvegardes sur S3…'),
  unreadable: tx('Sauvegardes illisibles'),
  none: tx('Aucune sauvegarde sur S3'),
  restore: tx('Restaurer cette sauvegarde'),
  running: tx('Restauration en cours…'),
  runningMeta: tx('Les données reviennent d’abord, puis les photos et les fichiers.'),
  failed: tx('La restauration a échoué'),
  back: tx('Vos données sont revenues'),
  file: tx('Restaurer depuis un fichier'),
  fileMeta: tx('Une archive .tar.gz téléchargée depuis S3 ou depuis l’Administration.'),
  refused: tx('Restauration refusée'),
});

/** « Aucune sauvegarde sur S3 »'s line: where the server looked. */
export function setupNoBackupsMeta(bucket: string, prefix: string): string {
  return t('Rien à restaurer dans {place}.', { place: `${bucket}${prefix ? `/${prefix.replace(/\/$/, '')}` : ''}` });
}

/** A row's title and lead as the server stands: once a backup came back, its lead no longer calls the server empty. */
export function setupTaskWords(task: SetupTask, status: AdminStatus | null): Omit<SetupStepWords, 'short'> {
  const words = SETUP_TASK_WORDS[task];
  if (task !== 'restore' || !setupRestored(status)) return words;
  return { ...words, lead: t('Les données de la sauvegarde sont revenues sur ce serveur. Vous pouvez en restaurer une autre, ou continuer.') };
}

/** What Claude does for an app, in the Claude form of the setup and the Administration; null for an app that does not ask it. */
export function claudeUse(app: AppId): string | null {
  const name = APPS[app].name;
  switch (app) {
    case 'notes':
      return t('{app} : chaque lien enregistré est lu (titre, prix, résumé, images) et rangé dans la bonne collection.', { app: name });
    case 'pages':
      return t('{app} : des questions sur vos pages, auxquelles Claude répond en citant les passages.', { app: name });
    case 'calendar':
      return t('{app} : un événement tapé en quelques mots, un événement tiré d’un lien enregistré, des questions sur votre agenda.', { app: name });
    default:
      return null;
  }
}

/** The server holds nothing yet: a new one, or one to bring back from a backup. */
export function serverEmpty(status: AdminStatus | null): boolean {
  return status !== null && status.server.notes === 0 && status.server.pages === 0 && status.server.contacts === 0 && status.server.events === 0 && status.server.files === 0;
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
 * Whether this device sets the server up (the apps, « Votre serveur »): connected to a server whose
 * own setup is not done, or not known yet. Once it is, every other device skips it.
 */
export function setupServerShown(connected: boolean, serverDone: boolean | null): boolean {
  return connected && serverDone !== true;
}

/** The steps, in order: the server (or this device alone), the server's own when this device sets it up, then how the apps look here. */
export function setupSteps(connected: boolean, serverSetup: boolean): SetupStep[] {
  return connected && serverSetup ? ['server', 'apps', 'checklist', 'appearance'] : ['server', 'appearance'];
}

/** The apps that use a task: Claude for those that ask it, Seerr for Carnet; S3, Seafile and a restore for all. */
const TASK_APPS: Partial<Record<SetupTask, readonly AppId[]>> = { reading: ['notes', 'pages', 'calendar'], seerr: ['notes'], holidays: ['calendar'] };

/** "Votre serveur"'s rows, in order: a backup to bring back first (only on a server that held nothing), then Claude, S3, Seafile, Seerr, those the apps on use. */
export function setupTasks(startedEmpty: boolean, apps: readonly AppId[]): SetupTask[] {
  const all: SetupTask[] = ['restore', 'reading', 'backup', 'drive', 'seerr', 'holidays'];
  return all.filter(task => (task === 'restore' ? startedEmpty : (TASK_APPS[task] ?? APP_IDS).some(id => apps.includes(id))));
}

/** One card of the apps step. */
export interface SetupAppChoice {
  readonly id: AppId;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly replaces: string;
  /** Announced, not installable yet: shown with « Bientôt disponible ». */
  readonly soon: boolean;
  readonly checked: boolean;
  /** The app this device is (a phone app): it stays on. */
  readonly locked: boolean;
}

/** Every app of the suite as the apps step shows it, ready ones first. */
export function setupAppChoices(enabled: readonly AppId[], own: AppId | null): SetupAppChoice[] {
  return APP_IDS.map(id => ({
    id,
    name: APPS[id].name,
    ...APP_WORDS[id],
    soon: !isReadyApp(id),
    checked: isReadyApp(id) && enabled.includes(id),
    locked: id === own,
  }));
}

/** The apps on after ticking or unticking one: never an announced one, never the device's own, never none. */
export function toggleSetupApp(enabled: readonly AppId[], id: AppId, own: AppId | null): readonly AppId[] {
  if (!isReadyApp(id) || id === own) return enabled;
  const next = enabled.includes(id) ? enabled.filter(each => each !== id) : [...enabled, id];
  const ordered = APP_IDS.filter(each => next.includes(each));
  return ordered.length > 0 ? ordered : enabled;
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
    case 'holidays':
      return settings !== null && settings.calendar.holidays.country !== null;
  }
}

/**
 * The forward button's words at the foot of a step: the last one opens the app. Nothing is skipped
 * on the appearance step, what it shows is kept: left as it came, it says so.
 */
export function setupForward(step: SetupStep, set: boolean, last: boolean): string {
  if (last) return t('Commencer');
  if (step === 'appearance' && !set) return t('Garder l’apparence d’origine');
  return t('Continuer');
}

/** The forward button of a task opened from "Votre serveur": back to the list, done or left for later. */
export function setupTaskForward(set: boolean): string {
  return set ? t('Continuer') : t('Plus tard');
}

/** "Étape 2 sur 4". */
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

/** A phone app finding its sibling's connection on the welcome: the one tap that saves typing it. */
export function siblingConnectionWords(app: AppId, server: string): { readonly action: string; readonly note: string } {
  const name = APPS[app].name;
  return { action: t('Utiliser la connexion de {app}', { app: name }), note: t('{app} est déjà relié à {server} sur ce téléphone.', { app: name, server: server.replace(/^https?:\/\//, '') }) };
}

/** The appearance step's note when it starts from a sibling phone app's colours. */
export function siblingAppearanceNote(app: AppId): string {
  return t('Les couleurs de {app} sur ce téléphone, reprises ici.', { app: APPS[app].name });
}

/** What a client shows when its app is off on the server it connects to. */
export function appOffWords(app: AppId): { readonly title: string; readonly lead: string; readonly action: string } {
  const name = APPS[app].name;
  return {
    title: t('{app} n’est pas activé sur ce serveur', { app: name }),
    lead: t('Votre serveur ne fait pas tourner {app} pour l’instant. Activez-le pour l’utiliser ici : rien d’autre ne change, et ses données sont gardées même désactivé.', { app: name }),
    action: t('Activer {app}', { app: name }),
  };
}

/** What the connection's fields say once left empty, or sent so (null: filled). */
export function connectionProblem(field: 'address' | 'token', value: string): string | null {
  if (value.trim()) return null;
  return field === 'address' ? t('Saisissez l’adresse de votre serveur.') : t('Saisissez le jeton de votre serveur.');
}

/** What is wrong with a Claude key typed: nothing pasted, or too short to be one (null: it may be one; the server tries it). */
export function claudeKeyProblem(key: string): string | null {
  const typed = key.trim();
  if (!typed) return t('Collez votre clé API Claude.');
  return typed.length < 20 ? t('Cette clé est trop courte : collez-la en entier, elle commence par sk-ant-.') : null;
}

/**
 * What is wrong with the address of a service typed (S3, Seafile, Seerr): `missing` when empty, else
 * when it is not a web address, how one reads, with `example`.
 */
export function serviceAddressProblem(address: string, missing: string, example: string): string | null {
  const typed = address.trim();
  if (!typed) return missing;
  return /^https?:\/\/[^\s/]+\S*$/i.test(typed) ? null : t('Une adresse commençant par https:// ou http://, comme {example}.', { example });
}

/** A field of a service's form (S3, Seafile, Seerr) that the server's refusal can point at. */
export type ServiceField = 'address' | 'region' | 'bucket' | 'key';

/** The server's refusals of a service, by the field they concern (its French words, as it sends them). */
const SERVICE_REFUSALS: Readonly<Record<string, ServiceField>> = {
  'Stockage S3 injoignable': 'address',
  'Seafile injoignable': 'address',
  'Seerr injoignable': 'address',
  'Cette adresse ne répond pas comme un serveur Seafile': 'address',
  'Cette adresse ne répond pas comme un serveur Seerr': 'address',
  'Cette adresse renvoie ailleurs : donnez celle où Seerr répond': 'address',
  'Bucket introuvable': 'bucket',
  'Mauvaise région pour ce bucket': 'region',
  'Jeton refusé par Seafile': 'key',
  'Ce jeton est en lecture seule : il faut la lecture et l’écriture': 'key',
  'Ce jeton ouvre une autre bibliothèque : désactivez d’abord Seafile pour rapatrier vos fichiers': 'key',
  'Clé API refusée par Seerr': 'key',
};

/**
 * Which field the server's refusal of a service points at, so it shows under it: the address it could
 * not reach or that is not the service's, the bucket or the region S3 refused, the key or token refused.
 * null: the whole form (both S3 keys together, rights, an error of the service's).
 */
export function serviceRefusalField(message: string): ServiceField | null {
  return SERVICE_REFUSALS[message] ?? null;
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

/** What the backup form starts from on a new setup: Scaleway in Paris, a folder named after the suite, as the drive's. */
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

/** A country's name in the interface's language when this build knows it (`FR` -> « France »), else its code. */
export function countryName(code: string): string {
  const name = COUNTRY_NAMES[code];
  return name ? t(name) : code;
}

/** The countries Nager.Date has holidays for that people pick most, by name; any other is its code. */
export const COUNTRY_NAMES: Readonly<Record<string, string>> = {
  FR: tx('France'),
  BE: tx('Belgique'),
  CH: tx('Suisse'),
  LU: tx('Luxembourg'),
  CA: tx('Canada'),
  GB: tx('Royaume-Uni'),
  IE: tx('Irlande'),
  US: tx('États-Unis'),
  DE: tx('Allemagne'),
  AT: tx('Autriche'),
  ES: tx('Espagne'),
  PT: tx('Portugal'),
  IT: tx('Italie'),
  NL: tx('Pays-Bas'),
  MC: tx('Monaco'),
  MA: tx('Maroc'),
  TN: tx('Tunisie'),
  SN: tx('Sénégal'),
  AU: tx('Australie'),
  NZ: tx('Nouvelle-Zélande'),
  SE: tx('Suède'),
  NO: tx('Norvège'),
  DK: tx('Danemark'),
  FI: tx('Finlande'),
  PL: tx('Pologne'),
  GR: tx('Grèce'),
  JP: tx('Japon'),
  BR: tx('Brésil'),
  MX: tx('Mexique'),
};

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
      return set ? line(t('Claude {model}, pour toutes les applications', { model: CLAUDE_MODEL_NAMES[settings!.analysis.model] })) : line(t('Lire vos liens, répondre sur vos pages.'));
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
    case 'holidays': {
      const { country, region } = settings?.calendar.holidays ?? { country: null, region: null };
      return country ? line(region ? `${countryName(country)} · ${region}` : countryName(country)) : line(t('Les jours fériés de votre pays dans l’agenda.'));
    }
  }
}
