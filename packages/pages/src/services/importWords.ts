/**
 * The words of Pages' import wizard both clients show (`services/importing` reads and plans; the
 * web's `PagesImport` and the phone's `PagesImport` lay these out), so the two read alike. What
 * only one client says (a folder chosen whole on the web, one file at a time on the phone) is its own.
 */
import { localized, t, tx } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';

export const PAGES_IMPORT_WORDS = localized({
  title: tx('Your Notion or Markdown pages'),
  lead: tx('Each page becomes a page, each sub-page a sub-page: the tree is kept, with its pictures and files.'),
  fromNotion: tx('From Notion'),
  fromMarkdown: tx('From Obsidian or Markdown files'),
  previewLead: tx('Nothing is written yet. Here is each page in its place, what it holds and what will become of it; untick a page to leave it out with its sub-pages.'),
  pages: tx('The export’s pages'),
  readNotion: tx('A Notion export: titles without their ids, databases as tables.'),
  readMarkdown: tx('Markdown files: each note titled by its name, each folder a page.'),
  noPages: tx('No page in there: no Markdown file, no CSV table.'),
  where: tx('Where the pages go'),
  whereMeta: tx('A page already here, in the same place with the same title, is kept as it is: only its new sub-pages are added to it.'),
  underNew: tx('Under a new page'),
  top: tx('At the top of the tree'),
  topMeta: tx('The export’s top pages join those on the home.'),
  inside: tx('In an existing page'),
  insideNone: tx('Choose the page right after.'),
  containerName: tx('Name of the new page'),
  pick: tx('Choose the page'),
  change: tx('Change page'),
  pickTitle: tx('Import into'),
  keep: tx('Keep away from Claude'),
  keepMeta: tx('Neither these pages nor their sub-pages will be sent to Claude with a question. Each can be shown to Claude again from its menu.'),
  writing: tx('Writing the pages…'),
  open: tx('Open the pages'),
  doneLead: tx('Everything that just came in can go at once: “Undo” on the message.'),
  unreadable: tx('Couldn’t read it: try again, or import the files one by one.'),
});

/** How to get Notion's export, step by step. */
export function notionSteps(): string[] {
  return [
    t('In Notion, open Settings › Export all workspace content, or, for one page and its sub-pages, its ••• menu › Export.'),
    t('Choose the “Markdown & CSV” format, include sub-pages and tick “Create folders for subpages”.'),
    t('Download the .zip archive Notion prepares, then import it here as it is.'),
    t('To keep the pages’ icons, which the “Markdown & CSV” export leaves out, export as “HTML” too and drop both archives together: only the icons are read from it.'),
  ];
}

/** The new page's choice, what it does said under it. */
export function underNewMeta(title: string): string {
  return t('“{title}”, at the top of the tree: everything that comes in stays together.', { title });
}

/** The page chosen to import into, said under its choice. */
export function insideMeta(page: string | null): string {
  return page ? t('In “{page}”, after what it holds.', { page }) : PAGES_IMPORT_WORDS.insideNone;
}

/** The import's foot button, counted. */
export function importPagesAction(count: number): string {
  return count > 0 ? t('Import {pages}', { pages: plural(count, 'page') }) : t('Import');
}
