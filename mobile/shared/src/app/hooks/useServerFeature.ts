/**
 * Whether the server has said it set up one of the Administration's optional services (Claude, the
 * backup to S3, the drive, Seerr): what leans on it shows only then. Remembered across starts
 * (`rememberServerSettings`), so a start offline shows what the server last said; not known yet (a
 * first connection, the answer on its way) counts as not set up, since an entry would lead nowhere;
 * without a server, none is. The web's `useServerFeature`.
 */
import type { ServerFeature } from '@unlease/core/sync/settings';

import { selectServerFeature, selectServerFeatureState, useSettingsStore, type FeatureState } from '../store/settingsStore';

export const useServerFeature = (feature: ServerFeature): boolean => useSettingsStore(selectServerFeature(feature));

/** The same, with `unknown` apart: a screen reached by a link leaves only once the server said `off`. */
export const useServerFeatureState = (feature: ServerFeature): FeatureState => useSettingsStore(selectServerFeatureState(feature));

/** `useServerFeature` outside a component. */
export const hasServerFeature = (feature: ServerFeature): boolean => selectServerFeature(feature)(useSettingsStore.getState());
