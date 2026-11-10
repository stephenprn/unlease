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
  /** Réglages, or one of its sections, landed on from a search (`appearance`, `ground`, `data`…). */
  Settings: { readonly section?: string } | undefined;
  /** The Administration's home, or one of its sections (`server`, `reading`, `seerr`…). */
  Admin: { readonly section?: string } | undefined;
  Import: undefined;
  /** « Modèles de fiche »: what Claude reads on each kind of link, and the person's own templates. */
  Templates: undefined;
  /**
   * A template's editor: a kind's (`kind`), one of the person's own (`id`), or a new one (neither);
   * `collection`: a new one made from that collection's menu, chosen for it once saved.
   */
  Template: { readonly id?: string; readonly kind?: LinkKind; readonly collection?: string } | undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
