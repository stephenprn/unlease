/**
 * « Créer un contact » and « Modifier le contact », as Google's form: the photo (the gallery or the
 * camera, or none), the names, the company and the job; as many numbers, emails and addresses as
 * wanted, each with its kind or a name of the person's own (a number with its calling code before it,
 * picked in a sheet: the « Indicatif par défaut » for a new one or one written without it, written
 * with its `+` once typed or picked here); an address looked for over the whole screen (`PlaceField`:
 * the other contacts' addresses, then the server's places as it is typed), which fills its parts; the birthday, its separators written as it is typed
 * (`core/services/dateTyping`; the year may be left out); the labels, each one tap on or off, a new
 * one named in place (`LabelChips`); the star, and the note. A full-screen form, as Material's: × to leave (asking first
 * when something changed, `useUnsaved`), « Enregistrer » at the bar's end, which writes what changed
 * in one batch (the note, typed text, merged with an edit made elsewhere meanwhile). The keyboard's
 * « Suivant » walks the fields in order, the keyboard staying up; an e-mail or a birthday that does
 * not read says so under it as the form's timing says (`useForm`), an empty contact under its first
 * name when saved.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, View } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { createId } from '@unlease/core/services/ids';
import { settleDate, typeDate } from '@unlease/core/services/dateTyping';
import type { GlyphName } from '@unlease/design/glyphs';
import { ADDRESS_KINDS, CONTACTS_TEXT_LIMITS, CONTACT_LIMITS, EMAIL_KINDS, PHONE_KINDS, PHONE_KIND_NAMES, PLACE_KIND_NAMES, type AddressEntry, type EmailEntry, type PhoneEntry } from '@unlease/contacts/models/contacts';
import { birthdayFieldText, birthdayMonthFirst, formatBirthday, readBirthday, readTypedBirthday, writeBirthday } from '@unlease/contacts/services/birthdays';
import { birthdayProblem, emailProblem, emptyContactProblem } from '@unlease/contacts/services/checks';
import { addressPlace, phoneKindName, placeKindName } from '@unlease/contacts/services/addresses';
import { CALLING_CODES, numberParts, writtenNumber, type NumberParts } from '@unlease/contacts/services/phones';
import type { Place } from '@unlease/core/sync/places';
import { useContact } from '@app/hooks/useContacts';
import { handedDraft } from '@app/handedContact';
import { deviceRegion } from '@app/reach';
import { cleanDraft, createContact, createLabel, draftPatch, labelNameTaken, updateContact, type ContactDraft } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { dropPhoto, photoReplaced, photoWritten, pickPhoto } from '@app/photos';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, Button, FormMessage, Ground, Icon, IconButton, LabelChips, Menu, Organic, PlaceField, PlaceSearchHost, RevealScrollView, Tappable, TextField, TopBar, useForm, useUnsaved, type LabelChipItem, type MenuItem } from '@shared/ui/components';
import { SwitchRow } from '@shared/ui/features/appearance/SwitchRow';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { ContactAvatar } from '../features/contacts/ContactAvatar';
import { KindSheet, type KindChoice } from '../features/contacts/KindSheet';
import { callingCountry, CodeSheet } from '../features/contacts/RegionSheet';
import type { ScreenProps } from '../navigation/types';
import { later } from '@app/later';

const EMPTY_DRAFT: ContactDraft = { firstName: '', lastName: '', company: '', jobTitle: '', phones: [], emails: [], addresses: [], birthday: null, labelIds: [], favorite: false, photoId: null, photoMime: '', photoUploaded: false };

// As the web's form: the first row of a kind is the usual one (a mobile, a home), the next ones the other (home, work).
const newPhone = (number = '', kind = 'mobile'): PhoneEntry => ({ id: createId(), number, kind, label: '' });
const newEmail = (kind = 'home'): EmailEntry => ({ id: createId(), address: '', kind, label: '' });
const newAddress = (kind = 'home'): AddressEntry => ({ id: createId(), kind, label: '', street: '', postalCode: '', city: '', region: '', country: '' });

/** Which kinds a row offers, and their names. */
type KindTarget = { readonly list: 'phones' | 'emails' | 'addresses'; readonly id: string };

function Group({ icon, title, children }: { icon: GlyphName; title: string; children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <View style={styles.group}>
      <View style={styles.groupHead}>
        <Icon name={icon} size={20} color={theme.color.inkMuted} />
        <AppText variant="section" accessibilityRole="header">
          {title}
        </AppText>
      </View>
      {children}
    </View>
  );
}

/** A number's calling code before its field (« +33 »), opening its sheet; « — » for none. */
function CodeChip({ region, onPress }: { region: string | null; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <Tappable frost onPress={onPress} style={[styles.kind, styles.code]} accessibilityRole="button" accessibilityLabel={t('Indicatif : {country}', { country: region ? callingCountry(region) : t('Aucun indicatif') })}>
      <AppText variant="label" numberOfLines={1} style={styles.kindText}>
        {region ? `+${CALLING_CODES[region] ?? ''}` : '—'}
      </AppText>
      <Icon name="chevronDown" size={16} color={theme.color.inkMuted} />
    </Tappable>
  );
}

/** Each number as the form opened it: stored, and split from its code (`writtenNumber` keeps a row nobody touched as stored). */
type OpenedNumbers = Readonly<Record<string, NumberParts & { readonly number: string }>>;

/** The form's numbers split from their codes (`+33 6 12…` -> `FR` and `6 12…`), a number written without one taking `fallback`. */
function splitPhones(draft: ContactDraft, fallback: string | null): { readonly draft: ContactDraft; readonly codes: Readonly<Record<string, string | null>>; readonly numbers: OpenedNumbers } {
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

function KindChip({ name, onPress }: { name: string; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <Tappable frost onPress={onPress} style={styles.kind} accessibilityRole="button" accessibilityLabel={t('Type : {kind}', { kind: name })}>
      <AppText variant="label" numberOfLines={1} style={styles.kindText}>
        {name}
      </AppText>
      <Icon name="chevronDown" size={16} color={theme.color.inkMuted} />
    </Tappable>
  );
}

export function EditContactScreen({ navigation, route }: ScreenProps<'Edit'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const editing = route.params?.id ?? null;
  const contact = useContact(editing);
  const contacts = useLibraryStore(s => s.contacts);
  const labelOrder = useLibraryStore(s => s.labelOrder);
  const labelRecords = useLibraryStore(s => s.labels);
  const labels = useMemo(
    () =>
      labelOrder.flatMap((id): LabelChipItem[] => {
        const label = labelRecords[id];
        return label && label.deletedAt === null ? [{ id, name: label.name, color: label.color }] : [];
      }),
    [labelOrder, labelRecords],
  );
  // The other contacts' addresses, offered first as an address is typed (a household shares one).
  const known = useMemo(() => {
    const places: Place[] = [];
    for (const other of Object.values(contacts)) {
      if (other.id === editing || other.deletedAt !== null || other.trashedAt !== null || other.mergedInto) continue;
      for (const address of other.addresses) {
        const place = addressPlace(address);
        if (place) places.push(place);
      }
    }
    return places;
  }, [contacts, editing]);

  const initial = useMemo<ContactDraft>(() => {
    // A number and an e-mail ready to fill, as on the web (Google's form): an empty row is left out when saved.
    if (contact) return { ...EMPTY_DRAFT, ...contact, phones: contact.phones.length > 0 ? contact.phones : [newPhone()], emails: contact.emails.length > 0 ? contact.emails : [newEmail()] };
    // Another app's « Créer un contact »: what it handed, kept only once saved (× leaves without a trace).
    if (route.params?.handed) return { ...EMPTY_DRAFT, ...handedDraft(route.params.handed, createId) };
    return {
      ...EMPTY_DRAFT,
      phones: [newPhone(route.params?.phone ?? '')],
      emails: [newEmail()],
      labelIds: route.params?.label ? [route.params.label] : [],
      favorite: route.params?.favorite === true,
    };
    // The form starts from the contact as it was opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const initialNote = useRef(contact?.note ?? route.params?.handed?.note ?? '').current;
  // The « Indicatif par défaut » as the form opened: a number without its code, and every new one, take it.
  const [fallback] = useState(deviceRegion);
  // A birthday is read month first in English where the region writes dates so (`birthdayMonthFirst`).
  const monthFirst = birthdayMonthFirst(fallback);
  const [opened] = useState(() => splitPhones(initial, fallback));
  const [draft, setDraft] = useState<ContactDraft>(opened.draft);
  const [codes, setCodes] = useState<Readonly<Record<string, string | null>>>(opened.codes);
  const [codeTarget, setCodeTarget] = useState<string | null>(null);
  const [note, setNote] = useState(initialNote);
  const [birthdayText, setBirthdayText] = useState(() => birthdayFieldText(readBirthday(initial.birthday), monthFirst));
  const [kindTarget, setKindTarget] = useState<KindTarget | null>(null);
  // The row just added takes the cursor, as a new field is typed in at once.
  const [added, setAdded] = useState<string | null>(null);
  const [photoMenu, setPhotoMenu] = useState(false);
  const saved = useRef(false);
  /** The photos picked in this form: those left unworn when it closes are dropped (`dropPhoto`). */
  const picks = useRef<string[]>([]);
  useEffect(
    () => () => {
      for (const id of picks.current) dropPhoto(id);
    },
    [],
  );

  const dateOrder = monthFirst ? 'monthFirst' : 'dayFirst';
  const typed = birthdayText.trim() ? readTypedBirthday(birthdayText, monthFirst) : null;
  const codeOf = (rowId: string): string | null => (rowId in codes ? codes[rowId]! : fallback);
  const current: ContactDraft = {
    ...draft,
    phones: draft.phones.map(phone => ({ ...phone, number: writtenNumber(opened.numbers[phone.id], codeOf(phone.id), phone.number) })),
    birthday: typed ? writeBirthday(typed) : null,
  };
  const clean = cleanDraft(current);
  const empty = !clean.firstName && !clean.lastName && !clean.company && clean.phones.length === 0 && clean.emails.length === 0 && clean.addresses.length === 0 && !note.trim();

  const dirty = note !== initialNote || (contact ? Object.keys(draftPatch(contact, current)).length > 0 : JSON.stringify(clean) !== JSON.stringify(cleanDraft(initial)));
  const unsaved = useUnsaved(dirty, { screen: true });
  const markSaved = unsaved.saved;

  // An empty contact is said under its first name once saved; an e-mail or a birthday as it is left.
  const checks: Record<string, string | null> = { firstName: empty ? emptyContactProblem() : null, birthday: birthdayProblem(birthdayText, monthFirst) };
  for (const entry of draft.emails) checks[`email:${entry.id}`] = emailProblem(entry.address);
  // The keyboard's « Suivant » goes down the form as it reads.
  const order = [
    'firstName',
    'lastName',
    'company',
    'jobTitle',
    ...draft.phones.map(entry => `phone:${entry.id}`),
    ...draft.emails.map(entry => `email:${entry.id}`),
    ...draft.addresses.flatMap(entry => ['street', 'rest', 'postalCode', 'city', 'region', 'country'].map(part => `${part}:${entry.id}`)),
    'birthday',
    'note',
  ];
  const form = useForm(checks, { order });

  const leave = (): void => {
    saved.current = true;
    markSaved();
    navigation.goBack();
  };

  // A contact deleted elsewhere while the form is open: nothing left to edit.
  useEffect(() => {
    if (editing && contact?.deletedAt != null && !saved.current) {
      markSaved();
      navigation.goBack();
    }
  }, [editing, contact?.deletedAt, navigation, markSaved]);

  const update = <K extends keyof ContactDraft>(key: K, value: ContactDraft[K]): void => setDraft(before => ({ ...before, [key]: value }));
  const updateEntry = <L extends 'phones' | 'emails' | 'addresses'>(list: L, id: string, patch: Partial<ContactDraft[L][number]>): void =>
    setDraft(before => ({ ...before, [list]: (before[list] as readonly { id: string }[]).map(entry => (entry.id === id ? { ...entry, ...patch } : entry)) }));
  const removeEntry = (list: 'phones' | 'emails' | 'addresses', id: string): void => setDraft(before => ({ ...before, [list]: (before[list] as readonly { id: string }[]).filter(entry => entry.id !== id) }));
  // A number typed with its own code (« +44 20… ») gives it to the chip when the field is left.
  const takeCode = (phone: PhoneEntry): void => {
    const number = phone.number.trim();
    if (!number.startsWith('+') && !/^00[1-9]/.test(number)) return;
    const parts = numberParts(number, codeOf(phone.id));
    if (!parts.region) return;
    setCodes(before => ({ ...before, [phone.id]: parts.region }));
    updateEntry('phones', phone.id, { number: parts.rest });
  };

  const save = (): void => {
    if (!editing) {
      const id = createContact(clean, note.trim());
      if (clean.photoId) photoWritten();
      saved.current = true;
      markSaved();
      navigation.replace('Contact', { id });
      return;
    }
    const before = contact?.photoId ?? null;
    const changed = updateContact(editing, clean, { since: initialNote, typed: note });
    if (changed && clean.photoId !== before) photoReplaced(before, clean.photoId);
    leave();
  };

  const choosePhoto = async (source: 'gallery' | 'camera'): Promise<void> => {
    const picked = await pickPhoto(source);
    if (picked.status === 'ok') {
      // A photo picked here a moment ago and replaced at once never reaches a contact.
      const previous = draft.photoId;
      picks.current.push(picked.photo.id);
      setDraft(before => ({ ...before, photoId: picked.photo.id, photoMime: picked.photo.mime, photoUploaded: false }));
      if (previous && picks.current.includes(previous)) dropPhoto(previous);
    }
    else if (picked.status === 'error') showSnack(picked.message, undefined, { tone: 'error' });
  };

  const removePhoto = (): void => {
    const previous = draft.photoId;
    setDraft(before => ({ ...before, photoId: null, photoMime: '', photoUploaded: false }));
    if (previous && picks.current.includes(previous)) dropPhoto(previous);
  };

  const photoItems: MenuItem[] = [
    { label: t('Choisir une photo'), icon: 'image', onPress: () => later(choosePhoto('gallery')) },
    { label: t('Prendre une photo'), icon: 'camera', onPress: () => later(choosePhoto('camera')) },
    ...(draft.photoId ? [{ label: t('Retirer la photo'), icon: 'trash' as const, danger: true, onPress: removePhoto }] : []),
  ];

  const kindEntry = kindTarget ? (draft[kindTarget.list] as readonly { id: string; kind: string; label: string }[]).find(entry => entry.id === kindTarget.id) : undefined;
  const face = { id: editing ?? 'new', firstName: draft.firstName, lastName: draft.lastName, company: draft.company, emails: draft.emails, phones: draft.phones, photoId: draft.photoId };

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar
        title={editing ? t('Modifier le contact') : t('Créer un contact')}
        closes
        onBack={() => navigation.goBack()}
        actions={<Button label={t('Enregistrer')} small busy={form.busy} onPress={() => later(form.submit(save))} style={styles.saveButton} />}
      />
      {form.message ? (
        <View style={styles.message}>
          <FormMessage message={form.message} />
        </View>
      ) : null}
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <RevealScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.photo}>
            <Tappable onPress={() => setPhotoMenu(true)} accessibilityRole="button" accessibilityLabel={draft.photoId ? t('Changer la photo') : t('Ajouter une photo')} style={styles.photoTarget}>
              <ContactAvatar contact={face} size={104} />
              <Organic pebble={3} style={styles.photoBadge}>
                <Icon name="camera" size={18} color={theme.color.onAction} />
              </Organic>
            </Tappable>
          </View>

          {/* Who it is, under the face that heads them: the fields' own names say it, no title above them. */}
          <View style={styles.group}>
            <TextField kind="person" field={form.field('firstName')} label={t('Prénom')} value={draft.firstName} onChangeText={value => update('firstName', value)} maxLength={CONTACT_LIMITS.name} autoFocus={!editing} />
            <TextField kind="person" field={form.field('lastName')} label={t('Nom de famille')} value={draft.lastName} onChangeText={value => update('lastName', value)} maxLength={CONTACT_LIMITS.name} />
            <TextField kind="organization" field={form.field('company')} label={t('Entreprise')} value={draft.company} onChangeText={value => update('company', value)} maxLength={CONTACT_LIMITS.company} />
            <TextField kind="text" field={form.field('jobTitle')} label={t('Fonction')} value={draft.jobTitle} onChangeText={value => update('jobTitle', value)} maxLength={CONTACT_LIMITS.jobTitle} />
          </View>

          <Group icon="phoneCall" title={t('Téléphones')}>
            {draft.phones.map(phone => (
              <View key={phone.id} style={styles.entry}>
                <CodeChip region={codeOf(phone.id)} onPress={() => setCodeTarget(phone.id)} />
                <View style={styles.entryField}>
                  <TextField
                    kind="tel"
                    field={form.field(`phone:${phone.id}`)}
                    value={phone.number}
                    onChangeText={value => updateEntry('phones', phone.id, { number: value })}
                    onBlur={() => takeCode(phone)}
                    placeholder={t('Numéro')}
                    accessibilityLabel={t('Numéro')}
                    maxLength={CONTACT_LIMITS.number}
                    autoFocus={phone.id === added}
                  />
                </View>
                <KindChip name={phoneKindName(phone)} onPress={() => setKindTarget({ list: 'phones', id: phone.id })} />
                <IconButton icon="close" label={t('Retirer ce numéro')} onPress={() => removeEntry('phones', phone.id)} />
              </View>
            ))}
            {draft.phones.length < CONTACT_LIMITS.phones ? <Button label={t('Ajouter un numéro')} icon="plus" kind="text" onPress={() => {
                  const phone = newPhone('', draft.phones.length === 0 ? 'mobile' : 'home');
                  setAdded(phone.id);
                  update('phones', [...draft.phones, phone]);
                }} style={styles.add} /> : null}
          </Group>

          <Group icon="email" title={t('E-mails')}>
            {draft.emails.map(entry => (
              <View key={entry.id} style={styles.entry}>
                <View style={styles.entryField}>
                  <TextField kind="email" field={form.field(`email:${entry.id}`)} value={entry.address} onChangeText={value => updateEntry('emails', entry.id, { address: value })} placeholder={t('Adresse e-mail')} accessibilityLabel={t('Adresse e-mail')} maxLength={CONTACT_LIMITS.email} autoFocus={entry.id === added} />
                </View>
                <KindChip name={placeKindName(entry)} onPress={() => setKindTarget({ list: 'emails', id: entry.id })} />
                <IconButton icon="close" label={t('Retirer cet e-mail')} onPress={() => removeEntry('emails', entry.id)} />
              </View>
            ))}
            {draft.emails.length < CONTACT_LIMITS.emails ? <Button label={t('Ajouter un e-mail')} icon="plus" kind="text" onPress={() => {
                  const entry = newEmail(draft.emails.length === 0 ? 'home' : 'work');
                  setAdded(entry.id);
                  update('emails', [...draft.emails, entry]);
                }} style={styles.add} /> : null}
          </Group>

          <Group icon="mapPin" title={t('Adresses')}>
            {draft.addresses.map((entry, index) => (
              <View key={entry.id} style={[styles.address, index > 0 ? styles.nextAddress : null]}>
                <View style={styles.addressHead}>
                  <KindChip name={placeKindName(entry)} onPress={() => setKindTarget({ list: 'addresses', id: entry.id })} />
                  <IconButton icon="close" label={t('Retirer cette adresse')} onPress={() => removeEntry('addresses', entry.id)} />
                </View>
                <PlaceField
                  label={t('Rue')}
                  value={entry.street.split('\n')[0] ?? ''}
                  onChangeText={value => {
                    const rest = entry.street.split('\n').slice(1).join('\n');
                    updateEntry('addresses', entry.id, { street: rest ? `${value}\n${rest}` : value });
                  }}
                  onPick={place => {
                    const rest = entry.street.split('\n').slice(1).join('\n');
                    const first = place.street || (place.name !== place.city ? place.name : '');
                    updateEntry('addresses', entry.id, { street: rest ? `${first}\n${rest}` : first, postalCode: place.postalCode, city: place.city, region: place.region, country: place.country });
                  }}
                  known={known}
                  placeholder={t('Un numéro et une rue, un lieu, une ville…')}
                  help={t('Choisir une adresse proposée remplit le code postal, la ville et le pays.')}
                  autoFocus={entry.id === added}
                  field={form.field(`street:${entry.id}`)}
                />
                <TextField
                  kind="street"
                  field={form.field(`rest:${entry.id}`)}
                  label={t('Complément')}
                  value={entry.street.split('\n').slice(1).join('\n')}
                  onChangeText={value => {
                    const first = entry.street.split('\n')[0] ?? '';
                    updateEntry('addresses', entry.id, { street: value ? `${first}\n${value}` : first });
                  }}
                  placeholder={t('Bâtiment, étage, code…')}
                  multiline={entry.street.split('\n').length > 2}
                  maxLength={CONTACT_LIMITS.addressLine}
                />
                <View style={styles.pair}>
                  <View style={styles.short}>
                    <TextField kind="postalCode" field={form.field(`postalCode:${entry.id}`)} label={t('Code postal')} value={entry.postalCode} onChangeText={value => updateEntry('addresses', entry.id, { postalCode: value })} maxLength={CONTACT_LIMITS.addressPart} />
                  </View>
                  <View style={styles.fill}>
                    <TextField kind="city" field={form.field(`city:${entry.id}`)} label={t('Ville')} value={entry.city} onChangeText={value => updateEntry('addresses', entry.id, { city: value })} maxLength={CONTACT_LIMITS.addressPart} />
                  </View>
                </View>
                <View style={styles.pair}>
                  <View style={styles.fill}>
                    <TextField kind="region" field={form.field(`region:${entry.id}`)} label={t('Région')} value={entry.region} onChangeText={value => updateEntry('addresses', entry.id, { region: value })} maxLength={CONTACT_LIMITS.addressPart} />
                  </View>
                  <View style={styles.fill}>
                    <TextField kind="country" field={form.field(`country:${entry.id}`)} label={t('Pays')} value={entry.country} onChangeText={value => updateEntry('addresses', entry.id, { country: value })} maxLength={CONTACT_LIMITS.addressPart} />
                  </View>
                </View>
              </View>
            ))}
            {draft.addresses.length < CONTACT_LIMITS.addresses ? <Button label={t('Ajouter une adresse')} icon="plus" kind="text" onPress={() => {
                  const entry = newAddress(draft.addresses.length === 0 ? 'home' : 'work');
                  setAdded(entry.id);
                  update('addresses', [...draft.addresses, entry]);
                }} style={styles.add} /> : null}
          </Group>

          <Group icon="cake" title={t('Anniversaire')}>
            <TextField
              kind="number"
              field={form.field('birthday')}
              value={birthdayText}
              // Its separators are written as it is typed (« 27 » -> « 27/ »), so digits alone are enough.
              onChangeText={text => setBirthdayText(before => typeDate(before, text, dateOrder))}
              onBlur={() => setBirthdayText(before => settleDate(before))}
              placeholder={monthFirst ? t('MM/JJ/AAAA') : t('JJ/MM/AAAA')}
              accessibilityLabel={t('Anniversaire')}
              keyboardType="number-pad"
              maxLength={12}
              help={`${monthFirst ? t('MM/JJ/AAAA, année facultative') : t('JJ/MM/AAAA, année facultative')}${typed ? ` · ${formatBirthday(typed)}` : ''}`}
            />
          </Group>

          <Group icon="tag" title={t('Libellés')}>
            <LabelChips
              labels={labels}
              chosen={draft.labelIds}
              onToggle={id => setDraft(before => ({ ...before, labelIds: before.labelIds.includes(id) ? before.labelIds.filter(other => other !== id) : [...before.labelIds, id] }))}
              onCreate={name => {
                if (labelNameTaken(name)) return { problem: t('Ce libellé existe déjà : choisissez un autre nom.') };
                const id = createLabel(name);
                setDraft(before => ({ ...before, labelIds: [...before.labelIds, id] }));
                return { id };
              }}
              maxLength={CONTACT_LIMITS.labelName}
              words={{ add: t('Nouveau libellé'), placeholder: t('Nom du libellé'), field: t('Nom du nouveau libellé'), create: t('Créer le libellé') }}
            />
            <SwitchRow title={t('Favori')} supporting={t('En tête de la liste, et dans les appels rapides.')} value={draft.favorite} onChange={value => update('favorite', value)} />
          </Group>

          <Group icon="note" title={t('Note')}>
            <TextField kind="prose" field={form.field('note')} value={note} onChangeText={setNote} placeholder={t('Ce que vous voulez garder sur cette personne')} accessibilityLabel={t('Note')} multiline maxLength={CONTACTS_TEXT_LIMITS.contact.note} style={styles.note} />
          </Group>
        </RevealScrollView>
      </KeyboardAvoidingView>

      <Menu visible={photoMenu} items={photoItems} onDismiss={() => setPhotoMenu(false)} />
      <CodeSheet
        visible={codeTarget !== null}
        chosen={codeTarget ? codeOf(codeTarget) : null}
        fallback={fallback}
        onChoose={region => codeTarget && setCodes(before => ({ ...before, [codeTarget]: region }))}
        onDismiss={() => setCodeTarget(null)}
      />
      <KindSheet
        visible={kindTarget !== null && kindEntry !== undefined}
        kinds={kindTarget?.list === 'phones' ? PHONE_KINDS : kindTarget?.list === 'emails' ? EMAIL_KINDS : ADDRESS_KINDS}
        names={kindTarget?.list === 'phones' ? PHONE_KIND_NAMES : PLACE_KIND_NAMES}
        value={{ kind: kindEntry?.kind ?? 'other', label: kindEntry?.label ?? '' }}
        onChange={(choice: KindChoice) => kindTarget && updateEntry(kindTarget.list, kindTarget.id, choice)}
        onDismiss={() => setKindTarget(null)}
      />
      {unsaved.dialog}
      <PlaceSearchHost />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    fill: { flex: 1 },
    content: { padding: 16, paddingBottom: 64, gap: 24 },
    saveButton: { marginRight: 8 },
    message: { paddingHorizontal: 16, paddingBottom: 8 },
    photo: { alignItems: 'center' },
    photoTarget: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center', ...corners(SHAPES.frame) },
    photoBadge: { position: 'absolute', right: -6, bottom: -6, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.action },
    group: { gap: 10 },
    groupHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
    entry: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    entryField: { flex: 1 },
    // Fixed widths, so the fields of every row end on one line: as narrow as « Personnel » (61 at 14) and « +352 » allow, so the number keeps its room.
    kind: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 2, minHeight: 52, width: 104, paddingLeft: 12, paddingRight: 6, borderWidth: 1, borderColor: theme.color.edge, backgroundColor: theme.color.fieldVeil, ...corners(SHAPES.field) },
    kindText: { flexShrink: 1 },
    code: { width: 72, paddingLeft: 12, paddingRight: 6 },
    add: { alignSelf: 'flex-start' },
    // An address lies on the ground as the numbers do: its kind and its × over its fields, a hairline between two.
    address: { gap: 10 },
    nextAddress: { paddingTop: 16, marginTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.color.hairline },
    addressHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    pair: { flexDirection: 'row', gap: 10 },
    short: { width: 120 },
    note: { minHeight: 96, textAlignVertical: 'top' },
  });
