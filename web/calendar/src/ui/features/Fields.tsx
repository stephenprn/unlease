/**
 * The event form's own controls, drawn as the suite's fields: a row led by its glyph (`FormRow`), a
 * day picked on a small month (`DateField`), a time typed as one says it (« 20h », « 2030 », « 8:30 »)
 * or picked from the quarters (the end's with how long it lasts, as Google's: `TimeField`), and one
 * choice among a few from a menu (`ChoiceField`); the places offered as one is typed
 * (`useKnownPlaces`). The whole form and the quick one on the grid share them.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type Ref, type RefObject } from 'react';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { placeFromLine, type Place } from '@unlease/core/sync/places';
import type { GlyphName } from '@unlease/design/glyphs';
import { clockWords, weekdayDay } from '@unlease/calendar/services/eventText';
import { partsOf, readClock } from '@unlease/calendar/services/time';
import { addressLine } from '@unlease/contacts/services/addresses';
import { contactName } from '@unlease/contacts/services/names';

import { useContactsStore } from '@contacts/app/store/library';
import { Floating } from '@shared/ui/components/Floating';
import { Icon } from '@shared/ui/components/Icon';
import { Menu, type MenuItem } from '@shared/ui/components/Menu';
import { Popover } from '@shared/ui/components/Popover';
import { useCalendarStore } from '../../app/store/library';
import styles from '../calendar.module.css';
import { MiniMonth } from '../views/MiniMonth';

/**
 * A row of the form, led by its glyph, centred on the row's first line: a field's (52, the default),
 * chips' (40), a file's (36), the swatches' (34) or a small button's (32).
 */
export function FormRow({ icon, children, label, wide = false, first, fieldsRef }: { icon: GlyphName; children: ReactNode; label?: string; wide?: boolean; first?: 'chips' | 'file' | 'swatches' | 'small'; fieldsRef?: Ref<HTMLDivElement> }) {
  return (
    <div className={styles.formRow} role={label ? 'group' : undefined} aria-label={label} data-first={first}>
      <Icon name={icon} size={22} />
      {/* Fields that move (the reminders) are their own frame. */}
      <div ref={fieldsRef} className={`${wide ? styles.formFieldsWide : styles.formFields}${fieldsRef ? ` ${styles.movingFields}` : ''}`}>
        {children}
      </div>
    </div>
  );
}

/** The places this device knows: the events' own (the most used first), then the contacts' addresses. */
export function useKnownPlaces(): readonly Place[] {
  const events = useCalendarStore(s => s.events);
  const contacts = useContactsStore(s => s.contacts);
  return useMemo(() => {
    const used = Object.values(events)
      .filter(event => event.deletedAt === null && event.trashedAt === null && event.feedId === null && event.place.trim())
      .sort((a, b) => b.editedAt - a.editedAt)
      .map(event => placeFromLine(event.place));
    const kept = Object.values(contacts)
      .filter(contact => contact.deletedAt === null && contact.trashedAt === null && !contact.mergedInto)
      .flatMap(contact => contact.addresses.map(address => addressLine(address)).filter(Boolean).map(line => ({ ...placeFromLine(line), detail: `${contactName(contact)} · ${placeFromLine(line).detail}`.replace(/ · $/, '') })));
    return [...used, ...kept];
  }, [events, contacts]);
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** Where a field is on screen while its list is open, followed as the page scrolls or the window changes. */
export function useFieldAnchor(open: boolean, field: RefObject<HTMLElement | null>): DOMRect | null {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const measure = (): void => {
      if (field.current) setAnchor(field.current.getBoundingClientRect());
    };
    const frame = requestAnimationFrame(measure);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, field]);
  return open ? anchor : null;
}
const toMinutes = (clock: string): number => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
const toClock = (minutes: number): string => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;

/** « 30 min », « 1 h », « 1 h 30 »: how long, beside an end time. */
function lengthWords(minutes: number): string {
  if (minutes < 60) return t('{minutes} min', { minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? t('{hours} h {minutes}', { hours, minutes: pad(rest) }) : t('{hours} h', { hours });
}

export interface TimeFieldProps {
  readonly value: string;
  readonly onChange: (clock: string) => void;
  readonly label: string;
  /** The start, for an end: the list begins there, each time with how long the event would last. */
  readonly from?: string;
  readonly twelveHours?: boolean;
  /** Drawn in error (an end before the start), its problem said by `describedBy`. */
  readonly invalid?: boolean;
  readonly describedBy?: string;
  /** The input, for a form that sends the focus to it. */
  readonly fieldRef?: (element: HTMLElement | null) => void;
}

export function TimeField({ value, onChange, label, from, twelveHours = false, invalid: wrong = false, describedBy, fieldRef }: TimeFieldProps) {
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const anchor = useFieldAnchor(open, input);
  const options = useMemo(() => {
    // An end's from a quarter after the start (its own quarter), a start's the whole day.
    const start = from ? Math.ceil((toMinutes(from) + 1) / 15) * 15 : 0;
    const out: { clock: string; length: number | null }[] = [];
    for (let minutes = start; minutes < 24 * 60; minutes += 15) out.push({ clock: toClock(minutes), length: from ? minutes - toMinutes(from) : null });
    return out;
  }, [from]);
  const chosen = options.findIndex(option => option.clock === value);
  const nearest = chosen >= 0 ? chosen : Math.max(0, options.findIndex(option => option.clock > value));
  const [active, setActive] = useState(nearest);

  // The list opens on the time chosen in its middle, the times around it in sight on both sides;
  // then the one moved to stays in sight. The list's own scroll alone.
  const placed = anchor !== null;
  useEffect(() => {
    const box = list.current;
    const row = box?.querySelector<HTMLElement>(`[data-index='${nearest}']`);
    if (placed && box && row) box.scrollTop = row.offsetTop - (box.clientHeight - row.offsetHeight) / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as it opens: the arrows move it after.
  }, [placed]);
  useEffect(() => {
    const box = list.current;
    const row = box?.querySelector<HTMLElement>(`[data-index='${active}']`);
    if (!box || !row) return;
    if (row.offsetTop < box.scrollTop) box.scrollTop = row.offsetTop - 6;
    else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight + 6;
  }, [placed, active]);

  const commit = (text: string | null): void => {
    setTyped(null);
    if (text === null) return;
    const clock = readClock(text);
    if (clock && clock !== value) onChange(clock);
  };
  const pick = (clock: string): void => {
    setTyped(null);
    setOpen(false);
    if (clock !== value) onChange(clock);
  };
  const openList = (): void => {
    setActive(nearest);
    setOpen(true);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) return openList();
      setActive(Math.min(options.length - 1, Math.max(0, active + (event.key === 'ArrowDown' ? 1 : -1))));
    } else if (event.key === 'Enter') {
      if (typed !== null && readClock(typed)) {
        event.preventDefault();
        commit(typed);
        setOpen(false);
      } else if (open && options[active]) {
        event.preventDefault();
        pick(options[active]!.clock);
      }
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setTyped(null);
      setOpen(false);
    }
  };
  const shown = typed ?? clockWords(value, twelveHours);
  const invalid = typed !== null && typed.trim() !== '' && readClock(typed) === null;
  return (
    <div className={styles.timeField}>
      <input
        ref={element => {
          input.current = element;
          fieldRef?.(element);
        }}
        className={styles.fieldInput}
        data-invalid={invalid || wrong || undefined}
        aria-invalid={invalid || wrong || undefined}
        aria-describedby={describedBy}
        value={shown}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        data-owns-escape={open || undefined}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        inputMode="text"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        onFocus={event => {
          event.currentTarget.select();
          openList();
        }}
        onClick={() => (open ? undefined : openList())}
        onChange={event => {
          setTyped(event.target.value);
          const clock = readClock(event.target.value);
          if (clock) {
            const index = options.findIndex(option => option.clock >= clock);
            if (index >= 0) setActive(index);
          }
        }}
        onBlur={() => {
          commit(typed);
          setOpen(false);
        }}
        onKeyDown={onKeyDown}
      />
      {open && anchor ? (
        <Floating anchor={anchor} label={label} role="listbox" id={listId}>
          <div ref={list} className={styles.floatList} style={{ width: Math.max(anchor.width, from ? 168 : 120) }}>
            {options.map((option, index) => (
              <div
                key={option.clock}
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={index === chosen}
                data-active={index === active || undefined}
                className={styles.timeOption}
                onPointerMove={() => (active === index ? undefined : setActive(index))}
                onClick={() => pick(option.clock)}
              >
                <span className="tabular">{clockWords(option.clock, twelveHours)}</span>
                {option.length !== null ? <span className={styles.timeLength}>{lengthWords(option.length)}</span> : null}
              </div>
            ))}
          </div>
        </Floating>
      ) : null}
    </div>
  );
}

export interface DateFieldProps {
  readonly value: string;
  readonly onChange: (day: string) => void;
  readonly label: string;
  readonly weekStart: number;
  readonly today: string;
  /** Drawn in error (an end before the start), its problem said by `describedBy`. */
  readonly invalid?: boolean;
  readonly describedBy?: string;
  /** The button, for a form that sends the focus to it. */
  readonly fieldRef?: (element: HTMLElement | null) => void;
  readonly disabled?: boolean;
}

/** A day: its words on a field-like button, the small month under it to pick another. */
export function DateField({ value, onChange, label, weekStart, today, invalid, describedBy, fieldRef, disabled }: DateFieldProps) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value);
  const year = partsOf(today).year;
  const shown = useMemo(() => new Set([value]), [value]);
  return (
    <>
      <button
        ref={element => {
          anchor.current = element;
          fieldRef?.(element);
        }}
        type="button"
        className={styles.fieldButton}
        data-invalid={invalid || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label} : ${weekdayDay(value, year)}`}
        onClick={() => {
          setMonth(value);
          setOpen(true);
        }}
      >
        <span>{weekdayDay(value, year)}</span>
      </button>
      <Popover open={open} anchor={anchor} onDismiss={() => setOpen(false)} label={label} width={300}>
        <div className={styles.datePop}>
          <MiniMonth
            month={month}
            weekStart={weekStart}
            today={today}
            shown={shown}
            onStep={direction => setMonth(current => shiftMonth(current, direction))}
            onPick={day => {
              setOpen(false);
              if (day !== value) onChange(day);
            }}
          />
        </div>
      </Popover>
    </>
  );
}

function shiftMonth(day: string, direction: 1 | -1): string {
  const { year, month } = partsOf(day);
  const index = year * 12 + (month - 1) + direction;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}-01`;
}

export interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
}

/** One choice among a few, a field-like button opening their menu (the chosen one ticked). */
export function ChoiceField<T extends string>({ value, choices, onChange, label, shown, icon }: { value: T; choices: readonly Choice<T>[]; onChange: (value: T) => void; label: string; shown?: string; icon?: GlyphName }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const current = choices.find(choice => choice.value === value);
  const items: MenuItem[] = choices.map(choice => ({
    label: choice.label,
    icon: 'check',
    mark: choice.value === value ? undefined : <span className={styles.menuBlank} aria-hidden="true" />,
    onSelect: () => onChange(choice.value),
  }));
  return (
    <>
      <button ref={anchor} type="button" className={styles.fieldButton} aria-haspopup="menu" aria-expanded={open} aria-label={`${label} : ${shown ?? current?.label ?? ''}`} onClick={() => setOpen(true)}>
        {icon ? <Icon name={icon} size={18} /> : null}
        <span>{shown ?? current?.label ?? ''}</span>
        <Icon name="chevronDown" size={18} />
      </button>
      <Menu open={open} anchor={anchor} onDismiss={() => setOpen(false)} items={items} label={label} align="start" />
    </>
  );
}

/** « 1 heure », « 2 jours »: how long an all-day event lasts. */
export const daysWords = (days: number): string => plural(days, 'jour');
