/**
 * How each app of the suite introduces itself, in both languages: the setup's choice of apps, the
 * app switcher, the Administration's list, its search field and its Réglages' language. Apart from the registry (`apps.ts`), which the dictionary
 * itself reads.
 */
import type { AppId } from './apps';
import { localized, tx } from './i18n';

/** How each app introduces itself: in the setup's choice of apps, the app switcher and the Administration. */
export interface AppWords {
  /** A few words, under its name. */
  readonly tagline: string;
  /** What it does, in one sentence. */
  readonly description: string;
  /** The Google app it replaces. */
  readonly replaces: string;
  /** Its search field's placeholder, « Rechercher dans » what it holds: the same on both clients. */
  readonly search: string;
  /** Under a search that found nothing, what it looks through: the same on both clients. */
  readonly searchHint: string;
  /** The name of the interface's language in its Réglages (Carnet's also says what Claude writes of a link). */
  readonly language: string;
  /** What that language changes, under the choice. */
  readonly languageNote: string;
}

export const APP_WORDS: Record<AppId, AppWords> = {
  notes: localized({
    tagline: tx('Notes, lists and links'),
    description: tx('Your notes, shopping lists, drawings and reminders, and collections of links Claude reads and sorts for you.'),
    replaces: tx('Replaces Google Keep'),
    search: tx('Search your notes'),
    searchHint: tx('Search the words of a note, a list or a link in your collections, accents or not.'),
    language: tx('Language of the app and of link readings'),
    languageNote: tx('The app’s screens, and what Claude writes when it reads a link saved from this device: title, summary, details. A link already read keeps its language; “Read the page again” reads it in this one.'),
  }),
  pages: localized({
    tagline: tx('Pages and wiki'),
    description: tx('Nested pages, tables and columns for your projects, your wiki or your trips; they cite your notes and collections.'),
    replaces: tx('Replaces Google Docs and Notion'),
    search: tx('Search your pages'),
    searchHint: tx('Search the title or the words of a page, accents or not.'),
    language: tx('Interface language'),
    languageNote: tx('The app’s screens, and the language Claude answers questions asked from this device in.'),
  }),
  calendar: localized({
    tagline: tx('Calendar'),
    description: tx('Your appointments, your contacts’ birthdays, public holidays and the calendars you subscribe to, on all your devices.'),
    replaces: tx('Replaces Google Calendar'),
    search: tx('Search your calendar'),
    searchHint: tx('Search a title, a place, a description or a label.'),
    language: tx('Interface language'),
    languageNote: tx('The app’s screens, the days, the months and the reminders.'),
  }),
  contacts: localized({
    tagline: tx('Address book'),
    description: tx('Your contacts, their birthdays and addresses, on all your devices.'),
    replaces: tx('Replaces Google Contacts'),
    search: tx('Search your contacts'),
    searchHint: tx('Search a name, a company, a number, an email, an address or a label.'),
    language: tx('Interface language'),
    languageNote: tx('The app’s screens, dates, and the names of number types.'),
  }),
};

/**
 * The language's name and note while the server has no Claude key, for the apps whose language also
 * sets what Claude writes (Carnet's readings, Pages' answers): Claude is not mentioned where it does nothing.
 */
export const LANGUAGE_WITHOUT_CLAUDE: Partial<Record<AppId, Pick<AppWords, 'language' | 'languageNote'>>> = {
  notes: localized({ language: tx('Interface language'), languageNote: tx('The app’s screens, the dates and the reminders.') }),
  pages: localized({ language: tx('Interface language'), languageNote: tx('The app’s screens and the dates written in pages.') }),
};

/** The language's name and note in an app's Réglages, with or without Claude. */
export const languageWords = (app: AppId, claude: boolean): Pick<AppWords, 'language' | 'languageNote'> => (claude ? APP_WORDS[app] : (LANGUAGE_WITHOUT_CLAUDE[app] ?? APP_WORDS[app]));
