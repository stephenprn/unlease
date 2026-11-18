/**
 * « Identité »: the identity papers (identity card, passport, driving licence, health insurance card,
 * residence permit), the shape of the cards themselves, by kind then by person; when papers concern
 * several people (a child's passport), each one's under their name. Locked, under the frost.
 */
import { useMemo } from 'react';

import { t } from '@unlease/core/i18n';
import { today as todayOf } from '@unlease/calendar/services/time';
import { contactName } from '@unlease/contacts/services/names';
import { isIdentityKind } from '@unlease/wallet/models/item';
import { orderIdentity } from '@unlease/wallet/services/order';

import { useContactsStore } from '@contacts/app/store/library';
import { useMinute } from '@shared/app/hooks/useMinute';
import { Button } from '@shared/ui/components/Button';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { liveItems, useWalletStore } from '../../app/store/library';
import { useVaultStatus, useVaultStore } from '../../app/store/vault';
import { Frost } from '../features/Frost';
import { openNew } from '../features/open';
import { SearchResults, useSearchQuery } from '../features/SearchResults';
import { PaperTile } from '../features/Tiles';
import { KitStep, VaultIntro } from '../features/vault/VaultIntro';
import { paths } from '../routes';
import styles from '../wallet.module.css';

export function PapersScreen() {
  const status = useVaultStatus();
  const pendingKit = useVaultStore(s => s.pendingKit);
  const now = useMinute();
  const query = useSearchQuery();
  const items = useWalletStore(state => state.items);
  const contacts = useContactsStore(state => state.contacts);
  const groups = useMemo(() => {
    const papers = orderIdentity(liveItems(items).filter(item => isIdentityKind(item.kind)));
    const byPerson = new Map<string, typeof papers>();
    for (const paper of papers) {
      const key = paper.details.personContactId ?? '';
      byPerson.set(key, [...(byPerson.get(key) ?? []), paper]);
    }
    return [...byPerson.entries()].map(([person, list]) => {
      const contact = person ? contacts[person] : undefined;
      return { person, name: contact && contact.deletedAt === null ? contactName(contact) : null, list };
    });
  }, [items, contacts]);
  const today = todayOf(now);

  if (pendingKit || status === 'none') {
    return (
      <div className={styles.screen}>
        {pendingKit ? <KitStep /> : <VaultIntro />}
      </div>
    );
  }
  return (
    <div className={styles.screen}>
      <h1 className="sr-only">{t('Identity papers')}</h1>
      {status !== 'open' ? (
        <Frost tier="papers" what={t('Your papers open with the vault’s passphrase, for this visit.')} />
      ) : query ? (
        <SearchResults query={query} />
      ) : groups.length === 0 ? (
        <EmptyState scene="papers" title={t('No papers yet')} text={t('Your identity card, passport, driving licence and health insurance card: both sides, their numbers and when they expire.')}>
          <Button kind="tonal" icon="plus" onClick={() => openNew('idCard')}>
            {t('Add a paper')}
          </Button>
        </EmptyState>
      ) : (
        groups.map(group => (
          <section key={group.person} aria-label={group.name ?? t('Identity papers')}>
            {groups.length > 1 ? <h2 className={`${styles.sectionTitle} t-section`}>{group.name ?? t('Yours')}</h2> : null}
            <ul className={styles.tiles}>
              {group.list.map(paper => (
                <PaperTile key={paper.id} item={paper} today={today} person={group.name} background={paths.papers} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
