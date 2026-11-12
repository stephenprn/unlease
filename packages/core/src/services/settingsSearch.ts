/**
 * The settings a search finds, in every app and on both clients: typing « grain », « budget »,
 * « S3 », « clé », « couleur » or « fond » in an app's search offers the place of Réglages (the
 * device's) or of the Administration (the server's) that holds it, opened in one press.
 *
 * The places every app shares are here (`SHARED_SETTINGS_PLACES`: the device's sections, the
 * Administration's shared ones and what they hold); each app's package brings its own, as it brings
 * its Administration sections (Carnet's board layout and Seerr, Agenda's week, Contacts' order). A
 * place is found by the words of its title in French and in English, whatever the interface's
 * language, then by the section it sits in and its synonyms (written in both languages: never shown),
 * accents and case ignored (`foldText`). A word typed matches a word's start from three letters,
 * a whole word below (« S3 »); its plural matches too.
 */
import type { AppId } from '../apps';
import { inEnglish, t, tx } from '../i18n';
import { foldText } from './search';

/** Réglages, this device's own, or the Administration, the server's for every app. */
export type SettingsArea = 'settings' | 'admin';

export type SettingsClient = 'web' | 'phone';

/**
 * The sections of Réglages every app has, as addresses: the web's `/<app>/settings#language` (and
 * `/<app>/settings/appearance#ground` for the look's, `settingsPageOf`), the phone's `section`. An
 * app's own are its own (`notes`, `calendar`). Never renamed: a search's results point at them.
 */
export const SETTINGS_SECTIONS = { appearance: 'appearance', colors: 'colors', ground: 'ground', language: 'language', data: 'data', import: 'import', erase: 'erase' } as const;

/**
 * Réglages' pages besides its overview: « Apparence », the look's own (the theme and the paper's
 * grain, the colours, the ground), opened from its one row on the overview, as Android's settings
 * give a large group a page of its own; and the two of « Données » that are flows of their own, the
 * import's wizard and « Effacer des données ». The web's `/<app>/settings/appearance`, the phone's
 * screens.
 */
export type SettingsPage = 'appearance' | 'import' | 'erase';

/** The sections on the look's page; the import's and the erase's are pages of their own; every other is on the overview. */
const LOOK_SECTIONS: readonly string[] = [SETTINGS_SECTIONS.appearance, SETTINGS_SECTIONS.colors, SETTINGS_SECTIONS.ground];

/** The page of Réglages a section sits on: « Apparence »'s for the look's, null for the overview. */
export function settingsPageOf(section: string | null): SettingsPage | null {
  if (section === SETTINGS_SECTIONS.import) return 'import';
  if (section === SETTINGS_SECTIONS.erase) return 'erase';
  return section !== null && LOOK_SECTIONS.includes(section) ? 'appearance' : null;
}

/** A page's name, French (`tx`), as a place's second line says where it is. */
const SETTINGS_PAGE_TITLES: Readonly<Record<SettingsPage, string>> = { appearance: tx('Apparence'), import: tx('Importer'), erase: tx('Effacer des données') };

/** A place a search finds. `G` is the glyph's name: the design system's, which the core does not know (each app's package types its own). */
export interface SettingsPlace<G extends string = string> {
  /** Unique within an app's list (a row's key). */
  readonly id: string;
  readonly area: SettingsArea;
  /** Where it lands: a section of Réglages (`SETTINGS_SECTIONS`, an app's own) or of the Administration (`backup`, `seerr`); null for the area's home. */
  readonly section: string | null;
  /** Its name, French (`tx`), translated where shown. */
  readonly title: string;
  /** The section it sits in, French (`tx`), when it is a setting of it rather than the section itself. */
  readonly within: string | null;
  /** Its mark: its own row's glyph where it has one, else its section's. */
  readonly glyph: G;
  /** More words that find it, in French and in English (never shown, never translated). */
  readonly words: readonly string[];
  /** The app whose Réglages or Administration has it; null: every app's. */
  readonly app: AppId | null;
  /** Only on one client (the keyboard's shortcuts on the web, the maps app on the phone). */
  readonly only?: SettingsClient;
}

/** How many a phone's search shows before « Tout voir ». */
export const SETTINGS_SHOWN = 3;

const shared = (place: Omit<SettingsPlace, 'app'>): SettingsPlace => ({ ...place, app: null });

/** Every app's places: Réglages' sections and settings, then the Administration's shared sections and what they hold. */
export const SHARED_SETTINGS_PLACES: readonly SettingsPlace[] = [
  shared({ id: 'settings', area: 'settings', section: null, title: tx('Réglages'), within: null, glyph: 'settings', words: ['parametres', 'preferences', 'options', 'configuration', 'settings', 'preferences'] }),
  shared({ id: 'appearance', area: 'settings', section: SETTINGS_SECTIONS.appearance, title: tx('Apparence'), within: null, glyph: 'palette', words: ['affichage', 'aspect', 'look', 'display', 'style'] }),
  shared({ id: 'theme', area: 'settings', section: SETTINGS_SECTIONS.appearance, title: tx('Thème'), within: tx('Apparence'), glyph: 'moon', words: ['sombre', 'clair', 'nuit', 'jour', 'systeme', 'mode sombre', 'dark', 'light', 'night', 'dark mode', 'light mode', 'system'] }),
  shared({ id: 'paper-grain', area: 'settings', section: SETTINGS_SECTIONS.appearance, title: tx('Grain du papier'), within: tx('Apparence'), glyph: 'note', words: ['texture', 'feuille', 'papier', 'paper', 'sheet', 'noise'] }),
  shared({ id: 'colors', area: 'settings', section: SETTINGS_SECTIONS.colors, title: tx('Couleurs'), within: null, glyph: 'palette', words: ['couleur', 'palette', 'primaire', 'accent', 'teinte', 'color', 'colour', 'primary', 'tint', 'hue'] }),
  shared({ id: 'ground', area: 'settings', section: SETTINGS_SECTIONS.ground, title: tx('Fond'), within: null, glyph: 'image', words: ['fond d’ecran', 'arriere-plan', 'degrade', 'ground', 'wallpaper', 'gradient', 'backdrop'] }),
  shared({ id: 'ground-grain', area: 'settings', section: SETTINGS_SECTIONS.ground, title: tx('Grain sur le fond'), within: tx('Fond'), glyph: 'image', words: ['texture', 'film', 'noise'] }),
  shared({ id: 'services-css', area: 'settings', section: SETTINGS_SECTIONS.ground, title: tx('Habiller vos autres services'), within: tx('Fond'), glyph: 'palette', words: ['css', 'seafile', 'seerr', 'immich', 'theme', 'style', 'skin'] }),
  shared({ id: 'language', area: 'settings', section: SETTINGS_SECTIONS.language, title: tx('Langue'), within: null, glyph: 'globe', words: ['francais', 'anglais', 'traduction', 'french', 'english', 'translation', 'locale'] }),
  // The web's alone: the phone searches by word in the interface's language.
  shared({ id: 'search-languages', area: 'settings', section: SETTINGS_SECTIONS.language, title: tx('Langues des recherches par mot'), within: tx('Langue'), glyph: 'globe', words: ['emoji', 'emojis', 'recherche', 'search'], only: 'web' }),
  shared({ id: 'data', area: 'settings', section: SETTINGS_SECTIONS.data, title: tx('Données'), within: null, glyph: 'download', words: ['import', 'export', 'importer', 'exporter', 'data'] }),
  shared({ id: 'empty-bin', area: 'settings', section: SETTINGS_SECTIONS.data, title: tx('Vider la corbeille'), within: tx('Données'), glyph: 'trash', words: ['poubelle', 'supprimer', 'trash', 'bin', 'empty', 'delete'] }),
  shared({ id: 'shortcuts', area: 'settings', section: SETTINGS_SECTIONS.data, title: tx('Raccourcis clavier'), within: tx('Données'), glyph: 'keyboard', words: ['touches', 'shortcuts', 'keyboard', 'keys', 'hotkeys'], only: 'web' }),
  shared({ id: 'erase', area: 'settings', section: SETTINGS_SECTIONS.erase, title: tx('Effacer des données'), within: tx('Données'), glyph: 'eraser', words: ['effacer', 'tout supprimer', 'remise a zero', 'reinitialiser', 'vider', 'erase', 'delete all', 'wipe', 'reset', 'clear'] }),

  shared({ id: 'admin', area: 'admin', section: null, title: tx('Administration'), within: null, glyph: 'server', words: ['admin', 'server settings'] }),
  shared({ id: 'admin-apps', area: 'admin', section: 'apps', title: tx('Applications'), within: null, glyph: 'apps', words: ['activer', 'desactiver', 'apps', 'enable', 'disable', 'turn on', 'turn off'] }),
  shared({ id: 'admin-server', area: 'admin', section: 'server', title: tx('Serveur'), within: null, glyph: 'server', words: ['adresse', 'jeton', 'connexion', 'connecter', 'relier', 'synchronisation', 'address', 'url', 'token', 'connect', 'sync', 'host', 'version'] }),
  shared({ id: 'admin-claude', area: 'admin', section: 'reading', title: 'Claude', within: null, glyph: 'sparkle', words: ['ia', 'ai', 'anthropic', 'intelligence artificielle', 'artificial intelligence', 'lecture', 'reading'] }),
  shared({ id: 'claude-key', area: 'admin', section: 'reading', title: tx('Clé API Claude'), within: 'Claude', glyph: 'key', words: ['anthropic', 'api key', 'secret'] }),
  shared({ id: 'claude-model', area: 'admin', section: 'reading', title: tx('Modèle'), within: 'Claude', glyph: 'sparkle', words: ['sonnet', 'haiku', 'opus', 'model'] }),
  shared({ id: 'claude-budget', area: 'admin', section: 'reading', title: tx('Budget mensuel'), within: 'Claude', glyph: 'sparkle', words: ['depenses', 'cout', 'prix', 'dollars', 'consommation', 'limite', 'spending', 'cost', 'price', 'usage', 'limit', 'monthly'] }),
  shared({ id: 'admin-backup', area: 'admin', section: 'backup', title: tx('Sauvegarde sur S3'), within: null, glyph: 'cloud', words: ['backup', 'bucket', 'scaleway', 'aws', 'minio', 'glacier', 'copie', 'copy', 'archive'] }),
  shared({ id: 'backup-restore', area: 'admin', section: 'backup', title: tx('Restaurer une sauvegarde'), within: tx('Sauvegarde sur S3'), glyph: 'restore', words: ['restauration', 'recuperer', 'restore', 'recover', 's3'] }),
  shared({ id: 'admin-drive', area: 'admin', section: 'drive', title: tx('Fichiers sur Seafile'), within: null, glyph: 'file', words: ['photos', 'videos', 'documents', 'stockage', 'bibliotheque', 'dossier', 'drive', 'storage', 'library', 'folder'] }),
];

/** The places one app's search finds on one client: every app's, then its own (`own`, from its package). */
export function placesFor<G extends string>(app: AppId, client: SettingsClient, own: readonly SettingsPlace<G>[]): readonly SettingsPlace<G>[] {
  const fits = (place: SettingsPlace<string>): boolean => (place.app === null || place.app === app) && (place.only === undefined || place.only === client);
  return [...(SHARED_SETTINGS_PLACES as readonly SettingsPlace<G>[]), ...own].filter(fits);
}

/** Words that say nothing of a setting (« sur », « the »): never matched, typed or written. */
const FILLERS = new Set(['a', 'au', 'aux', 'ce', 'cette', 'd', 'de', 'des', 'du', 'en', 'et', 'l', 'la', 'le', 'les', 'par', 'pour', 'sur', 'un', 'une', 'vos', 'votre', 'an', 'and', 'by', 'for', 'in', 'of', 'on', 'the', 'to', 'your']);

/** Folded words, fillers left out: « Grain sur le fond » -> grain, fond. */
function wordsOf(text: string): string[] {
  return foldText(text)
    .split(/[^a-z0-9]+/)
    .filter(word => word.length > 0 && !FILLERS.has(word));
}

/** A word without its plural's mark (« couleurs », « réseaux »), from four letters. */
const stem = (word: string): string => (word.length > 3 && /[sx]$/.test(word) ? word.slice(0, -1) : word);

/** How well one typed word meets one word of a place: 2 the same word (or its plural), 1 its start (three letters typed at least), 0 not at all. */
function meet(word: string, typed: string): number {
  if (word === typed || stem(word) === stem(typed)) return 2;
  return typed.length >= 3 && word.startsWith(stem(typed)) ? 1 : 0;
}

const best = (words: readonly string[], typed: string): number => words.reduce((most, word) => Math.max(most, meet(word, typed)), 0);

/**
 * The places the words typed name, best first: every word must meet one of the place's, a title's
 * word outranking where it sits and its synonyms, a whole word its start, a title typed whole first
 * of all; places that score the same keep their order (the sections before what they hold).
 */
export function findSettings<G extends string>(places: readonly SettingsPlace<G>[], query: string): SettingsPlace<G>[] {
  const typed = wordsOf(query);
  if (typed.length === 0) return [];
  const whole = typed.join(' ');
  const found: { readonly place: SettingsPlace<G>; readonly score: number; readonly at: number }[] = [];
  places.forEach((place, at) => {
    const titles = [place.title, inEnglish(place.title)];
    const title = titles.flatMap(wordsOf);
    const rest = [...(place.within ? [place.within, inEnglish(place.within)] : []), ...place.words].flatMap(wordsOf);
    let score = 0;
    for (const word of typed) {
      const inTitle = best(title, word);
      const elsewhere = inTitle > 0 ? 0 : best(rest, word);
      if (inTitle === 0 && elsewhere === 0) return;
      score += inTitle > 0 ? 2 + inTitle * 2 : elsewhere;
    }
    // « Fond » typed: the section itself before « Grain sur le fond ».
    if (titles.some(each => wordsOf(each).join(' ') === whole)) score += 4;
    found.push({ place, score, at });
  });
  return found.sort((a, b) => b.score - a.score || a.at - b.at).map(hit => hit.place);
}

/** The area's name: « Réglages », « Administration ». */
export function settingsAreaName(area: SettingsArea): string {
  return area === 'admin' ? t('Administration') : t('Réglages');
}

/**
 * Where a place is, as a result's second line says it: « Réglages › Langue » for a setting, the area
 * alone for a section of its home (« Administration »), the page between them for what lies on one
 * (« Réglages › Apparence » for the colours, « Réglages › Apparence › Fond » for the ground's grain);
 * nothing for an area's own home.
 */
export function settingsWhere(place: SettingsPlace<string>): string {
  if (place.section === null) return '';
  const trail = [settingsAreaName(place.area)];
  const page = place.area === 'settings' ? settingsPageOf(place.section) : null;
  // The page itself (« Apparence ») sits on the overview; what it holds says it is on it.
  if (page !== null && place.section !== page) trail.push(t(SETTINGS_PAGE_TITLES[page]));
  if (place.within && !(page !== null && place.within === SETTINGS_PAGE_TITLES[page] && trail.length > 1)) trail.push(t(place.within));
  return trail.join(' › ');
}
