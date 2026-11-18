/**
 * Wallet's places, all under `/wallet`: the cards (`/wallet`), the identity papers
 * (`/wallet/papers`), the documents (`/wallet/documents`); an item over its place
 * (`/wallet/item/<id>`), its form (`/wallet/item/<id>/edit`) and a new one's
 * (`/wallet/new/<kind>`). The Réglages are the shell's (`/wallet/settings`).
 */
import { isItemKind, tierOfKind, isIdentityKind, type ItemKind } from '@unlease/wallet/models/item';

import { decodePart, type Route } from '@shared/ui/router';

declare module '@shared/ui/router' {
  interface Routes {
    readonly wallet: object;
    readonly walletPapers: object;
    readonly walletDocuments: object;
    readonly walletItem: { readonly id: string };
    readonly walletEdit: { readonly id: string };
    readonly walletNew: { readonly kind: ItemKind };
  }
}

export const WALLET_ROUTES = ['wallet', 'walletPapers', 'walletDocuments', 'walletItem', 'walletEdit', 'walletNew'] as const satisfies readonly Route['name'][];

export const HOME = '/wallet';

export const paths = {
  cards: HOME,
  papers: `${HOME}/papers`,
  documents: `${HOME}/documents`,
  item: (id: string): string => `${HOME}/item/${encodeURIComponent(id)}`,
  edit: (id: string): string => `${HOME}/item/${encodeURIComponent(id)}/edit`,
  create: (kind: ItemKind): string => `${HOME}/new/${kind}`,
} as const;

const PLAIN: Readonly<Record<string, Route>> = {
  [HOME]: { name: 'wallet' },
  [paths.papers]: { name: 'walletPapers' },
  [paths.documents]: { name: 'walletDocuments' },
};

export function parseWalletRoute(path: string): Route | null {
  const plain = PLAIN[path];
  if (plain) return plain;
  const edit = /^\/wallet\/item\/([^/]+)\/edit$/.exec(path);
  if (edit) return { name: 'walletEdit', id: decodePart(edit[1]!) };
  const item = /^\/wallet\/item\/([^/]+)$/.exec(path);
  if (item) return { name: 'walletItem', id: decodePart(item[1]!) };
  const created = /^\/wallet\/new\/([A-Za-z]+)$/.exec(path);
  if (created && isItemKind(created[1])) return { name: 'walletNew', kind: created[1] };
  return null;
}

/** The place an item lives in. */
export function placeOfKind(kind: ItemKind): Route {
  if (tierOfKind(kind) === 'cards') return { name: 'wallet' };
  return isIdentityKind(kind) ? { name: 'walletPapers' } : { name: 'walletDocuments' };
}

export const isWalletPlace = (route: Route): boolean => route.name === 'wallet' || route.name === 'walletPapers' || route.name === 'walletDocuments';
