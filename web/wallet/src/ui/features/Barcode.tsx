/**
 * A barcode drawn as the till's scanner reads it: black bars on white, by bwip-js (loaded the first
 * time a barcode shows, so the lists never pay for it). The SVG is bwip-js's own, paths only; a value
 * it cannot draw says so instead.
 */
import { useEffect, useState } from 'react';
import type * as Bwip0 from 'bwip-js/browser';

import { t } from '@unlease/core/i18n';
import { BWIP_NAMES, isSquareFormat, type BarcodeFormat } from '@unlease/wallet/models/barcode';

import styles from '../wallet.module.css';

type Bwip = typeof Bwip0;
let loading: Promise<Bwip> | null = null;
const loadBwip = (): Promise<Bwip> => (loading ??= import('bwip-js/browser'));

/** The SVG of a barcode, or null when its value cannot be drawn in its format. */
export async function barcodeSvg(format: BarcodeFormat, value: string): Promise<string | null> {
  const bwip = await loadBwip();
  try {
    return bwip.toSVG({ bcid: BWIP_NAMES[format], text: value, scale: 3, height: isSquareFormat(format) ? undefined : 18, includetext: false, barcolor: '1A1817', backgroundcolor: 'FFFFFF', paddingwidth: 6, paddingheight: 6 });
  } catch {
    return null;
  }
}

export function Barcode({ format, value, label }: { format: BarcodeFormat; value: string; label: string }) {
  const [svg, setSvg] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void barcodeSvg(format, value).then(drawn => {
      if (live) setSvg(drawn);
    });
    return () => {
      live = false;
    };
  }, [format, value]);
  if (svg === null) return <p className={`${styles.tillNone} t-body`}>{t('This number can’t be drawn as a barcode.')}</p>;
  return <div className={styles.barcode} data-square={isSquareFormat(format) || undefined} role="img" aria-label={label} dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />;
}
