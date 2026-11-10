import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Setup: undefined;
  /** The list: every contact, the favourites (`favorites`) or a label's (`label`). */
  Contacts: { readonly filter?: 'favorites'; readonly label?: string } | undefined;
  /** One contact's card; `wish`: asking at once how to wish their birthday (a birthday notification's « Message »). */
  Contact: { readonly id: string; readonly wish?: boolean };
  /** « Créer un contact » (no `id`: `phone`, `label`, `favorite` start it), or « Modifier le contact ». */
  Edit: { readonly id?: string; readonly phone?: string; readonly label?: string; readonly favorite?: boolean } | undefined;
  Birthdays: undefined;
  /** « Gérer les libellés ». */
  Labels: undefined;
  /** From Google or the phone; `shared`: the card shared to the app, read already (`importStore`). */
  Import: { readonly source?: 'shared' } | undefined;
  /** « Doublons »: the contacts that are one person, to merge. */
  Duplicates: undefined;
  Trash: undefined;
  /** Réglages, or one of its sections, landed on from a search (`appearance`, `ground`, `data`…). */
  Settings: { readonly section?: string } | undefined;
  /** The Administration's home, or one of its sections (`server`, `reading`, `seerr`…). */
  Admin: { readonly section?: string } | undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
