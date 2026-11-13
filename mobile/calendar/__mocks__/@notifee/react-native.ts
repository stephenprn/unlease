/**
 * Notifee under Jest: a recorder of what was armed and cancelled, and what the permission answers.
 */
export const state = {
  armed: new Map<string, { title: string; body: string; timestamp: number; data: Record<string, string>; actions: string[] }>(),
  cancelled: [] as string[],
  /** Shown at once (`displayNotification`), by id. */
  shown: [] as string[],
  /** The alarm type each trigger was armed with, by id. */
  alarmTypes: new Map<string, number>(),
  permission: 1,
  asked: 0,
  initial: null as null | { notification: { data: Record<string, string> }; pressAction: { id: string } },
};

export function __reset(): void {
  state.armed.clear();
  state.cancelled = [];
  state.shown = [];
  state.alarmTypes.clear();
  state.permission = 1;
  state.asked = 0;
  state.initial = null;
}

export enum AndroidImportance { LOW = 2, DEFAULT = 3, HIGH = 4 }
export enum AndroidStyle { BIGPICTURE = 0, BIGTEXT = 1 }
export enum AlarmType { SET = 0, SET_AND_ALLOW_WHILE_IDLE = 1, SET_EXACT = 2, SET_EXACT_AND_ALLOW_WHILE_IDLE = 3, SET_ALARM_CLOCK = 4 }
export enum AndroidCategory { ALARM = 'alarm', EVENT = 'event', REMINDER = 'reminder' }
export enum TriggerType { TIMESTAMP = 0 }
export enum EventType { DISMISSED = 0, PRESS = 1, ACTION_PRESS = 2 }
export enum AuthorizationStatus { DENIED = 0, AUTHORIZED = 1 }
export enum AndroidNotificationSetting { NOT_SUPPORTED = -1, DISABLED = 0, ENABLED = 1 }

const notifee = {
  createChannel: async (channel: { id: string }) => channel.id,
  requestPermission: async () => {
    state.asked += 1;
    return { authorizationStatus: state.permission };
  },
  getNotificationSettings: async () => ({ android: { alarm: AndroidNotificationSetting.ENABLED } }),
  openAlarmPermissionSettings: async () => {},
  createTriggerNotification: async (
    notification: { id: string; title: string; body?: string; data?: Record<string, string>; android?: { actions?: { title: string }[] } },
    trigger: { timestamp: number; alarmManager?: { type?: number } },
  ) => {
    state.alarmTypes.set(notification.id, trigger.alarmManager?.type ?? -1);
    state.armed.set(notification.id, { title: notification.title, body: notification.body ?? '', timestamp: trigger.timestamp, data: notification.data ?? {}, actions: (notification.android?.actions ?? []).map(action => action.title) });
    return notification.id;
  },
  cancelTriggerNotification: async (id: string) => {
    state.armed.delete(id);
    state.cancelled.push(id);
  },
  cancelDisplayedNotification: async () => {},
  displayNotification: async (notification: { id: string }) => {
    state.shown.push(notification.id);
    return notification.id;
  },
  getPowerManagerInfo: async () => ({ activity: null }),
  openPowerManagerSettings: async () => {},
  onForegroundEvent: () => () => {},
  onBackgroundEvent: () => {},
  getInitialNotification: async () => state.initial,
};

export default notifee;
