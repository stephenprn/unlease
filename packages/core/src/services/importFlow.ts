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
  preview: tx('Preview'),
  choices: tx('Choices'),
  import: tx('Import [noun]'),
});

/** "Étape 2 sur 4", read out under the trail. */
export function importProgress(step: ImportStep): string {
  return t('Step {step} of {count}', { step: IMPORT_STEPS.indexOf(step) + 1, count: IMPORT_STEPS.length });
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
  new: tx('New'),
  update: tx('Completed'),
  same: tx('Already here'),
  skip: tx('Left out'),
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
  return t('Show {count} more', { count: Math.min(PREVIEW_PAGE, total - shown) });
}

/** The list's foot while it is cut: how many are shown of how many. */
export function shownOfWords(shown: number, total: number): string {
  return t('{shown} of {total}', { shown: Math.min(shown, total), total });
}

/** What a filter that keeps nothing says. */
export function previewEmptyWords(query: string): string {
  return query.trim() ? t('Nothing matches “{query}”.', { query: query.trim() }) : t('Nothing in this filter.');
}

/** The import's foot button, counted when it can be. */
export function importAction(count: number | null): string {
  return count === null ? t('Import') : count > 0 ? t('Import {items}', { items: plural(count, 'item') }) : t('Import');
}

/** The words of the steps every app shares. */
export const IMPORT_WORDS = localized({
  sourceTitle: tx('Where your data comes from'),
  previewTitle: tx('What the file holds'),
  previewLead: tx('Nothing is written yet. Here is what each item will become; filter or search to check.'),
  choicesTitle: tx('Your choices'),
  choicesLead: tx('What the import does with what needs a choice. The settings offered suit most cases.'),
  importingTitle: tx('Importing'),
  importingLead: tx('Keep this page open until it ends.'),
  doneTitle: tx('Import complete'),
  skipped: tx('Left out'),
  nothingNew: tx('Nothing new to import.'),
  allFates: tx('All'),
  search: tx('Search the preview'),
  another: tx('Import another file'),
  change: tx('Choose another file'),
  private: tx('Nothing is sent anywhere but your server.'),
  privateLocal: tx('Nothing leaves this device.'),
});

/** The setup's import step, an app's source named (« Google Keep »). */
export function setupImportLead(source: string): string {
  return t('Coming from {source}? Import your data now, or later from Settings. Nothing is written before you have seen it all.', { source });
}

/** The progress line while files go up: « Photos : 12 sur 40 ». */
export function importFilesProgress(done: number, total: number): string {
  return t('Photos and files: {done} of {total}', { done, total });
}
