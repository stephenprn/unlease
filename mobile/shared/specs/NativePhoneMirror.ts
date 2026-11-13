/**
 * The mirror of an app's records into the phone's own (Contacts' into the address book, Agenda's into
 * the calendar: `mobile/<app>/android/…/mirror`), one way, under the app's own Android account
 * (`MirrorAccount`, `mobile/shared/android/src/mirror`: its type is the app's package and `.mirror`,
 * so a dev build's never touches a released app's). Every read and write is limited to that account: the phone's
 * other contacts and events are never read. Only Contacts and Agenda implement it; the rows are JSON
 * in each app's own shape (`@unlease/contacts/services/phoneMirror`, `@unlease/calendar/services/phoneMirror`).
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /** Whether the app's account is on the phone. */
  isOn(): Promise<boolean>;
  /** Adds the app's account (`accountName`, shown in the phone's contacts or calendar) if it is not there; true once it is. */
  turnOn(accountName: string): Promise<boolean>;
  /** Removes every row the account holds, then the account. */
  turnOff(): Promise<boolean>;
  /** What the account holds, as JSON: each row's record id and the fingerprint it was written with. Empty lists without the permission. */
  written(): Promise<string>;
  /** Writes a batch (JSON: rows to write, ids to take away); resolves with how many rows it wrote and took away. */
  apply(batch: string): Promise<number>;
}

export default TurboModuleRegistry.get<Spec>('PhoneMirror');
