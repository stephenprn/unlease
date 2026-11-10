/**
 * The phone's maps apps, through the MapApps TurboModule: those that open a place, by name with
 * their own icon, and a place opened in one of them. A missing module (JS reloaded against an older
 * native build) lists none and opens nothing, never a crash.
 */
import NativeMapApps from '../../specs/NativeMapApps';

export interface MapAppInfo {
  readonly packageName: string;
  readonly label: string;
  /** A PNG `data:` address, '' when the phone could not draw it. */
  readonly icon: string;
}

/** The apps that open `geo:`, by name. */
export async function mapApps(): Promise<readonly MapAppInfo[]> {
  if (!NativeMapApps) return [];
  try {
    return (await NativeMapApps.apps()).apps;
  } catch {
    return [];
  }
}

/** `uri` in that app only; false when it does not open it any more (or the module is missing). */
export async function openInMapApp(uri: string, packageName: string): Promise<boolean> {
  if (!NativeMapApps) return false;
  try {
    return await NativeMapApps.open(uri, packageName);
  } catch {
    return false;
  }
}
