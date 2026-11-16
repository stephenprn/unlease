/**
 * Where the phone is, coarse (a kilometre or so), for the weather as an alarm rings: Android's
 * `ACCESS_COARSE_LOCATION`, asked only when the person chooses « Ici » for the weather. The engine
 * reads the phone's last known place itself (`whereabouts`).
 */
import { PermissionsAndroid, Platform } from 'react-native';

export type LocationAnswer = 'granted' | 'denied' | 'blocked';

const COARSE = PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION;

export async function hasCoarseLocation(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    return await PermissionsAndroid.check(COARSE);
  } catch {
    return false;
  }
}

/** Asks Android, saying what it is for; `blocked` once the person said « Ne plus demander » (only the system's settings give it then). */
export async function askCoarseLocation(rationale: { readonly title: string; readonly message: string; readonly buttonPositive: string }): Promise<LocationAnswer> {
  if (Platform.OS !== 'android') return 'denied';
  try {
    const answer = await PermissionsAndroid.request(COARSE, rationale);
    if (answer === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
    return answer === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied';
  } catch {
    return 'denied';
  }
}
