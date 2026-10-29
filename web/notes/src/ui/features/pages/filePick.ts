/** The system's file picker for a media block, opened in the gesture that asked for it. */
import type { MediaKind } from '@unlease/notes/models/blocks';
import { mediaKindFor } from '@unlease/notes/services/media';

import { attachBlockFile, fileRefusal } from '../../../app/media/blockFiles';
import { showError } from '../../../app/store/ui';

const ACCEPT: Record<MediaKind, string> = { image: 'image/*', video: 'video/*', pdf: 'application/pdf', file: '' };

export function pickAndAttach(page: string, blockId: string, kind: MediaKind): void {
  const input = document.createElement('input');
  input.type = 'file';
  if (ACCEPT[kind]) input.accept = ACCEPT[kind];
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    void attachBlockFile(page, blockId, file).then(outcome => {
      if (outcome !== 'ok') showError(fileRefusal(outcome, mediaKindFor(file.type) === 'image'));
    });
  });
  input.click();
}
