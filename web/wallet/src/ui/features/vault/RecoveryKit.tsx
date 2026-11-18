/**
 * The recovery kit: the code that opens the vault when the passphrase is lost, shown once. Eight
 * groups of four (Crockford's base32: no I, L, O or U to misread), its QR code for the phone's
 * camera, « Imprimer » and « Télécharger » (a text file). It is never stored by the apps: nothing
 * can show it again, only make a new one (which retires this one).
 */
import { useEffect, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { APP_NAME } from '@unlease/wallet/brand';

import { Button } from '@shared/ui/components/Button';
import { barcodeQr } from './qr';
import styles from '../../wallet.module.css';

function kitText(code: string): string {
  return [
    t('{app} recovery kit', { app: APP_NAME }),
    '',
    code,
    '',
    t('This code opens your vault if you forget its passphrase. Keep it on paper, somewhere safe and apart from your devices. Anyone holding it and your server’s token can open your papers.'),
    t('Made on {date}.', { date: new Date().toLocaleDateString() }),
  ].join('\n');
}

export function RecoveryKit({ code }: { code: string }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    void barcodeQr(code).then(setQr);
  }, [code]);
  const download = (): void => {
    const url = URL.createObjectURL(new Blob([kitText(code)], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${APP_NAME.toLowerCase()}-kit.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };
  const print = (): void => {
    const frame = window.open('', '_blank', 'width=600,height=800');
    if (!frame) return download();
    const doc = frame.document;
    doc.title = t('{app} recovery kit', { app: APP_NAME });
    const pre = doc.createElement('pre');
    pre.textContent = kitText(code);
    doc.body.append(pre);
    if (qr) {
      const holder = doc.createElement('div');
      holder.innerHTML = qr;
      doc.body.append(holder);
    }
    frame.focus();
    frame.print();
    frame.close();
  };
  return (
    <div className={styles.fields}>
      <p className={`${styles.kitCode}`} aria-label={t('Recovery code')}>
        {code}
      </p>
      {qr ? <div className={styles.kitQr} aria-hidden="true" dangerouslySetInnerHTML={{ __html: qr }} /> : null}
      <div className={styles.actions}>
        <Button kind="tonal" icon="download" onClick={download}>
          {t('Download')}
        </Button>
        <Button kind="tonal" icon="file" onClick={print}>
          {t('Print')}
        </Button>
      </div>
    </div>
  );
}
