/**
 * A time of day on a phone-sized window, as on the phone (`mobile/calendar`'s `TimeSheet`): a sheet
 * with the time large at its top, every hour and every five minutes as targets 48 high; an hour and a
 * minute picked, in either order, keep the time and close, one alone waits for « OK ». An end offers
 * how long first and says how long the time picked lasts. Any other time is typed as one says it
 * (`readClock`) behind the keyboard's button. A wide window keeps the typed field and its list
 * (`TimeField`), the fastest with a keyboard.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { plural } from '@unlease/core/services/format';
import { t } from '@unlease/core/i18n';
import { clockWords, lengthWords, shortLengthWords } from '@unlease/calendar/services/eventText';
import { readClock } from '@unlease/calendar/services/time';

import { Button } from '@shared/ui/components/Button';
import controls from '@shared/ui/components/controls.module.css';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton } from '@shared/ui/components/IconButton';
import { Layer } from '@shared/ui/components/Layer';
import { Segmented } from '@shared/ui/components/Segmented';
import styles from '../calendar.module.css';

const pad = (value: number): string => String(value).padStart(2, '0');
const clockOf = (hour: number, minute: number): string => `${pad(hour)}:${pad(minute)}`;
const toMinutes = (clock: string): number => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

const HOURS_24 = Array.from({ length: 24 }, (_, hour) => hour);
/** On a 12-hour clock: 12, then 1 to 11, the half of the day chosen beside them. */
const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = Array.from({ length: 12 }, (_, index) => index * 5);
const LENGTHS = [30, 60, 90, 120];
/** The night's hours (before 7, from 22) lie back, so the day's are found at a glance. */
const isNight = (hour: number): boolean => hour < 7 || hour >= 22;
/** A beat for the second pick to show as chosen before the sheet goes. */
const KEEP_AFTER_MS = 150;

export interface TimeSheetProps {
  readonly open: boolean;
  readonly label: string;
  readonly value: string;
  readonly twelveHours: boolean;
  /** The start, for an end on its day: how long each time lasts, and the lengths to pick. */
  readonly from?: string;
  readonly onPick: (clock: string) => void;
  readonly onClose: () => void;
}

export function TimeSheet(props: TimeSheetProps) {
  const titleId = useId();
  return (
    <Layer open={props.open} onDismiss={props.onClose} kind="bottom" labelledBy={titleId}>
      {props.open ? <TimeGrid {...props} titleId={titleId} /> : null}
    </Layer>
  );
}

function Cell({ words, label, on, faint, onPick }: { words: string; label: string; on: boolean; faint?: boolean; onPick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={on} aria-label={label} className={styles.timeCell} data-faint={faint || undefined} onClick={onPick}>
      {words}
    </button>
  );
}

function TimeGrid({ value, label, twelveHours, from, onPick, onClose, titleId }: TimeSheetProps & { titleId: string }) {
  const [draft, setDraft] = useState(value);
  const [picked, setPicked] = useState({ hour: false, minute: false });
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState(() => clockWords(value, twelveHours));
  const [tried, setTried] = useState(false);
  const problemId = useId();
  const closing = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (closing.current !== null) window.clearTimeout(closing.current);
    },
    [],
  );

  const keep = (clock: string): void => {
    if (closing.current !== null) window.clearTimeout(closing.current);
    closing.current = null;
    if (clock !== value) onPick(clock);
    onClose();
  };
  const choose = (clock: string, part: 'hour' | 'minute'): void => {
    const next = { ...picked, [part]: true };
    setDraft(clock);
    setPicked(next);
    if (next.hour && next.minute) {
      if (closing.current !== null) window.clearTimeout(closing.current);
      closing.current = window.setTimeout(() => keep(clock), KEEP_AFTER_MS);
    }
  };
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!typing) return keep(draft);
    const clock = readClock(typed);
    if (clock) keep(clock);
    else setTried(true);
  };

  const hour = Number(draft.slice(0, 2)) || 0;
  const minute = Number(draft.slice(3, 5)) || 0;
  const afternoon = hour >= 12;
  // An end on the start's day: a time before the start ends the next day, as the form keeps it.
  const length = from ? (toMinutes(draft) - toMinutes(from) + 24 * 60) % (24 * 60) : null;
  const nextDay = from ? draft < from : false;
  const problem = typing && tried && !readClock(typed) ? t('A time such as 8 pm, 20:00 or 8:30.') : null;
  const hours = twelveHours ? HOURS_12.map(shown => ({ real: (shown % 12) + (afternoon ? 12 : 0), words: String(shown) })) : HOURS_24.map(real => ({ real, words: pad(real) }));

  return (
    <DialogFrame
      title={label}
      titleId={titleId}
      onClose={onClose}
      onSubmit={submit}
      foot={
        <>
          <Button kind="text" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" disabled={typing && !typed.trim()}>
            {t('OK')}
          </Button>
        </>
      }
    >
      <div className={styles.timeGrid}>
        <div className={styles.timeReadout}>
          <div className={styles.timeReadoutWords} aria-live="polite">
            <span className={styles.timeBig}>{clockWords(draft, twelveHours)}</span>
            {length !== null ? <span className="t-meta">{nextDay ? t('{length}, until the next day', { length: lengthWords(length) }) : lengthWords(length)}</span> : null}
          </div>
          <IconButton icon={typing ? 'clock' : 'keyboard'} label={typing ? t('Pick on the grid') : t('Type a time')} onClick={() => setTyping(!typing)} />
        </div>

        {typing ? (
          <div>
            <input
              className={styles.fieldInput}
              value={typed}
              onChange={event => setTyped(event.target.value)}
              aria-label={t('Time')}
              aria-invalid={problem ? true : undefined}
              data-invalid={problem ? true : undefined}
              aria-describedby={problem ? problemId : undefined}
              inputMode="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="done"
              autoFocus
              onFocus={event => event.currentTarget.select()}
            />
            {problem ? (
              <p id={problemId} className={`${controls.error} ${controls.fieldNoteAlone} t-meta`}>
                <Icon name="error" size={16} className={controls.errorGlyph} />
                <span>{problem}</span>
              </p>
            ) : null}
          </div>
        ) : (
          <>
            {from ? (
              <div className={styles.timeCells} data-lengths="" role="radiogroup" aria-label={t('Duration')}>
                {LENGTHS.map(minutes => (
                  <Cell key={minutes} words={shortLengthWords(minutes)} label={lengthWords(minutes)} on={length === minutes} onPick={() => keep(clockOf(Math.floor(((toMinutes(from) + minutes) % (24 * 60)) / 60), (toMinutes(from) + minutes) % 60))} />
                ))}
              </div>
            ) : null}
            <div className={styles.timeHead}>
              <h3 className="t-section">{t('Hour')}</h3>
              {twelveHours ? (
                <Segmented
                  compact
                  label={t('Half of the day')}
                  options={[
                    { value: 'am', label: 'AM' },
                    { value: 'pm', label: 'PM' },
                  ]}
                  value={afternoon ? 'pm' : 'am'}
                  onChange={half => setDraft(clockOf((hour % 12) + (half === 'pm' ? 12 : 0), minute))}
                />
              ) : null}
            </div>
            <div className={styles.timeCells} role="radiogroup" aria-label={t('Hour')}>
              {hours.map(cell => (
                <Cell key={cell.real} words={cell.words} label={clockWords(clockOf(cell.real, 0), twelveHours)} on={cell.real === hour} faint={isNight(cell.real)} onPick={() => choose(clockOf(cell.real, minute), 'hour')} />
              ))}
            </div>
            <h3 className={`${styles.timeHead} t-section`}>{t('Minutes')}</h3>
            <div className={styles.timeCells} role="radiogroup" aria-label={t('Minutes')}>
              {MINUTES.map(each => (
                <Cell key={each} words={`:${pad(each)}`} label={plural(each, 'minute')} on={each === minute} onPick={() => choose(clockOf(hour, each), 'minute')} />
              ))}
            </div>
          </>
        )}
      </div>
    </DialogFrame>
  );
}
