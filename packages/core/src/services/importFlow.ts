/**
 * Every app's import is the same way through, on both clients (Carnet's Keep archive, Contacts' vCard
 * or the phone's book, Agenda's `.ics`, Pages' Notion export or Markdown), and the first run offers
 * it once (`setup.ts`, the `import` step) for an app that holds nothing yet:
 *
 * 1. `source`: where it comes from, the steps to get the file, the file picked or dropped, read.
 * 2. `preview`: what the file holds, counted, then every item listed with what will become of it
 *    (`ImportFate`), filtered by fate or found by its words, a page at a time.
 * 3. `choices`: what the person decides (the app's own: what Keep's link notes become, a label for
 *    the events brought, where Notion's pages go), each choice with its default and its cost.
 * 4. `import`: written as one batch, its files after, counted as they go; then what came in and
 *    what was left out, and the way back where the app has one (an import taken back on its slip).
 *
 * Nothing is written before « Importer ». The app's package reads the file and plans the records;
 * this holds the words and the list's filtering, shared so the four wizards read alike.
 */
import { localized, t, tx } from '../i18n';
import { plural } from './format';
import { foldText } from './search';

export const IMPORT_STEPS = ['source', 'preview', 'choices', 'import'] as const;
export type ImportStep = (typeof IMPORT_STEPS)[number];

/** Each step's name in the trail, short. */
export const IMPORT_STEP_NAMES: Readonly<Record<ImportStep, string>> = localized({
  source: tx('Source'),
  preview: tx('Aperçu'),
  choices: tx('Choix'),
  import: tx('Import'),
});

/** "Étape 2 sur 4", read out under the trail. */
export function importProgress(step: ImportStep): string {
  return t('Étape {step} sur {count}', { step: IMPORT_STEPS.indexOf(step) + 1, count: IMPORT_STEPS.length });
}

/** The step before (itself at the start). */
export function previousImportStep(step: ImportStep): ImportStep {
  return IMPORT_STEPS[Math.max(0, IMPORT_STEPS.indexOf(step) - 1)]!;
}

/** The step after (itself at the end). */
export function nextImportStep(step: ImportStep): ImportStep {
  return IMPORT_STEPS[Math.min(IMPORT_STEPS.length - 1, IMPORT_STEPS.indexOf(step) + 1)]!;
}

/**
 * What becomes of one item: added (`new`), here already and completed with what it lacked
 * (`update`), here already with nothing to add (`same`), or left out (`skip`, its reason said).
 */
export const IMPORT_FATES = ['new', 'update', 'same', 'skip'] as const;
export type ImportFate = (typeof IMPORT_FATES)[number];

/** A fate's name on its tag and its filter chip. */
export const IMPORT_FATE_NAMES: Readonly<Record<ImportFate, string>> = localized({
  new: tx('Nouveau'),
  update: tx('Complété'),
  same: tx('Déjà là'),
  skip: tx('Laissé de côté'),
});

/** One item of the preview's list: what it is, what becomes of it. */
export interface PreviewEntry {
  /** Unique in the list. */
  readonly key: string;
  readonly title: string;
  /** Its second line: what it holds (« 12 éléments, 2 photos », a date, a number). */
  readonly detail: string;
  readonly fate: ImportFate;
  /** Why it is left out, or what it gains (« Ajoute 2 numéros »); shown under the detail. */
  readonly why?: string;
  /** Its glyph's name (the design system's). */
  readonly glyph: string;
  /** A third line the app adds (a Keep list's lines without a link, a series' repeat). */
  readonly note?: string;
}

/** How many entries the list shows at first, and adds at each « Afficher plus ». */
export const PREVIEW_PAGE = 40;

/** The entries of one fate (all: null) whose words hold the query, in their order. */
export function filterPreview(entries: readonly PreviewEntry[], fate: ImportFate | null, query: string): PreviewEntry[] {
  const folded = foldText(query.trim());
  return entries.filter(entry => (fate === null || entry.fate === fate) && (!folded || foldText(`${entry.title} ${entry.detail} ${entry.note ?? ''}`).includes(folded)));
}

/** How many entries each fate holds, those with none left out, in the fates' order. */
export function fateCounts(entries: readonly PreviewEntry[]): { readonly fate: ImportFate; readonly count: number }[] {
  const counts = new Map<ImportFate, number>();
  for (const entry of entries) counts.set(entry.fate, (counts.get(entry.fate) ?? 0) + 1);
  return IMPORT_FATES.filter(fate => counts.has(fate)).map(fate => ({ fate, count: counts.get(fate)! }));
}

/** « Afficher 40 de plus », or the rest when fewer remain. */
export function showMoreWords(shown: number, total: number): string {
  return t('Afficher {count} de plus', { count: Math.min(PREVIEW_PAGE, total - shown) });
}

/** The list's foot while it is cut: how many are shown of how many. */
export function shownOfWords(shown: number, total: number): string {
  return t('{shown} sur {total}', { shown: Math.min(shown, total), total });
}

/** What a filter that keeps nothing says. */
export function previewEmptyWords(query: string): string {
  return query.trim() ? t('Rien ne correspond à « {query} ».', { query: query.trim() }) : t('Rien dans ce filtre.');
}

/** The import's foot button, counted when it can be. */
export function importAction(count: number | null): string {
  return count === null ? t('Importer') : count > 0 ? t('Importer {items}', { items: plural(count, 'élément') }) : t('Importer');
}

/** The words of the steps every app shares. */
export const IMPORT_WORDS = localized({
  sourceTitle: tx('D’où viennent vos données'),
  previewTitle: tx('Ce que contient le fichier'),
  previewLead: tx('Rien n’est encore écrit. Voici ce que deviendra chaque élément ; filtrez ou cherchez pour vérifier.'),
  choicesTitle: tx('Vos choix'),
  choicesLead: tx('Ce que l’import fait de ce qui demande un choix. Les réglages proposés conviennent le plus souvent.'),
  importingTitle: tx('Import en cours'),
  importingLead: tx('Gardez cette page ouverte jusqu’à la fin.'),
  doneTitle: tx('Import terminé'),
  skipped: tx('Laissé de côté'),
  nothingNew: tx('Rien de nouveau à importer.'),
  allFates: tx('Tout'),
  search: tx('Chercher dans l’aperçu'),
  another: tx('Importer un autre fichier'),
  change: tx('Choisir un autre fichier'),
  private: tx('Rien n’est envoyé ailleurs que sur votre serveur.'),
  privateLocal: tx('Rien ne quitte cet appareil.'),
});

/** The setup's import step, an app's source named (« Google Keep »). */
export function setupImportLead(source: string): string {
  return t('Vous arrivez de {source} ? Importez vos données maintenant, ou plus tard depuis les Réglages. Rien n’est écrit avant que vous ayez tout vu.', { source });
}

/** The progress line while files go up: « Photos : 12 sur 40 ». */
export function importFilesProgress(done: number, total: number): string {
  return t('Photos et fichiers : {done} sur {total}', { done, total });
}
