/**
 * « Copie à envoyer »: whom the copy is for and why (« Agence Dupont », « location »), then a PDF of
 * the paper's pictures with « Copie destinée à Agence Dupont – location – 18 nov. 2026 » across every
 * page, downloaded. As France's « Filigrane Facile »: a copy that can't be used for anything else.
 */
import { useId, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { today as todayOf } from '@unlease/calendar/services/time';
import type { WalletItem } from '@unlease/wallet/models/item';
import { watermarkText } from '@unlease/wallet/services/watermark';
import { kindName } from '@unlease/wallet/services/words';

import { useMinute } from '@shared/app/hooks/useMinute';
import { showError } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { FormMessage } from '@shared/ui/components/FormMessage';
import { Layer } from '@shared/ui/components/Layer';
import { TextField } from '@shared/ui/components/TextField';
import { useForm } from '@shared/ui/components/useForm';
import { openWalletBytes, saveOpened } from '../../app/files';
import { itemKey } from '../../app/store/actions';
import { watermarkedPdf } from '../../app/watermark';
import styles from '../wallet.module.css';

function WatermarkForm({ item, onClose }: { item: WalletItem; onClose: () => void }) {
  const titleId = useId();
  const [recipient, setRecipient] = useState('');
  const [purpose, setPurpose] = useState('');
  const form = useForm({});
  const today = todayOf(useMinute());
  const text = watermarkText({ recipient: recipient.trim() || undefined, purpose: purpose.trim() || undefined, date: today });
  const make = async (): Promise<void> => {
    const key = itemKey(item.id);
    if (!key) return form.fail(null, t('The vault locked meanwhile: unlock it and try again.'));
    try {
      const pages: Blob[] = [];
      for (const file of item.details.files.filter(each => each.mime.startsWith('image/'))) {
        const bytes = await openWalletBytes(key, file.id);
        if (!bytes) return form.fail(null, t('A picture of this paper can’t be opened here yet.'));
        pages.push(new Blob([bytes.slice().buffer as ArrayBuffer], { type: file.mime }));
      }
      const name = item.title || kindName(item.kind);
      const pdf = await watermarkedPdf(pages, text, name);
      saveOpened(pdf, `${name} – ${t('copy')}.pdf`, 'application/pdf');
      onClose();
    } catch {
      showError(t('The copy couldn’t be made.'));
    } finally {
      key.fill(0);
    }
  };
  return (
    <DialogFrame
      title={t('Copy to send')}
      titleId={titleId}
      onClose={onClose}
      onSubmit={form.onSubmit(make)}
      foot={
        <>
          <FormMessage form={form} />
          <Button kind="text" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" icon="download" busy={form.busy}>
            {t('Download the copy')}
          </Button>
        </>
      }
    >
      <div className={styles.fields}>
        <p className="t-body">{t('Every page gets this line written across it, so the copy is no use for anything else.')}</p>
        <TextField label={t('For')} placeholder={t('Agence Dupont, the landlord…')} value={recipient} onChange={setRecipient} optional autoFocus />
        <TextField label={t('Why')} placeholder={t('Flat rental, job application…')} value={purpose} onChange={setPurpose} optional />
        <p className={`${styles.kitCode} t-body`}>{text}</p>
      </div>
    </DialogFrame>
  );
}

export function WatermarkDialog({ item, open, onClose }: { item: WalletItem; open: boolean; onClose: () => void }) {
  return (
    <Layer open={open} onDismiss={onClose} label={t('Copy to send')}>
      {open ? <WatermarkForm item={item} onClose={onClose} /> : null}
    </Layer>
  );
}
