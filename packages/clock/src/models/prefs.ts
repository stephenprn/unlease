/**
 * How Clock rings on this device (Réglages, never synced): whether this phone rings at all, the
 * snooze, how long an alarm rings unanswered, how its volume rises, what the volume keys do, what a
 * new alarm shows as it rings, where the weather is read, and the evening check (an event too close
 * to tomorrow's alarm, said the evening before).
 */
import { isClockTime } from './alarm';

export type VolumeKeys = 'volume' | 'snooze' | 'stop';
export const VOLUME_KEYS: readonly VolumeKeys[] = ['volume', 'snooze', 'stop'];

/** Where the weather is read as an alarm rings: where the phone is (its last known place, coarse), else the place chosen. */
export type WeatherWhere = 'phone' | 'place';

/** A place picked for the weather (the suite's place search): its name and where it is. */
export interface WeatherPlace {
  readonly label: string;
  readonly lat: number;
  readonly lon: number;
}

export interface ClockPrefs {
  /** This phone rings the alarms (a tablet, a second phone: off). */
  readonly ringsHere: boolean;
  readonly snoozeMinutes: number;
  /** An alarm left ringing stops after this long, and says it was missed. */
  readonly silenceAfter: number;
  /** Seconds the volume takes to rise to the alarm's volume; 0 at once. */
  readonly rampSeconds: number;
  readonly volumeKeys: VolumeKeys;
  /** A new alarm's sound. */
  readonly defaultSound: string;
  /** A new alarm shows the weather as it rings. */
  readonly weatherDefault: boolean;
  /** A new alarm shows the day's events as it rings. */
  readonly agendaDefault: boolean;
  readonly weatherWhere: WeatherWhere;
  /** Where the weather is read when the phone says nothing of where it is (or `weatherWhere` is `place`). */
  readonly weatherPlace: WeatherPlace | null;
  /** The evening check: tomorrow's first event too close to (or before) tomorrow's alarm, said at `eveningAt`. */
  readonly eveningCheck: boolean;
  /** `21:00`. */
  readonly eveningAt: string;
  /** How long one needs between the alarm and the first event (minutes). */
  readonly marginMinutes: number;
  /** A quiet notification before an alarm, to skip it (minutes before; 0 none). */
  readonly upcomingMinutes: number;
  /** 0 Sunday, 1 Monday, 6 Saturday: the order of the days. */
  readonly weekStart: number;
  readonly twelveHours: boolean;
  /** An instant timer's sound (a saved one names its own), and whether it vibrates. */
  readonly timerSound: string;
  readonly timerVibrate: boolean;
}

export const SNOOZE_CHOICES = [1, 2, 3, 5, 10, 15, 20, 30] as const;
export const SILENCE_CHOICES = [1, 5, 10, 15, 20, 30] as const;
export const RAMP_CHOICES = [0, 15, 30, 60, 120] as const;
export const MARGIN_CHOICES = [15, 30, 45, 60, 90, 120] as const;
export const UPCOMING_CHOICES = [0, 30, 60, 120] as const;

export const CLOCK_PREFS_DEFAULTS: ClockPrefs = {
  ringsHere: true,
  snoozeMinutes: 10,
  silenceAfter: 10,
  rampSeconds: 30,
  volumeKeys: 'volume',
  defaultSound: 'melody',
  weatherDefault: true,
  agendaDefault: true,
  weatherWhere: 'phone',
  weatherPlace: null,
  eveningCheck: true,
  eveningAt: '21:00',
  marginMinutes: 30,
  upcomingMinutes: 60,
  weekStart: 1,
  twelveHours: false,
  timerSound: 'bell',
  timerVibrate: true,
};

const among = <T extends number>(choices: readonly T[], value: unknown, fallback: T): T => (choices as readonly unknown[]).includes(value) ? (value as T) : fallback;

function readPlace(value: unknown): WeatherPlace | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const { label, lat, lon } = raw;
  if (typeof label !== 'string' || typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { label: label.slice(0, 200), lat, lon };
}

/** Prefs as stored, read whole: what is missing or wrong takes its default. */
export function readClockPrefs(value: unknown): ClockPrefs {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Partial<Record<keyof ClockPrefs, unknown>>;
  const d = CLOCK_PREFS_DEFAULTS;
  const flag = (key: keyof ClockPrefs, fallback: boolean): boolean => (typeof raw[key] === 'boolean' ? (raw[key] as boolean) : fallback);
  return {
    ringsHere: flag('ringsHere', d.ringsHere),
    snoozeMinutes: among(SNOOZE_CHOICES, raw.snoozeMinutes, 10),
    silenceAfter: among(SILENCE_CHOICES, raw.silenceAfter, 10),
    rampSeconds: among(RAMP_CHOICES, raw.rampSeconds, 30),
    volumeKeys: (VOLUME_KEYS as readonly unknown[]).includes(raw.volumeKeys) ? (raw.volumeKeys as VolumeKeys) : d.volumeKeys,
    defaultSound: typeof raw.defaultSound === 'string' && raw.defaultSound.length > 0 && raw.defaultSound.length <= 600 ? raw.defaultSound : d.defaultSound,
    weatherDefault: flag('weatherDefault', d.weatherDefault),
    agendaDefault: flag('agendaDefault', d.agendaDefault),
    weatherWhere: raw.weatherWhere === 'place' ? 'place' : 'phone',
    weatherPlace: readPlace(raw.weatherPlace),
    eveningCheck: flag('eveningCheck', d.eveningCheck),
    eveningAt: isClockTime(raw.eveningAt) ? raw.eveningAt : d.eveningAt,
    marginMinutes: among(MARGIN_CHOICES, raw.marginMinutes, 30),
    upcomingMinutes: among(UPCOMING_CHOICES, raw.upcomingMinutes, 60),
    weekStart: raw.weekStart === 0 || raw.weekStart === 1 || raw.weekStart === 6 ? raw.weekStart : d.weekStart,
    twelveHours: flag('twelveHours', d.twelveHours),
    timerSound: typeof raw.timerSound === 'string' && raw.timerSound.length > 0 && raw.timerSound.length <= 600 ? raw.timerSound : d.timerSound,
    timerVibrate: flag('timerVibrate', d.timerVibrate),
  };
}
