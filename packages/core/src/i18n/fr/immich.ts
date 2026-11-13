/** French for Immich, every app's: its Administration section, its setup row, the server's messages about it and the pictures' shared words. Keys are the English exactly as written in `t()` / `tx()`, single-quoted, one per line. */
import type { Dictionary } from '..';

export const FR_IMMICH: Dictionary = {
  // The Administration's section and the setup's row
  'Photos on Immich': 'Photos sur Immich',
  'Immich not linked': 'Immich non relié',
  'Link your Immich to show its albums in pages and give contacts a face it knows.': 'Reliez votre Immich pour montrer ses albums dans les pages et donner aux contacts un visage qu’il connaît.',
  'Optional: your Immich photo library, to show an album or photos in a page and take a contact’s photo from the faces it knows. Create an API key in Immich, Account Settings, API Keys, with album.read, asset.read, asset.view and person.read.': 'Facultatif : votre photothèque Immich, pour montrer un album ou des photos dans une page et prendre la photo d’un contact parmi les visages qu’il connaît. Créez une clé API dans Immich, Paramètres du compte, Clés API, avec album.read, asset.read, asset.view et person.read.',
  'Your albums in pages, faces for your contacts.': 'Vos albums dans les pages, des visages pour vos contacts.',
  'Immich is a photo library you run yourself. Linked here, a page can show one of its albums or photos you pick, and a contact can take its photo from the faces Immich recognised. Your server asks Immich for them: the key never leaves it.': 'Immich est une photothèque que vous hébergez vous-même. Relié ici, une page peut montrer l’un de ses albums ou les photos que vous choisissez, et un contact peut prendre sa photo parmi les visages qu’Immich a reconnus. Votre serveur les demande à Immich : la clé ne le quitte jamais.',
  'Enter your Immich’s address.': 'Saisissez l’adresse de votre Immich.',
  'Immich saved': 'Immich enregistré',
  'Immich linked: its albums show in pages, its faces for contacts.': 'Immich relié : ses albums dans les pages, ses visages pour les contacts.',
  'Immich unlinked': 'Immich délié',
  'Immich linked': 'Immich relié',
  'Pages and Contacts show Immich only once it is linked.': 'Pages et Contacts ne montrent Immich qu’une fois relié.',
  'Unlink Immich': 'Délier Immich',
  'Immich address': 'Adresse d’Immich',
  'In Immich: Account Settings, then API Keys, “New API Key”, with album.read, asset.read, asset.view and person.read. Kept on your server.': 'Dans Immich : Paramètres du compte, puis Clés API, « Nouvelle clé API », avec album.read, asset.read, asset.view et person.read. Gardée sur votre serveur.',
  'Unlink Immich?': 'Délier Immich ?',
  'Pages stop showing its photos and nothing more is taken from it. Photos already given to contacts stay. Nothing changes in Immich.': 'Les pages ne montrent plus ses photos et plus rien n’y est pris. Les photos déjà données aux contacts restent. Rien ne change dans Immich.',
  // The server's messages
  'Immich unreachable': 'Immich injoignable',
  'Invalid Immich address': 'Adresse Immich invalide',
  'Enter Immich’s address': 'Saisissez l’adresse d’Immich',
  'Paste an Immich API key': 'Collez une clé API Immich',
  'This address does not answer like an Immich server': 'Cette adresse ne répond pas comme un serveur Immich',
  'This address redirects elsewhere: give the one Immich answers on': 'Cette adresse renvoie ailleurs : donnez celle où Immich répond',
  'API key refused by Immich': 'Clé API refusée par Immich',
  'This API key lacks a permission: give it album.read, asset.read, asset.view and person.read': 'Il manque une permission à cette clé API : donnez-lui album.read, asset.read, asset.view et person.read',
  'Immich answered with an error': 'Immich a répondu par une erreur',
  'Immich is not linked: add it in Administration.': 'Immich n’est pas relié : ajoutez-le dans l’administration.',
  'Not found in Immich': 'Introuvable dans Immich',
  // Pictures, wherever they show
  'Reading Immich…': 'Lecture d’Immich…',
  'Photos from Immich': 'Photos d’Immich',
  'Open in Immich': 'Ouvrir dans Immich',
  'photo': 'photo',
  'photos': 'photos',
};
