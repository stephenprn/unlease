/**
 * Presses on Clock's notices (the evening check, the notice before an alarm), as Notifee hands them:
 * in the foreground, and with the app closed (registered at start, before any root, as Notifee
 * requires). What they do is the app's (`@app/evening`).
 */
import notifee, { type Event } from '@notifee/react-native';

export type NoticeEvent = Event;

/** While the app shows: returns what stops listening. */
export function onForegroundNotices(listener: (event: NoticeEvent) => Promise<void>): () => void {
  return notifee.onForegroundEvent(event => {
    listener(event).catch(() => undefined);
  });
}

/** With the app closed (index.js). */
export function onBackgroundNotices(listener: (event: NoticeEvent) => Promise<void>): void {
  notifee.onBackgroundEvent(listener);
}
