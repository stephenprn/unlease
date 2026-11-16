/**
 * The sounds an alarm can ring with: Clock's own (Ogg files shipped in the phone app, `res/raw`, and
 * the web app, `sounds/`; CC0 and Apache-2.0, credited in `docs/SOUNDS.md`), the phone's own alarm
 * sounds (`phone:<uri>`, picked through Android's picker and read on that phone only: another phone
 * rings the default), or none (`silent`, vibration alone). Each mood leads its group in the picker.
 */
import { localized, t, tx } from '@unlease/core/i18n';

export type SoundMood = 'gentle' | 'classic' | 'lively';

export interface Sound {
  readonly key: string;
  readonly mood: SoundMood;
}

/** In the picker's order: gentle first, then classic, then lively. Keys are stored: never rename one. */
export const SOUNDS: readonly Sound[] = [
  { key: 'sunrise', mood: 'gentle' },
  { key: 'birdsong', mood: 'gentle' },
  { key: 'chimes', mood: 'gentle' },
  { key: 'bowl', mood: 'gentle' },
  { key: 'melody', mood: 'classic' },
  { key: 'bell', mood: 'classic' },
  { key: 'digital', mood: 'classic' },
  { key: 'groove', mood: 'lively' },
  { key: 'rooster', mood: 'lively' },
];

/** Bright and musical, full from its first note: pleasant, yet hard to sleep through. */
export const DEFAULT_SOUND = 'melody';
export const SILENT = 'silent';
export const PHONE_SOUND = 'phone:';

const SOUND_NAMES: Readonly<Record<string, string>> = localized({
  sunrise: tx('Sunrise'),
  birdsong: tx('Birdsong'),
  chimes: tx('Wind chimes'),
  bowl: tx('Singing bowl'),
  melody: tx('Bright melody'),
  bell: tx('Bell alarm clock'),
  digital: tx('Digital beeps'),
  groove: tx('Neon groove'),
  rooster: tx('Rooster'),
});

export const MOOD_NAMES: Readonly<Record<SoundMood, string>> = localized({
  gentle: tx('Gentle'),
  classic: tx('Classic'),
  lively: tx('Lively'),
});

export const isBundledSound = (key: string): boolean => SOUNDS.some(sound => sound.key === key);
export const isPhoneSound = (key: string): boolean => key.startsWith(PHONE_SOUND);

/** A phone's sound as stored: `phone:<uri>|<its name>`, the name kept so another device can say what it was. */
export function phoneSound(uri: string, name: string): string {
  return `${PHONE_SOUND}${uri}|${name.replace(/\|/g, ' ').slice(0, 120)}`;
}

/** A phone's sound read back: its address and its name. */
export function readPhoneSound(key: string): { readonly uri: string; readonly name: string } | null {
  if (!isPhoneSound(key)) return null;
  const rest = key.slice(PHONE_SOUND.length);
  const bar = rest.lastIndexOf('|');
  return bar < 0 ? { uri: rest, name: '' } : { uri: rest.slice(0, bar), name: rest.slice(bar + 1) };
}

/** A sound's name as the editor and the settings say it. */
export function soundName(key: string): string {
  if (key === SILENT) return t('Silent (vibration only)');
  const phone = readPhoneSound(key);
  if (phone) return phone.name || t('A sound of the phone');
  return SOUND_NAMES[key] ?? SOUND_NAMES[DEFAULT_SOUND]!;
}

/** The key a sound plays as: a bundled one, else the default (an unknown key a newer client wrote). */
export const playableSound = (key: string): string => (isBundledSound(key) || key === SILENT || isPhoneSound(key) ? key : DEFAULT_SOUND);
