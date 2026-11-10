/**
 * A kitchen timer rings as an alarm clock's alarm: the one Android never holds back.
 */
import { AlarmType, state as notifee, __reset as resetNotifee } from '../../../../__mocks__/@notifee/react-native';
import { startTimer, stopTimer } from '../kitchen';

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => resetNotifee());

describe('kitchen timers', () => {
  it('arm an alarm clock’s alarm, taken away when stopped', async () => {
    const timer = startTimer('l1', 'Étape 3', 600);
    await settle();
    expect(notifee.alarmTypes.get(timer.id)).toBe(AlarmType.SET_ALARM_CLOCK);
    expect(notifee.armed.get(timer.id)?.timestamp).toBe(timer.endsAt);
    stopTimer(timer.id);
    await settle();
    expect(notifee.armed.has(timer.id)).toBe(false);
  });
});
