/**
 * « Cartes », Wallet's home: the vault's first run on a server that has none; else the cards, the
 * shape of the cards themselves, favourites first, then the most used lately (as Catima orders them),
 * the emergency card at the head. A card opens at the till. Locked here (cards not kept open in this
 * browser), they lie under the frost. A search shows what matches across the wallet.
 */
import { useMemo } from 'react';

import { t } from '@unlease/core/i18n';
import { today as todayOf } from '@unlease/calendar/services/time';
import { orderCards } from '@unlease/wallet/services/order';

import { useMinute } from '@shared/app/hooks/useMinute';
import { Button } from '@shared/ui/components/Button';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { liveItems, useWalletStore } from '../../app/store/library';
import { useVaultStatus, useVaultStore } from '../../app/store/vault';
import { Frost } from '../features/Frost';
import { openNew } from '../features/open';
import { SearchResults, useSearchQuery } from '../features/SearchResults';
import { CardTile } from '../features/Tiles';
import { KitStep, VaultIntro } from '../features/vault/VaultIntro';
import styles from '../wallet.module.css';

export function CardsScreen() {
  const status = useVaultStatus();
  const pendingKit = useVaultStore(s => s.pendingKit);
  const now = useMinute();
  const query = useSearchQuery();
  const items = useWalletStore(state => state.items);
  const cards = useMemo(() => {
    const live = liveItems(items).filter(item => item.tier === 'cards');
    const ordered = orderCards(live, now);
    return [...ordered.filter(item => item.kind === 'emergency'), ...ordered.filter(item => item.kind !== 'emergency')];
  }, [items, now]);
  const today = todayOf(now);

  return (
    <div className={styles.screen}>
      <h1 className="sr-only">{t('Cards')}</h1>
      {pendingKit ? (
        <KitStep />
      ) : status === 'none' ? (
        <VaultIntro />
      ) : status === 'locked' ? (
        <Frost tier="cards" what={t('Your cards open with the vault’s passphrase.')} />
      ) : query ? (
        <SearchResults query={query} />
      ) : cards.length > 0 ? (
        <ul className={styles.tiles} aria-label={t('Cards')}>
          {cards.map(card => (
            <CardTile key={card.id} item={card} today={today} />
          ))}
        </ul>
      ) : (
        <EmptyState scene="cards" title={t('No cards yet')} text={t('Your loyalty cards, gift cards and the card to show in an emergency, ready at the till.')}>
          <Button kind="tonal" icon="plus" onClick={() => openNew('card')}>
            {t('Add a card')}
          </Button>
        </EmptyState>
      )}
    </div>
  );
}
