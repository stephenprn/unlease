/**
 * The people an event is with, as Agenda shows them: a face (their photo cropped to the pebble, or
 * their initials on a tile of their own wash, as Contacts draws it), a chip opening them in Contacts,
 * and the form's picker: the chosen ones as chips, a field finding the others by name, number or
 * e-mail (Contacts' own search), the favourites first while nothing is typed.
 */
import { memo, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { t } from '@unlease/core/i18n';
import type { LineColor } from '@unlease/design/colors';
import { pebbleTurnOf } from '@unlease/design/pebbles';
import type { Contact } from '@unlease/contacts/models/contacts';
import { resolveContact } from '@unlease/contacts/services/duplicates';
import { contactName, initials, workLine } from '@unlease/contacts/services/names';
import { searchContacts } from '@unlease/contacts/services/search';

import { useContactsStore } from '@contacts/app/store/library';
import { useBlobUrl } from '@shared/app/media/images';
import { EmptyLine } from '@shared/ui/components/EmptyLine';
import { Floating } from '@shared/ui/components/Floating';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton } from '@shared/ui/components/IconButton';
import { Link } from '@shared/ui/router';
import { mentionPath } from '../../app/names';
import styles from '../calendar.module.css';
import { avatarColor } from '@unlease/contacts/services/avatar';
import { useFieldAnchor } from './Fields';

/** A person's own pigment, the same as in Contacts and on the phone (`avatarColor`). */
const washOf = (id: string): LineColor => avatarColor(id);

type Face = Pick<Contact, 'id' | 'firstName' | 'lastName' | 'company' | 'emails' | 'phones' | 'photoId' | 'photoUploaded'>;

function FaceComponent({ contact, size = 28 }: { contact: Face; size?: number }) {
  const url = useBlobUrl(contact.photoId, 'display', contact.photoUploaded);
  const letters = initials(contact);
  return (
    <span
      className={styles.face}
      data-pebble={url ? pebbleTurnOf(contact.id) : undefined}
      data-still={url ? true : undefined}
      data-line={url ? undefined : washOf(contact.id)}
      style={{ width: size, height: url ? Math.round(size * 0.93) : size, fontSize: Math.round(size * (letters.length > 1 ? 0.38 : 0.44)) }}
      aria-hidden="true"
    >
      {url ? <img src={url} alt="" draggable={false} /> : letters ? letters : <Icon name="person" size={Math.round(size * 0.6)} />}
    </span>
  );
}

export const PersonFace = memo(FaceComponent);

/** The contact an id names now (a merged one's survivor), or null when gone. */
export function useContact(id: string): Contact | null {
  const contacts = useContactsStore(s => s.contacts);
  return resolveContact(contacts, id);
}

/** A person the event is with: their face and name, opening them in Contacts. */
export function PersonChip({ id }: { id: string }) {
  const contact = useContact(id);
  const path = mentionPath({ type: 'contact', id: contact?.id ?? id });
  if (!contact) {
    return (
      <span className={styles.person} data-gone="">
        <Icon name="person" size={18} />
        <span>{t('Contact supprimé')}</span>
      </span>
    );
  }
  const inner = (
    <>
      <PersonFace contact={contact} />
      <span className={styles.personName}>{contactName(contact)}</span>
    </>
  );
  return path ? (
    <Link to={path} className={styles.person}>
      {inner}
    </Link>
  ) : (
    <span className={styles.person}>{inner}</span>
  );
}

/** The form's picker: the chosen people, and a field to find more (`autoFocus`: its caret as it appears, a quick form's row opened). */
export function PeoplePicker({ value, onChange, max, autoFocus = false }: { value: readonly string[]; onChange: (ids: readonly string[]) => void; max: number; autoFocus?: boolean }) {
  const contacts = useContactsStore(s => s.contacts);
  const labels = useContactsStore(s => s.labels);
  const listId = useId();
  const field = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const found = useMemo(() => {
    const live = Object.values(contacts).filter(contact => contact.deletedAt === null && contact.trashedAt === null && !contact.mergedInto && !value.includes(contact.id));
    if (!query.trim()) return live.filter(contact => contact.favorite).sort((a, b) => contactName(a).localeCompare(contactName(b))).slice(0, 6);
    return searchContacts(live, labels, query).slice(0, 6);
  }, [contacts, labels, query, value]);
  const add = (contact: Contact): void => {
    onChange([...value, contact.id].slice(0, max));
    setQuery('');
    setActive(0);
    field.current?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      if (found.length > 0) setActive((active + (event.key === 'ArrowDown' ? 1 : found.length - 1)) % found.length);
    } else if (event.key === 'Enter' && open && found[active]) {
      event.preventDefault();
      add(found[active]!);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === 'Backspace' && !query && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };
  // Nothing found is said, as Carnet's picker says it; with no word typed and no favourite, it waits for one.
  const typing = query.trim().length > 0;
  const none = useMemo(() => !Object.values(contacts).some(contact => contact.deletedAt === null && contact.trashedAt === null && !contact.mergedInto), [contacts]);
  const empty = found.length > 0 ? null : typing ? t('Personne ne s’appelle ainsi dans vos contacts.') : none ? t('Aucun contact pour l’instant.') : null;
  const listed = open && found.length > 0;
  const shown = listed || (open && empty !== null);
  const anchor = useFieldAnchor(shown, field);
  const width = anchor ? Math.min(Math.max(anchor.width, 280), 440) : undefined;
  return (
    <div className={styles.peoplePicker}>
      {value.length > 0 ? (
        <ul className={styles.people} aria-label={t('Avec')}>
          {value.map(id => {
            const contact = resolveContact(contacts, id);
            const name = contact ? contactName(contact) : t('Contact supprimé');
            return (
              <li key={id} className={styles.person} data-gone={contact ? undefined : ''}>
                {contact ? <PersonFace contact={contact} /> : <Icon name="person" size={18} />}
                <span className={styles.personName}>{name}</span>
                <IconButton icon="close" label={t('Retirer {name}', { name })} compact size={16} onClick={() => onChange(value.filter(each => each !== id))} />
              </li>
            );
          })}
        </ul>
      ) : null}
      {value.length < max ? (
        <div className={styles.comboBox}>
          <input
            ref={field}
            className={styles.fieldInput}
            value={query}
            role="combobox"
            aria-label={t('Ajouter des personnes')}
            aria-expanded={listed}
            data-owns-escape={open || undefined}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={listed ? `${listId}-${active}` : undefined}
            placeholder={value.length > 0 ? t('Ajouter quelqu’un') : t('Ajouter des personnes')}
            autoComplete="off"
            autoFocus={autoFocus}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onChange={event => {
              setQuery(event.target.value);
              setActive(0);
              setOpen(true);
            }}
            onKeyDown={onKeyDown}
          />
          {shown && anchor && !listed ? (
            <Floating anchor={anchor} label={t('Contacts')} id={listId}>
              <div style={{ width }}>
                <EmptyLine glyph={typing ? 'search' : 'person'} className={styles.floatEmpty} role="status" text={empty!} />
              </div>
            </Floating>
          ) : shown && anchor ? (
            <Floating anchor={anchor} label={query.trim() ? t('Contacts') : t('Favoris')} role="listbox" id={listId}>
              <div className={styles.floatList} style={{ width }}>
                {found.map((contact, index) => {
                  const detail = workLine(contact) || contact.emails[0]?.address || contact.phones[0]?.number || '';
                  return (
                    <div
                      key={contact.id}
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={index === active}
                      data-active={index === active || undefined}
                      className={styles.comboOption}
                      onPointerMove={() => (active === index ? undefined : setActive(index))}
                      onClick={() => add(contact)}
                    >
                      <PersonFace contact={contact} size={32} />
                      <span className={styles.comboText}>
                        <span className="t-body">{contactName(contact)}</span>
                        {detail ? <span className="t-meta">{detail}</span> : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Floating>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
