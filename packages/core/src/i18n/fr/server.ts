/** French for the server’s own messages the apps show (sync, files, settings, backups, Claude’s answers). Keys are the English exactly as written in `t()` / `tx()`, single-quoted, one per line. */
import { APPS, READY_APPS, SUITE_NAME, SUITE_SLUG } from '../../apps';
import type { Dictionary } from '..';

export const FR_SERVER: Dictionary = {
  // Routes
  'Download link expired': 'Lien de téléchargement expiré',
  'Invalid request': 'Requête invalide',
  'The Administration is not available on this server': 'L’administration n’est pas disponible sur ce serveur',
  'S3 backup not set up': 'Sauvegarde S3 non configurée',
  'The server is empty: nothing to back up yet': 'Le serveur est vide : rien à sauvegarder pour l’instant',
  'A restore is under way: the backup will wait': 'Une restauration est en cours : la sauvegarde attendra',
  'Seafile is not connected': 'Seafile n’est pas relié',
  'A restore is already under way': 'Une restauration est déjà en cours',
  'Unknown restore mode': 'Mode de restauration inconnu',
  'Unknown backup': 'Sauvegarde inconnue',
  'Archive too big to send from here: restore it from the web or from S3': 'Archive trop grosse pour être envoyée d’ici : restaurez-la depuis le web ou depuis S3',
  'Empty archive': 'Archive vide',
  // The routes of an app turned off in the Administration.
  ...Object.fromEntries(READY_APPS.map(id => [`${APPS[id].name} n’est pas activé sur ce serveur`, `${APPS[id].name} is not turned on on this server`])),
  'This link has not reached the server yet: try again in a moment': 'Ce lien n’est pas encore arrivé sur le serveur : réessayez dans un instant',

  // Settings and their checks
  'Unknown app, or not available yet': 'Application inconnue ou pas encore disponible',
  'Keep at least one app': 'Gardez au moins une application',
  'This token is read-only: it needs read and write access': 'Ce jeton est en lecture seule : il faut la lecture et l’écriture',
  'This address does not answer like a Seafile server': 'Cette adresse ne répond pas comme un serveur Seafile',
  'Unknown model': 'Modèle inconnu',
  'Invalid budget': 'Budget invalide',
  'Invalid key': 'Clé invalide',
  'Invalid S3 service address': 'Adresse du service S3 invalide',
  'Invalid region': 'Région invalide',
  'Invalid bucket name': 'Nom de bucket invalide',
  'Invalid folder in the bucket': 'Dossier dans le bucket invalide',
  'Invalid access key': 'Clé d’accès invalide',
  'Invalid secret key': 'Clé secrète invalide',
  'Unknown frequency': 'Fréquence inconnue',
  'Invalid number of days to keep': 'Durée de conservation invalide',
  'Unknown storage class': 'Classe de stockage inconnue',
  'Secret key missing': 'Clé secrète manquante',
  'Fill in the service address, the region, the bucket and the access key': 'Renseignez l’adresse du service, la région, le bucket et la clé d’accès',
  'Set up the S3 storage first': 'Renseignez d’abord le stockage S3',
  'Unknown drive': 'Drive inconnu',
  'Invalid Seafile address': 'Adresse Seafile invalide',
  'Invalid token': 'Jeton invalide',
  'Choose a folder in the library (not its root)': 'Choisissez un dossier de la bibliothèque (pas sa racine)',
  'Fill in the Seafile address and the library token': 'Renseignez l’adresse de Seafile et le jeton de la bibliothèque',
  'Key refused by Anthropic': 'Clé refusée par Anthropic',
  'Could not check the key with Anthropic': 'Impossible de vérifier la clé auprès d’Anthropic',
  'This token opens another library: turn Seafile off first to bring your files back': 'Ce jeton ouvre une autre bibliothèque : désactivez d’abord Seafile pour rapatrier vos fichiers',

  // S3
  'S3 storage unreachable': 'Stockage S3 injoignable',
  'Bucket not found': 'Bucket introuvable',
  'This storage does not offer this class': 'Ce stockage ne propose pas cette classe',
  'This backup is in Glacier: it has been asked out, try again in a few hours': 'Cette sauvegarde est dans Glacier : sa sortie est demandée, réessayez dans quelques heures',
  'Keys refused by S3': 'Clés refusées par S3',
  'Wrong region for this bucket': 'Mauvaise région pour ce bucket',
  'Access denied by S3: check the key’s permissions': 'Accès refusé par S3 : vérifiez les droits de la clé',

  // Seafile
  'Seafile unreachable': 'Seafile injoignable',
  'Token refused by Seafile': 'Jeton refusé par Seafile',
  'Seafile quota exceeded': 'Quota Seafile dépassé',
  'Not found in Seafile': 'Introuvable dans Seafile',

  // Backups
  'Interrupted: the server stopped': 'Interrompue : le serveur s’est arrêté',
  'The server’s clock seems to be behind: the older backups are kept': 'L’horloge du serveur semble en retard : les anciennes sauvegardes sont gardées',
  'Server error during the backup (see its logs)': 'Erreur du serveur pendant la sauvegarde (voir ses journaux)',
  'The S3 settings changed during the backup: it will resume on the next try': 'Les réglages S3 ont changé pendant la sauvegarde : elle reprendra au prochain essai',

  // Restores
  'Interrupted: the server stopped. Start the restore again to finish.': 'Interrompue : le serveur s’est arrêté. Relancez la restauration pour finir.',
  'Unreadable archive: not a .tar.gz backup': 'Archive illisible : ce n’est pas une sauvegarde .tar.gz',
  'The restore failed': 'La restauration a échoué',
  [`${SUITE_SLUG}.json too big`]: `${SUITE_SLUG}.json trop gros`,
  [`${SUITE_SLUG}.json unreadable`]: `${SUITE_SLUG}.json illisible`,
  [`Archive without ${SUITE_SLUG}.json: not a backup made by ${SUITE_NAME}`]: `Archive sans ${SUITE_SLUG}.json : ce n’est pas une sauvegarde faite par ${SUITE_NAME}`,
  'Backup made by a newer version of the server': 'Sauvegarde faite par une version plus récente du serveur',
  'Monthly budget reached': 'Budget mensuel atteint',
  'Claude took too long': 'Claude a mis trop de temps',

  // Claude's answers
  'Timed out (Claude)': 'Délai dépassé (Claude)',
  'Claude API unreachable': 'API Claude injoignable',
  'Claude API limit reached': 'Limite de l’API Claude atteinte',
  'API key refused': 'Clé API refusée',
  'Access to the Claude API denied': 'Accès à l’API Claude refusé',
  'Claude model not found': 'Modèle Claude introuvable',
  'Claude is overloaded': 'Claude est surchargé',
  'Claude service error': 'Erreur du service Claude',
  'API credit used up': 'Crédit API épuisé',
  'Analysis error': 'Erreur de l’analyse',
  'Analysis refused by Claude': 'Analyse refusée par Claude',
  'Incomplete answer from Claude': 'Réponse de Claude incomplète',
  'Analysis too long': 'Analyse trop longue',
  'Unreadable answer from Claude': 'Réponse de Claude illisible',
  // The server's own messages, composed in French on the server (backups, the drive).
  'unreadable file': 'fichier illisible',
  'unreadable files': 'fichiers illisibles',
  'file not found': 'fichier introuvable',
  'files not found': 'fichiers introuvables',
  'file has': 'fichier n’a',
  'files have': 'fichiers n’ont',
};
