/**
 * « Personnaliser… » the repeat, as Google's dialog: every so many days, weeks, months or years; the
 * weekdays of a weekly repeat; the day of the month or « le 2e mardi »; it ends never, on a day, or
 * after a number of times. It writes an RRULE (`makeRule`, `serializeRule`) and says the rule in words
 * as it is built. Drawn with the suite's fields (never the browser's number, select, radio or date
 * inputs); a count that cannot be is said under its field, and OK goes to it.
 */
import { useEffect, useId, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { weekdayNames } from '@unlease/core/services/format';
import { FREQUENCIES, describeRule, makeRule, parseRule, serializeRule, weekCodesFrom, type Frequency, type Rule } from '@unlease/calendar/services/recurrence';
import { narrowWeekday } from '@unlease/calendar/services/eventText';
import { addMonths, daysInMonth, partsOf, weekdayOf } from '@unlease/calendar/services/time';

import { Button } from '@shared/ui/components/Button';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { FormMessage } from '@shared/ui/components/FormMessage';
import layers from '@shared/ui/components/layers.module.css';
import { Layer } from '@shared/ui/components/Layer';
import { Segmented } from '@shared/ui/components/Segmented';
import { SelectField } from '@shared/ui/components/SelectField';
import { TextField } from '@shared/ui/components/TextField';
import { useForm } from '@shared/ui/components/useForm';
import { useUnsaved } from '@shared/ui/components/useUnsaved';
import { useNow } from '../../app/hooks/useToday';
import { usePrefsStore } from '../../app/store/prefs';
import styles from '../calendar.module.css';
import { DateField } from './Fields';

function unitWords(freq: Frequency): string {
  switch (freq) {
    case 'DAILY':
      return t('jours');
    case 'WEEKLY':
      return t('semaines');
    case 'MONTHLY':
      return t('mois');
    case 'YEARLY':
      return t('ans');
  }
}

type Ends = 'never' | 'on' | 'after';

/** A count typed, 1 to 999, or null. */
const readCount = (typed: string): number | null => (/^\d{1,3}$/.test(typed.trim()) && Number(typed) >= 1 ? Number(typed) : null);

function RepeatForm({ start, rrule, onDone, onCancel, onDirty }: { start: string; rrule: string; onDone: (rrule: string) => void; onCancel: () => void; onDirty: (dirty: boolean) => void }) {
  const titleId = useId();
  const prefs = usePrefsStore();
  const { today } = useNow();
  const initial: Rule = parseRule(rrule) ?? makeRule({ freq: 'WEEKLY', byDay: [{ weekday: weekdayOf(start), nth: 0 }] });
  const [freq, setFreq] = useState<Frequency>(initial.freq);
  const [interval, setInterval] = useState(String(initial.interval));
  const [days, setDays] = useState<number[]>(initial.byDay.length > 0 && initial.freq === 'WEEKLY' ? initial.byDay.map(day => day.weekday) : [weekdayOf(start)]);
  const [monthly, setMonthly] = useState<'day' | 'weekday'>(initial.freq === 'MONTHLY' && initial.byDay.length > 0 ? 'weekday' : 'day');
  const [ends, setEnds] = useState<Ends>(initial.count !== null ? 'after' : initial.until ? 'on' : 'never');
  const [until, setUntil] = useState(initial.until?.kind === 'day' ? initial.until.day : addMonths(start.slice(0, 10), 3));
  const [count, setCount] = useState(String(initial.count ?? 10));
  const names = weekdayNames();
  const p = partsOf(start);
  const nth = Math.floor((p.day - 1) / 7) + 1;
  const last = p.day + 7 > daysInMonth(p.year, p.month);
  const every = readCount(interval);
  const times = readCount(count);
  const form = useForm({
    every: every === null ? t('Un nombre de 1 à 999.') : null,
    times: ends === 'after' && times === null ? t('Un nombre de 1 à 999.') : null,
  });
  const build = (): string => {
    const base = makeRule({ freq, interval: every ?? 1 });
    let rule: Rule = base;
    if (freq === 'WEEKLY') rule = { ...base, byDay: [...new Set(days)].sort().map(weekday => ({ weekday, nth: 0 })) };
    if (freq === 'MONTHLY') rule = monthly === 'day' ? { ...base, byMonthDay: [p.day] } : { ...base, byDay: [{ weekday: weekdayOf(start), nth: last && nth > 4 ? -1 : nth }] };
    if (freq === 'YEARLY') rule = { ...base, byMonth: [p.month], byMonthDay: [p.day] };
    if (ends === 'after') rule = { ...rule, count: times ?? 1 };
    if (ends === 'on') rule = { ...rule, until: { kind: 'day', day: until } };
    return serializeRule(rule);
  };
  const built = build();
  const summary = parseRule(built);
  // The dialog asks before a slip loses a rule changed (`RepeatDialog`).
  const dirty = built !== serializeRule(initial);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  return (
    <DialogFrame
      title={t('Répétition personnalisée')}
      titleId={titleId}
      onClose={onCancel}
      className={layers.dialog}
      onSubmit={form.onSubmit(() => onDone(built))}
      foot={
        <>
          <FormMessage form={form} className={styles.footMessage} />
          <Button kind="text" onClick={onCancel}>
            {t('Annuler')}
          </Button>
          <Button type="submit">{t('OK')}</Button>
        </>
      }
    >
      <div className={styles.repeatForm}>
        <div className={styles.repeatEvery}>
          <TextField label={t('Tous les')} kind="number" value={interval} onChange={setInterval} field={form.field('every')} maxLength={3} className={styles.repeatCount} />
          <SelectField label={t('Fréquence')} value={freq} onChange={setFreq} options={FREQUENCIES.map(each => ({ value: each, label: unitWords(each) }))} className={styles.repeatUnit} />
        </div>
        {freq === 'WEEKLY' ? (
          <div className={styles.picker} role="group" aria-label={t('Les jours')}>
            {weekCodesFrom(prefs.weekStart).map(weekday => (
              <button
                key={weekday}
                type="button"
                className={styles.pick}
                aria-pressed={days.includes(weekday)}
                aria-label={names[weekday]}
                onClick={() => setDays(days.includes(weekday) ? (days.length > 1 ? days.filter(each => each !== weekday) : days) : [...days, weekday])}
              >
                {narrowWeekday(weekday)}
              </button>
            ))}
          </div>
        ) : null}
        {freq === 'MONTHLY' ? (
          <SelectField<'day' | 'weekday'>
            label={t('Quel jour du mois')}
            value={monthly}
            onChange={setMonthly}
            options={[
              { value: 'day', label: t('Le {day} de chaque mois', { day: p.day }) },
              { value: 'weekday', label: last && nth > 4 ? t('Le dernier {weekday} du mois', { weekday: names[weekdayOf(start)]! }) : t('Le {nth}e {weekday} du mois', { nth, weekday: names[weekdayOf(start)]! }) },
            ]}
          />
        ) : null}
        <div className={styles.repeatEnds}>
          <span className="t-meta-strong">{t('Se termine')}</span>
          <Segmented<Ends>
            label={t('Se termine')}
            value={ends}
            onChange={setEnds}
            options={[
              { value: 'never', label: t('Jamais') },
              { value: 'on', label: t('Le') },
              { value: 'after', label: t('Après') },
            ]}
          />
          {ends === 'on' ? <DateField value={until} label={t('Dernier jour')} weekStart={prefs.weekStart} today={today} onChange={day => setUntil(day < start.slice(0, 10) ? start.slice(0, 10) : day)} /> : null}
          {ends === 'after' ? (
            <div className={styles.repeatEvery}>
              <TextField ariaLabel={t('Nombre de fois')} kind="number" value={count} onChange={setCount} field={form.field('times')} maxLength={3} className={styles.repeatCount} />
              <span className={`${styles.repeatWord} t-body`}>{t('occurrences')}</span>
            </div>
          ) : null}
        </div>
        {summary ? <p className={`${styles.repeatSummary} t-meta`}>{describeRule(summary, start)}</p> : null}
      </div>
    </DialogFrame>
  );
}

export function RepeatDialog({ open, start, rrule, onDone, onCancel }: { open: boolean; start: string; rrule: string; onDone: (rrule: string) => void; onCancel: () => void }) {
  const [dirty, setDirty] = useState(false);
  const unsaved = useUnsaved(open && dirty);
  return (
    <>
      <Layer open={open} onDismiss={unsaved.guard(onCancel)} label={t('Répétition personnalisée')}>
        {open ? <RepeatForm start={start} rrule={rrule} onDone={onDone} onCancel={onCancel} onDirty={setDirty} /> : null}
      </Layer>
      {unsaved.dialog}
    </>
  );
}
