/**
 * « Documents »: every document, newest first, filtered by type from the chips over them (Impôts,
 * Logement, Santé…: only the types it holds), then, apart, those kept past what France asks (« Peut
 * être jeté »: a bill of six years ago), which the person may delete. Locked, under the frost.
 */
import { useMemo, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { today as todayOf } from '@unlease/calendar/services/time';
import { DOCUMENT_TYPES, type DocumentType } from '@unlease/wallet/models/documentTypes';
import { discardable } from '@unlease/wallet/services/expiry';
import { orderDocuments } from '@unlease/wallet/services/order';
import { documentTypeGlyph, documentTypeName } from '@unlease/wallet/services/words';

import { useMinute } from '@shared/app/hooks/useMinute';
import { Button } from '@shared/ui/components/Button';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { Icon } from '@shared/ui/components/Icon';
import { liveItems, useWalletStore } from '../../app/store/library';
import { useVaultStatus, useVaultStore } from '../../app/store/vault';
import { Frost } from '../features/Frost';
import { ItemRow } from '../features/ItemRow';
import { openNew } from '../features/open';
import { SearchResults, useSearchQuery } from '../features/SearchResults';
import { KitStep, VaultIntro } from '../features/vault/VaultIntro';
import styles from '../wallet.module.css';

export function DocumentsScreen() {
  const status = useVaultStatus();
  const pendingKit = useVaultStore(s => s.pendingKit);
  const now = useMinute();
  const query = useSearchQuery();
  const items = useWalletStore(state => state.items);
  const [type, setType] = useState<DocumentType | null>(null);
  const today = todayOf(now);
  const { documents, types, old } = useMemo(() => {
    const all = orderDocuments(liveItems(items).filter(item => item.kind === 'document'));
    const old = new Set(discardable(all, today).map(item => item.id));
    const held = new Set(all.map(item => item.details.docType ?? 'other'));
    return { documents: all, types: DOCUMENT_TYPES.filter(each => held.has(each)), old };
  }, [items, today]);
  const shown = documents.filter(item => !old.has(item.id) && (type === null || (item.details.docType ?? 'other') === type));
  const stale = documents.filter(item => old.has(item.id) && (type === null || (item.details.docType ?? 'other') === type));

  if (pendingKit || status === 'none') {
    return (
      <div className={styles.screen}>
        {pendingKit ? <KitStep /> : <VaultIntro />}
      </div>
    );
  }
  return (
    <div className={styles.screen}>
      <h1 className="sr-only">{t('Documents')}</h1>
      {status !== 'open' ? (
        <Frost tier="papers" what={t('Your documents open with the vault’s passphrase, for this visit.')} />
      ) : query ? (
        <SearchResults query={query} />
      ) : documents.length === 0 ? (
        <EmptyState scene="documents" title={t('No documents yet')} text={t('Tax notices, payslips, leases, insurance certificates, warranties: scanned or added as PDF, filed by type, kept as long as they must be.')}>
          <Button kind="tonal" icon="plus" onClick={() => openNew('document')}>
            {t('Add a document')}
          </Button>
        </EmptyState>
      ) : (
        <>
          {types.length > 1 ? (
            <div className={styles.chips} role="toolbar" aria-label={t('Document types')}>
              <button type="button" className={`${styles.chip} t-label`} aria-pressed={type === null} onClick={() => setType(null)}>
                {t('All')}
              </button>
              {types.map(each => (
                <button key={each} type="button" className={`${styles.chip} t-label`} aria-pressed={type === each} onClick={() => setType(type === each ? null : each)}>
                  <Icon name={documentTypeGlyph(each)} size={18} />
                  {documentTypeName(each)}
                </button>
              ))}
            </div>
          ) : null}
          {shown.length > 0 ? (
            <ul className={styles.rows} aria-label={t('Documents')}>
              {shown.map(item => (
                <ItemRow key={item.id} item={item} today={today} />
              ))}
            </ul>
          ) : null}
          {stale.length > 0 ? (
            <section aria-labelledby="wallet-stale">
              <h2 id="wallet-stale" className={`${styles.sectionTitle} t-section`}>
                {t('Kept longer than needed')}
              </h2>
              <p className="t-meta">{t('France no longer asks you to keep these. Delete them if you have no other use for them.')}</p>
              <ul className={styles.rows}>
                {stale.map(item => (
                  <ItemRow key={item.id} item={item} today={today} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
