/**
 * « Effacer des données » in Wallet (`core/services/erase`): the cards, the identity papers, the
 * documents. Erasing needs no key: it writes tombstones the server sees. The vault itself stays (its
 * keys open nothing once every item is gone, and a new item is sealed under them again).
 */
import { t } from '@unlease/core/i18n';
import { tombstones, type EraseChange, type ErasePart } from '@unlease/core/services/erase';
import { plural } from '@unlease/core/services/format';
import { ITEM_TYPE } from '../crypto/vault';
import { isIdentityKind, type ShownItem } from '../models/item';

export const WALLET_ERASE_PARTS = ['cards', 'identity', 'documents', 'locked'] as const;

type Part = (typeof WALLET_ERASE_PARTS)[number];

function partOf(item: ShownItem): Part {
  if (item.locked) return item.tier === 'cards' ? 'cards' : 'locked';
  if (item.tier === 'cards') return 'cards';
  return isIdentityKind(item.kind) ? 'identity' : 'documents';
}

const live = (items: readonly ShownItem[], part: Part): ShownItem[] => items.filter(item => item.deletedAt === null && partOf(item) === part);

/** The parts, as their rows show them. Papers this device cannot open (locked) are one part: erasing them needs no unlocking. */
export function eraseParts(items: readonly ShownItem[]): ErasePart[] {
  const cards = live(items, 'cards').length;
  const identity = live(items, 'identity').length;
  const documents = live(items, 'documents').length;
  const locked = live(items, 'locked').length;
  const parts: ErasePart[] = [
    { id: 'cards', title: t('Cards'), detail: cards === 0 ? t('No cards') : plural(cards, 'card [wallet]', 'cards [wallet]'), count: cards, glyph: 'card' },
    { id: 'identity', title: t('Identity papers'), detail: identity === 0 ? t('No identity papers') : plural(identity, 'identity paper'), count: identity, glyph: 'idCard' },
    { id: 'documents', title: t('Documents'), detail: documents === 0 ? t('No documents') : plural(documents, 'document'), count: documents, glyph: 'file' },
  ];
  if (locked > 0) parts.push({ id: 'locked', title: t('Locked papers'), detail: plural(locked, 'paper'), count: locked, glyph: 'lock' });
  return parts;
}

export function eraseChanges(items: readonly ShownItem[], chosen: ReadonlySet<string>, now: number): EraseChange[] {
  return WALLET_ERASE_PARTS.flatMap(part => (chosen.has(part) ? tombstones(ITEM_TYPE, live(items, part).map(item => item.id), now) : []));
}
