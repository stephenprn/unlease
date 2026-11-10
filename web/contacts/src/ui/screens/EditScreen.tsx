/**
 * « Créer un contact » and « Modifier le contact », as Google's form: the photo (picked from its
 * button's menu or dropped on it, shown at once, uploaded once saved); the name, the company and the
 * job; as many numbers, e-mails and addresses as wanted, each with its kind (a menu) or a name of
 * one's own; a number's calling code picked beside it (`CodePicker`, the « Indicatif par défaut » for
 * a new one or one written without it), the number written with its `+` once typed or given a code
 * here (one nobody touched is saved as it was); an address found as it
 * is typed (`PlaceField`: the other contacts' addresses, then the server's places), which fills its
 * parts; the birthday, typed as it is said (« 12/03/1990 »,
 * « 12/03 »); the labels and the star; a note. « Enregistrer », pinned at the window's foot with
 * « Annuler » (or ⌘/Ctrl+Entrée, ⌘/Ctrl+S), writes it all in one batch, the note merged with an edit
 * made elsewhere meanwhile. An e-mail or a birthday that does not read says so as the form's timing
 * says (`useForm`), an empty contact when it is saved; leaving with changes asks first (`useUnsaved`).
 */
import { useEffect, useEffectEvent, useId, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';

import { t, tx } from '@unlease/core/i18n';
import type { GlyphName } from '@unlease/design/glyphs';
import type { Place } from '@unlease/core/sync/places';
import { ADDRESS_KINDS, CONTACT_LIMITS, CONTACTS_TEXT_LIMITS, EMAIL_KINDS, PHONE_KINDS, PHONE_KIND_NAMES, PLACE_KIND_NAMES, type AddressEntry, type EmailEntry, type PhoneEntry } from '@unlease/contacts/models/contacts';
import { addressPlace } from '@unlease/contacts/services/addresses';
import { birthdayFieldText, birthdayMonthFirst, formatBirthday, readBirthday, readTypedBirthday, writeBirthday } from '@unlease/contacts/services/birthdays';
import { birthdayProblem, emailProblem, emptyContactProblem } from '@unlease/contacts/services/checks';
import { settleDate, typeDate } from '@unlease/core/services/dateTyping';
import { numberParts, writtenNumber, type NumberParts } from '@unlease/contacts/services/phones';

import { draftOf, emptyDraft, isEmptyDraft, newAddress, newEmail, newPhone, type ContactDraft } from '../../app/drafts';
import { keepPhoto, pickPhoto } from '../../app/media/photos';
import { createLabel, labelNameTaken, saveContact } from '../../app/store/actions';
import { takeSeed } from '../../app/store/contactsUi';
import { callingRegion } from '../../app/store/prefs';
import { useContactsStore } from '../../app/store/library';
import { showError } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { FormFoot } from '@shared/ui/components/FormFoot';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton } from '@shared/ui/components/IconButton';
import { SwitchMark } from '@shared/ui/components/Checkbox';
import { Menu } from '@shared/ui/components/Menu';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { PlaceField } from '@shared/ui/components/PlaceField';
import { TextField } from '@shared/ui/components/TextField';
import { useForm } from '@shared/ui/components/useForm';
import { useUnsaved } from '@shared/ui/components/useUnsaved';
import { PageHead } from '@shared/ui/navigation/PageHead';
import { goBack, navigate } from '@shared/ui/router';
import { useMedia } from '@shared/ui/useMedia';
import styles from '../contacts.module.css';
import { Avatar } from '../features/Avatar';
import { CodePicker } from '../features/CodePicker';
import { LabelChips } from '@shared/ui/components/LabelChips';
import { useLiveLabels } from '../../app/hooks/useContacts';
import { paths } from '../routes';

/** The select's choice for a name of one's own. */
const CUSTOM = 'custom';
const CUSTOM_NAME = tx('Personnalisé');

/** A panel of the form under its glyph and title; without a glyph, its fields alone (the photo above leads them), its title said to screen readers. */
function Group({ icon, title, children }: { icon?: GlyphName; title: string; children: ReactNode }) {
  const id = useId();
  if (!icon) {
    return (
      <OutlinedBox kind="panel" lift="card" className={`${styles.fieldset} ${styles.fieldsetBare} paper`} role="group" aria-label={title}>
        {children}
      </OutlinedBox>
    );
  }
  return (
    <OutlinedBox kind="panel" lift="card" className={`${styles.fieldset} paper`} role="group" aria-labelledby={id}>
      <div className={styles.fieldsetHead}>
        <Icon name={icon} size={22} />
        <h2 id={id} className="t-section">
          {title}
        </h2>
      </div>
      {children}
    </OutlinedBox>
  );
}

/** A row's kind (`mobile`, `work`), or a name of one's own (« Bureau Lyon »): a field-like button opening its menu, the chosen one ticked. */
function KindPicker({ kinds, names, entry, custom, onKind, label }: { kinds: readonly string[]; names: Readonly<Record<string, string>>; entry: { kind: string; label: string }; custom: boolean; onKind: (kind: string, custom: boolean) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const value = custom || entry.label ? CUSTOM : kinds.includes(entry.kind) ? entry.kind : 'other';
  const shown = value === CUSTOM ? t(CUSTOM_NAME) : (names[value] ?? value);
  const mark = (on: boolean): ReactNode => (on ? <Icon name="check" size={22} className={styles.kindTick} /> : <span className={styles.kindBlank} />);
  return (
    <>
      <button ref={anchor} type="button" className={styles.kindButton} aria-haspopup="menu" aria-expanded={open} aria-label={`${label} : ${shown}`} onClick={() => setOpen(true)}>
        <span className={styles.kindName}>{shown}</span>
        <Icon name="chevronDown" size={18} />
      </button>
      <Menu
        open={open}
        anchor={anchor}
        align="start"
        onDismiss={() => setOpen(false)}
        label={label}
        items={[
          ...kinds.map(kind => ({ label: names[kind] ?? kind, icon: 'check' as const, mark: mark(value === kind), onSelect: () => onKind(kind, false) })),
          { label: t('Personnalisé…'), icon: 'edit' as const, mark: mark(value === CUSTOM), separatorBefore: true, onSelect: () => onKind(entry.kind, true) },
        ]}
      />
    </>
  );
}

type Rows<T> = readonly T[];

/** The other contacts' addresses, offered first as an address is typed (a household shares one). */
function useKnownAddresses(id: string | null): readonly Place[] {
  const contacts = useContactsStore(s => s.contacts);
  return useMemo(() => {
    const places: Place[] = [];
    for (const contact of Object.values(contacts)) {
      if (contact.id === id || contact.deletedAt !== null || contact.trashedAt !== null || contact.mergedInto) continue;
      for (const address of contact.addresses) {
        const place = addressPlace(address);
        if (place) places.push(place);
      }
    }
    return places;
  }, [contacts, id]);
}

/** Each number's calling code in the form, by its row (`null`: none, kept as written); a row not here takes the default. */
type Codes = Readonly<Record<string, string | null>>;

/** Each number as the form opened it: stored, and split (`writtenNumber` keeps a row nobody touched as stored). */
type OpenedNumbers = Readonly<Record<string, NumberParts & { readonly number: string }>>;

/** The form's numbers split from their codes (`+33 6 12…` -> `FR` and `6 12…`), a number written without one taking `fallback`. */
function splitPhones(draft: ContactDraft, fallback: string | null): { readonly draft: ContactDraft; readonly codes: Codes; readonly numbers: OpenedNumbers } {
  const codes: Record<string, string | null> = {};
  const numbers: Record<string, NumberParts & { readonly number: string }> = {};
  const phones = draft.phones.map(phone => {
    const parts = numberParts(phone.number, fallback);
    codes[phone.id] = parts.region;
    numbers[phone.id] = { ...parts, number: phone.number };
    return { ...phone, number: parts.rest };
  });
  return { draft: { ...draft, phones }, codes, numbers };
}

/** Replaces one row of a list, by its id. */
function replaced<T extends { id: string }>(rows: Rows<T>, id: string, patch: Partial<T>): T[] {
  return rows.map(row => (row.id === id ? { ...row, ...patch } : row));
}

function ContactForm({ id, initial: given, initialNote, title }: { id: string | null; initial: ContactDraft; initialNote: string; title: string }) {
  // The « Indicatif par défaut » as the form opened: a number without its code, and every new one, take it.
  const [fallback] = useState(callingRegion);
  // A birthday is read month first in English where the region writes dates so (`birthdayMonthFirst`).
  const monthFirst = birthdayMonthFirst(fallback);
  const [opened] = useState(() => splitPhones(given, fallback));
  const initial = opened.draft;
  const [draft, setDraft] = useState(initial);
  const labels = useLiveLabels();
  const [codes, setCodes] = useState<Codes>(opened.codes);
  const [note, setNote] = useState(initialNote);
  const [since] = useState<string | null>(id ? initialNote : null);
  const [custom, setCustom] = useState<ReadonlySet<string>>(() => new Set([...initial.phones, ...initial.emails, ...initial.addresses].filter(row => row.label).map(row => row.id)));
  const [birthdayText, setBirthdayText] = useState(() => birthdayFieldText(readBirthday(initial.birthday), monthFirst));
  const [picked, setPicked] = useState<{ readonly id: string; readonly mime: string; readonly file: File } | null>(null);
  const [over, setOver] = useState(false);
  const [photoMenu, setPhotoMenu] = useState(false);
  // Under a finger the face is touched, and nothing is dropped on it.
  const finger = useMedia('(pointer: coarse)');
  const photoButton = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const known = useKnownAddresses(id);
  const set = (patch: Partial<ContactDraft>): void => setDraft(current => ({ ...current, ...patch }));
  const setCustomRow = (rowId: string, on: boolean): void =>
    setCustom(current => {
      const next = new Set(current);
      if (on) next.add(rowId);
      else next.delete(rowId);
      return next;
    });

  const parsedBirthday = readTypedBirthday(birthdayText, monthFirst);
  const empty = isEmptyDraft(draft, note);
  // An empty contact is said under its first name, once saved; the rest as each field is left.
  const checks: Record<string, string | null> = { firstName: empty ? emptyContactProblem() : null, birthday: birthdayProblem(birthdayText, monthFirst) };
  for (const email of draft.emails) checks[`email:${email.id}`] = emailProblem(email.address);
  const form = useForm(checks);
  const [start] = useState(() => JSON.stringify({ draft: initial, codes: opened.codes, note: initialNote, birthday: birthdayFieldText(readBirthday(initial.birthday), monthFirst) }));
  const dirty = JSON.stringify({ draft, codes, note, birthday: birthdayText }) !== start;
  const codeOf = (rowId: string): string | null => (rowId in codes ? codes[rowId]! : fallback);
  const setCode = (rowId: string, region: string | null): void => setCodes(current => ({ ...current, [rowId]: region }));
  // A number typed with its own code (« +44 20… ») gives it to the picker when the field is left.
  const takeCode = (phone: PhoneEntry): void => {
    const typed = phone.number.trim();
    if (!typed.startsWith('+') && !/^00[1-9]/.test(typed)) return;
    const parts = numberParts(typed, codeOf(phone.id));
    if (!parts.region) return;
    setCode(phone.id, parts.region);
    set({ phones: replaced(draft.phones, phone.id, { number: parts.rest }) });
  };
  const unsaved = useUnsaved(dirty, { page: id ? paths.contact(id) : paths.contacts });

  const choosePhoto = (file: File | undefined): void => {
    if (!file) return;
    const photo = pickPhoto(file);
    if (!photo) {
      showError(t('Cette image n’est pas prise : une photo JPEG, PNG, WebP, GIF, HEIC ou AVIF de 25 Mo au plus.'));
      return;
    }
    setPicked(photo);
    set({ photoId: photo.id, photoMime: photo.mime, photoUploaded: false });
  };

  const save = (): void => {
    const ready: ContactDraft = {
      ...draft,
      phones: draft.phones.map(phone => ({ ...phone, number: writtenNumber(opened.numbers[phone.id], codeOf(phone.id), phone.number) })),
      birthday: parsedBirthday ? writeBirthday(parsedBirthday) : null,
    };
    const saved = saveContact(id, ready, { since, typed: note });
    if (picked && ready.photoId === picked.id) void keepPhoto(picked.id, picked.file, picked.mime);
    unsaved.saved();
    if (id) goBack(paths.contact(saved));
    else navigate(paths.contact(saved), { replace: true });
  };

  // ⌘/Ctrl+Entrée and ⌘/Ctrl+S save from anywhere on the page.
  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || !(event.key === 'Enter' || event.key.toLowerCase() === 's')) return;
    event.preventDefault();
    void form.submit(save);
  });
  useEffect(() => {
    const listen = (event: KeyboardEvent): void => onShortcut(event);
    window.addEventListener('keydown', listen);
    return () => window.removeEventListener('keydown', listen);
  }, []);

  const phones = (
    <Group icon="phoneCall" title={t('Téléphones')}>
      {draft.phones.map((phone: PhoneEntry, index) => (
        <div key={phone.id} className={`${styles.entry} ${styles.phoneEntry}`}>
          <CodePicker region={codeOf(phone.id)} fallback={fallback} onChange={region => setCode(phone.id, region)} label={t('Indicatif du numéro {index}', { index: index + 1 })} />
          <TextField
            kind="tel"
            className={styles.entryNumber}
            value={phone.number}
            onChange={number => set({ phones: replaced(draft.phones, phone.id, { number }) })}
            onBlur={() => takeCode(phone)}
            ariaLabel={t('Numéro {index}', { index: index + 1 })}
            placeholder={t('Numéro')}
            maxLength={CONTACT_LIMITS.number}
          />
          <KindPicker
            kinds={PHONE_KINDS}
            names={PHONE_KIND_NAMES}
            entry={phone}
            custom={custom.has(phone.id)}
            label={t('Type du numéro {index}', { index: index + 1 })}
            onKind={(kind, own) => {
              setCustomRow(phone.id, own);
              set({ phones: replaced(draft.phones, phone.id, own ? { kind: 'other' } : { kind, label: '' }) });
            }}
          />
          <IconButton icon="close" className={styles.entryRemove} label={t('Retirer le numéro {index}', { index: index + 1 })} shape={index} onClick={() => set({ phones: draft.phones.filter(row => row.id !== phone.id) })} />
          {custom.has(phone.id) ? <TextField kind="text" className={styles.entryCustom} value={phone.label} onChange={label => set({ phones: replaced(draft.phones, phone.id, { label }) })} ariaLabel={t('Nom du type')} placeholder={t('Nom du type (Bureau Lyon…)')} maxLength={CONTACT_LIMITS.entryLabel} /> : null}
        </div>
      ))}
      {draft.phones.length < CONTACT_LIMITS.phones ? (
        <div>
          <Button kind="text" icon="plus" onClick={() => set({ phones: [...draft.phones, newPhone(draft.phones.length === 0 ? 'mobile' : 'home')] })}>
            {t('Ajouter un numéro')}
          </Button>
        </div>
      ) : null}
    </Group>
  );

  const emails = (
    <Group icon="email" title={t('E-mails')}>
      {draft.emails.map((email: EmailEntry, index) => (
        <div key={email.id} className={styles.entry}>
          <TextField kind="email" field={form.field(`email:${email.id}`)} value={email.address} onChange={address => set({ emails: replaced(draft.emails, email.id, { address }) })} ariaLabel={t('E-mail {index}', { index: index + 1 })} placeholder={t('E-mail')} maxLength={CONTACT_LIMITS.email} />
          <KindPicker
            kinds={EMAIL_KINDS}
            names={PLACE_KIND_NAMES}
            entry={email}
            custom={custom.has(email.id)}
            label={t('Type de l’e-mail {index}', { index: index + 1 })}
            onKind={(kind, own) => {
              setCustomRow(email.id, own);
              set({ emails: replaced(draft.emails, email.id, own ? { kind: 'other' } : { kind, label: '' }) });
            }}
          />
          <IconButton icon="close" className={styles.entryRemove} label={t('Retirer l’e-mail {index}', { index: index + 1 })} shape={index} onClick={() => set({ emails: draft.emails.filter(row => row.id !== email.id) })} />
          {custom.has(email.id) ? <TextField kind="text" className={styles.entryCustom} value={email.label} onChange={label => set({ emails: replaced(draft.emails, email.id, { label }) })} ariaLabel={t('Nom du type')} placeholder={t('Nom du type (Bureau Lyon…)')} maxLength={CONTACT_LIMITS.entryLabel} /> : null}
        </div>
      ))}
      {draft.emails.length < CONTACT_LIMITS.emails ? (
        <div>
          <Button kind="text" icon="plus" onClick={() => set({ emails: [...draft.emails, newEmail(draft.emails.length === 0 ? 'home' : 'work')] })}>
            {t('Ajouter un e-mail')}
          </Button>
        </div>
      ) : null}
    </Group>
  );

  const part = (address: AddressEntry, key: 'postalCode' | 'city' | 'region' | 'country', label: string): ReactNode => (
    <TextField kind={key} label={label} value={address[key]} onChange={value => set({ addresses: replaced(draft.addresses, address.id, { [key]: value }) })} maxLength={CONTACT_LIMITS.addressPart} />
  );

  /** The street's first line, found as it is typed; its other lines (a building, a floor) under it. */
  const streetLines = (address: AddressEntry): { first: string; rest: string } => {
    const [first = '', ...rest] = address.street.split('\n');
    return { first, rest: rest.join('\n') };
  };
  const setStreet = (address: AddressEntry, first: string, rest: string): void => set({ addresses: replaced(draft.addresses, address.id, { street: rest ? `${first}\n${rest}` : first }) });
  const pickPlace = (address: AddressEntry, place: Place): void => {
    const first = place.street || (place.name !== place.city ? place.name : '');
    const { rest } = streetLines(address);
    set({ addresses: replaced(draft.addresses, address.id, { street: rest ? `${first}\n${rest}` : first, postalCode: place.postalCode, city: place.city, region: place.region, country: place.country }) });
  };

  const addresses = (
    <Group icon="mapPin" title={t('Adresses')}>
      {draft.addresses.map((address, index) => {
        const { first, rest } = streetLines(address);
        return (
          <div key={address.id} className={styles.address}>
            <div className={styles.addressHead}>
              <KindPicker
                kinds={ADDRESS_KINDS}
                names={PLACE_KIND_NAMES}
                entry={address}
                custom={custom.has(address.id)}
                label={t('Type de l’adresse {index}', { index: index + 1 })}
                onKind={(kind, own) => {
                  setCustomRow(address.id, own);
                  set({ addresses: replaced(draft.addresses, address.id, own ? { kind: 'other' } : { kind, label: '' }) });
                }}
              />
              {custom.has(address.id) ? <TextField kind="text" value={address.label} onChange={label => set({ addresses: replaced(draft.addresses, address.id, { label }) })} ariaLabel={t('Nom du type')} placeholder={t('Nom du type (Bureau Lyon…)')} maxLength={CONTACT_LIMITS.entryLabel} /> : <span />}
              <IconButton icon="close" label={t('Retirer l’adresse {index}', { index: index + 1 })} shape={index} onClick={() => set({ addresses: draft.addresses.filter(row => row.id !== address.id) })} />
            </div>
            <PlaceField
              className={styles.addressWide}
              label={t('Rue')}
              value={first}
              onChange={value => setStreet(address, value, rest)}
              onPick={place => pickPlace(address, place)}
              known={known}
              placeholder={t('Un numéro et une rue, un lieu, une ville…')}
              help={t('Choisir une adresse proposée remplit le code postal, la ville et le pays.')}
              autoFocus={address.street === '' && address.city === '' && index === draft.addresses.length - 1 && index > 0}
            />
            <TextField
              kind="street"
              className={styles.addressWide}
              label={t('Complément')}
              value={rest}
              multiline={rest.includes('\n')}
              onChange={value => setStreet(address, first, value)}
              placeholder={t('Bâtiment, étage, code…')}
              maxLength={CONTACT_LIMITS.addressLine}
            />
            {part(address, 'postalCode', t('Code postal'))}
            {part(address, 'city', t('Ville'))}
            {part(address, 'region', t('Région'))}
            {part(address, 'country', t('Pays'))}
          </div>
        );
      })}
      {draft.addresses.length < CONTACT_LIMITS.addresses ? (
        <div>
          <Button kind="text" icon="plus" onClick={() => set({ addresses: [...draft.addresses, newAddress(draft.addresses.length === 0 ? 'home' : 'work')] })}>
            {t('Ajouter une adresse')}
          </Button>
        </div>
      ) : null}
    </Group>
  );

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setOver(false);
    choosePhoto(event.dataTransfer.files[0]);
  };

  return (
    <form className={`${styles.screen} ${styles.narrowScreen} ${styles.form}`} onSubmit={form.onSubmit(save)} noValidate>
      <PageHead title={title} />
      <div
        className={styles.formHead}
        data-over={over || undefined}
        onDragOver={event => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <button
          ref={photoButton}
          type="button"
          className={styles.photoButton}
          aria-haspopup="menu"
          aria-expanded={photoMenu}
          aria-label={draft.photoId ? t('Changer la photo') : t('Ajouter une photo')}
          data-tip={draft.photoId ? t('Changer la photo') : t('Ajouter une photo')}
          onClick={() => (draft.photoId ? setPhotoMenu(true) : fileInput.current?.click())}
        >
          <Avatar contact={{ id: id ?? 'new', firstName: draft.firstName, lastName: draft.lastName, company: draft.company, emails: draft.emails, phones: draft.phones, photoId: draft.photoId, photoUploaded: draft.photoUploaded }} size={96} />
          <span className={styles.photoBadge} data-pebble-under={3} aria-hidden="true">
            <Icon name="camera" size={18} />
          </span>
        </button>
        {/* The face and its camera say they choose the photo; what they cannot show is the drop, under a pointer. */}
        {finger ? null : <p className={`${styles.photoHint} t-meta`}>{t('Une image déposée ici devient sa photo.')}</p>}
        <Menu
          open={photoMenu}
          anchor={photoButton}
          align="start"
          onDismiss={() => setPhotoMenu(false)}
          label={t('Photo')}
          items={[
            { label: t('Choisir une autre photo…'), icon: 'image', onSelect: () => fileInput.current?.click() },
            { label: t('Retirer la photo'), icon: 'trash', danger: true, onSelect: () => set({ photoId: null, photoMime: '', photoUploaded: false }) },
          ]}
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            choosePhoto(file);
          }}
        />
      </div>
      {/* Who they are: the photo leads these fields, so they take no title of their own (« Nom » then « Prénom » read twice). */}
      <Group title={t('Nom')}>
        <div className={styles.pair}>
          <TextField kind="person" field={form.field('firstName')} label={t('Prénom')} value={draft.firstName} onChange={firstName => set({ firstName })} maxLength={CONTACT_LIMITS.name} autoFocus={!id} />
          <TextField kind="person" label={t('Nom de famille')} value={draft.lastName} onChange={lastName => set({ lastName })} maxLength={CONTACT_LIMITS.name} />
          <TextField kind="organization" label={t('Entreprise')} value={draft.company} onChange={company => set({ company })} maxLength={CONTACT_LIMITS.company} />
          <TextField kind="text" label={t('Fonction')} value={draft.jobTitle} onChange={jobTitle => set({ jobTitle })} maxLength={CONTACT_LIMITS.jobTitle} />
        </div>
      </Group>
      {phones}
      {emails}
      {addresses}
      <Group icon="cake" title={t('Anniversaire')}>
        <TextField
          kind="number"
          field={form.field('birthday')}
          // « Anniversaire » over it names it; its format stays in its help.
          ariaLabel={t('Date')}
          value={birthdayText}
          // Its separators are written as it is typed (« 27 » -> « 27/ »): digits alone are enough.
          onChange={text => setBirthdayText(before => typeDate(before, text, monthFirst ? 'monthFirst' : 'dayFirst'))}
          onBlur={() => setBirthdayText(before => settleDate(before))}
          placeholder={monthFirst ? t('MM/JJ/AAAA') : t('JJ/MM/AAAA')}
          inputMode="numeric"
          className={styles.birthdayField}
          help={`${monthFirst ? t('MM/JJ/AAAA, année facultative') : t('JJ/MM/AAAA, année facultative')}${parsedBirthday ? ` · ${formatBirthday(parsedBirthday)}` : ''}`}
        />
      </Group>
      <Group icon="tag" title={t('Libellés')}>
        <LabelChips
          labels={labels}
          chosen={draft.labelIds}
          onToggle={id => set({ labelIds: draft.labelIds.includes(id) ? draft.labelIds.filter(other => other !== id) : [...draft.labelIds, id] })}
          onCreate={name => {
            if (labelNameTaken(name)) return { problem: t('Ce libellé existe déjà : choisissez un autre nom.') };
            const id = createLabel(name);
            set({ labelIds: [...draft.labelIds, id] });
            return { id };
          }}
          maxLength={CONTACT_LIMITS.labelName}
          words={{ add: t('Nouveau libellé'), placeholder: t('Nom du libellé'), field: t('Nom du nouveau libellé'), create: t('Créer le libellé') }}
        />
        <button type="button" role="switch" aria-checked={draft.favorite} className={styles.switchRow} onClick={() => set({ favorite: !draft.favorite })}>
          <span className={styles.switchText}>
            <span className="t-body">{t('Favori')}</span>
            <span className="t-meta">{t('En tête de la liste, et dans les appels rapides.')}</span>
          </span>
          <SwitchMark checked={draft.favorite} />
        </button>
      </Group>
      <Group icon="note" title={t('Note')}>
        <TextField kind="prose" ariaLabel={t('Note')} value={note} onChange={setNote} multiline maxLength={CONTACTS_TEXT_LIMITS.contact.note} placeholder={t('Ce que vous voulez retenir')} />
      </Group>
      <FormFoot form={form}>
        <Button kind="text" onClick={() => goBack(id ? paths.contact(id) : paths.contacts)}>
          {t('Annuler')}
        </Button>
        <Button type="submit" icon="check" busy={form.busy}>
          {t('Enregistrer')}
        </Button>
      </FormFoot>
      {unsaved.dialog}
    </form>
  );
}

/** A new contact's form, from what « Créer un contact » was given (a name typed, a label's list). */
export function NewContactScreen() {
  const [seed] = useState(takeSeed);
  return <ContactForm id={null} initial={emptyDraft(seed?.name ?? '', seed?.labelIds ?? [])} initialNote="" title={t('Créer un contact')} />;
}

/** A contact's form, as it stands when opened. */
export function EditContactScreen({ id }: { id: string }) {
  const contact = useContactsStore(s => s.contacts[id]);
  const [opened] = useState(contact);
  if (!opened || opened.deletedAt !== null) {
    return (
      <div className={`${styles.screen} ${styles.narrowScreen}`}>
        <EmptyState scene="trash" as="h1" title={t('Ce contact n’existe plus')} text={t('Il a été supprimé, sur cet appareil ou sur un autre.')} />
      </div>
    );
  }
  return <ContactForm id={id} initial={draftOf(opened)} initialNote={opened.note} title={t('Modifier le contact')} />;
}
