import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { CalendarView } from '@unlease/calendar/services/eventText';

export type RootStackParamList = {
  Setup: undefined;
  /**
   * The calendar: its views around a day (`day`), one view (`view`), or one label's events (`label`);
   * `words`: quick add opened with them (words selected in another app, « Créer un événement »);
   * `capture`: quick add opened empty (the launcher's shortcut « Ajouter en quelques mots »).
   */
  Calendar: { readonly day?: string; readonly view?: CalendarView; readonly label?: string; readonly words?: string; readonly capture?: 'quick' } | undefined;
  /** One event, at one of its occurrences (`at`, as stored). */
  Event: { readonly id: string; readonly at?: string };
  /**
   * « Nouvel événement » (no `id`: a draft from `start`, `end`, `tz`, `title`, `place`, `url`, `notes`, `link`,
   * as Carnet's « Ajouter à l'agenda » and the grid's long press hand them, and `rrule`, `guests` as
   * another app's does: `app/handedEvent.ts`), or « Modifier » (`id`, `at`).
   */
  Edit:
    | {
        readonly id?: string;
        readonly at?: string;
        readonly start?: string;
        readonly end?: string;
        readonly tz?: string;
        readonly title?: string;
        readonly place?: string;
        readonly url?: string;
        readonly link?: string;
        readonly description?: string;
        /** Carnet's « Ajouter à l'agenda »: what Claude read of the link, put in the description. */
        readonly notes?: string;
        /** How it repeats (an RRULE), kept when it reads (`handedRule`). */
        readonly rrule?: string;
        /** Its guests: contact ids, comma-separated (`handedGuests`). */
        readonly guests?: string;
      }
    | undefined;
  /** A contact's birthday: open them in Contacts, call, write, gift ideas. */
  Birthday: { readonly id: string; readonly day?: string };
  Search: undefined;
  /** « Gérer les libellés ». */
  Labels: undefined;
  /** The calendars one subscribes to, and the holidays'; `url`: an address in the form, to subscribe to once the person says so (a `webcal://` link). */
  Feeds: { readonly url?: string } | undefined;
  /** The import wizard; `shared`: files shared or opened with the app, read already (`importStore`), on its preview. */
  Import: { readonly source?: 'shared' } | undefined;
  /** « Effacer des données »: Agenda's parts, erased for good. */
  Erase: undefined;
  Trash: undefined;
  /** « Demander à Claude » about the calendar. */
  Ask: undefined;
  /** Réglages, or one of its sections, landed on from a search (`language`, `data`, the app's own…). */
  Settings: { readonly section?: string } | undefined;
  /** Réglages' « Apparence » page, or one of its sections (`appearance`, `colors`, `ground`), from its row or a search. */
  Appearance: { readonly section?: string } | undefined;
  /** The Administration's home, or one of its sections. */
  Admin: { readonly section?: string } | undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
