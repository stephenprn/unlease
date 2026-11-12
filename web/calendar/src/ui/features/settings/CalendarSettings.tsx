/**
 * Agenda's part of the Réglages, this browser's own: the view it opens on, the week's first day,
 * weekends and week numbers, the hours' format, a new event's length and reminders, where the
 * weather is asked, and the reminders as this browser's notifications. In « Données », as on the
 * phone: the export of one's events as one `.ics`, after the import the shell lists first (`importer`).
 */
import { useState } from 'react';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { isOwn } from '@unlease/calendar/models/events';
import { lengthWords, reminderWords, REMINDER_CHOICES, VIEW_NAMES, VIEWS, type CalendarView } from '@unlease/calendar/services/eventText';
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
import { disableNotifications, enableNotifications, pushSupported } from '../../../app/push';
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
      label={t('Météo')}
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
      placeholder={t('Votre ville')}
      maxLength={200}
      help={t('Pour les jours sans événement avec un lieu : une ville, par exemple « Lyon ». Laissez vide pour n’en montrer qu’aux événements situés.')}
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
        showSnack(t('Rappels de ce navigateur désactivés'));
        return;
      }
      if (!server) {
        showError(t('Les rappels passent par votre serveur : connectez-en un d’abord.'));
        return;
      }
      const refused = await enableNotifications(server);
      if (refused) showError(refused);
      else showSnack(t('Rappels activés sur ce navigateur'), undefined, { tone: 'success' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title={t('Agenda')} id={CALENDAR_SETTINGS_SECTION}>
      <div className={settings.block}>
        <SelectField<CalendarView> label={t('Vue à l’ouverture')} value={prefs.view} onChange={view => savePrefs({ view })} options={VIEWS.map(view => ({ value: view, label: VIEW_NAMES[view] }))} />
        {/* Three choices, segmented (DESIGN), as on the phone. */}
        <p className="t-meta-strong">{t('La semaine commence le')}</p>
        <Segmented
          label={t('La semaine commence le')}
          value={String(prefs.weekStart)}
          onChange={day => savePrefs({ weekStart: Number(day) })}
          options={[
            { value: '1', label: t('Lundi') },
            { value: '0', label: t('Dimanche') },
            { value: '6', label: t('Samedi') },
          ]}
        />
        <SelectField label={t('Durée d’un nouvel événement')} value={String(prefs.eventLength)} onChange={minutes => savePrefs({ eventLength: Number(minutes) })} options={EVENT_LENGTHS.map(minutes => ({ value: String(minutes), label: lengthWords(minutes) }))} />
        <SelectField
          label={t('Rappel d’un nouvel événement')}
          value={String(prefs.reminders[0] ?? NONE)}
          onChange={minutes => savePrefs({ reminders: minutes === NONE ? [] : [Number(minutes)] })}
          options={[{ value: NONE, label: t('Aucun') }, ...REMINDER_CHOICES.timed.map(minutes => ({ value: String(minutes), label: reminderWords(minutes, false) }))]}
        />
        <SelectField
          label={t('Rappel d’un nouvel événement d’une journée')}
          value={String(prefs.allDayReminders[0] ?? NONE)}
          onChange={minutes => savePrefs({ allDayReminders: minutes === NONE ? [] : [Number(minutes)] })}
          options={[{ value: NONE, label: t('Aucun') }, ...REMINDER_CHOICES.allDay.map(minutes => ({ value: String(minutes), label: reminderWords(minutes, true) }))]}
        />
        <WeatherPlace />
      </div>
      <Toggle on={prefs.hideWeekends} onChange={on => savePrefs({ hideWeekends: on })} icon="calendar" title={t('Masquer les week-ends')} meta={t('La semaine et le mois sans samedi ni dimanche.')} />
      <Toggle on={prefs.weekNumbers} onChange={on => savePrefs({ weekNumbers: on })} icon="numbered" title={t('Numéros de semaine')} meta={t('Le numéro ISO de la semaine, à gauche de ses jours.')} />
      <Toggle on={prefs.twelveHours} onChange={on => savePrefs({ twelveHours: on })} icon="clock" title={t('Heures sur 12')} meta={t('2 PM plutôt que 14:00.')} />
      {pushSupported() ? (
        <button type="button" role="switch" aria-checked={prefs.notify} className={settings.row} disabled={busy} onClick={() => void toggleNotify(!prefs.notify)}>
          <Icon name="bell" size={24} />
          <span className={settings.rowText}>
            <span className="t-body">{t('Rappels sur ce navigateur')}</span>
            <span className="t-meta">{t('Les rappels de vos événements en notifications, même l’onglet fermé.')}</span>
          </span>
          <SwitchMark checked={prefs.notify} />
        </button>
      ) : null}
    </Section>
  );
}

/** « Données »'s export, the phone's row: it goes out (`upload`), after the import that comes in (the shell's row). */
function CalendarData() {
  const events = useCalendarStore(s => s.events);
  const own = Object.values(events).filter(event => event.deletedAt === null && event.trashedAt === null && isOwn(event) && !event.recurringId).length;
  const exportAll = (): void => {
    exportCalendar();
    showSnack(t('{events} exportés', { events: plural(own, 'événement') }), undefined, { tone: 'success' });
  };
  return (
    <>
      {own > 0 ? (
        <button type="button" className={settings.row} onClick={exportAll}>
          <Icon name="upload" size={24} />
          <span className={settings.rowText}>
            <span className="t-body">{t('Exporter')}</span>
            <span className="t-meta">{t('{events} dans un fichier .ics', { events: plural(own, 'événement') })}</span>
          </span>
        </button>
      ) : (
        <div className={settings.row}>
          <Icon name="upload" size={24} />
          <span className={settings.rowText}>
            <span className="t-body">{t('Exporter')}</span>
            <span className="t-meta">{t('Aucun événement à exporter.')}</span>
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
