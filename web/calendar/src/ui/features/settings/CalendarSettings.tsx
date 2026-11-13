/**
 * Agenda's part of the Réglages, this browser's own: the view it opens on, the week's first day,
 * weekends and week numbers, the hours' format, a new event's length and reminders, where the
 * weather is asked, the reminders and the morning summary as this browser's notifications. In « Données », as on the
 * phone: the export of one's events as one `.ics`, after the import the shell lists first (`importer`).
 */
import { useState } from 'react';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { isOwn } from '@unlease/calendar/models/events';
import { DIGEST_TIMES } from '@unlease/calendar/services/digest';
import { clockWords, lengthWords, reminderWords, REMINDER_CHOICES, VIEW_NAMES, VIEWS, type CalendarView } from '@unlease/calendar/services/eventText';
import { EVENT_LENGTHS } from '@unlease/calendar/models/prefs';
import { CALENDAR_SETTINGS_SECTION } from '@unlease/calendar/services/settingsPlaces';

import { selectServer, useSettingsStore } from '@shared/app/store/settings';
import { showError, showSnack } from '@shared/app/store/ui';
import { SwitchMark } from '@shared/ui/components/Checkbox';
import { Icon } from '@shared/ui/components/Icon';
import { Segmented } from '@shared/ui/components/Segmented';
import { SelectField } from '@shared/ui/components/SelectField';
import { TextField } from '@shared/ui/components/TextField';
import { Section } from '@shared/ui/features/settings/Section';
import settings from '@shared/ui/features/settings/settings.module.css';
import type { SettingsSection } from '@shared/modules';
import { disableDigest, disableNotifications, enableDigest, enableNotifications, pushSupported, savePushPrefs } from '../../../app/push';
import { useCalendarStore } from '../../../app/store/library';
import { savePrefs, usePrefsStore } from '../../../app/store/prefs';
import { exportCalendar } from '../exporting';

function Toggle({ on, onChange, title, meta, icon }: { on: boolean; onChange: (on: boolean) => void; title: string; meta: string; icon: Parameters<typeof Icon>[0]['name'] }) {
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

/** A select's value for « Aucun ». */
const NONE = 'none';

/** Where the weather is asked: saved when the field is left or Entrée pressed, never at each letter. */
function WeatherPlace() {
  const saved = usePrefsStore(s => s.homePlace);
  const [typed, setTyped] = useState(saved);
  const [shown, setShown] = useState(saved);
  // Changed elsewhere (another tab): the new place shows.
  if (saved !== shown) {
    setShown(saved);
    setTyped(saved);
  }
  const commit = (): void => {
    if (typed.trim() !== saved) savePrefs({ homePlace: typed.trim() });
  };
  return (
    <TextField
      label={t('Weather')}
      kind="city"
      value={typed}
      onChange={setTyped}
      onBlur={commit}
      onKeyDown={event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
      }}
      enterKeyHint="done"
      placeholder={t('Your city')}
      maxLength={200}
      help={t('For days without an event with a place: a city, for example “Lyon”. Leave empty to show it only for events with a place.')}
    />
  );
}

function CalendarSection() {
  const prefs = usePrefsStore();
  const server = useSettingsStore(selectServer);
  const [busy, setBusy] = useState(false);
  const toggleNotify = async (on: boolean): Promise<void> => {
    setBusy(true);
    try {
      if (!on) {
        await disableNotifications(server);
        showSnack(t('This browser’s reminders turned off'));
        return;
      }
      if (!server) {
        showError(t('Reminders go through your server: connect one first.'));
        return;
      }
      const refused = await enableNotifications(server);
      if (refused) showError(refused);
      else showSnack(t('Reminders on in this browser'), undefined, { tone: 'success' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title={t('Calendar')} id={CALENDAR_SETTINGS_SECTION}>
      <div className={settings.block}>
        <SelectField<CalendarView> label={t('View on opening')} value={prefs.view} onChange={view => savePrefs({ view })} options={VIEWS.map(view => ({ value: view, label: VIEW_NAMES[view] }))} />
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
        <SelectField label={t('A new event’s length')} value={String(prefs.eventLength)} onChange={minutes => savePrefs({ eventLength: Number(minutes) })} options={EVENT_LENGTHS.map(minutes => ({ value: String(minutes), label: lengthWords(minutes) }))} />
        <SelectField
          label={t('A new event’s reminder')}
          value={String(prefs.reminders[0] ?? NONE)}
          onChange={minutes => savePrefs({ reminders: minutes === NONE ? [] : [Number(minutes)] })}
          options={[{ value: NONE, label: t('None') }, ...REMINDER_CHOICES.timed.map(minutes => ({ value: String(minutes), label: reminderWords(minutes, false) }))]}
        />
        <SelectField
          label={t('A new all-day event’s reminder')}
          value={String(prefs.allDayReminders[0] ?? NONE)}
          onChange={minutes => savePrefs({ allDayReminders: minutes === NONE ? [] : [Number(minutes)] })}
          options={[{ value: NONE, label: t('None') }, ...REMINDER_CHOICES.allDay.map(minutes => ({ value: String(minutes), label: reminderWords(minutes, true) }))]}
        />
        <WeatherPlace />
      </div>
      <Toggle on={prefs.hideWeekends} onChange={on => savePrefs({ hideWeekends: on })} icon="calendar" title={t('Hide weekends')} meta={t('The week and the month without Saturday and Sunday.')} />
      <Toggle on={prefs.weekNumbers} onChange={on => savePrefs({ weekNumbers: on })} icon="numbered" title={t('Week numbers')} meta={t('The week’s ISO number, left of its days.')} />
      <Toggle on={prefs.twelveHours} onChange={on => void savePushPrefs({ twelveHours: on })} icon="clock" title={t('12-hour clock')} meta={t('2 PM rather than 14:00.')} />
      {pushSupported() ? (
        <button type="button" role="switch" aria-checked={prefs.notify} className={settings.row} disabled={busy} onClick={() => void toggleNotify(!prefs.notify)}>
          <Icon name="bell" size={24} />
          <span className={settings.rowText}>
            <span className="t-body">{t('Reminders in this browser')}</span>
            <span className="t-meta">{t('Your events’ reminders as notifications, even with the tab closed.')}</span>
          </span>
          <SwitchMark checked={prefs.notify} />
        </button>
      ) : null}
      <DigestRows />
    </Section>
  );
}

/**
 * The morning digest (`services/digest`), pushed by the server to this browser at the time chosen:
 * on or off, its time, and whether a day with nothing says so. A browser that cannot receive
 * notifications says so instead of offering it.
 */
function DigestRows() {
  const prefs = usePrefsStore();
  const server = useSettingsStore(selectServer);
  const [busy, setBusy] = useState(false);
  if (!pushSupported()) {
    return (
      <div className={settings.row}>
        <Icon name="bell" size={24} />
        <span className={settings.rowText}>
          <span className="t-body">{t('Morning summary')}</span>
          <span className="t-meta">{t('This browser does not receive notifications.')}</span>
        </span>
      </div>
    );
  }
  const toggle = async (on: boolean): Promise<void> => {
    setBusy(true);
    try {
      if (!on) {
        await disableDigest(server);
        showSnack(t('This browser’s morning summary turned off'));
        return;
      }
      if (!server) {
        showError(t('The morning summary goes through your server: connect one first.'));
        return;
      }
      const refused = await enableDigest(server);
      if (refused) showError(refused);
      else showSnack(t('Morning summary on in this browser'), undefined, { tone: 'success' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" role="switch" aria-checked={prefs.digest} className={settings.row} disabled={busy} onClick={() => void toggle(!prefs.digest)}>
        <Icon name="today" size={24} />
        <span className={settings.rowText}>
          <span className="t-body">{t('Morning summary')}</span>
          <span className="t-meta">{t('Your day in one notification each morning: events, birthdays, reminders and pages.')}</span>
        </span>
        <SwitchMark checked={prefs.digest} />
      </button>
      {prefs.digest ? (
        <>
          <div className={settings.block}>
            <SelectField label={t('At')} value={prefs.digestAt} onChange={digestAt => void savePushPrefs({ digestAt })} options={DIGEST_TIMES.map(time => ({ value: time, label: clockWords(time, prefs.twelveHours) }))} />
          </div>
          <Toggle on={prefs.digestEmpty} onChange={digestEmpty => void savePushPrefs({ digestEmpty })} icon="calendar" title={t('Even on days with nothing')} meta={t('Says so when the day holds nothing.')} />
        </>
      ) : null}
    </>
  );
}

/** « Données »'s export, the phone's row: it goes out (`upload`), after the import that comes in (the shell's row). */
function CalendarData() {
  const events = useCalendarStore(s => s.events);
  const own = Object.values(events).filter(event => event.deletedAt === null && event.trashedAt === null && isOwn(event) && !event.recurringId).length;
  const exportAll = (): void => {
    exportCalendar();
    showSnack(t('{events} exported', { events: plural(own, 'event') }), undefined, { tone: 'success' });
  };
  return (
    <>
      {own > 0 ? (
        <button type="button" className={settings.row} onClick={exportAll}>
          <Icon name="upload" size={24} />
          <span className={settings.rowText}>
            <span className="t-body">{t('Export')}</span>
            <span className="t-meta">{t('{events} in an .ics file', { events: plural(own, 'event') })}</span>
          </span>
        </button>
      ) : (
        <div className={settings.row}>
          <Icon name="upload" size={24} />
          <span className={settings.rowText}>
            <span className="t-body">{t('Export')}</span>
            <span className="t-meta">{t('No event to export.')}</span>
          </span>
        </div>
      )}
    </>
  );
}

export const CALENDAR_SETTINGS: readonly SettingsSection[] = [
  { id: 'calendar-view', Body: CalendarSection },
  { id: 'calendar-data', Body: CalendarData, place: 'data' },
];
