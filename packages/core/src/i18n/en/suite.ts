/** English for the suite's own words (`apps`, `appWords`, the first run's `services/setup`). Keys are the French exactly as written in `t()` / `tx()`, single-quoted, one per line. */
import type { Dictionary } from '..';

export const EN_SUITE: Dictionary = {
  // The apps
  'Notes, listes et liens': 'Notes, lists and links',
  'Vos notes, listes de courses, dessins et rappels, et des collections de liens que Claude lit et range pour vous.': 'Your notes, shopping lists, drawings and reminders, and collections of links Claude reads and sorts for you.',
  'Remplace Google Keep': 'Replaces Google Keep',
  'Pages et wiki': 'Pages and wiki',
  'Des pages imbriquées, des tableaux et des colonnes pour vos projets, votre wiki ou vos voyages ; elles citent vos notes et vos collections.': 'Nested pages, tables and columns for your projects, your wiki or your trips; they cite your notes and collections.',
  'Remplace Google Docs et Notion': 'Replaces Google Docs and Notion',
  'Agenda': 'Calendar',
  'Vos rendez-vous, les anniversaires de vos contacts, les jours fériés et les agendas auxquels vous êtes abonné, sur tous vos appareils.': 'Your appointments, your contacts’ birthdays, public holidays and the calendars you subscribe to, on all your devices.',
  'Remplace Google Agenda': 'Replaces Google Calendar',
  // eslint-disable-next-line no-restricted-syntax -- « carnet d’adresses » is the French for an address book, not the app.
  'Carnet d’adresses': 'Address book',
  'Vos contacts, leurs anniversaires et leurs adresses, sur tous vos appareils.': 'Your contacts, their birthdays and addresses, on all your devices.',
  'Remplace Google Contacts': 'Replaces Google Contacts',
  'Rechercher dans vos notes': 'Search your notes',
  'Rechercher dans vos pages': 'Search your pages',
  'Rechercher dans votre agenda': 'Search your calendar',
  'Rechercher dans vos contacts': 'Search your contacts',
  'Cherchez les mots d’une note, d’une liste ou d’un lien de vos collections, sans tenir compte des accents.': 'Search the words of a note, a list or a link in your collections, accents or not.',
  'Cherchez le titre ou les mots d’une page, sans tenir compte des accents.': 'Search the title or the words of a page, accents or not.',
  'Cherchez un titre, un lieu, une description ou un libellé.': 'Search a title, a place, a description or a label.',
  'Cherchez un nom, une entreprise, un numéro, un e-mail, une adresse ou un libellé.': 'Search a name, a company, a number, an email, an address or a label.',
  'Langue de l’interface et des lectures': 'Language of the app and of link readings',
  'Les écrans de l’application, et ce que Claude écrit quand il lit un lien enregistré depuis cet appareil : titre, résumé, détails. Un lien déjà lu garde sa langue ; « Relire la page » le relit dans celle-ci.':
    'The app’s screens, and what Claude writes when it reads a link saved from this device: title, summary, details. A link already read keeps its language; “Read the page again” reads it in this one.',
  'Les écrans de l’application, et la langue dans laquelle Claude répond aux questions posées depuis cet appareil.': 'The app’s screens, and the language Claude answers questions asked from this device in.',
  'Les écrans de l’application, les jours, les mois et les rappels.': 'The app’s screens, the days, the months and the reminders.',
  'Les écrans de l’application, les dates et les rappels.': 'The app’s screens, the dates and the reminders.',
  'Les écrans de l’application et les dates écrites dans les pages.': 'The app’s screens and the dates written in pages.',
  'Les écrans de l’application, les dates et les noms des types de numéros.': 'The app’s screens, dates, and the names of number types.',
  'Bientôt disponible': 'Coming soon',
  'Claude': 'Claude',

  // The first run
  'Vos notes, vos pages, vos contacts et votre agenda, sur votre propre serveur.': 'Your notes, your pages, your contacts and your calendar, on your own server.',
  'Vos applications': 'Your apps',
  'Applications': 'Apps',
  'Choisissez ce que votre serveur fait tourner. Les applications partagent vos réglages, votre apparence et vos données ; vous en ajouterez ou en retirerez plus tard dans l’Administration.':
    'Choose what your server runs. The apps share your settings, your look and your data; you can add or remove some later in Administration.',
  'Ce que votre serveur peut faire de plus, réglé une fois pour toutes les applications. Tout est facultatif, et se règle aussi plus tard dans l’Administration.':
    'What more your server can do, set once for every app. All of it is optional, and can also be set later in Administration.',
  'Les couleurs et le fond des applications sur cet appareil. Gardez ceux d’origine ou choisissez les vôtres : ils se changent ensuite dans les Réglages.':
    'The apps’ colours and background on this device. Keep the original ones or choose your own: you can change them later in Settings.',
  'L’adresse où vous avez installé {suite}, par exemple https://{slug}.exemple.fr.': 'The address where you installed {suite}, for example https://{slug}.example.org.',
  'L’adresse de cette page : c’est votre serveur qui la sert.': 'This page’s address: your server is serving it.',
  'La valeur de UNLEASE_TOKEN, dans le fichier .env posé à côté de docker-compose.yml sur votre serveur.': 'The value of UNLEASE_TOKEN, in the .env file next to docker-compose.yml on your server.',
  'Votre serveur est vide. S’il en remplace un autre, restaurez sa dernière sauvegarde : les données de toutes les applications reviennent de S3, les fichiers de Seafile. Sinon, commencez à neuf.':
    'Your server is empty. If it replaces another one, restore its latest backup: every app’s data comes back from S3, the files from Seafile. Otherwise, start afresh.',
  'Les données de la sauvegarde sont revenues sur ce serveur. Vous pouvez en restaurer une autre, ou continuer.': 'The backup’s data is back on this server. You can restore another one, or carry on.',
  'Facultatif : une clé Claude, partagée par toutes les applications. Une clé se crée sur console.anthropic.com, rubrique API Keys ; le budget mensuel arrête tout une fois atteint.':
    'Optional: a Claude key, shared by every app. Create one on console.anthropic.com, under API Keys; the monthly budget stops everything once reached.',
  'Une copie des données de toutes les applications loin de chez vous, chez Scaleway, OVH, AWS… et de vos photos et fichiers, sauf si Seafile les garde. La clé se crée dans la console de votre fournisseur (clés d’accès, ou IAM) ; elle est vérifiée (lecture, écriture, suppression) puis gardée sur votre serveur.':
    'A copy of every app’s data away from home, at Scaleway, OVH, AWS… and of your photos and files, unless Seafile keeps them. Create the key in your provider’s console (access keys, or IAM); it is checked (read, write, delete) then kept on your server.',
  'Facultatif : les photos, vidéos et documents de toutes les applications rangés dans un dossier Seafile, chacune dans le sien ; le serveur n’en garde que des aperçus. Sans Seafile, il les garde, et la sauvegarde S3 en a une copie.':
    'Optional: every app’s photos, videos and documents filed in a Seafile folder, each app in its own; the server keeps only previews. Without Seafile, it keeps them, and the S3 backup has a copy.',
  'Facultatif, pour les collections de films et de séries : votre Seerr (Jellyseerr, Overseerr), pour demander un titre depuis son lien. Sa clé API est dans Seerr, Réglages, Général.':
    'Optional, for collections of films and series: your Seerr (Jellyseerr, Overseerr), to request a title from its link. Its API key is in Seerr, Settings, General.',
  '{app} : chaque lien enregistré est lu (titre, prix, résumé, images) et rangé dans la bonne collection.': '{app}: each saved link is read (title, price, summary, pictures) and filed in the right collection.',
  '{app} : des questions sur vos pages, auxquelles Claude répond en citant les passages.': '{app}: questions about your pages, which Claude answers citing the passages.',
  '{app} : un événement tapé en quelques mots, un événement tiré d’un lien enregistré, des questions sur votre agenda.': '{app}: an event typed in a few words, an event drawn from a saved link, questions about your calendar.',
  'Claude {model}, pour toutes les applications': 'Claude {model}, for every app',
  'Lire vos liens, répondre sur vos pages.': 'Read your links, answer about your pages.',
  'Utiliser la connexion de {app}': 'Use {app}’s connection',
  '{app} est déjà relié à {server} sur ce téléphone.': '{app} is already connected to {server} on this phone.',
  'Les couleurs de {app} sur ce téléphone, reprises ici.': 'The colours of {app} on this phone, taken up here.',
  '{app} n’est pas activé sur ce serveur': '{app} is not turned on on this server',
  'Votre serveur ne fait pas tourner {app} pour l’instant. Activez-le pour l’utiliser ici : rien d’autre ne change, et ses données sont gardées même désactivé.':
    'Your server doesn’t run {app} for now. Turn it on to use it here: nothing else changes, and its data is kept even while it is off.',
  'Activer {app}': 'Turn on {app}',
  'Il faut activer {app} sur le serveur': '{app} must be turned on on the server',
};
