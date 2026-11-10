import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { CalendarView } from '@unlease/calendar/services/eventText';

export type RootStackParamList = {
  Setup: undefined;
  /** The calendar: its views around a day (`day`), one view (`view`), or one label's events (`label`). */
  Calendar: { readonly day?: string; readonly view?: CalendarView; readonly label?: string } | undefined;
  /** One event, at one of its occurrences (`at`, as stored). */
  Event: { readonly id: string; readonly at?: string };
  /**
   * « Nouvel événement » (no `id`: a draft from `start`, `end`, `tz`, `title`, `place`, `url`, `notes`, `link`,
   * as Carnet's « Ajouter à l'agenda » and the grid's long press hand them), or « Modifier » (`id`, `at`).
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
      }
    | undefined;
  /** A contact's birthday: open them in Contacts, call, write, gift ideas. */
  Birthday: { readonly id: string; readonly day?: string };
  Search: undefined;
  /** « Gérer les libellés ». */
  Labels: undefined;
  /** The calendars one subscribes to, and the holidays'. */
  Feeds: undefined;
  /** An `.ics` file to import; `shared`: the one shared to the app, read already (`importStore`). */
  Import: { readonly source?: 'shared' } | undefined;
  Trash: undefined;
  /** « Demander à Claude » about the calendar. */
  Ask: undefined;
  /** Réglages, or one of its sections, landed on from a search (`appearance`, `ground`, `data`…). */
  Settings: { readonly section?: string } | undefined;
  /** The Administration's home, or one of its sections. */
  Admin: { readonly section?: string } | undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
