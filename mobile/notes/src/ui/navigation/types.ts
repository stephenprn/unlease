import type { NativeStackScreenProps } from '@react-navigation/native-stack';

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
  /** The pages' home: the other space, beside the notes' board. */
  Pages: undefined;
  /** `block`: opened at that block (a source Claude cited), scrolled to and lit a moment. */
  Page: { id: string; block?: string };
  Link: { id: string };
  /** A recipe link's cook mode ("En cuisine"). */
  Cooking: { id: string };
  /** A page's drawing block, drawn on the whole screen. */
  Drawing: { page: string; block: string };
  Lines: undefined;
  Labels: undefined;
  Settings: undefined;
  Admin: undefined;
  Import: undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
