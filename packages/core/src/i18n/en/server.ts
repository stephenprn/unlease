/** English for the server’s own messages the apps show (sync, files, settings, backups, Claude’s answers). Keys are the French exactly as written in `t()` / `tx()`, single-quoted, one per line. */
import { SUITE_NAME, SUITE_SLUG } from '../../apps';
import type { Dictionary } from '..';

export const EN_SERVER: Dictionary = {
  // Routes
  'Lien de téléchargement expiré': 'Download link expired',
  'Requête invalide': 'Invalid request',
  'L’administration n’est pas disponible sur ce serveur': 'The Administration is not available on this server',
  'Sauvegarde S3 non configurée': 'S3 backup not set up',
  'Le serveur est vide : rien à sauvegarder pour l’instant': 'The server is empty: nothing to back up yet',
  'Une restauration est en cours : la sauvegarde attendra': 'A restore is under way: the backup will wait',
  'Seafile n’est pas relié': 'Seafile is not connected',
  'Une restauration est déjà en cours': 'A restore is already under way',
  'Mode de restauration inconnu': 'Unknown restore mode',
  'Sauvegarde inconnue': 'Unknown backup',
  'Archive trop grosse pour être envoyée d’ici : restaurez-la depuis le web ou depuis S3': 'Archive too big to send from here: restore it from the web or from S3',
  'Archive vide': 'Empty archive',

  // Settings and their checks
  'Ce jeton est en lecture seule : il faut la lecture et l’écriture': 'This token is read-only: it needs read and write access',
  'Cette adresse ne répond pas comme un serveur Seafile': 'This address does not answer like a Seafile server',
  'Modèle inconnu': 'Unknown model',
  'Budget invalide': 'Invalid budget',
  'Clé invalide': 'Invalid key',
  'Adresse du service S3 invalide': 'Invalid S3 service address',
  'Région invalide': 'Invalid region',
  'Nom de bucket invalide': 'Invalid bucket name',
  'Dossier dans le bucket invalide': 'Invalid folder in the bucket',
  'Clé d’accès invalide': 'Invalid access key',
  'Clé secrète invalide': 'Invalid secret key',
  'Fréquence inconnue': 'Unknown frequency',
  'Nombre de sauvegardes invalide': 'Invalid number of backups',
  'Clé secrète manquante': 'Secret key missing',
  'Renseignez l’adresse du service, la région, le bucket et la clé d’accès': 'Fill in the service address, the region, the bucket and the access key',
  'Renseignez d’abord le stockage S3': 'Set up the S3 storage first',
  'Drive inconnu': 'Unknown drive',
  'Adresse Seafile invalide': 'Invalid Seafile address',
  'Jeton invalide': 'Invalid token',
  'Choisissez un dossier de la bibliothèque (pas sa racine)': 'Choose a folder in the library (not its root)',
  'Renseignez l’adresse de Seafile et le jeton de la bibliothèque': 'Fill in the Seafile address and the library token',
  'Clé refusée par Anthropic': 'Key refused by Anthropic',
  'Impossible de vérifier la clé auprès d’Anthropic': 'Could not check the key with Anthropic',
  'Ce jeton ouvre une autre bibliothèque : désactivez d’abord Seafile pour rapatrier vos fichiers': 'This token opens another library: turn Seafile off first to bring your files back',

  // S3
  'Stockage S3 injoignable': 'S3 storage unreachable',
  'Bucket introuvable': 'Bucket not found',
  'Clés refusées par S3': 'Keys refused by S3',
  'Mauvaise région pour ce bucket': 'Wrong region for this bucket',
  'Accès refusé par S3 : vérifiez les droits de la clé': 'Access denied by S3: check the key’s permissions',

  // Seafile
  'Seafile injoignable': 'Seafile unreachable',
  'Jeton refusé par Seafile': 'Token refused by Seafile',
  'Quota Seafile dépassé': 'Seafile quota exceeded',
  'Introuvable dans Seafile': 'Not found in Seafile',

  // Backups
  'Interrompue : le serveur s’est arrêté': 'Interrupted: the server stopped',
  'L’horloge du serveur semble en retard : les anciennes sauvegardes sont gardées': 'The server’s clock seems to be behind: the older backups are kept',
  'Erreur du serveur pendant la sauvegarde (voir ses journaux)': 'Server error during the backup (see its logs)',
  'Les réglages S3 ont changé pendant la sauvegarde : elle reprendra au prochain essai': 'The S3 settings changed during the backup: it will resume on the next try',

  // Restores
  'Interrompue : le serveur s’est arrêté. Relancez la restauration pour finir.': 'Interrupted: the server stopped. Start the restore again to finish.',
  'Archive illisible : ce n’est pas une sauvegarde .tar.gz': 'Unreadable archive: not a .tar.gz backup',
  'La restauration a échoué': 'The restore failed',
  [`${SUITE_SLUG}.json trop gros`]: `${SUITE_SLUG}.json too big`,
  [`${SUITE_SLUG}.json illisible`]: `${SUITE_SLUG}.json unreadable`,
  [`Archive sans ${SUITE_SLUG}.json : ce n’est pas une sauvegarde faite par ${SUITE_NAME}`]: `Archive without ${SUITE_SLUG}.json: not a backup made by ${SUITE_NAME}`,
  'Sauvegarde faite par une version plus récente du serveur': 'Backup made by a newer version of the server',
  'Budget mensuel atteint': 'Monthly budget reached',
  'Claude a mis trop de temps': 'Claude took too long',

  // Claude's answers
  'Délai dépassé (Claude)': 'Timed out (Claude)',
  'API Claude injoignable': 'Claude API unreachable',
  'Limite de l’API Claude atteinte': 'Claude API limit reached',
  'Clé API refusée': 'API key refused',
  'Accès à l’API Claude refusé': 'Access to the Claude API denied',
  'Modèle Claude introuvable': 'Claude model not found',
  'Claude est surchargé': 'Claude is overloaded',
  'Erreur du service Claude': 'Claude service error',
  'Crédit API épuisé': 'API credit used up',
  'Erreur de l’analyse': 'Analysis error',
  'Analyse refusée par Claude': 'Analysis refused by Claude',
  'Réponse de Claude incomplète': 'Incomplete answer from Claude',
  'Analyse trop longue': 'Analysis too long',
  'Réponse de Claude illisible': 'Unreadable answer from Claude',
};
