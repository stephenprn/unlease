/**
 * An alarm's form, over the page it was opened from (`/clock/alarm/<id>`, `/clock/new`): a dialog, the
 * phone's sheet under 720 (DESIGN's Forms). The time first, large and typed as people type it
 * (« 7h30 », « 730 », « 7:30 pm »: `readClock`), with when it would ring under it (« Sonnera dans
 * 9 h 12 »); the days, as a quick choice or each in the week's order; the label; the sound, heard
 * from its play button; what the alarm shows as it rings; « Ignorer la prochaine » for a repeating
 * alarm already saved. One way to save: « Enregistrer », Enter in a field, ⌘/Ctrl+Enter or ⌘/Ctrl+S;
 * leaving with changes asks first (`useUnsaved`). A new alarm's time takes the caret; an alarm opened
 * shows itself with the keyboard down. The web rings nothing: the phones ring what is saved here.
 */
import { useEffect, useEffectEvent, useId, useMemo, useRef, useState, type RefObject } from 'react';

import { APPS } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import { isBlank } from '@unlease/core/services/formChecks';
import { clockWords, weekdayDay } from '@unlease/calendar/services/eventText';
import { spanWords } from '@unlease/calendar/services/today';
import { addDays, instantToDay, instantToWall, readClock } from '@unlease/calendar/services/time';
import { DAY_PATTERN } from '@unlease/calendar/models/events';
import { ALARM_LIMITS, normalizeDays, type Alarm } from '@unlease/clock/models/alarm';
import { linkedOccurrence, offDaysFrom } from '@unlease/clock/services/agenda';
import { blankDraft, draftChanged, draftOf, type AlarmDraft } from '@unlease/clock/services/editing';
import { BEFORE_CHOICES, DAYS_CHOICES, DEFAULT_BEFORE, daysChoiceName, daysChoiceOf, daysOfChoice, draftRing, linkedDraft, retimedDraft, ringsInWords } from '@unlease/clock/services/editor';
import { nextRing, skippedDay } from '@unlease/clock/services/schedule';
import { alarmClock, beforeWords, forEventWords, setWords } from '@unlease/clock/services/words';

import { useMinute } from '@shared/app/hooks/useMinute';
import { showSnack, showUndo } from '@shared/app/store/ui';
import { useWorkDays } from '@shared/app/store/serverSettings';
import { Button } from '@shared/ui/components/Button';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { FormMessage } from '@shared/ui/components/FormMessage';
import { Icon } from '@shared/ui/components/Icon';
import { Layer } from '@shared/ui/components/Layer';
import { TextField } from '@shared/ui/components/TextField';
import { WeekdayToggles } from '@shared/ui/components/WeekdayToggles';
import { useForm } from '@shared/ui/components/useForm';
import { useUnsaved } from '@shared/ui/components/useUnsaved';
import { getLocation } from '@shared/ui/router';
import { useAlarm } from '../../app/hooks/useAlarms';
import { stopPreview } from '../../app/sounds';
import { createAlarm, deleteAlarm, saveAlarm } from '../../app/store/actions';
import { useAgendaStore } from '../../app/store/agenda';
import { useClockStore } from '../../app/store/library';
import { usePrefsStore } from '../../app/store/prefs';
import styles from '../clock.module.css';
import { SoundField } from './SoundField';
import { ToggleRow } from './ToggleRow';

/** What a new alarm's address may bring: its time (`?time=7h30`) and its label. */
/** Agenda's « Me réveiller pour cet événement »: the event its address names (`?event=…&occurrence=…&at=…&title=…`), or null. */
function askedEvent(): { readonly eventId: string; readonly eventStart: string; readonly at: number; readonly title: string } | null {
  const params = new URLSearchParams(getLocation().search);
  const eventId = params.get('event');
  return eventId ? { eventId, eventStart: params.get('occurrence') ?? '', at: Number(params.get('at')), title: (params.get('title') ?? '').trim().slice(0, ALARM_LIMITS.label) } : null;
}

function handed(): Partial<Pick<AlarmDraft, 'time' | 'label' | 'date'>> {
  const params = new URLSearchParams(getLocation().search);
  const time = readClock(params.get('time') ?? '');
  const label = (params.get('label') ?? '').replace(/\s+/g, ' ').trim().slice(0, ALARM_LIMITS.label);
  // The morning it was asked from (« Régler une alarme » on a morning with none).
  const date = params.get('date') ?? '';
  return { ...(time ? { time } : {}), ...(label ? { label } : {}), ...(DAY_PATTERN.test(date) ? { date } : {}) };
}

interface FormProps {
  readonly alarm: Alarm | undefined;
  readonly closing: boolean;
  readonly titleId: string;
  /** The page under it, where Back lands when the history has nothing before it. */
  readonly under: string;
  readonly onClose: () => void;
}

function EditorForm({ alarm, closing, titleId, under, onClose }: FormProps) {
  const prefs = usePrefsStore();
  const now = useMinute();
  const workDays = useWorkDays();
  const events = useAgendaStore(s => s.events);
  const [asked] = useState(() => (alarm ? null : askedEvent()));
  const [blank] = useState<AlarmDraft>(() => {
    const draft = { ...blankDraft(prefs), ...(alarm ? {} : handed()) };
    if (!asked) return draft;
    // The event as this browser has it, else as Agenda handed it; an hour before, or less when it is near.
    const startAt = linkedOccurrence(asked, events)?.startAt ?? asked.at;
    if (!Number.isFinite(startAt)) return draft;
    const before = Math.max(0, Math.min(DEFAULT_BEFORE, Math.floor((startAt - Date.now()) / 60_000) - 5));
    return linkedDraft({ ...draft, label: asked.title }, asked, startAt, before);
  });
  // The alarm as the form opened on it: what the person changed is measured against it, not against an edit synced meanwhile.
  const [base] = useState(alarm);
  const [draft, setDraft] = useState<AlarmDraft>(() => (alarm ? draftOf(alarm) : blank));
  // The event an alarm is for, as this browser has it now (moved since, its new time).
  const occurrence = useMemo(() => (draft.link ? linkedOccurrence(draft.link, events) : null), [draft.link, events]);
  const eventStart = occurrence?.startAt ?? (asked && Number.isFinite(asked.at) ? asked.at : null);
  const [typed, setTyped] = useState(() => alarmClock(draft.time, prefs.twelveHours));
  // « Ignorer la prochaine » as it stood when the form opened, and as it is now.
  const [skippedAtOpen] = useState(() => (alarm ? skippedDay(alarm, Date.now()) !== null : false));
  const [skip, setSkip] = useState(skippedAtOpen);
  const timeInput = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const timeBlock = useRef<HTMLDivElement>(null);

  const parsed = readClock(typed);
  const time = parsed ?? draft.time;
  const days = draft.link ? [] : normalizeDays(draft.days);
  const repeating = days.length > 0;
  const canSkip = alarm !== undefined && repeating;
  // When it would ring as the form stands: the next ring, or, kept quiet, the one after.
  // Agenda's holidays and days off, which a repeating alarm that asks for it skips.
  const quiet = useMemo(() => offDaysFrom({ events: Object.values(events), feeds: [] }, addDays(instantToDay(now), -1)), [events, now]);
  const plain = draftRing(retimedDraft(draft, time, eventStart), now, '', quiet);
  const sameTiming = alarm !== undefined && alarm.time === time && alarm.days.join() === days.join();
  const quietDay = canSkip && skip ? ((sameTiming ? skippedDay(alarm, now) : null) ?? plain?.day ?? null) : null;
  const ring = quietDay ? nextRing({ time, days, date: null, enabled: true, skipDay: quietDay }, now) : plain;

  const form = useForm({ time: parsed ? null : isBlank(typed) ? t('Type the time it rings.') : t('Type a time like 7:30, 730 or 7:30 pm.') });
  // An alarm for an event stays for it when its time is typed: it rings that much earlier or later before it.
  const ready: AlarmDraft = retimedDraft(draft, time, eventStart);
  const dirty = parsed === null || draftChanged(base ?? null, ready, blank) || skip !== skippedAtOpen;
  const unsaved = useUnsaved(dirty && !closing, { page: under });
  const cancel = unsaved.guard(onClose);
  const set = (patch: Partial<AlarmDraft>): void => setDraft(current => ({ ...current, ...patch }));

  // What plays stops as the form goes.
  useEffect(() => {
    if (closing) stopPreview();
  }, [closing]);
  useEffect(() => stopPreview, []);

  const save = (): void => {
    const at = Date.now();
    let id: string;
    if (alarm) {
      saveAlarm(alarm.id, ready, canSkip ? { skip } : {}, at);
      id = alarm.id;
    } else {
      id = createAlarm(ready, at);
    }
    const saved = useClockStore.getState().alarms[id];
    const words = saved ? setWords(saved, at) : null;
    unsaved.saved();
    onClose();
    if (words) showSnack(words, undefined, { tone: 'success' });
  };

  const remove = (): void => {
    if (!alarm) return;
    const undo = deleteAlarm(alarm.id);
    unsaved.saved();
    onClose();
    showUndo(t('Alarm deleted'), undo);
  };

  // ⌘/Ctrl+Entrée and ⌘/Ctrl+S save from anywhere in the form.
  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (closing || !(event.metaKey || event.ctrlKey) || event.altKey || !(event.key === 'Enter' || event.key.toLowerCase() === 's')) return;
    event.preventDefault();
    void form.submit(save);
  });
  useEffect(() => {
    const listen = (event: KeyboardEvent): void => onShortcut(event);
    window.addEventListener('keydown', listen);
    return () => window.removeEventListener('keydown', listen);
  }, []);

  const choice = daysChoiceOf(days, workDays);
  const eventWall = eventStart !== null ? instantToWall(eventStart, '') : null;
  const skipLine = quietDay ? t('Stays quiet on {day}', { day: weekdayDay(quietDay) }) : plain ? t('Next ring: {day}', { day: weekdayDay(plain.day) }) : undefined;
  return (
    <>
      {/* An alarm opened shows itself, the keyboard down; a new one's time takes the caret. */}
      <Layer open={!closing} onDismiss={cancel} routed labelledBy={titleId} initialFocus={(alarm ? timeBlock : timeInput) as RefObject<HTMLElement | null>}>
        <DialogFrame
          title={alarm ? t('Edit alarm') : t('New alarm')}
          titleId={titleId}
          onClose={cancel}
          className={styles.editor}
          onSubmit={form.onSubmit(save)}
          foot={
            <>
              {alarm ? (
                <Button kind="dangerText" icon="trash" className={styles.footStart} onClick={remove}>
                  {t('Delete')}
                </Button>
              ) : null}
              <FormMessage form={form} />
              <Button kind="text" onClick={cancel}>
                {t('Cancel')}
              </Button>
              <Button type="submit" icon="check" busy={form.busy}>
                {t('Save')}
              </Button>
            </>
          }
        >
          <div ref={timeBlock} className={styles.timeBlock} tabIndex={alarm ? -1 : undefined}>
            <TextField
              ref={timeInput}
              label={t('Time')}
              kind="time"
              field={form.field('time')}
              value={typed}
              onChange={setTyped}
              onFocus={() => timeInput.current?.select()}
              onBlur={() => {
                if (parsed) setTyped(alarmClock(parsed, prefs.twelveHours));
              }}
              enterKeyHint="done"
              maxLength={10}
              className={styles.timeField}
              inputClassName={styles.timeInput}
              help={ring ? ringsInWords(ring.at, now) : undefined}
            />
          </div>
          {draft.link ? (
            // An alarm for an Agenda event rings once, for it: the event, « Délier », and how long before.
            <fieldset className={styles.days}>
              <legend className={`${styles.legend} t-meta-strong`}>{t('Rings before the event')}</legend>
              <div className={styles.linkRow}>
                <Icon name="today" size={24} />
                <span className={styles.toggleText}>
                  <span className="t-body-strong">{forEventWords(occurrence?.event.title ?? (asked?.title || draft.label))}</span>
                  <span className="t-meta">{[eventWall ? `${weekdayDay(eventWall.slice(0, 10))}, ${clockWords(eventWall.slice(11, 16), prefs.twelveHours)}` : '', beforeWords(ready.link?.before ?? draft.link.before)].filter(Boolean).join(' · ')}</span>
                </span>
                <Button kind="text" small onClick={() => set({ link: null })}>
                  {t('Unlink')}
                </Button>
              </div>
              <div className={styles.choices}>
                {BEFORE_CHOICES.map(minutes => (
                  <button
                    key={minutes}
                    type="button"
                    aria-pressed={(ready.link?.before ?? draft.link?.before) === minutes}
                    aria-label={t('Rings {span} before', { span: spanWords(minutes) })}
                    className={styles.choice}
                    onClick={() => {
                      if (!draft.link || eventStart === null) return;
                      const next = linkedDraft(draft, draft.link, eventStart, minutes);
                      setDraft(next);
                      setTyped(alarmClock(next.time, prefs.twelveHours));
                    }}
                  >
                    {spanWords(minutes)}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : (
            <fieldset className={styles.days}>
              <legend className={`${styles.legend} t-meta-strong`}>{t('Days')}</legend>
              <WeekdayToggles days={days} weekStart={prefs.weekStart} label={t('Days of the week')} onChange={next => set({ days: next })} />
              {/* The quick choices, as the phone's: two by two, the one the days are on the primary's wash. */}
              <div className={styles.choices}>
                {DAYS_CHOICES.map(each => (
                  <button key={each} type="button" aria-pressed={choice === each} className={styles.choice} onClick={() => set({ days: [...daysOfChoice(each, workDays)] })}>
                    {daysChoiceName(each, workDays)}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <TextField label={t('Label')} kind="text" value={draft.label} onChange={label => set({ label })} maxLength={ALARM_LIMITS.label} enterKeyHint="done" help={t('Shown as it rings, and in your list.')} />
          <SoundField label={t('Sound')} value={draft.sound} onChange={sound => set({ sound })} />
          <div className={styles.toggles}>
            {repeating ? (
              <ToggleRow icon="bellOff" title={t('Not on holidays and days off')} meta={t('From Agenda: its public holidays and your days off.')} on={draft.offDays} onChange={offDays => set({ offDays })} />
            ) : null}
            <ToggleRow icon="phone" title={t('Vibrate')} on={draft.vibrate} onChange={vibrate => set({ vibrate })} />
            <ToggleRow icon="sun" title={t('Weather as it rings')} meta={t('The day’s weather where the phone is, on the alarm’s screen.')} on={draft.weather} onChange={weather => set({ weather })} />
            <ToggleRow
              icon="today"
              title={t('The day’s events as it rings')}
              meta={t('Your first events from {app}, on the alarm’s screen.', { app: APPS.calendar.name })}
              on={draft.agenda}
              onChange={agenda => set({ agenda })}
            />
            {canSkip ? <ToggleRow icon="bellOff" title={t('Skip the next one')} meta={skipLine} on={skip} onChange={setSkip} /> : null}
          </div>
        </DialogFrame>
      </Layer>
      {unsaved.dialog}
    </>
  );
}

/** An address of an alarm that is not there (deleted, or never synced here). */
function Gone({ closing, onClose }: { closing: boolean; onClose: () => void }) {
  return (
    <Layer open={!closing} onDismiss={onClose} label={t('Alarm not found')} routed>
      <DialogFrame
        title={t('Alarm not found')}
        onClose={onClose}
        className={styles.goneFrame}
        foot={
          <Button kind="filled" onClick={onClose}>
            {t('Close')}
          </Button>
        }
      >
        <p className="t-body">{t('This alarm no longer exists.')}</p>
      </DialogFrame>
    </Layer>
  );
}

export function AlarmEditor({ id, closing, under, onClose }: { id: string | null; closing: boolean; under: string; onClose: () => void }) {
  const titleId = useId();
  const alarm = useAlarm(id);
  // The alarm as it opened: deleted from here, it keeps its form while the dialog leaves.
  const [opened] = useState(alarm);
  const shown = alarm ?? (closing ? opened : undefined);
  if (id !== null && !shown) return <Gone closing={closing} onClose={onClose} />;
  return <EditorForm alarm={shown} closing={closing} titleId={titleId} under={under} onClose={onClose} />;
}
