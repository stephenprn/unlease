import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Setup: undefined;
  /** The pages' home: the recent pages and every top-level one; `capture` (the launcher's shortcuts): a new page, or the search. */
  Pages: { readonly capture?: 'page' | 'search' } | undefined;
  /** `block`: opened at that block (a source Claude cited, a link's `#block`), scrolled to and lit a moment. */
  Page: { id: string; block?: string };
  /** A page's drawing block, drawn on the whole screen. */
  Drawing: { page: string; block: string };
  /** The pages in the bin. */
  Trash: undefined;
  /** Réglages, or one of its sections, landed on from a search (`language`, `data`, the app's own…). */
  Settings: { readonly section?: string } | undefined;
  /** Réglages' « Apparence » page, or one of its sections (`appearance`, `colors`, `ground`), from its row or a search. */
  Appearance: { readonly section?: string } | undefined;
  /** The Administration's home, or one of its sections (`server`, `reading`, `seerr`…). */
  Admin: { readonly section?: string } | undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
