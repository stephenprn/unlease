/**
 * Notifee under Jest: a recorder of what was armed and cancelled.
 */
export const state = {
  armed: new Map<string, { title: string; timestamp: number }>(),
  cancelled: [] as string[],
};

export function __reset(): void {
  state.armed.clear();
  state.cancelled = [];
}

export enum AndroidImportance { DEFAULT = 3, HIGH = 4 }
export enum AlarmType { SET = 0, SET_AND_ALLOW_WHILE_IDLE = 1, SET_EXACT = 2, SET_EXACT_AND_ALLOW_WHILE_IDLE = 3 }
export enum TriggerType { TIMESTAMP = 0 }
export enum EventType { DISMISSED = 0, PRESS = 1, ACTION_PRESS = 2 }
export enum AuthorizationStatus { DENIED = 0, AUTHORIZED = 1 }
export enum AndroidNotificationSetting { NOT_SUPPORTED = -1, DISABLED = 0, ENABLED = 1 }

const notifee = {
  createChannel: async (channel: { id: string }) => channel.id,
  requestPermission: async () => ({ authorizationStatus: AuthorizationStatus.AUTHORIZED }),
  getNotificationSettings: async () => ({ android: { alarm: AndroidNotificationSetting.ENABLED } }),
  openAlarmPermissionSettings: async () => {},
  createTriggerNotification: async (notification: { id: string; title: string }, trigger: { timestamp: number }) => {
    state.armed.set(notification.id, { title: notification.title, timestamp: trigger.timestamp });
    return notification.id;
  },
  cancelTriggerNotification: async (id: string) => {
    state.armed.delete(id);
    state.cancelled.push(id);
  },
  cancelDisplayedNotification: async () => {},
  displayNotification: async (notification: { id: string }) => notification.id,
  onForegroundEvent: () => () => {},
  onBackgroundEvent: () => {},
  getInitialNotification: async () => null,
};

export default notifee;
