/**
 * A place typed as one line, with what it may be offered under it as it is typed (a combobox): the
 * places the app already knows first (a contact's address, an event's place used before), then those
 * the server finds (`GET /api/places`, `core/sync/places`, after a short pause). A place picked fills
 * the line, and its parts for who wants them (`onPick`: Contacts' address fields). Arrows move, Entrée
 * picks, Échap closes; typing on keeps what was typed, which is always kept as it is.
 */
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { t } from '@unlease/core/i18n';
import { knownPlaces, PLACE_QUERY_MIN, type Place } from '@unlease/core/sync/places';

import { findPlaces, placesFound } from '../../app/places';
import { selectServer, useSettingsStore } from '../../app/store/settings';
import controls from './controls.module.css';
import { EmptyLine } from './EmptyLine';
import { Floating } from './Floating';
import { Icon } from './Icon';
import styles from './placeField.module.css';

export interface PlaceFieldProps {
  readonly label?: string;
  readonly ariaLabel?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** A suggestion chosen: the line is already its label. */
  readonly onPick?: (place: Place) => void;
  /** The places this device knows, offered first (filtered by what is typed). */
  readonly known?: readonly Place[];
  readonly placeholder?: string;
  readonly help?: ReactNode;
  readonly autoFocus?: boolean;
  readonly className?: string;
  readonly inputClassName?: string;
  readonly name?: string;
}

/** A pause after the last key before the server is asked. */
const PAUSE_MS = 250;

type Search = { readonly typed: string; readonly places: readonly Place[]; readonly failed: boolean };

/** The server's places for what is typed, asked after a pause; the last answer kept while the next one comes. */
function useFoundPlaces(typed: string, active: boolean): Search & { readonly waiting: boolean } {
  const server = useSettingsStore(selectServer);
  const [search, setSearch] = useState<Search>({ typed: '', places: [], failed: false });
  const query = typed.replace(/\s+/g, ' ').trim();
  const asks = active && server !== null && query.length >= PLACE_QUERY_MIN;
  useEffect(() => {
    if (!asks || !server) return;
    if (placesFound(query)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      findPlaces(server, query, controller.signal).then(
        places => setSearch({ typed: query, places, failed: false }),
        () => {
          if (!controller.signal.aborted) setSearch({ typed: query, places: [], failed: true });
        },
      );
    }, PAUSE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [asks, server, query]);
  if (!asks) return { typed: query, places: [], failed: false, waiting: false };
  const found = placesFound(query);
  if (found) return { typed: query, places: found, failed: false, waiting: false };
  return { ...search, waiting: search.typed !== query };
}

function PlaceFieldComponent({ label, ariaLabel, value, onChange, onPick, known = [], placeholder, help, autoFocus, className, inputClassName, name }: PlaceFieldProps) {
  const id = useId();
  const listId = `${id}-places`;
  const noteId = `${id}-note`;
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const found = useFoundPlaces(value, open);

  const rows = useMemo((): readonly { readonly place: Place; readonly known: boolean }[] => {
    // A row is what it reads (its name and its detail): two reading the same are one.
    const seen = new Set<string>();
    const fresh = (place: Place): boolean => {
      const key = `${place.name}|${place.detail}`.toLowerCase();
      if (seen.has(key) || place.label.toLowerCase() === value.trim().toLowerCase()) return false;
      seen.add(key);
      return true;
    };
    const mine = knownPlaces(known, value, value.trim() ? 3 : 4).filter(fresh).map(place => ({ place, known: true }));
    const theirs = found.places.filter(fresh).map(place => ({ place, known: false }));
    return [...mine, ...theirs].slice(0, 8);
  }, [known, value, found.places]);

  const typedEnough = value.replace(/\s+/g, ' ').trim().length >= PLACE_QUERY_MIN;
  const said = rows.length === 0 && typedEnough && !found.waiting ? (found.failed ? t('La recherche de lieux ne répond pas : le lieu est gardé tel qu’il est écrit.') : found.typed ? t('Aucun lieu trouvé : il est gardé tel qu’il est écrit.') : null) : null;
  const shown = open && anchor !== null && (rows.length > 0 || said !== null);
  const at = active < rows.length ? active : -1;

  // The list follows the field while the page scrolls or the window changes.
  const measure = useCallback(() => {
    if (input.current) setAnchor(input.current.getBoundingClientRect());
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, measure]);

  const pick = (place: Place): void => {
    onChange(place.label);
    onPick?.(place);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!open) {
        setOpen(true);
        return;
      }
      if (rows.length === 0) return;
      event.preventDefault();
      // From the field to the rows and back to the field: -1 is the field itself.
      const next = at + (event.key === 'ArrowDown' ? 1 : -1);
      setActive(next >= rows.length ? -1 : next < -1 ? rows.length - 1 : next);
    } else if (event.key === 'Enter' && shown && at >= 0) {
      event.preventDefault();
      pick(rows[at]!.place);
    } else if (event.key === 'Escape' && shown) {
      // Only the list closes, never the dialog or the page around.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  const optionId = (index: number): string => `${id}-place-${index}`;
  return (
    <div className={[controls.field, className ?? ''].join(' ')}>
      {label ? (
        <label htmlFor={id} className={`${controls.fieldLabel} t-meta-strong`}>
          {label}
        </label>
      ) : null}
      <input
        ref={input}
        id={id}
        name={name}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        data-owns-escape={shown || undefined}
        aria-controls={shown ? listId : undefined}
        aria-activedescendant={shown && at >= 0 ? optionId(at) : undefined}
        aria-label={label ? undefined : ariaLabel}
        aria-describedby={help ? noteId : undefined}
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        maxLength={300}
        value={value}
        placeholder={placeholder}
        className={[controls.input, inputClassName ?? ''].filter(Boolean).join(' ')}
        onChange={event => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {help ? (
        <p id={noteId} className={`${controls.help} t-meta`}>
          {help}
        </p>
      ) : null}
      {shown && anchor ? (
        <Floating anchor={anchor} label={label ?? ariaLabel ?? t('Lieux')} className={styles.panel} role="listbox" id={listId}>
          <div className={styles.list} style={{ width: Math.min(Math.max(anchor.width, 300), 520) }}>
            {rows.map((row, index) => (
              <div
                key={`${row.known ? 'k' : 'f'}:${row.place.name}|${row.place.detail}`}
                id={optionId(index)}
                role="option"
                aria-selected={index === at}
                data-active={index === at || undefined}
                className={styles.row}
                onPointerMove={() => setActive(index)}
                onClick={() => pick(row.place)}
              >
                <Icon name={row.known ? 'clock' : 'mapPin'} size={20} />
                <span className={styles.text}>
                  <span className="t-body">{row.place.name}</span>
                  {row.place.detail ? <span className="t-meta">{row.place.detail}</span> : null}
                </span>
              </div>
            ))}
            {said ? <EmptyLine text={said} glyph="info" className={styles.said} /> : null}
            {rows.some(row => !row.known) ? <p className={`${styles.credit} t-meta`}>{t('Lieux : © les contributeurs d’OpenStreetMap')}</p> : null}
          </div>
        </Floating>
      ) : null}
    </div>
  );
}

export const PlaceField = memo(PlaceFieldComponent);
