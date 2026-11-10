/**
 * « Ce que Claude relève », on both clients: a collection's facts (Claude's usual ones, or its own),
 * the usual facts of each kind, the overview that lists them, and what a link says once its facts
 * changed. A fact is « une information » in French, "a fact" in English. The editors' own lines are
 * `webTemplates`' and `phoneTemplates`'.
 */
import type { Dictionary } from '@unlease/core/i18n';

export const EN_FACTS: Dictionary = {
  // Its name, everywhere: a collection's menu, a link's, the Administration, the search.
  'Ce que Claude relève': 'Facts Claude notes',
  'Ce que Claude relève sur chaque lien qu’il lit': 'What Claude notes on each link it reads',
  // A collection's facts: where they come from.
  'Les informations habituelles': 'Claude’s usual facts',
  'Chaque lien a celles de son type : la marque d’un produit, le réalisateur d’un film…': 'Each link gets those of its kind: a product’s brand, a film’s director…',
  'Les informations de cette collection': 'Facts for this collection',
  'Les mêmes sur chaque lien, celles que vous choisissez.': 'The same on every link here, the ones you choose.',
  'Sur les liens de {collection}': 'On the links in {collection}',
  'Types de liens ici': 'Kinds of link here',
  'Ses liens n’ont pas encore de type : Claude en donne un à chaque lien qu’il lit.': 'Its links have no kind yet: Claude gives one to each link it reads.',
  'Aussi relevées sur les liens de {collections}.': 'Also noted on the links in {collections}.',
  // The facts, as a list.
  'Informations': 'Facts',
  'Ajouter une information': 'Add a fact',
  'Modifier l’information': 'Edit the fact',
  '{count} informations au plus.': '{count} facts at most.',
  'Aucune information : Claude ne relèvera que le titre, le résumé et le prix.': 'No facts: Claude will only note the title, the summary and the price.',
  'Nom de l’information': 'Name of the fact',
  'Ce que Claude y note': 'What Claude writes in it',
  'Réponse': 'Answer',
  'Supprimer l’information': 'Remove the fact',
  'Information sans nom': 'Unnamed fact',
  'Aucune information': 'No facts',
  'Prix, auteur, adresse…': 'Price, author, address…',
  'Par exemple : l’année de sortie': 'For example: the year it came out',
  'Ajouter « {name} »': 'Add “{name}”',
  '« {name} » ajoutée': '“{name}” added',
  'Nommez cette information.': 'Name this fact.',
  'Une autre information porte ce nom.': 'Another fact has this name.',
  // The usual facts of a kind.
  'Informations habituelles · {kind}': 'Usual facts · {kind}',
  'Claude les relève sur chaque lien qu’il reconnaît comme « {kind} », sauf dans une collection qui a les siennes.':
    'Claude notes these on every link it recognises as “{kind}”, except in a collection that has its own.',
  'Informations de Claude rétablies': 'Claude’s facts restored',
  'Rétablir celles de Claude': 'Restore Claude’s facts',
  'Modifiées': 'Changed',
  // The overview.
  'Collections qui ont les leurs': 'Collections with their own',
  'Informations habituelles, par type de lien': 'Usual facts, by kind of link',
  'Une collection peut avoir les siennes : « Ce que Claude relève » dans son menu.': 'A collection can have its own: “Facts Claude notes” in its menu.',
  // Each fact's answer (`TEMPLATE_FIELD_TYPE_ANSWERS`); « un nombre » and « une date » are Carnet's already.
  'quelques mots': 'a few words',
  'une durée': 'a length of time',
  'plusieurs valeurs': 'several values',
  'oui ou non': 'yes or no',
  // Saved, and links read before.
  'Informations enregistrées': 'Facts saved',
  '{links} avant ce changement · environ {cost} pour le relire': '{links} before this change · about {cost} to read it again',
  '{links} avant ce changement · environ {cost} pour les relire': '{links} before this change · about {cost} to read them again',
  'lien lu': 'link read',
  'liens lus': 'links read',
  'Lu avant le dernier changement de ses informations.': 'Read before its facts last changed.',
  'Relire': 'Read again',
  'Tout relire': 'Read all again',
  // « Essayer ».
  'Aperçu sur un lien': 'Preview on a link',
  'Voyez ce que Claude relèverait, sans rien enregistrer.': 'See what Claude would note, without saving anything.',
  // Old addresses of « Modèles de fiche ».
  'Cette liste d’informations n’existe plus': 'This list of facts no longer exists',
  'Elle a été supprimée, sur cet appareil ou sur un autre.': 'It was deleted, on this device or another.',
};
