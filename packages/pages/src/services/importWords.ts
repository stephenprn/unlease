/**
 * The words of Pages' import wizard both clients show (`services/importing` reads and plans; the
 * web's `PagesImport` and the phone's `PagesImport` lay these out), so the two read alike. What
 * only one client says (a folder chosen whole on the web, one file at a time on the phone) is its own.
 */
import { localized, t, tx } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';

export const PAGES_IMPORT_WORDS = localized({
  title: tx('Vos pages Notion ou Markdown'),
  lead: tx('Chaque page devient une page, chaque sous-page une sous-page : l’arborescence est gardée, avec ses images et ses fichiers.'),
  fromNotion: tx('Depuis Notion'),
  fromMarkdown: tx('Depuis Obsidian ou des fichiers Markdown'),
  previewLead: tx('Rien n’est encore écrit. Voici chaque page à sa place, ce qu’elle contient et ce qu’elle deviendra ; décochez une page pour la laisser de côté avec ses sous-pages.'),
  pages: tx('Les pages de l’export'),
  readNotion: tx('Un export de Notion : les titres sans leur identifiant, les bases de données en tableaux.'),
  readMarkdown: tx('Des fichiers Markdown : chaque note titrée par son nom, chaque dossier en page.'),
  noPages: tx('Aucune page là-dedans : ni fichier Markdown, ni tableau CSV.'),
  where: tx('Où mettre les pages'),
  whereMeta: tx('Une page déjà là, au même endroit et au même titre, est gardée telle quelle : seules ses sous-pages nouvelles s’y ajoutent.'),
  underNew: tx('Sous une nouvelle page'),
  top: tx('En haut de l’arborescence'),
  topMeta: tx('Les pages du haut de l’export rejoignent celles de l’accueil.'),
  inside: tx('Dans une page existante'),
  insideNone: tx('Choisissez la page juste après.'),
  containerName: tx('Nom de la nouvelle page'),
  pick: tx('Choisir la page'),
  change: tx('Changer de page'),
  pickTitle: tx('Importer dans'),
  keep: tx('Garder hors de Claude'),
  keepMeta: tx('Ni ces pages ni leurs sous-pages ne seront envoyées à Claude avec une question. Chacune se rouvre ensuite à Claude depuis son menu.'),
  writing: tx('Écriture des pages…'),
  open: tx('Ouvrir les pages'),
  doneLead: tx('Tout ce qui vient d’arriver peut repartir d’un coup : « Annuler » sur le message.'),
  unreadable: tx('Lecture impossible : réessayez, ou importez les fichiers un par un.'),
});

/** How to get Notion's export, step by step. */
export function notionSteps(): string[] {
  return [
    t('Dans Notion, ouvrez Paramètres › Exporter tout le contenu de l’espace de travail, ou, pour une page et ses sous-pages, son menu ••• › Exporter.'),
    t('Choisissez le format « Markdown & CSV », incluez les sous-pages et cochez « Créer des dossiers pour les sous-pages ».'),
    t('Téléchargez l’archive .zip que Notion prépare, puis importez-la ici telle quelle.'),
  ];
}

/** The new page's choice, what it does said under it. */
export function underNewMeta(title: string): string {
  return t('« {title} », en haut de l’arborescence : tout ce qui arrive reste ensemble.', { title });
}

/** The page chosen to import into, said under its choice. */
export function insideMeta(page: string | null): string {
  return page ? t('Dans « {page} », après ce qu’elle contient.', { page }) : PAGES_IMPORT_WORDS.insideNone;
}

/** The import's foot button, counted. */
export function importPagesAction(count: number): string {
  return count > 0 ? t('Importer {pages}', { pages: plural(count, 'page') }) : t('Importer');
}
