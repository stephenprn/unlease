/**
 * Setting a reminder: the phone's quick choices for the usual cases, then a
 * day and a time for everything else. Under 720px the day and the time are the
 * phone's chips (ReminderSheet: the next two weeks, the hours from 6 to 22, the
 * quarters), in place of the list; wider, a date and a time field under it. The
 * web app stores and shows it; the phone is what rings, so the picker says so.
 */
import { useState, type RefObject } from 'react';

import { getLocale, t } from '@unlease/core/i18n';
import { dayDelta, formatDay, formatReminder, weekdayNames } from '@unlease/core/services/format';

import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { Popover } from '../../components/Popover';
import inputs from '../../components/controls.module.css';
import { NARROW, useMedia } from '../../useMedia';
import styles from './editor.module.css';
import { arrowKeys } from './radioKeys';

function at(day: Date, hour: number, minute = 0): number {
  const date = new Date(day);
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
}

/** The phone's quick choices (ReminderSheet), by the same rules. */
export function quickReminders(now: number): { label: string; time: number }[] {
  const today = new Date(now);
  const hour = today.getHours();
  const tomorrow = new Date(now);
  tomorrow.setDate(today.getDate() + 1);
  const monday = new Date(now);
  monday.setDate(today.getDate() + ((8 - today.getDay()) % 7 || 7));
  const options: { label: string; time: number }[] = [];
  if (hour < 17) options.push({ label: t('Plus tard aujourd’hui'), time: at(today, 18) });
  else if (hour < 20) options.push({ label: t('Ce soir'), time: at(today, 21) });
  options.push({ label: t('Demain matin'), time: at(tomorrow, 8) });
  options.push({ label: t('Lundi prochain'), time: at(monday, 8) });
  return options;
}

const pad = (value: number): string => String(value).padStart(2, '0');
const dateValue = (time: number): string => {
  const date = new Date(time);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const timeValue = (time: number): string => {
  const date = new Date(time);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

function parseLocal(day: string, clock: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const t = /^(\d{2}):(\d{2})$/.exec(clock);
  if (!d || !t) return null;
  return new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]), 0, 0).getTime();
}

export interface ReminderPickerProps {
  readonly open: boolean;
  readonly anchor: RefObject<HTMLElement | null>;
  readonly current: number | null;
  readonly now: number;
  readonly onDismiss: () => void;
  readonly onSet: (time: number | null) => void;
}

function CustomTime({ current, now, onSet }: { current: number | null; now: number; onSet: (time: number) => void }) {
  const start = current ?? now + 3_600_000;
  const [day, setDay] = useState(dateValue(start));
  const [clock, setClock] = useState(timeValue(start - (start % 900_000)));
  const chosen = parseLocal(day, clock);
  const valid = chosen !== null && chosen > now;
  return (
    <form
      className={styles.custom}
      onSubmit={event => {
        event.preventDefault();
        if (valid && chosen !== null) onSet(chosen);
      }}
    >
      <label className={`${styles.customField} t-meta-strong`}>
        {t('Jour')}
        <input type="date" className={inputs.input} value={day} min={dateValue(now)} onChange={event => setDay(event.target.value)} required />
      </label>
      <label className={`${styles.customField} t-meta-strong`}>
        {t('Heure')}
        <input type="time" className={inputs.input} value={clock} step={300} onChange={event => setClock(event.target.value)} required />
      </label>
      <div className={styles.customFoot}>
        <span className="t-meta">{chosen !== null ? (valid ? formatReminder(chosen, now) : t('Choisissez un moment à venir')) : ''}</span>
        <Button type="submit" small disabled={!valid}>
          {t('Enregistrer')}
        </Button>
      </div>
    </form>
  );
}

const DAY_COUNT = 14;
/** A weekday on its chip: « lun. », "Mon". */
const shortDay = (day: number): string => {
  const name = weekdayNames()[day] ?? '';
  return getLocale() === 'en' ? name.slice(0, 3) : `${name.slice(0, 3)}.`;
};
/** A weekday read out at the head of a sentence: « Lundi », "Monday". */
const longDay = (day: number): string => {
  const name = weekdayNames()[day] ?? '';
  return name.charAt(0).toUpperCase() + name.slice(1);
};
const HOURS = Array.from({ length: 17 }, (_, index) => index + 6);
const QUARTERS = [0, 15, 30, 45];
const QUARTER_MS = 900_000;

/** The phone's chips: a day of the next two weeks, an hour, a quarter. */
function CustomChips({ current, now, onSet }: { current: number | null; now: number; onSet: (time: number) => void }) {
  // Where the chips start: the reminder set, else in an hour, on the nearest quarter.
  const [start] = useState(() => new Date(Math.round((current ?? now + 3_600_000) / QUARTER_MS) * QUARTER_MS));
  const [day, setDay] = useState(() => Math.min(DAY_COUNT - 1, Math.max(0, dayDelta(start.getTime(), now))));
  const [hour, setHour] = useState(start.getHours());
  const [minute, setMinute] = useState(start.getMinutes());
  const days = Array.from({ length: DAY_COUNT }, (_, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() + index);
    return date;
  });
  const chosen = at(days[day]!, hour, minute);
  const indexes = days.map((_, index) => index);
  return (
    <div className={styles.when}>
      <h3 className="t-meta-strong">{t('Jour')}</h3>
      <div className={styles.days} role="radiogroup" aria-label={t('Jour')} onKeyDown={arrowKeys(indexes, day, setDay, String)}>
        {days.map((date, index) => (
          <button
            key={index}
            type="button"
            role="radio"
            aria-checked={index === day}
            aria-label={`${index === 0 ? t('Aujourd’hui') : index === 1 ? t('Demain') : longDay(date.getDay())}, ${formatDay(date.getTime(), now)}`}
            data-key={index}
            tabIndex={index === day ? 0 : -1}
            // Opened on the day already chosen, scrolled into view.
            autoFocus={index === day}
            className={`${styles.whenChip} ${styles.day}`}
            onClick={() => setDay(index)}
          >
            <span className={`${styles.dayName} t-meta`}>{index === 0 ? t('auj.') : index === 1 ? t('dem.') : shortDay(date.getDay())}</span>
            <span className="t-body-strong">{date.getDate()}</span>
          </button>
        ))}
      </div>
      <h3 className="t-meta-strong">{t('Heure')}</h3>
      <div className={styles.hours} role="radiogroup" aria-label={t('Heure')} onKeyDown={arrowKeys(HOURS, hour, setHour, String)}>
        {HOURS.map(value => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={value === hour}
            data-key={value}
            tabIndex={value === hour || (!HOURS.includes(hour) && value === HOURS[0]) ? 0 : -1}
            className={`${styles.whenChip} ${styles.hour} t-label`}
            onClick={() => setHour(value)}
          >
            {t('{hour} h', { hour: value })}
          </button>
        ))}
      </div>
      <div className={styles.quarters} role="radiogroup" aria-label={t('Minutes')} onKeyDown={arrowKeys(QUARTERS, minute, setMinute, String)}>
        {QUARTERS.map(value => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={value === minute}
            aria-label={`${value} min`}
            data-key={value}
            tabIndex={value === minute ? 0 : -1}
            className={`${styles.whenChip} ${styles.quarter} t-label`}
            onClick={() => setMinute(value)}
          >
            {`:${pad(value)}`}
          </button>
        ))}
      </div>
      <div className={styles.whenFoot}>
        <span className="t-body-strong">{formatReminder(chosen, now)}</span>
        <Button disabled={chosen <= now} onClick={() => onSet(chosen)}>
          {t('Enregistrer')}
        </Button>
      </div>
    </div>
  );
}

export function ReminderPicker({ open, anchor, current, now, onDismiss, onSet }: ReminderPickerProps) {
  const narrow = useMedia(NARROW);
  const [custom, setCustom] = useState(false);
  // Each opening starts on the quick choices; one closing keeps what it shows while it leaves, so its height never jumps.
  const [opened, setOpened] = useState(open);
  if (open !== opened) {
    setOpened(open);
    if (open) setCustom(false);
  }
  const set = (time: number | null): void => {
    onSet(time);
    onDismiss();
  };
  return (
    <Popover open={open} anchor={anchor} onDismiss={onDismiss} label={t('Rappel')} width={340}>
      <div className={styles.picker}>
        <h2 className={`${styles.pickerTitle} ${narrow ? 't-title' : 't-label'}`}>{t('Rappel')}</h2>
        {/* On a phone the chips take the list's place, as in the phone's sheet. */}
        {narrow && custom ? (
          <CustomChips current={current} now={now} onSet={set} />
        ) : (
          <>
            {quickReminders(now).map(option => (
              <button key={option.label} type="button" className={styles.pickerRow} onClick={() => set(option.time)}>
                <Icon name="clock" size={20} />
                {option.label}
                <span className={styles.pickerWhen}>{formatReminder(option.time, now)}</span>
              </button>
            ))}
            <button type="button" className={styles.pickerRow} aria-expanded={custom} onClick={() => setCustom(value => !value)}>
              <Icon name="calendar" size={20} />
              {t('Choisir la date et l’heure')}
            </button>
            {custom ? <CustomTime current={current} now={now} onSet={set} /> : null}
            {current !== null ? (
              <button type="button" className={styles.pickerRow} data-danger onClick={() => set(null)}>
                <Icon name="bellOff" size={20} />
                {t('Supprimer le rappel')}
                <span className={styles.pickerWhen}>{formatReminder(current, now)}</span>
              </button>
            ) : null}
          </>
        )}
        <p className={`${styles.pickerNote} t-meta`}>{t('Votre téléphone sonnera à l’heure dite.')}</p>
      </div>
    </Popover>
  );
}
