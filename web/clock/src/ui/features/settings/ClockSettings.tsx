/**
 * Clock's part of the Réglages, this browser's own (`ClockPrefs`), as the phone's but for what only
 * a phone does (how an alarm rings, the weather's place, the evening check: `only: 'phone'` in
 * `CLOCK_SETTINGS_PLACES`): « Alarmes » (a new alarm's sound, the 12-hour clock, the week's first day)
 * and « Au réveil » (whether a new alarm shows the weather and the day's events as it rings). Each
 * applies at once. Their sections carry the places' addresses, so a search lands on them.
 */
import { APPS } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import { CLOCK_SETTINGS_SECTION, RINGING_SETTINGS_SECTION } from '@unlease/clock/services/settingsPlaces';
import type { GlyphName } from '@unlease/design/glyphs';

import { SwitchMark } from '@shared/ui/components/Checkbox';
import { Icon } from '@shared/ui/components/Icon';
import { Segmented } from '@shared/ui/components/Segmented';
import { Section } from '@shared/ui/features/settings/Section';
import settings from '@shared/ui/features/settings/settings.module.css';
import type { SettingsSection } from '@shared/modules';
import { savePrefs, usePrefsStore } from '../../../app/store/prefs';
import styles from '../../clock.module.css';
import { SoundField } from '../SoundField';

function Toggle({ on, onChange, title, meta, icon }: { on: boolean; onChange: (on: boolean) => void; title: string; meta: string; icon: GlyphName }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={settings.row} onClick={() => onChange(!on)}>
      <Icon name={icon} size={24} />
      <span className={settings.rowText}>
        <span className="t-body">{title}</span>
        <span className="t-meta">{meta}</span>
      </span>
      <SwitchMark checked={on} />
    </button>
  );
}

function AlarmsSection() {
  const prefs = usePrefsStore();
  return (
    <Section title={t('Alarms')} id={CLOCK_SETTINGS_SECTION}>
      <div className={settings.block}>
        <div className={styles.settingsField}>
          <SoundField label={t('A new alarm’s sound')} value={prefs.defaultSound} onChange={defaultSound => savePrefs({ defaultSound })} help={t('An alarm made in this browser starts with it.')} />
        </div>
        {/* Three choices, segmented (DESIGN), as on the phone. */}
        <p className="t-meta-strong">{t('The week starts on')}</p>
        <Segmented
          label={t('The week starts on')}
          value={String(prefs.weekStart)}
          onChange={day => savePrefs({ weekStart: Number(day) })}
          options={[
            { value: '1', label: t('Monday') },
            { value: '0', label: t('Sunday') },
            { value: '6', label: t('Saturday') },
          ]}
        />
      </div>
      <Toggle on={prefs.twelveHours} onChange={twelveHours => savePrefs({ twelveHours })} icon="clock" title={t('12-hour clock')} meta={t('7:30 PM rather than 19:30.')} />
      <p className={`${settings.help} t-meta`}>{t('How an alarm rings (its snooze, its volume, the evening check) is set on each phone, in {app} for Android.', { app: APPS.clock.name })}</p>
    </Section>
  );
}

function RingingSection() {
  const prefs = usePrefsStore();
  return (
    <Section title={t('As it rings')} id={RINGING_SETTINGS_SECTION}>
      <Toggle on={prefs.weatherDefault} onChange={weatherDefault => savePrefs({ weatherDefault })} icon="sun" title={t('Weather')} meta={t('A new alarm shows the day’s weather where the phone is.')} />
      <Toggle
        on={prefs.agendaDefault}
        onChange={agendaDefault => savePrefs({ agendaDefault })}
        icon="today"
        title={t('The day’s events')}
        meta={t('A new alarm shows your first events from {app}.', { app: APPS.calendar.name })}
      />
    </Section>
  );
}

export const CLOCK_SETTINGS: readonly SettingsSection[] = [
  { id: 'clock-alarms', Body: AlarmsSection },
  { id: 'clock-ringing', Body: RingingSection },
];
