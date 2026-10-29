/**
 * Where this instance keeps its data.
 *
 * Production uses the machine spelling of the name (`carnet`) for the IndexedDB
 * database and the localStorage prefix. The dev-only demo (`?demo=1`) swaps in
 * its own name so it can never touch the owner's real notes in the same
 * browser profile.
 */
import { APP_SLUG } from '@unlease/notes/brand';

let storageName: string = APP_SLUG;

export function setStorageName(name: string): void {
  storageName = name;
}

/** The IndexedDB database name, and the prefix of every localStorage key. */
export function getStorageName(): string {
  return storageName;
}
