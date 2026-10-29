/** Any one document, through the Media TurboModule's picker: copied into the app's cache first. */
import { t } from '@unlease/core/i18n';

import NativeMedia, { type PickedFile } from '../../specs/NativeMedia';

export type { PickedFile };

export async function pickDocument(mimeTypes: readonly string[]): Promise<PickedFile> {
  if (!NativeMedia) return { status: 'error', message: t('Sélecteur de fichiers indisponible'), path: '', name: '', bytes: 0 };
  return NativeMedia.pickFile([...mimeTypes]);
}
