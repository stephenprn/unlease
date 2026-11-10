/** The maps apps TurboModule under Jest: the phone's maps apps, and what was opened in them, in `state`. */
import type { MapAppEntry, MapAppList } from '../specs/NativeMapApps';

export const state = {
  apps: [] as MapAppEntry[],
  opened: [] as { uri: string; packageName: string }[],
};

export function __reset(): void {
  state.apps = [];
  state.opened = [];
}

const NativeMapApps = {
  apps: async (): Promise<MapAppList> => ({ apps: state.apps }),
  open: async (uri: string, packageName: string): Promise<boolean> => {
    if (!state.apps.some(app => app.packageName === packageName)) return false;
    state.opened.push({ uri, packageName });
    return true;
  },
};

export default NativeMapApps;
