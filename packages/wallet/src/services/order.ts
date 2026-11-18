/**
 * How each place orders what it holds. « Cartes »: favourites first, then the most used (as Catima's
 * « most used »), a card shown at a till in the last weeks counting more than one shown often long
 * ago; never used, by name. « Identité »: by kind (identity card, passport, licence…), then by person.
 * « Documents »: newest first, by the document's date, else when it was added.
 */
import { IDENTITY_KINDS, type WalletItem } from '../models/item';

const DAY = 86_400_000;

/** A card's weight in « Cartes »: its uses, the recent ones counting most (half as much every 30 days). */
export function cardWeight(item: WalletItem, now: number): number {
  const { count, at } = item.usage;
  if (count === 0 || at === null) return 0;
  return count * Math.pow(0.5, Math.max(0, now - at) / (30 * DAY));
}

const byTitle = (a: WalletItem, b: WalletItem): number => a.title.localeCompare(b.title) || a.id.localeCompare(b.id);

export function orderCards(cards: readonly WalletItem[], now: number): WalletItem[] {
  return [...cards].sort((a, b) => Number(b.favourite) - Number(a.favourite) || cardWeight(b, now) - cardWeight(a, now) || byTitle(a, b));
}

export function orderIdentity(papers: readonly WalletItem[]): WalletItem[] {
  return [...papers].sort(
    (a, b) =>
      IDENTITY_KINDS.indexOf(a.kind as never) - IDENTITY_KINDS.indexOf(b.kind as never) ||
      (a.details.personContactId ?? '').localeCompare(b.details.personContactId ?? '') ||
      byTitle(a, b),
  );
}

const documentDay = (item: WalletItem): string => item.details.docDate ?? new Date(item.createdAt).toISOString().slice(0, 10);

export function orderDocuments(documents: readonly WalletItem[]): WalletItem[] {
  return [...documents].sort((a, b) => documentDay(b).localeCompare(documentDay(a)) || b.createdAt - a.createdAt);
}
