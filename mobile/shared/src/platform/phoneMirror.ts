/**
 * The PhoneMirror TurboModule (`specs/NativePhoneMirror.ts`, Contacts' and Agenda's) and the runtime
 * permissions it needs. A missing module (another app, or JavaScript reloaded against an older native
 * build) reads as « not available », never a crash.
 */
import { Linking, PermissionsAndroid, Platform, type Permission } from 'react-native';

import NativePhoneMirror, { type Spec } from '../../specs/NativePhoneMirror';

export type PhoneMirrorNative = Spec;

/** The module, or null where the app has none. */
export const phoneMirrorNative: PhoneMirrorNative | null = Platform.OS === 'android' ? (NativePhoneMirror ?? null) : null;

/** What the mirror needs: the address book's or the calendar's read and write. */
export type MirrorPermissions = 'contacts' | 'calendar';

const PERMISSIONS: Readonly<Record<MirrorPermissions, readonly Permission[]>> = {
  contacts: [PermissionsAndroid.PERMISSIONS.READ_CONTACTS, PermissionsAndroid.PERMISSIONS.WRITE_CONTACTS],
  calendar: [PermissionsAndroid.PERMISSIONS.READ_CALENDAR, PermissionsAndroid.PERMISSIONS.WRITE_CALENDAR],
};

export type PermissionAnswer = 'granted' | 'denied' | 'blocked';

export async function hasMirrorPermissions(which: MirrorPermissions): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const answers = await Promise.all(PERMISSIONS[which].map(permission => PermissionsAndroid.check(permission)));
    return answers.every(Boolean);
  } catch {
    return false;
  }
}

/** Asks Android for both; `blocked` once the person said « Ne plus demander » (only the system's settings give it then). */
export async function askMirrorPermissions(which: MirrorPermissions): Promise<PermissionAnswer> {
  if (Platform.OS !== 'android') return 'denied';
  try {
    const answers = Object.values(await PermissionsAndroid.requestMultiple([...PERMISSIONS[which]]));
    if (answers.every(answer => answer === PermissionsAndroid.RESULTS.GRANTED)) return 'granted';
    return answers.some(answer => answer === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) ? 'blocked' : 'denied';
  } catch {
    return 'denied';
  }
}

/** The app's page in Android's settings, where a refused permission is given. */
export function openMirrorSettings(): void {
  Linking.openSettings().catch(() => {});
}
