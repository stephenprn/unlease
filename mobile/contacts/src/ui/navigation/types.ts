import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { HandedContact } from '@app/handedContact';

export type RootStackParamList = {
  Setup: undefined;
  /** The list: every contact, the favourites (`favorites`) or a label's (`label`); `capture` (the launcher's shortcut): its search, the keyboard up. */
  Contacts: { readonly filter?: 'favorites'; readonly label?: string; readonly capture?: 'search' } | undefined;
  /** One contact's card; `wish`: asking at once how to wish their birthday (a birthday notification's « Message »). */
  Contact: { readonly id: string; readonly wish?: boolean };
  /** « Créer un contact » (no `id`: `phone`, `label`, `favorite` start it; `handed`: what another app's « Créer un contact » handed), or « Modifier le contact ». */
  Edit: { readonly id?: string; readonly phone?: string; readonly label?: string; readonly favorite?: boolean; readonly handed?: HandedContact } | undefined;
  Birthdays: undefined;
  /** « Gérer les libellés ». */
  Labels: undefined;
  /** The import's wizard, from Google or the phone; `shared`: the card shared to the app, read already (`importStore`), on its preview. */
  Import: { readonly source?: 'shared' } | undefined;
  /** « Effacer des données », from Réglages › Données. */
  Erase: undefined;
  /** « Doublons »: the contacts that are one person, to merge. */
  Duplicates: undefined;
  Trash: undefined;
  /** Réglages, or one of its sections, landed on from a search (`language`, `data`, the app's own…). */
  Settings: { readonly section?: string } | undefined;
  /** Réglages' « Apparence » page, or one of its sections (`appearance`, `colors`, `ground`), from its row or a search. */
  Appearance: { readonly section?: string } | undefined;
  /** The Administration's home, or one of its sections (`server`, `reading`, `seerr`…). */
  Admin: { readonly section?: string } | undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
