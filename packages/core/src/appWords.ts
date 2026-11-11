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
    tagline: tx('Notes, listes et liens'),
    description: tx('Vos notes, listes de courses, dessins et rappels, et des collections de liens que Claude lit et range pour vous.'),
    replaces: tx('Remplace Google Keep'),
    search: tx('Rechercher dans vos notes'),
    searchHint: tx('Cherchez les mots d’une note, d’une liste ou d’un lien de vos collections, sans tenir compte des accents.'),
    language: tx('Langue de l’interface et des lectures'),
    languageNote: tx('Les écrans de l’application, et ce que Claude écrit quand il lit un lien enregistré depuis cet appareil : titre, résumé, détails. Un lien déjà lu garde sa langue ; « Relire la page » le relit dans celle-ci.'),
  }),
  pages: localized({
    tagline: tx('Pages et wiki'),
    description: tx('Des pages imbriquées, des tableaux et des colonnes pour vos projets, votre wiki ou vos voyages ; elles citent vos notes et vos collections.'),
    replaces: tx('Remplace Google Docs et Notion'),
    search: tx('Rechercher dans vos pages'),
    searchHint: tx('Cherchez le titre ou les mots d’une page, sans tenir compte des accents.'),
    language: tx('Langue de l’interface'),
    languageNote: tx('Les écrans de l’application, et la langue dans laquelle Claude répond aux questions posées depuis cet appareil.'),
  }),
  calendar: localized({
    tagline: tx('Agenda'),
    description: tx('Vos rendez-vous, les anniversaires de vos contacts, les jours fériés et les agendas auxquels vous êtes abonné, sur tous vos appareils.'),
    replaces: tx('Remplace Google Agenda'),
    search: tx('Rechercher dans votre agenda'),
    searchHint: tx('Cherchez un titre, un lieu, une description ou un libellé.'),
    language: tx('Langue de l’interface'),
    languageNote: tx('Les écrans de l’application, les jours, les mois et les rappels.'),
  }),
  contacts: localized({
    tagline: tx('Carnet d’adresses'),
    description: tx('Vos contacts, leurs anniversaires et leurs adresses, sur tous vos appareils.'),
    replaces: tx('Remplace Google Contacts'),
    search: tx('Rechercher dans vos contacts'),
    searchHint: tx('Cherchez un nom, une entreprise, un numéro, un e-mail, une adresse ou un libellé.'),
    language: tx('Langue de l’interface'),
    languageNote: tx('Les écrans de l’application, les dates et les noms des types de numéros.'),
  }),
};

/**
 * The language's name and note while the server has no Claude key, for the apps whose language also
 * sets what Claude writes (Carnet's readings, Pages' answers): Claude is not mentioned where it does nothing.
 */
export const LANGUAGE_WITHOUT_CLAUDE: Partial<Record<AppId, Pick<AppWords, 'language' | 'languageNote'>>> = {
  notes: localized({ language: tx('Langue de l’interface'), languageNote: tx('Les écrans de l’application, les dates et les rappels.') }),
  pages: localized({ language: tx('Langue de l’interface'), languageNote: tx('Les écrans de l’application et les dates écrites dans les pages.') }),
};

/** The language's name and note in an app's Réglages, with or without Claude. */
export const languageWords = (app: AppId, claude: boolean): Pick<AppWords, 'language' | 'languageNote'> => (claude ? APP_WORDS[app] : (LANGUAGE_WITHOUT_CLAUDE[app] ?? APP_WORDS[app]));
