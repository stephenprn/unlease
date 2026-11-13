/**
 * « Ce que Claude relève », on both clients: a collection's facts (Claude's usual ones, or its own),
 * the usual facts of each kind, the overview that lists them, and what a link says once its facts
 * changed. A fact is « une information » in French, "a fact" in English. The editors' own lines are
 * `webTemplates`' and `phoneTemplates`'.
 */
import type { Dictionary } from '@unlease/core/i18n';

export const FR_FACTS: Dictionary = {
  // Its name, everywhere: a collection's menu, a link's, the Administration, the search.
  'Facts Claude notes': 'Ce que Claude relève',
  'What Claude notes on each link it reads': 'Ce que Claude relève sur chaque lien qu’il lit',
  // A collection's facts: where they come from.
  'Adaptive facts': 'Informations adaptatives',
  'Claude picks them by each link’s kind: a product’s brand, a film’s director…': 'Claude les choisit selon le type de chaque lien : la marque d’un produit, le réalisateur d’un film…',
  'Custom facts': 'Informations personnalisées',
  'The ones you choose, the same on every link here.': 'Celles que vous choisissez, les mêmes sur chaque lien d’ici.',
  'On the links in {collection}': 'Sur les liens de {collection}',
  'Kinds of link here': 'Types de liens ici',
  'Its links have no kind yet: Claude gives one to each link it reads.': 'Ses liens n’ont pas encore de type : Claude en donne un à chaque lien qu’il lit.',
  'Also noted on the links in {collections}.': 'Aussi relevées sur les liens de {collections}.',
  // The facts, as a list.
  'Facts': 'Informations',
  'Add a fact': 'Ajouter une information',
  'Edit the fact': 'Modifier l’information',
  '{count} facts at most.': '{count} informations au plus.',
  'No facts: Claude will only note the title, the summary and the price.': 'Aucune information : Claude ne relèvera que le titre, le résumé et le prix.',
  'Name of the fact': 'Nom de l’information',
  'What Claude writes in it': 'Ce que Claude y note',
  'Answer': 'Réponse',
  'Remove the fact': 'Supprimer l’information',
  'Remove “{name}”': 'Supprimer « {name} »',
  '“{name}” removed [field]': '« {name} » supprimée',
  'Unnamed fact': 'Information sans nom',
  'No facts': 'Aucune information',
  'Price, author, address…': 'Prix, auteur, adresse…',
  'For example: the year it came out': 'Par exemple : l’année de sortie',
  'Add “{name}”': 'Ajouter « {name} »',
  '“{name}” added [field]': '« {name} » ajoutée',
  'Name this fact.': 'Nommez cette information.',
  'Another fact has this name.': 'Une autre information porte ce nom.',
  // The usual facts of a kind.
  'Usual facts · {kind}': 'Informations habituelles · {kind}',
  'Claude notes these on every link it recognises as “{kind}”, except in a collection that has its own.': 'Claude les relève sur chaque lien qu’il reconnaît comme « {kind} », sauf dans une collection qui a les siennes.',
  'Claude’s facts restored': 'Informations de Claude rétablies',
  'Restore Claude’s facts': 'Rétablir celles de Claude',
  'Changed': 'Modifiées',
  // The overview.
  'Collections with their own': 'Collections qui ont les leurs',
  'Usual facts, by kind of link': 'Informations habituelles, par type de lien',
  'A collection can have its own: “Facts Claude notes” in its menu.': 'Une collection peut avoir les siennes : « Ce que Claude relève » dans son menu.',
  // Each fact's answer (`TEMPLATE_FIELD_TYPE_ANSWERS`); « un nombre » and « une date » are Carnet's already.
  'a few words': 'quelques mots',
  'a length of time': 'une durée',
  'several values': 'plusieurs valeurs',
  'yes or no': 'oui ou non',
  // Saved, and links read before.
  'Facts saved': 'Informations enregistrées',
  '{links} before this change · about {cost} to read it again': '{links} avant ce changement · environ {cost} pour le relire',
  '{links} before this change · about {cost} to read them again': '{links} avant ce changement · environ {cost} pour les relire',
  'link read': 'lien lu',
  'links read': 'liens lus',
  'Read before its facts last changed.': 'Lu avant le dernier changement de ses informations.',
  'Read again': 'Relire',
  'Read all again': 'Tout relire',
  // « Essayer ».
  'Preview on a link': 'Aperçu sur un lien',
  'See what Claude would note, without saving anything.': 'Voyez ce que Claude relèverait, sans rien enregistrer.',
  // Old addresses of « Modèles de fiche ».
  'This list of facts no longer exists': 'Cette liste d’informations n’existe plus',
  'It was deleted, on this device or another. [template]': 'Elle a été supprimée, sur cet appareil ou sur un autre.',
};
