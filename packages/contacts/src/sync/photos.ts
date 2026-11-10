/**
 * `POST /api/contacts/photos`: the server fetches a contact's photo from an address (a Google
 * export's `Photo` column, a vCard's `PHOTO` by URI), through the suite's guarded reader, and keeps
 * it as a blob with its display copies, as an uploaded photo. The app then writes the contact's
 * `photoId` (and `photoUploaded: true`): the server never writes the contact itself.
 */

export interface ContactPhotoRequest {
  readonly url: string;
}

export interface ContactPhotoResponse {
  /** The blob's id: the contact's `photoId`. */
  readonly id: string;
  readonly mime: string;
}

export const CONTACT_PHOTO_PATH = '/api/contacts/photos';

/** The largest photo the server takes from an address. */
export const CONTACT_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

export function isContactPhotoRequest(value: unknown): value is ContactPhotoRequest {
  return typeof value === 'object' && value !== null && typeof (value as { url?: unknown }).url === 'string' && /^https?:\/\//i.test((value as { url: string }).url) && (value as { url: string }).url.length <= 4000;
}
