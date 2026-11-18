import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { AlarmDraft } from '@unlease/clock/services/editing';

import type { ClockTab } from './ClockTabBar';

export type RootStackParamList = {
  Setup: undefined;
  /** Clock's home: one of its four places (the alarms when none is named). */
  Alarms: { readonly tab?: ClockTab } | undefined;
  /** « Nouveau minuteur » (no `id`), or a saved timer's form. */
  Timer: { readonly id?: string } | undefined;
  /** « Ajouter une ville »: the search over the world's cities. */
  City: undefined;
  /**
   * « Nouvelle alarme » (no `id`; `handed`: a draft filled in, what another app's « set an alarm »
   * handed or the home's « Ajouter une alarme » for a morning's event (`eventAlarmDraft`);
   * `event`: an alarm for that Agenda event, from Agenda's « Me réveiller pour cet événement », with
   * its `occurrence`, its start `at` and its `title` as Agenda handed them), or « Modifier l’alarme » (`id`).
   */
  Edit: { readonly id?: string; readonly handed?: AlarmDraft; readonly event?: string; readonly occurrence?: string; readonly at?: string; readonly title?: string } | undefined;
  /** Réglages, or one of its sections, landed on from a search (`clock`, `clock-ringing`, `language`…). */
  Settings: { readonly section?: string } | undefined;
  /** Réglages' « Apparence » page, or one of its sections (`appearance`, `colors`, `ground`), from its row or a search. */
  Appearance: { readonly section?: string } | undefined;
  /** The Administration's home, or one of its sections (`server`, `apps`…). */
  Admin: { readonly section?: string } | undefined;
  /** « Effacer des données », from Réglages › Données. */
  Erase: undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
