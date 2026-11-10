import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Setup: undefined;
  /** The pages' home: the recent pages and every top-level one. */
  Pages: undefined;
  /** `block`: opened at that block (a source Claude cited, a link's `#block`), scrolled to and lit a moment. */
  Page: { id: string; block?: string };
  /** A page's drawing block, drawn on the whole screen. */
  Drawing: { page: string; block: string };
  /** The pages in the bin. */
  Trash: undefined;
  /** Réglages, or one of its sections, landed on from a search (`appearance`, `ground`, `data`…). */
  Settings: { readonly section?: string } | undefined;
  /** The Administration's home, or one of its sections (`server`, `reading`, `seerr`…). */
  Admin: { readonly section?: string } | undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
