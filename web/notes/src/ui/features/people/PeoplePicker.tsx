/**
 * The people of Contacts a note or a link names: a field that finds them as Contacts' own search
 * does (by name, number, e-mail, company), those named already first, each a row to tick or untick
 * (the phone's PeopleSheet). Each change is written at once (`setPeople`), so nothing waits on a
 * button; an id this browser cannot name stays on the note.
 */
import { useMemo, useRef, useState, type RefObject } from 'react';

import { t } from '@unlease/core/i18n';
import type { Contact } from '@unlease/contacts/models/contacts';
import { contactName, workLine } from '@unlease/contacts/services/names';
import { PEOPLE_MAX } from '@unlease/notes/sync/types';

import { useNotePeople, usePeopleFound } from '../../../app/hooks/useNotePeople';
import { EmptyLine } from '@shared/ui/components/EmptyLine';
import { CheckMark } from '@shared/ui/components/Checkbox';
import { Popover } from '@shared/ui/components/Popover';
import inputs from '@shared/ui/components/controls.module.css';
import { NARROW, useMedia } from '@shared/ui/useMedia';
import { PersonFace } from './PersonFace';
import styles from './people.module.css';

/** At most this many found people listed: typing finds the others. */
const SHOWN = 60;

export interface PeoplePickerProps {
  readonly open: boolean;
  readonly anchor: RefObject<HTMLElement | null>;
  /** The ids the note or link holds, as stored (an unknown one is kept). */
  readonly selected: readonly string[];
  readonly onDismiss: () => void;
  readonly onChange: (ids: string[]) => void;
}

function Row({ contact, on, onToggle }: { contact: Contact; on: boolean; onToggle: () => void }) {
  const detail = workLine(contact) || contact.phones[0]?.number || contact.emails[0]?.address || '';
  return (
    <label className={styles.row}>
      <input type="checkbox" className="sr-only" checked={on} onChange={onToggle} />
      <PersonFace contact={contact} size={36} />
      <span className={styles.rowText}>
        <span className="t-body">{contactName(contact)}</span>
        {detail ? <span className="t-meta">{detail}</span> : null}
      </span>
      <span className={styles.rowCheck}>
        <CheckMark checked={on} />
      </span>
    </label>
  );
}

function PeopleList({ selected, onChange, narrow, holder }: { selected: readonly string[]; onChange: (ids: string[]) => void; narrow: boolean; holder: RefObject<HTMLDivElement | null> }) {
  const [query, setQuery] = useState('');
  const chosen = useNotePeople(selected);
  const found = usePeopleFound(query);
  const chosenIds = useMemo(() => new Set(chosen.map(person => person.contact.id)), [chosen]);
  const field = useRef<HTMLInputElement>(null);
  const typing = query.trim().length > 0;
  const others = useMemo(() => (typing ? found : found.filter(contact => !chosenIds.has(contact.id))).slice(0, SHOWN), [found, chosenIds, typing]);
  const full = selected.length >= PEOPLE_MAX;

  const toggle = (contact: Contact): void => {
    const held = chosen.find(person => person.contact.id === contact.id);
    // Off: the id the note holds goes (the merged one's maybe); on: the contact's own.
    if (held) onChange(selected.filter(id => id !== held.id));
    else if (!full) onChange([...selected, contact.id]);
  };

  return (
    <div ref={holder} className={styles.picker} tabIndex={-1}>
      {/* A sheet on a phone says what it holds; by its button, the field (« Chercher une personne ») does. */}
      {narrow ? <h2 className={`${styles.pickerTitle} t-title`}>{t('People')}</h2> : null}
      <input
        ref={field}
        data-autofocus={narrow ? undefined : true}
        className={`${inputs.input} ${styles.search}`}
        value={query}
        onChange={event => setQuery(event.target.value)}
        onKeyDown={event => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          if (others[0]) toggle(others[0]);
        }}
        placeholder={t('Search for someone')}
        aria-label={t('Search for someone')}
        type="search"
        autoComplete="off"
        spellCheck={false}
      />
      <div data-scroller="" className={styles.list} role="group" aria-label={t('People')}>
        {!typing && chosen.length > 0 ? (
          <>
            {chosen.map(person => (
              <Row key={person.contact.id} contact={person.contact} on onToggle={() => toggle(person.contact)} />
            ))}
            {others.length > 0 ? <div className={styles.divider} role="separator" /> : null}
          </>
        ) : null}
        {others.map(contact => (
          <Row key={contact.id} contact={contact} on={chosenIds.has(contact.id)} onToggle={() => toggle(contact)} />
        ))}
        {others.length === 0 && (typing || chosen.length === 0) ? (
          <EmptyLine glyph={typing ? 'search' : 'person'} text={typing ? t('Nobody in your contacts goes by that name.') : t('No contacts yet.')} className={styles.empty} />
        ) : null}
      </div>
    </div>
  );
}

export function PeoplePicker({ open, anchor, selected, onDismiss, onChange }: PeoplePickerProps) {
  const narrow = useMedia(NARROW);
  // On a phone-sized window the sheet opens on its people with the keyboard down; the field is one tap away.
  const holder = useRef<HTMLDivElement>(null);
  return (
    <Popover open={open} anchor={anchor} onDismiss={onDismiss} label={t('People')} width={340} initialFocus={narrow ? holder : undefined} rows>
      <PeopleList selected={selected} onChange={onChange} narrow={narrow} holder={holder} />
    </Popover>
  );
}
