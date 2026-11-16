/**
 * Clock's places a search finds (`core/services/settingsSearch`), beside every app's (how an alarm
 * rings, the weather's place and the evening check are the phone's alone: the web rings nothing): Réglages'
 * « Alarmes » section (this phone rings, the snooze, how long an alarm rings, how its volume rises,
 * the volume keys, a new alarm's sound, the notice before an alarm, the clock's format, the week's
 * first day), « Au réveil » (the weather, where it is read, the day's events) and « La veille au
 * soir » (the evening check, its hour, the time one needs to get ready).
 */
import { tx } from '@unlease/core/i18n';
import type { SettingsPlace } from '@unlease/core/services/settingsSearch';
import type { GlyphName } from '@unlease/design/glyphs';

/** Réglages' sections, as addresses: the web's `#clock`, the phone's `section`. */
export const CLOCK_SETTINGS_SECTION = 'clock';
export const RINGING_SETTINGS_SECTION = 'clock-ringing';
export const EVENING_SETTINGS_SECTION = 'clock-evening';

const RING_WORDS = ['reveil', 'alarme', 'sonnerie', 'alarm', 'ring'];

const own = (section: string, within: string) => (place: Omit<SettingsPlace<GlyphName>, 'app' | 'area' | 'section' | 'within'>): SettingsPlace<GlyphName> => ({
  ...place,
  app: 'clock',
  area: 'settings',
  section,
  within,
});
const alarms = own(CLOCK_SETTINGS_SECTION, tx('Alarms'));
const ringing = own(RINGING_SETTINGS_SECTION, tx('As it rings'));
const evening = own(EVENING_SETTINGS_SECTION, tx('The evening before'));

export const CLOCK_SETTINGS_PLACES: readonly SettingsPlace<GlyphName>[] = [
  alarms({ id: 'clock-rings-here', title: tx('Ring on this phone'), glyph: 'bell', words: [...RING_WORDS, 'tablette', 'telephone', 'appareil', 'tablet', 'phone', 'device'], only: 'phone' }),
  alarms({ id: 'clock-snooze', title: tx('Snooze length'), glyph: 'clock', words: ['repeter', 'rappel', 'snooze', 'duree', 'minutes', 'length'], only: 'phone' }),
  alarms({ id: 'clock-silence', title: tx('Stop ringing after'), glyph: 'bellOff', words: [...RING_WORDS, 'arret', 'silence', 'manque', 'automatique', 'stop', 'missed', 'silence after'], only: 'phone' }),
  alarms({ id: 'clock-ramp', title: tx('Volume rises over'), glyph: 'bell', words: ['volume', 'progressif', 'douceur', 'monte', 'fondu', 'gradual', 'fade', 'increase', 'gentle'], only: 'phone' }),
  alarms({ id: 'clock-volume-keys', title: tx('Volume buttons'), glyph: 'settings', words: ['boutons', 'touches', 'volume', 'buttons', 'keys'], only: 'phone' }),
  alarms({ id: 'clock-sound', title: tx('A new alarm’s sound'), glyph: 'music', words: ['son', 'sonnerie', 'musique', 'melodie', 'sound', 'ringtone', 'tone', 'music'] }),
  alarms({ id: 'clock-upcoming', title: tx('Notice before an alarm'), glyph: 'bell', words: ['notification', 'prochaine', 'ignorer', 'avant', 'upcoming', 'skip', 'before'], only: 'phone' }),
  alarms({ id: 'clock-twelve-hours', title: tx('12-hour clock'), glyph: 'clock', words: ['heure', 'am', 'pm', 'format', '24 h', '12 h', 'hours', 'time format'] }),
  alarms({ id: 'clock-week-start', title: tx('The week starts on'), glyph: 'calendar', words: ['lundi', 'dimanche', 'samedi', 'premier jour', 'monday', 'sunday', 'saturday', 'first day'] }),
  ringing({ id: 'clock-weather', title: tx('Weather'), glyph: 'sun', words: ['meteo', 'temps', 'temperature', 'pluie', 'weather', 'forecast', 'rain'] }),
  ringing({ id: 'clock-weather-where', title: tx('Weather for'), glyph: 'mapPin', words: ['lieu', 'ville', 'position', 'localisation', 'place', 'city', 'location'], only: 'phone' }),
  ringing({ id: 'clock-agenda', title: tx('The day’s events'), glyph: 'today', words: ['agenda', 'evenements', 'journee', 'rendez-vous', 'calendar', 'events', 'day', 'appointments'] }),
  evening({ id: 'clock-evening', title: tx('Evening check'), glyph: 'moon', words: ['soir', 'veille', 'verification', 'conflit', 'retard', 'evening', 'check', 'clash', 'late'], only: 'phone' }),
  evening({ id: 'clock-evening-at', title: tx('Check at'), glyph: 'clock', words: ['heure', 'soir', '21', 'hour', 'evening'], only: 'phone' }),
  evening({ id: 'clock-margin', title: tx('Time to get ready'), glyph: 'clock', words: ['marge', 'preparer', 'delai', 'minutes', 'margin', 'ready', 'prepare'], only: 'phone' }),
];
