/**
 * « Remplir avec Claude », on the person's say only: the item's pictures opened here, drawn again no
 * larger than 1600 px, sent once to `POST /api/wallet/read`; the fields Claude read come back to be
 * checked. Nothing is kept on the server (`server/src/apps/wallet/reader.ts`).
 */
import { getLocale } from '@unlease/core/i18n';
import type { ItemKind, WalletFile } from '@unlease/wallet/models/item';
import { READ_MAX_PAGES, readReadFields, WALLET_READ_PATH, type ReadFields, type ReadPage } from '@unlease/wallet/sync/routes';

import { useSettingsStore } from '@shared/app/store/settings';
import { postJson } from '@shared/app/sync/transport';
import { openWalletBytes, shrinkImage } from './files';

const READ_LONG_SIDE = 1600;

async function base64Of(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** What Claude read of an item's pictures; null when nothing could be sent. */
export async function readWithClaude(itemKey: Uint8Array, files: readonly WalletFile[], kind: ItemKind | null): Promise<ReadFields | null> {
  const server = useSettingsStore.getState().server;
  if (!server) return null;
  const pages: ReadPage[] = [];
  for (const file of files.filter(each => each.mime.startsWith('image/')).slice(0, READ_MAX_PAGES)) {
    const bytes = await openWalletBytes(itemKey, file.id);
    if (!bytes) continue;
    const small = await shrinkImage(new Blob([bytes.slice().buffer as ArrayBuffer], { type: file.mime }), READ_LONG_SIDE, 0.85);
    pages.push({ mime: 'image/jpeg', base64: await base64Of(small.blob) });
  }
  if (pages.length === 0) return null;
  const answer = await postJson(server, WALLET_READ_PATH, { pages, kind, lang: getLocale() }, value => (typeof value === 'object' && value !== null && 'fields' in value ? readReadFields((value as { fields: unknown }).fields) : null));
  return answer;
}

/** A barcode read from a picture, where the browser can (Chrome's `BarcodeDetector`); null otherwise. */
export async function barcodeInPicture(blob: Blob): Promise<{ readonly format: string; readonly value: string } | null> {
  const Detector = (window as unknown as { BarcodeDetector?: new () => { detect(source: ImageBitmapSource): Promise<{ rawValue: string; format: string }[]> } }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const found = await new Detector().detect(bitmap);
    bitmap.close();
    return found[0] ? { format: found[0].format, value: found[0].rawValue } : null;
  } catch {
    return null;
  }
}

/** BarcodeDetector's names, as Wallet's formats. */
export const DETECTOR_FORMATS: Readonly<Record<string, string>> = {
  code_128: 'code128',
  ean_13: 'ean13',
  qr_code: 'qr',
  ean_8: 'ean8',
  upc_a: 'upcA',
  upc_e: 'upcE',
  code_39: 'code39',
  code_93: 'code93',
  codabar: 'codabar',
  itf: 'itf',
  pdf417: 'pdf417',
  aztec: 'aztec',
  data_matrix: 'dataMatrix',
};
