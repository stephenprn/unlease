/**
 * A picture or a PDF taken in for an item: the camera (the phone's camera app writes into this app's
 * files alone, never the gallery), the photo picker, or a PDF from the document picker; then sealed
 * under the item's key at once (`./files`).
 */
import { t } from '@unlease/core/i18n';
import type { FileRole, WalletFile } from '@unlease/wallet/models/item';
import { pickDocument } from '@shared/platform/documents';
import { capturePhoto, pickImages } from '@shared/platform/media';

import { keepPicked } from './files';

export type PickSource = 'camera' | 'photos' | 'pdf';

export type PickOutcome = { readonly status: 'ok'; readonly files: readonly WalletFile[] } | { readonly status: 'cancelled' } | { readonly status: 'error'; readonly message: string };

const MAX_PDF_BYTES = 40 * 1024 * 1024;

export async function pickForItem(itemKey: Uint8Array, source: PickSource, role: FileRole, name: string, max = 1): Promise<PickOutcome> {
  if (source === 'pdf') {
    const picked = await pickDocument(['application/pdf']);
    if (picked.status === 'cancelled') return { status: 'cancelled' };
    if (picked.status !== 'ok' || !picked.path) return { status: 'error', message: t('This file couldn’t be read.') };
    if (picked.bytes > MAX_PDF_BYTES) return { status: 'error', message: t('This file is over 40 MB.') };
    const file = await keepPicked(itemKey, { path: picked.path, mime: 'application/pdf', width: 0, height: 0, bytes: picked.bytes }, role, picked.name.replace(/\.pdf$/i, '') || name);
    return { status: 'ok', files: [file] };
  }
  const result = source === 'camera' ? await capturePhoto() : await pickImages(max);
  if (result.status === 'cancelled') return { status: 'cancelled' };
  if (result.status !== 'ok' || result.files.length === 0) return { status: 'error', message: result.message ? t(result.message) : t('Couldn’t add the photo') };
  const files: WalletFile[] = [];
  for (const picked of result.files) files.push(await keepPicked(itemKey, picked, role, name));
  return { status: 'ok', files };
}
