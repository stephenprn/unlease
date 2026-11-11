import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { LinkKind } from '@unlease/notes/models/entities';

import type { BoardView } from '@app/hooks/useBoard';

export type RootStackParamList = {
  Setup: undefined;
  /**
   * From the home-screen widgets: `capture` starts that action at once; `label` shows that label's
   * notes (`carnet://label/<id>`), and what is captured there wears it.
   */
  Board: { view?: BoardView; capture?: 'note' | 'checklist' | 'photo' | 'camera' | 'link' | 'search' | 'reminder'; label?: string } | undefined;
  /** `reminder`: open the reminder sheet at once (a note started from the Rappels view). */
  Note: { id: string; focus?: 'title' | 'body' | 'check'; reminder?: boolean };
  Line: { id: string };
  Link: { id: string };
  /** A recipe link's cook mode ("En cuisine"). */
  Cooking: { id: string };
  Lines: undefined;
  Labels: undefined;
  /** Réglages, or one of its sections, landed on from a search (`language`, `data`, the app's own…). */
  Settings: { readonly section?: string } | undefined;
  /** Réglages' « Apparence » page, or one of its sections (`appearance`, `colors`, `ground`), from its row or a search. */
  Appearance: { readonly section?: string } | undefined;
  /** The Administration's home, or one of its sections (`server`, `reading`, `seerr`…). */
  Admin: { readonly section?: string } | undefined;
  Import: undefined;
  /** « Ce que Claude relève »: the collections with their own facts, and each kind's usual ones. */
  Templates: undefined;
  /**
   * A page of facts: a collection's (`collection`), or a kind's usual facts (`kind`); `id`, an old
   * template's id, opens the first collection noting with it (a kind's fixed id, that kind).
   */
  Template: { readonly id?: string; readonly kind?: LinkKind; readonly collection?: string } | undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
