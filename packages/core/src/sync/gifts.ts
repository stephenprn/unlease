/**
 * A gift idea for someone (`POST /api/notes/gifts`): Contacts asks Carnet's server module to keep a
 * product's link in Carnet's « Cadeaux » collection (made the first time, found again after, renamed
 * or not, by its id or its name in either language), its people set to that contact (`contactIds`:
 * an address kept already gains them). Contacts syncs no Carnet record: the server writes the link
 * under its clock, and Carnet reads it as any saved link. An older client sends no contact: the
 * link's comment says for whom instead (« Pour Léa »).
 */
import { isLocale, type Locale } from '../i18n';

export interface GiftLinkRequest {
  readonly url: string;
  /** The person's name as shown: the link's comment says « Pour <name> » when no contact is named. */
  readonly forName: string;
  /** The contact the idea is for: the link's people (`contactIds`). Absent from an older client. */
  readonly contactId?: string;
  /** The device's language: the collection's name when it is made, Claude's reading, the comment. */
  readonly lang: Locale;
}

export interface GiftLinkResponse {
  readonly collectionId: string;
  readonly linkId: string;
  /** The collection held the address already: its comment gained the name, nothing was added. */
  readonly existing: boolean;
  /** The collection was made by this idea. */
  readonly created: boolean;
}

export const GIFTS_PATH = '/api/notes/gifts';

export function parseGiftLinkRequest(value: unknown): GiftLinkRequest | null {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v.url !== 'string' || !/^https?:\/\/\S+$/i.test(v.url.trim()) || v.url.length > 4000) return null;
  if (typeof v.forName !== 'string' || v.forName.trim().length === 0 || v.forName.length > 200) return null;
  if (v.contactId !== undefined && v.contactId !== null && (typeof v.contactId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(v.contactId))) return null;
  const contactId = typeof v.contactId === 'string' ? v.contactId : undefined;
  return { url: v.url.trim(), forName: v.forName.trim(), ...(contactId ? { contactId } : {}), lang: isLocale(v.lang) ? v.lang : 'fr' };
}

export function isGiftLinkResponse(value: unknown): value is GiftLinkResponse {
  const v = value as Record<string, unknown> | null;
  return !!v && typeof v.collectionId === 'string' && typeof v.linkId === 'string' && typeof v.existing === 'boolean' && typeof v.created === 'boolean';
}
