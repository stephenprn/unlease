/**
 * Android's notification permission (13 and later), through Notifee: without it, a ringing alarm
 * shows no screen and no buttons. Asked once, the first time an alarm is saved (`@app/permissions`).
 */
import notifee, { AuthorizationStatus } from '@notifee/react-native';

/** Asks Android (older ones answer yes); false when refused or unknown. */
export async function requestNotifications(): Promise<boolean> {
  try {
    const settings = await notifee.requestPermission();
    return settings.authorizationStatus === AuthorizationStatus.AUTHORIZED;
  } catch {
    return false;
  }
}
