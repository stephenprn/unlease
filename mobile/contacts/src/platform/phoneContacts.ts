/**
 * The phone's address book, WhatsApp's calls, calls, pictures and a shared card, through Contacts'
 * PhoneContacts TurboModule (`mobile/shared/specs/NativePhoneContacts.ts`), and the runtime
 * permissions they need (`PermissionsAndroid`). A missing module (JavaScript reloaded against an
 * older native build) reads as « nothing there », never a crash.
 */
import { Linking, PermissionsAndroid, Platform } from 'react-native';

import NativePhoneContacts, { type PhonePhoto, type WhatsappCalls } from '../../../shared/specs/NativePhoneContacts';

export type { PhonePhoto, WhatsappCalls };

export type Permission = 'contacts' | 'calls';
export type PermissionAnswer = 'granted' | 'denied' | 'blocked';

const ANDROID_PERMISSION = {
  contacts: PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
  calls: PermissionsAndroid.PERMISSIONS.CALL_PHONE,
} as const;

export async function hasPermission(permission: Permission): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    return await PermissionsAndroid.check(ANDROID_PERMISSION[permission]);
  } catch {
    return false;
  }
}

/** Asks Android; `blocked` once the person said « Ne plus demander » (only the system's settings can give it then). */
export async function askPermission(permission: Permission): Promise<PermissionAnswer> {
  if (Platform.OS !== 'android') return 'denied';
  try {
    const answer = await PermissionsAndroid.request(ANDROID_PERMISSION[permission]);
    return answer === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : answer === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied';
  } catch {
    return 'denied';
  }
}

/** The app's page in Android's settings, where a blocked permission is given. */
export function openAppSettings(): void {
  Linking.openSettings().catch(() => {});
}

/** One phone contact as the Kotlin writes it (`PhoneContactsModule.Person.toJson`). */
export interface PhoneContactRow {
  readonly firstName: string;
  readonly lastName: string;
  readonly company: string;
  readonly jobTitle: string;
  readonly note: string;
  readonly birthday: string;
  readonly favorite: boolean;
  readonly photo: string;
  readonly phones: readonly { readonly value: string; readonly kind: string; readonly label: string }[];
  readonly emails: readonly { readonly value: string; readonly kind: string; readonly label: string }[];
  readonly addresses: readonly { readonly kind: string; readonly label: string; readonly street: string; readonly postalCode: string; readonly city: string; readonly region: string; readonly country: string }[];
  readonly labels: readonly string[];
}

export async function readPhoneContacts(offset: number, limit: number): Promise<{ readonly total: number; readonly contacts: readonly PhoneContactRow[] }> {
  if (!NativePhoneContacts) return { total: 0, contacts: [] };
  const parsed = JSON.parse(await NativePhoneContacts.readContacts(offset, limit)) as { total?: unknown; contacts?: unknown };
  return { total: typeof parsed.total === 'number' ? parsed.total : 0, contacts: Array.isArray(parsed.contacts) ? (parsed.contacts as PhoneContactRow[]) : [] };
}

export async function whatsappInstalled(): Promise<boolean> {
  if (!NativePhoneContacts) return false;
  try {
    return await NativePhoneContacts.whatsappInstalled();
  } catch {
    return false;
  }
}

export async function whatsappCalls(number: string): Promise<WhatsappCalls> {
  const none = { voice: '', video: '' };
  if (!NativePhoneContacts) return none;
  try {
    return await NativePhoneContacts.whatsappCalls(number);
  } catch {
    return none;
  }
}

export async function openWhatsappCall(uri: string, video: boolean): Promise<boolean> {
  if (!NativePhoneContacts) return false;
  try {
    return await NativePhoneContacts.openWhatsappCall(uri, video);
  } catch {
    return false;
  }
}

/** 'call' (at once), 'dial' (the dialer opened with the number) or 'none'. */
export async function placeCall(number: string): Promise<'call' | 'dial' | 'none'> {
  if (!NativePhoneContacts) {
    // An older native build: the dialer, by address.
    try {
      await Linking.openURL(`tel:${number}`);
      return 'dial';
    } catch {
      return 'none';
    }
  }
  try {
    const placed = await NativePhoneContacts.placeCall(number);
    return placed === 'call' || placed === 'dial' ? placed : 'none';
  } catch {
    return 'none';
  }
}

export async function importPhoto(uri: string): Promise<PhonePhoto | null> {
  if (!NativePhoneContacts) return null;
  try {
    const photo = await NativePhoneContacts.importPhoto(uri);
    return photo.path ? photo : null;
  } catch {
    return null;
  }
}

export async function importPhotoData(base64: string): Promise<PhonePhoto | null> {
  if (!NativePhoneContacts) return null;
  try {
    const photo = await NativePhoneContacts.importPhotoData(base64);
    return photo.path ? photo : null;
  } catch {
    return null;
  }
}

export async function shareText(fileName: string, mime: string, text: string): Promise<boolean> {
  if (!NativePhoneContacts) return false;
  try {
    return await NativePhoneContacts.shareText(fileName, mime, text);
  } catch {
    return false;
  }
}
