/**
 * Contacts' way into the phone (only Contacts implements it: `mobile/contacts/android/…/phone`): the
 * phone's own address book (Google's synced contacts included) read for an import, WhatsApp's call
 * rows for a number, a call placed, a picture taken into the app's storage, and a card shared.
 * Reading needs READ_CONTACTS, a direct call CALL_PHONE: both asked from JavaScript
 * (`PermissionsAndroid`); without them the reads come back empty and a call opens the dialer.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface PhonePhoto {
  /** Where the picture was written, in the app's storage (upright, JPEG or PNG); empty when it could not be read. */
  path: string;
  mime: string;
}

export interface WhatsappCalls {
  /** The contacts provider's row WhatsApp keeps for a voice call to this number (`content://…/data/<id>`); empty for none. */
  voice: string;
  video: string;
}

export interface Spec extends TurboModule {
  /**
   * A page of the phone's contacts, in their creation order, as JSON (a nested list the bridge would
   * copy field by field): `{ total, contacts: [{ firstName, lastName, company, jobTitle, note,
   * birthday, favorite, photo, phones, emails, addresses, labels }] }`, `photo` a content address or
   * empty, `birthday` as Android stores it. Empty without the permission.
   */
  readContacts(offset: number, limit: number): Promise<string>;
  /** Whether WhatsApp (or its business edition) is installed. */
  whatsappInstalled(): Promise<boolean>;
  /** WhatsApp's call rows for this number (it writes them for the numbers it knows); empty without the permission. */
  whatsappCalls(number: string): Promise<WhatsappCalls>;
  /** Opens one of those rows in WhatsApp: the call starts there. */
  openWhatsappCall(uri: string, video: boolean): Promise<boolean>;
  /** Calls the number: at once with CALL_PHONE ('call'), else in the dialer ('dial'); 'none' when nothing can. */
  placeCall(number: string): Promise<string>;
  /** A picture at a content or file address (a phone contact's photo), into the app's storage. */
  importPhoto(uri: string): Promise<PhonePhoto>;
  /** A picture's bytes (a vCard's), as base64, into the app's storage. */
  importPhotoData(base64: string): Promise<PhonePhoto>;
  /** Offers a file made from this text (a contact's card) to the share sheet. */
  shareText(fileName: string, mime: string, text: string): Promise<boolean>;
}

export default TurboModuleRegistry.get<Spec>('PhoneContacts');
