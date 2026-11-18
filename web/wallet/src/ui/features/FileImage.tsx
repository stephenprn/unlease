/**
 * One of an item's files opened for this visit (`app/files`): a picture as itself, a PDF as a button
 * opening it in a new tab. A well while it opens; a line when it cannot be had (not sent yet from
 * another device, the server out of reach).
 */
import { useEffect, useState } from 'react';

import { t } from '@unlease/core/i18n';
import type { WalletFile } from '@unlease/wallet/models/item';

import { Button } from '@shared/ui/components/Button';
import { openedFileUrl, openWalletFile } from '../../app/files';
import { itemKey } from '../../app/store/actions';
import styles from '../wallet.module.css';

export function useOpenedFile(itemId: string, fileId: string | null, mime: string): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(() => (fileId ? (openedFileUrl(fileId) ?? undefined) : null));
  useEffect(() => {
    if (!fileId) return;
    let live = true;
    const key = itemKey(itemId);
    const job = key ? openWalletFile(key, fileId, mime) : Promise.resolve(null);
    key?.fill(0);
    void job.then(opened => {
      if (live) setUrl(opened);
    });
    return () => {
      live = false;
    };
  }, [itemId, fileId, mime]);
  return url;
}

export function FileImage({ itemId, file, label, page }: { itemId: string; file: WalletFile; label: string; page?: boolean }) {
  const url = useOpenedFile(itemId, file.id, file.mime);
  if (file.mime === 'application/pdf') {
    return (
      <Button kind="tonal" icon="pdf" disabled={!url} onClick={() => url && window.open(url, '_blank', 'noopener')}>
        {file.name || t('Open the PDF')}
      </Button>
    );
  }
  if (url === null) return <p className="t-meta">{t('This picture can’t be opened here yet: it may not have reached the server.')}</p>;
  return url ? <img className={styles.faceImage} data-page={page || undefined} src={url} alt={label} /> : <div className={styles.faceImage} data-page={page || undefined} aria-busy="true" />;
}
