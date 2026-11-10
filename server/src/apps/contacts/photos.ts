/**
 * A contact's photo taken from an address (`POST /api/contacts/photos`): a Google export names each
 * photo by its address. The server fetches it through the suite's guarded reader (public addresses
 * only, bounded, a picture or nothing) and keeps it as an uploaded photo (its original and its
 * display copy, so the drive holds it as it holds the photos people add). The app writes the
 * contact's `photoId`.
 */
import { createId } from '@unlease/core/services/ids';
import { CONTACT_PHOTO_MAX_BYTES, type ContactPhotoRequest, type ContactPhotoResponse } from '@unlease/contacts/sync/photos';
import { processUpload, UnsupportedImageError } from '../../blobs/images';
import type { BlobStore } from '../../blobs/store';
import type { Fetcher } from '../../reading/fetcher';
import { BROWSER_USER_AGENT } from '../../reading/reader';

export interface PhotoTakerOptions {
  readonly fetcher: Fetcher;
  readonly blobs: BlobStore;
  /** Called once a photo is kept: the drive takes it. */
  readonly kept?: () => void;
}

/** A photo kept, or why not (an address with no picture: 502; something else than a picture: 415). */
export type PhotoOutcome = { readonly ok: true; readonly answer: ContactPhotoResponse } | { readonly ok: false; readonly status: 415 | 502; readonly error: string };

export class PhotoTaker {
  constructor(private readonly options: PhotoTakerOptions) {}

  async take(request: ContactPhotoRequest): Promise<PhotoOutcome> {
    let body: Buffer;
    try {
      const response = await this.options.fetcher.fetch(request.url, {
        headers: { 'user-agent': BROWSER_USER_AGENT, accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8' },
        maxBytes: CONTACT_PHOTO_MAX_BYTES,
        timeoutMs: 15_000,
      });
      if (response.status < 200 || response.status >= 300 || response.truncated) return { ok: false, status: 502, error: 'Photo introuvable à cette adresse' };
      body = response.body;
    } catch {
      return { ok: false, status: 502, error: 'Photo introuvable à cette adresse' };
    }
    let processed;
    try {
      processed = await processUpload(body);
    } catch (error) {
      if (error instanceof UnsupportedImageError) return { ok: false, status: 415, error: 'Ce n’est pas une photo' };
      throw error;
    }
    const id = createId();
    await this.options.blobs.save(
      {
        id,
        mime: processed.mime,
        width: processed.width,
        height: processed.height,
        bytes: body.length,
        displayMime: processed.display ? 'image/webp' : processed.mime,
        displayBytes: processed.display?.length ?? body.length,
        source: 'upload',
      },
      { display: processed.display, original: body },
    );
    this.options.kept?.();
    return { ok: true, answer: { id, mime: processed.mime } };
  }
}
