import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ItemKind } from '@unlease/wallet/models/item';

export type WalletPlace = 'cards' | 'papers' | 'documents';

export type RootStackParamList = {
  Setup: undefined;
  /** The three places under one bar: the cards (at the till), the identity papers, the documents. */
  Home: { readonly place?: WalletPlace } | undefined;
  /** A card at the till, or a paper or a document open. */
  Item: { readonly id: string };
  /** A new item's form (`kind`), or an item's (`id`). */
  Edit: { readonly id?: string; readonly kind?: ItemKind };
  Settings: { readonly section?: string } | undefined;
  Appearance: { readonly section?: string } | undefined;
  Erase: undefined;
  Admin: { readonly section?: string } | undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
