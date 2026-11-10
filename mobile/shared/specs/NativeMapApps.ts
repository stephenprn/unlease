/**
 * The phone's maps apps (`MapApps`, `mobile/shared/android`): those that open a place (`geo:`), each
 * with its name and its own icon, so the app offers them itself (Android goes straight to its
 * default one); and a place opened in the one picked.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface MapAppEntry {
  /** Its applicationId (`com.google.android.apps.maps`). */
  packageName: string;
  /** Its name, as the launcher shows it. */
  label: string;
  /** Its icon, a PNG as a `data:` address ('' when it could not be drawn). */
  icon: string;
}

export interface MapAppList {
  apps: MapAppEntry[];
}

export interface Spec extends TurboModule {
  /** The apps that open `geo:`, one per app, by name; never this app itself. */
  apps(): Promise<MapAppList>;
  /** `uri` opened in that app only; false when it no longer opens it (uninstalled, turned off). */
  open(uri: string, packageName: string): Promise<boolean>;
}

export default TurboModuleRegistry.get<Spec>('MapApps');
