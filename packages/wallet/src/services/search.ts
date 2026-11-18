/**
 * Searching the wallet, on the device, in what it has opened: an item's title, kind, issuer, holder,
 * number, labels, notes and the words read on its files. Nothing of it is ever written to a search
 * index kept on disk (the spotlight's or the server's): it lives in memory while the tier is open.
 */
import { foldText, scoreTerms, queryTerms } from '@unlease/core/services/search';
import type { WalletItem } from '../models/item';
import { documentTypeName, kindName } from './words';

export function itemSearchText(item: WalletItem): { readonly title: string; readonly rest: string } {
  const d = item.details;
  return {
    title: foldText(item.title),
    rest: foldText(
      [kindName(item.kind), d.docType ? documentTypeName(d.docType) : '', d.issuer, d.holder, d.number, d.barcode?.value ?? '', ...d.labels, item.notes, item.text].join('\n'),
    ),
  };
}

/** The open items holding every word typed, best first; the bin left out. */
export function searchItems(items: readonly WalletItem[], query: string): WalletItem[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  return items
    .filter(item => item.deletedAt === null)
    .flatMap(item => {
      const text = itemSearchText(item);
      const score = scoreTerms(text.title, text.rest, terms);
      return score === null ? [] : [{ item, score }];
    })
    .sort((a, b) => b.score - a.score || b.item.editedAt - a.item.editedAt)
    .map(hit => hit.item);
}
