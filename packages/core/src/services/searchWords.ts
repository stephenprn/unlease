/**
 * The suite's one way of saying what a search found, in every app and on both clients: « Aucun
 * résultat pour « q » » when nothing answers, else the count of results. The field's placeholder is
 * each app's `APP_WORDS[app].search`.
 */
import { t } from '../i18n';
import { plural } from './format';

/**
 * The line over a search's results (or in their place when there are none). Under settings the
 * words found (`settings`), an empty search of the app's own things says « Rien d'autre pour
 * « q » », never « Aucun résultat » under results.
 */
export function searchSummary(query: string, found: number, settings = 0): string {
  if (found > 0) return plural(found, 'result');
  return settings > 0 ? t('Nothing else for “{query}”', { query: query.trim() }) : noResults(query);
}

/** « Aucun résultat pour « q » »: the title of an empty search. */
export function noResults(query: string): string {
  return t('No results for “{query}”', { query: query.trim() });
}
