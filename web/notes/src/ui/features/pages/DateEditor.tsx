/**
 * A date written in a page, changed in place: its words as a head, the usual days (today,
 * tomorrow, next Monday), a month to pick a day from (the arrows move between days, Page up and
 * down between months), a time or none, or the date taken out. Each change is written at once
 * through the block's text, one step of the page's undo; closed, the caret goes back after it.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { create } from 'zustand';

import { t } from '@unlease/core/i18n';
import { dateWords, dayStart, isoDayOf, monthWeeks, shiftDay, withTime } from '@unlease/core/services/dates';
import { monthNames, weekdayNames } from '@unlease/core/services/format';
import { dateRun, deleteRich, insertRich, parseRich, richToPlain, sliceRich, validDay, type DateRun, type Run } from '@unlease/core/services/richText';

import { useMinute } from '../../../app/hooks/useMinute';
import { useLibraryStore } from '../../../app/store/library';
import { Button } from '../../components/Button';
import { SwitchMark } from '../../components/Checkbox';
import inputs from '../../components/controls.module.css';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { Popover } from '../../components/Popover';
import { focusBlock, richHandle } from './editorStore';
import styles from './inline.module.css';
import { atomElementAt, setSelectionOffsets } from './richDom';

interface DateTarget {
  readonly block: string;
  /** Where the date stands in the block's text. */
  readonly offset: number;
  /** Where the caret goes back to once the editor closes. */
  readonly caret: number;
}

const useDateStore = create<{ readonly target: DateTarget | null }>(() => ({ target: null }));

/** The chip the editor stands under: drawn anew at each change, so found again then. */
const anchor: { current: HTMLElement | null } = { current: null };

/** The chip at `offset` found again, wearing the chosen wash while its editor is open. */
function holdChip(element: HTMLElement, offset: number): void {
  anchor.current = atomElementAt(element, offset);
  anchor.current?.setAttribute('data-open', '');
}

/** The date standing at `offset` in a block's text, if one does. */
function dateAt(runs: readonly Run[], offset: number): DateRun | null {
  const [run] = sliceRich(runs, offset, offset + 1);
  return run?.kind === 'date' ? run : null;
}

/** Opens the editor of the date at `offset` in a block; the caret waits at `caret` (after the date). */
export function openDateEditor(block: string, offset: number, caret: number = offset + 1): void {
  const handle = richHandle(block);
  if (!handle) return;
  handle.flush();
  if (!dateAt(handle.runs(), offset)) return;
  holdChip(handle.element, offset);
  // The chip's selection goes (and the formatting bar with it): the caret waits after the date.
  handle.element.focus({ preventScroll: true });
  setSelectionOffsets(handle.element, caret);
  useDateStore.setState({ target: { block, offset, caret } });
}

function closeDateEditor(): void {
  const target = useDateStore.getState().target;
  if (!target) return;
  useDateStore.setState({ target: null });
  anchor.current?.removeAttribute('data-open');
  // Once the editor has given the page back (it is inert until then).
  requestAnimationFrame(() => focusBlock(target.block, target.caret));
}

/** The date in the block's text replaced by `next`, or taken out with null (a space it leaves doubled goes too). */
function writeDate(target: DateTarget, next: DateRun | null): void {
  const handle = richHandle(target.block);
  if (!handle) return;
  const runs = handle.runs();
  const current = dateAt(runs, target.offset);
  // The day it already is (the chosen day pressed again): no step in the undo.
  if (!current || (next && next.date === current.date && next.time === current.time)) return;
  if (next) {
    handle.write(insertRich(deleteRich(runs, target.offset, target.offset + 1), target.offset, [next]), null);
    holdChip(handle.element, target.offset);
    return;
  }
  const plain = richToPlain(runs);
  const end = plain[target.offset + 1] === ' ' && (target.offset === 0 || /\s/.test(plain[target.offset - 1]!)) ? target.offset + 2 : target.offset + 1;
  handle.write(deleteRich(runs, target.offset, end), null);
  useDateStore.setState({ target: { ...target, caret: target.offset } });
  closeDateEditor();
}

const pad = (value: number): string => String(value).padStart(2, '0');

interface Month {
  readonly year: number;
  /** 1 to 12. */
  readonly month: number;
}

const monthOf = (day: string): Month => ({ year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) });
const sameMonth = (a: Month, b: Month): boolean => a.year === b.year && a.month === b.month;

function shiftMonth({ year, month }: Month, by: number): Month {
  const index = year * 12 + month - 1 + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** The same day a month before or after, kept inside that month (the 31st becomes its last day). */
function dayMonthsAway(day: string, by: number): string {
  const { year, month } = shiftMonth(monthOf(day), by);
  const last = new Date(year, month, 0).getDate();
  return validDay(year, month, Math.min(Number(day.slice(8)), last)) ?? day;
}

/** Its place in a week that starts on Monday. */
const weekdayOf = (day: string): number => (dayStart(day).getDay() + 6) % 7;

const STEPS: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

/** A month to pick a day from: today ringed, the chosen day in matcha. */
function MonthCalendar({ chosen, today, onPick }: { chosen: string; today: string; onPick: (day: string) => void }) {
  const [shown, setShown] = useState(() => monthOf(chosen));
  /** The day the arrows move from, which holds the tab stop. */
  const [cursor, setCursor] = useState(chosen);
  const [seen, setSeen] = useState(chosen);
  // A day chosen another way (a quick choice, an undo): its month shows.
  if (chosen !== seen) {
    setSeen(chosen);
    setCursor(chosen);
    setShown(monthOf(chosen));
  }
  const grid = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    [...(grid.current?.querySelectorAll<HTMLElement>('[data-day]') ?? [])].find(button => button.dataset.day === cursor)?.focus();
  }, [cursor, shown]);

  const months = monthNames();
  const weekdays = weekdayNames();
  const name = `${months[shown.month - 1]} ${shown.year}`;
  const initials = [...weekdays.slice(1), weekdays[0]!].map(day => day.charAt(0).toUpperCase());
  const first = `${shown.year}-${pad(shown.month)}-01`;
  const stop = sameMonth(monthOf(cursor), shown) ? cursor : sameMonth(monthOf(chosen), shown) ? chosen : first;
  const label = (day: string): string => {
    const date = dayStart(day);
    return `${weekdays[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const day = (event.target as HTMLElement).dataset.day;
    if (!day) return;
    const step = STEPS[event.key];
    let next: string | null = null;
    if (step !== undefined) next = shiftDay(dayStart(day).getTime(), step);
    else if (event.key === 'PageUp' || event.key === 'PageDown') next = dayMonthsAway(day, event.key === 'PageUp' ? -1 : 1);
    else if (event.key === 'Home') next = shiftDay(dayStart(day).getTime(), -weekdayOf(day));
    else if (event.key === 'End') next = shiftDay(dayStart(day).getTime(), 6 - weekdayOf(day));
    if (!next) return;
    event.preventDefault();
    moved.current = true;
    setCursor(next);
    setShown(monthOf(next));
  };

  return (
    <div className={styles.calendar}>
      <div className={styles.monthHead}>
        {/* The back chevron is the forward one turned round: Onde draws one. */}
        <IconButton icon="chevronRight" label={t('Mois précédent')} compact shape={1} className={styles.previous} onClick={() => setShown(month => shiftMonth(month, -1))} />
        <span className={`${styles.monthName} t-body-strong`} aria-live="polite">
          {name}
        </span>
        <IconButton icon="chevronRight" label={t('Mois suivant')} compact shape={2} onClick={() => setShown(month => shiftMonth(month, 1))} />
      </div>
      <div className={styles.week} aria-hidden="true">
        {initials.map((initial, index) => (
          <span key={index} className={`${styles.weekday} t-meta-strong`}>
            {initial}
          </span>
        ))}
      </div>
      <div ref={grid} role="group" aria-label={name} className={styles.days} onKeyDown={onKeyDown}>
        {monthWeeks(shown.year, shown.month).map((week, row) => (
          <div key={row} className={styles.week}>
            {week.map((day, index) =>
              day === null ? (
                <span key={index} className={styles.dayGap} />
              ) : (
                <button
                  key={day}
                  type="button"
                  className={styles.day}
                  data-day={day}
                  data-autofocus={day === chosen || undefined}
                  tabIndex={day === stop ? 0 : -1}
                  aria-pressed={day === chosen}
                  aria-current={day === today ? 'date' : undefined}
                  aria-label={label(day)}
                  onClick={() => {
                    setCursor(day);
                    onPick(day);
                  }}
                >
                  {Number(day.slice(8))}
                </button>
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DatePanel({ target, run }: { target: DateTarget; run: DateRun }) {
  const now = useMinute();
  const today = isoDayOf(now);
  const set = (next: DateRun | null): void => writeDate(target, next);
  const setDay = (day: string): void => set(dateRun(day, run.time) ?? run);
  const quick = [
    { label: t('Aujourd’hui'), day: today },
    { label: t('Demain'), day: shiftDay(now, 1) },
    { label: t('Lundi prochain'), day: shiftDay(now, (8 - new Date(now).getDay()) % 7 || 7) },
  ];
  // The time as typed: the field may hold half a time a moment; a whole one is written.
  const [clock, setClock] = useState(run.time ?? '');
  const [seen, setSeen] = useState(run.time);
  if (run.time !== seen) {
    setSeen(run.time);
    setClock(run.time ?? '');
  }
  const toggleTime = (): void => {
    if (run.time) set(withTime(run, null));
    else set(withTime(run, `${pad(run.date === today ? Math.min(23, new Date(now).getHours() + 1) : 9)}:00`));
  };
  return (
    <div className={styles.dateEditor}>
      <h2 className={`${styles.dateHead} t-label`}>{dateWords(run)}</h2>
      <div className={styles.quickDays}>
        {quick.map(choice => (
          <button key={choice.label} type="button" className={`${styles.quickDay} t-label`} aria-pressed={choice.day === run.date} onClick={() => setDay(choice.day)}>
            {choice.label}
          </button>
        ))}
      </div>
      <MonthCalendar chosen={run.date} today={today} onPick={setDay} />
      <button type="button" role="switch" aria-checked={run.time !== null} className={styles.switchRow} onClick={toggleTime}>
        <Icon name="clock" size={20} />
        <span className="t-body">{t('Heure')}</span>
        <SwitchMark checked={run.time !== null} />
      </button>
      {run.time !== null ? (
        <input
          type="time"
          className={`${inputs.input} ${styles.timeField}`}
          value={clock}
          aria-label={t('Heure')}
          onChange={event => {
            const value = event.target.value;
            setClock(value);
            if (/^\d{2}:\d{2}$/.test(value) && value !== run.time) set(withTime(run, value));
          }}
        />
      ) : null}
      <div className={styles.dateFoot}>
        <Button kind="dangerText" small onClick={() => set(null)}>
          {t('Retirer la date')}
        </Button>
      </div>
    </div>
  );
}

/** The date editor of the page on screen (drawn by the page, not in a page in the bin). */
export function DateEditor() {
  const target = useDateStore(s => s.target);
  // What it showed, kept while it leaves.
  const [shown, setShown] = useState(target);
  if (target && target !== shown) setShown(target);
  const markup = useLibraryStore(s => (shown ? s.blocks[shown.block]?.text : undefined));
  const run = shown && markup !== undefined ? dateAt(parseRich(markup), shown.offset) : null;
  // The date it showed last, kept while it leaves (taken out, the date is gone before the panel).
  const [last, setLast] = useState(run);
  if (run && (run.date !== last?.date || run.time !== last.time)) setLast(run);
  // The date gone from under it (undone, deleted, or moved by another device's edit): nothing left to change.
  const lost = target !== null && run === null;
  useEffect(() => {
    if (lost) closeDateEditor();
  }, [lost]);
  // Closed with the page (another page opened): nothing waits to reopen on the next.
  useEffect(() => () => useDateStore.setState({ target: null }), []);
  const showing = run ?? last;
  return (
    <Popover open={target !== null && run !== null} anchor={anchor} onDismiss={closeDateEditor} label={t('Date')} width={320}>
      {shown && showing ? <DatePanel target={shown} run={showing} /> : null}
    </Popover>
  );
}
