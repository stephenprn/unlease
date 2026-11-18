/**
 * A card's or a paper's form, a page of its own. What it asks follows the kind: a card's shop, number,
 * barcode format and colour; a gift card's balance; a paper's type (changed in place: an identity card
 * found to be a residence permit), holder, number, dates and whom it concerns; a document's type, issuer, date, end and how long to keep it. Its two sides (or its pages)
 * come from the camera, the photos or a PDF, sealed as they come in. Days are typed as written on the
 * paper (« 12/03/2031 »). Leaving with changes asks first.
 */
import React, { useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { getLocale, t } from '@unlease/core/i18n';
import { isLineColor } from '@unlease/design/colors';
import type { GlyphName } from '@unlease/design/glyphs';
import { contactName } from '@unlease/contacts/services/names';
import { BARCODE_FORMATS, barcodeProblem, guessFormat, type BarcodeFormat } from '@unlease/wallet/models/barcode';
import { DOCUMENT_TYPES, type DocumentType } from '@unlease/wallet/models/documentTypes';
import { EMPTY_DETAILS, IDENTITY_KINDS, ITEM_LIMITS, tierOfKind, type FileRole, type ItemDetails, type ItemKind, type WalletFile, type WalletItem } from '@unlease/wallet/models/item';
import { readDay, typedDay } from '@unlease/wallet/services/days';
import { barcodeProblemWords, documentTypeGlyph, documentTypeName, formatName, kindName, KIND_GLYPHS } from '@unlease/wallet/services/words';
import { addItem, deleteItem, itemKey, prepareItem, updateItem } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { useVaultStatus } from '@app/store/vault';
import { pickForItem, type PickSource } from '@app/pick';
import { dropPicked } from '@app/files';
import { showSnack } from '@shared/app/store/uiStore';
import { AppText, Button, EdgeScrollView, FormFoot, Ground, Icon, IconButton, LineColorPicker, ListRow, Organic, PickerField, Sheet, SheetScroll, Tappable, TextField, TopBar, useUnsaved } from '@shared/ui/components';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

import { useOpenedFile } from '../features/FileView';
import { LockPanel } from '../features/vault/LockPanel';
import type { ScreenProps } from '../navigation/types';

interface Draft {
  readonly title: string;
  readonly issuer: string;
  readonly holder: string;
  readonly number: string;
  readonly format: BarcodeFormat | 'none';
  readonly color: string | null;
  readonly issuedOn: string;
  readonly expiresOn: string;
  readonly birthDate: string;
  readonly nationality: string;
  readonly person: string;
  readonly amount: string;
  readonly currency: string;
  readonly docType: DocumentType;
  readonly docDate: string;
  readonly keep: 'rule' | 'forever' | 'date';
  readonly keepUntil: string;
  readonly labels: string;
  readonly notes: string;
  readonly files: readonly WalletFile[];
}

function draftOf(kind: ItemKind, item: WalletItem | null): Draft {
  const d = item?.details ?? EMPTY_DETAILS;
  return {
    title: item?.title ?? '',
    issuer: d.issuer,
    holder: d.holder,
    number: d.number || d.barcode?.value || '',
    format: d.barcode?.format ?? (tierOfKind(kind) === 'cards' && kind !== 'emergency' ? 'code128' : 'none'),
    color: d.color,
    issuedOn: typedDay(d.issuedOn),
    expiresOn: typedDay(d.expiresOn),
    birthDate: typedDay(d.birthDate),
    nationality: d.nationality,
    person: d.personContactId ?? '',
    amount: d.balance ? String(d.balance.amount) : '',
    currency: d.balance?.currency ?? 'EUR',
    docType: d.docType ?? 'other',
    docDate: typedDay(d.docDate),
    keep: d.keepUntil === 'forever' ? 'forever' : d.keepUntil ? 'date' : 'rule',
    keepUntil: d.keepUntil && d.keepUntil !== 'forever' ? typedDay(d.keepUntil) : '',
    labels: d.labels.join(', '),
    notes: item?.notes ?? '',
    files: d.files,
  };
}

function detailsOf(kind: ItemKind, draft: Draft, base: ItemDetails): ItemDetails {
  const cards = tierOfKind(kind) === 'cards';
  const number = draft.number.trim();
  const amount = Number(draft.amount.replace(',', '.'));
  return {
    ...base,
    issuer: draft.issuer.trim(),
    holder: draft.holder.trim(),
    number: !cards || draft.format === 'none' ? number : '',
    barcode: cards && draft.format !== 'none' && number ? { format: draft.format, value: number } : null,
    color: cards ? draft.color : null,
    issuedOn: readDay(draft.issuedOn),
    expiresOn: readDay(draft.expiresOn),
    birthDate: readDay(draft.birthDate, true),
    nationality: draft.nationality.trim().toUpperCase().slice(0, 3),
    personContactId: draft.person || null,
    balance: kind === 'giftCard' && draft.amount.trim() && Number.isFinite(amount) ? { amount, currency: draft.currency } : null,
    docType: kind === 'document' ? draft.docType : null,
    docDate: kind === 'document' ? readDay(draft.docDate) : null,
    keepUntil: kind !== 'document' ? null : draft.keep === 'forever' ? 'forever' : draft.keep === 'date' ? readDay(draft.keepUntil) : null,
    labels: draft.labels
      .split(',')
      .map(label => label.trim())
      .filter(Boolean)
      .slice(0, ITEM_LIMITS.labels),
    files: draft.files,
  };
}

const dayProblem = (typed: string, past = false): string | null => (typed.trim() && !readDay(typed, past) ? t('Type the day as written: 12/03/2031.') : null);

const ROLE_WORDS: Readonly<Record<FileRole, string>> = { front: 'Front [side]', back: 'Back [side]', page: 'Page', photo: 'Photo' };

function Thumb({ itemId, file, index, onRemove }: { itemId: string | null; file: WalletFile; index: number; onRemove: () => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const uri = useOpenedFile(itemId ?? '', file);
  return (
    <View style={styles.thumb}>
      <Organic outline="card" style={[styles.thumbFrame, { backgroundColor: theme.color.paperHigh }]}>
        {file.mime === 'application/pdf' ? <Icon name="pdf" size={28} color={theme.color.inkMuted} /> : uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Icon name="image" size={24} color={theme.color.inkMuted} />}
      </Organic>
      <AppText variant="labelSmall">{file.role === 'page' ? `${t('Page')} ${index + 1}` : t(ROLE_WORDS[file.role])}</AppText>
      <IconButton icon="close" size={18} label={t('Remove')} onPress={onRemove} style={styles.thumbRemove} />
    </View>
  );
}

interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly icon?: GlyphName;
}

function ChoiceSheet<T extends string>({ title, choices, value, visible, onChoose, onDismiss }: { title: string; choices: readonly Choice<T>[]; value: T; visible: boolean; onChoose: (value: T) => void; onDismiss: () => void }) {
  const theme = useTheme();
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={title}>
      <SheetScroll>
        {choices.map(choice => (
          <ListRow
            key={choice.value}
            title={choice.label}
            icon={choice.icon}
            trailing={choice.value === value ? <Icon name="check" size={22} color={theme.color.focus} /> : undefined}
            accessibilityRole="radio"
            accessibilityState={{ checked: choice.value === value }}
            onPress={() => {
              onChoose(choice.value);
              onDismiss();
            }}
          />
        ))}
      </SheetScroll>
    </Sheet>
  );
}

function EditForm({ kind: startKind, item, onDone }: { kind: ItemKind; item: WalletItem | null; onDone: () => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [kind, setKind] = useState<ItemKind>(startKind);
  const [draft, setDraft] = useState<Draft>(() => draftOf(startKind, item));
  const [prepared] = useState(() => (item ? null : prepareItem(startKind)));
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [sent, setSent] = useState(false);
  const [sheet, setSheet] = useState<'kind' | 'format' | 'docType' | 'person' | 'keep' | 'currency' | 'source' | null>(null);
  const [role, setRole] = useState<FileRole>('front');
  const contacts = useLibraryStore(s => s.contacts);
  const cards = tierOfKind(kind) === 'cards';
  const identity = !cards && kind !== 'document';
  const set = (patch: Partial<Draft>): void => setDraft(current => ({ ...current, ...patch }));
  const initial = useMemo(() => draftOf(startKind, item), [startKind, item]);
  const dirty = kind !== startKind || JSON.stringify(initial) !== JSON.stringify(draft);
  const unsaved = useUnsaved(dirty);
  const itemId = item?.id ?? prepared?.id ?? null;

  const numberProblem = cards && draft.format !== 'none' && draft.number.trim() ? barcodeProblem(draft.format, draft.number.trim()) : null;
  const problems = {
    title: (kind === 'card' || kind === 'giftCard' || kind === 'document') && !draft.title.trim() ? (kind === 'document' ? t('Name the document.') : t('Name the shop or the card.')) : null,
    number: numberProblem && draft.format !== 'none' ? barcodeProblemWords(numberProblem, draft.format) : null,
    issuedOn: dayProblem(draft.issuedOn),
    expiresOn: dayProblem(draft.expiresOn),
    birthDate: dayProblem(draft.birthDate, true),
    docDate: dayProblem(draft.docDate),
    keepUntil: draft.keep === 'date' ? dayProblem(draft.keepUntil) : null,
  };
  const shown = (name: keyof typeof problems): string | null => (sent ? problems[name] : null);

  const keyOf = (): Uint8Array | null => (prepared ? prepared.key : item ? itemKey(item.id) : null);

  const take = async (source: PickSource): Promise<void> => {
    const key = keyOf();
    if (!key) return;
    try {
      const outcome = await pickForItem(key, source, role, item?.title || draft.title.trim() || kindName(kind), role === 'page' ? 10 : 1);
      if (outcome.status === 'error') showSnack(outcome.message, undefined, { tone: 'error' });
      if (outcome.status !== 'ok') return;
      setPicked(current => [...current, ...outcome.files.map(file => file.id)]);
      setDraft(current => {
        const others = role === 'page' || role === 'photo' ? current.files : current.files.filter(file => file.role !== role);
        return { ...current, files: [...others, ...outcome.files].slice(0, ITEM_LIMITS.files) };
      });
    } finally {
      if (!prepared) key.fill(0);
    }
  };

  const save = (): void => {
    setSent(true);
    if (Object.values(problems).some(Boolean)) return;
    const details = detailsOf(kind, draft, item?.details ?? EMPTY_DETAILS);
    const title = draft.title.trim() || (kind === 'emergency' ? t('In case of emergency') : kindName(kind));
    if (item) updateItem(item.id, { title, details, notes: draft.notes, ...(item.kind !== kind ? { kind } : {}) });
    else if (prepared) addItem(prepared, { kind, title, details, notes: draft.notes, text: '' });
    const kept = new Set(details.files.map(file => file.id));
    dropPicked(picked.filter(id => !kept.has(id)));
    unsaved.saved();
    onDone();
  };

  const cancel = (): void => {
    dropPicked(picked);
    onDone();
  };

  const remove = (): void => {
    if (!item) return;
    const undo = deleteItem(item.id);
    unsaved.saved();
    onDone();
    showSnack(t('{name} deleted', { name: item.title || kindName(kind) }), { label: t('Undo'), run: undo });
  };

  const people: Choice<string>[] = [
    { value: '', label: t('You') },
    ...Object.values(contacts)
      .filter(contact => contact.deletedAt === null)
      .map(contact => ({ value: contact.id, label: contactName(contact) }))
      .sort((a, b) => a.label.localeCompare(b.label, getLocale())),
  ];
  const personName = people.find(choice => choice.value === draft.person)?.label ?? t('You');
  const sides: FileRole[] = kind === 'document' ? ['page'] : kind === 'emergency' ? [] : ['front', 'back'];
  const keepChoices: Choice<Draft['keep']>[] = [
    { value: 'rule', label: t('As long as France asks') },
    { value: 'forever', label: t('For good') },
    { value: 'date', label: t('Until a date') },
  ];

  return (
    <>
      <TopBar title={item ? t('Edit {name}', { name: item.title || kindName(kind) }) : kindName(kind)} onBack={unsaved.guard(cancel)} closes />
      <EdgeScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {sides.length > 0 ? (
          <View style={styles.files}>
            {draft.files.map((file, index) => (
              <Thumb key={file.id} itemId={itemId} file={file} index={index} onRemove={() => set({ files: draft.files.filter(each => each.id !== file.id) })} />
            ))}
            {sides.map(side =>
              side === 'page' || !draft.files.some(file => file.role === side) ? (
                <Tappable
                  key={side}
                  outline="card"
                  style={[styles.addFile, { borderColor: theme.color.dashed }]}
                  onPress={() => {
                    setRole(side);
                    setSheet('source');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={side === 'page' ? t('Add pages') : t(ROLE_WORDS[side])}>
                  <Icon name={side === 'page' ? 'scan' : 'camera'} size={24} color={theme.color.link} />
                  <AppText variant="label" color={theme.color.link}>
                    {side === 'page' ? t('Add pages') : t(ROLE_WORDS[side])}
                  </AppText>
                </Tappable>
              ) : null,
            )}
          </View>
        ) : null}

        {identity ? <PickerField label={t('Type')} value={kindName(kind)} icon={KIND_GLYPHS[kind]} onPress={() => setSheet('kind')} /> : null}

        <TextField
          label={kind === 'card' || kind === 'giftCard' ? t('Shop or card') : identity ? t('Name in the wallet') : t('Name')}
          placeholder={kind === 'document' ? t('Tax notice 2026, flat lease…') : kind === 'card' ? t('Bakery, library, gym…') : kindName(kind)}
          value={draft.title}
          onChangeText={title => set({ title })}
          error={shown('title')}
          optional={!(kind === 'card' || kind === 'giftCard' || kind === 'document')}
          maxLength={200}
        />

        {kind === 'document' ? (
          <>
            <PickerField label={t('Type')} value={documentTypeName(draft.docType)} icon={KIND_GLYPHS.document} onPress={() => setSheet('docType')} />
            <TextField label={t('Issued by')} placeholder={t('Tax office, insurer, landlord…')} value={draft.issuer} onChangeText={issuer => set({ issuer })} optional />
          </>
        ) : null}

        {cards && kind !== 'emergency' ? (
          <>
            <TextField
              label={t('Card number')}
              value={draft.number}
              onChangeText={number => set({ number, format: draft.format === 'code128' && number.trim() ? guessFormat(number.trim()) : draft.format })}
              autoCapitalize="characters"
              autoCorrect={false}
              error={shown('number')}
              optional
              help={t('Type it as written under the barcode, or add the card’s picture.')}
            />
            <PickerField label={t('Barcode')} value={draft.format === 'none' ? t('No barcode') : formatName(draft.format)} icon="barcode" onPress={() => setSheet('format')} />
            <View style={styles.colour}>
              <AppText variant="metaStrong" style={styles.colourLabel}>
                {t('Colour')}
              </AppText>
              <LineColorPicker value={draft.color && isLineColor(draft.color) ? draft.color : 'grey'} onChange={color => set({ color })} flush accessibilityLabel={t('Colour')} />
            </View>
          </>
        ) : null}

        {identity || kind === 'emergency' ? (
          <>
            <TextField label={t('Name on it')} value={draft.holder} onChangeText={holder => set({ holder })} optional autoCorrect={false} />
            <PickerField label={t('For')} value={personName} icon="person" onPress={() => setSheet('person')} />
          </>
        ) : null}
        {identity ? (
          <>
            <TextField label={t('Number [paper]')} value={draft.number} onChangeText={number => set({ number })} optional autoCapitalize="characters" autoCorrect={false} />
            <View style={styles.pair}>
              <View style={styles.half}>
                <TextField label={t('Issued on')} placeholder={t('DD/MM/YYYY')} keyboardType="numbers-and-punctuation" value={draft.issuedOn} onChangeText={issuedOn => set({ issuedOn })} error={shown('issuedOn')} optional />
              </View>
              <View style={styles.half}>
                <TextField label={t('Born on')} placeholder={t('DD/MM/YYYY')} keyboardType="numbers-and-punctuation" value={draft.birthDate} onChangeText={birthDate => set({ birthDate })} error={shown('birthDate')} optional />
              </View>
            </View>
            <TextField label={t('Nationality')} placeholder={t('Three letters: FRA…')} value={draft.nationality} onChangeText={nationality => set({ nationality })} optional maxLength={3} autoCapitalize="characters" />
          </>
        ) : null}

        {kind === 'giftCard' ? (
          <View style={styles.pair}>
            <View style={styles.half}>
              <TextField label={t('Balance')} keyboardType="decimal-pad" value={draft.amount} onChangeText={amount => set({ amount })} optional />
            </View>
            <View style={styles.half}>
              <PickerField label={t('Currency')} value={draft.currency} onPress={() => setSheet('currency')} />
            </View>
          </View>
        ) : null}

        {kind !== 'emergency' ? (
          <View style={styles.pair}>
            {kind === 'document' ? (
              <View style={styles.half}>
                <TextField label={t('Date of the document')} placeholder={t('DD/MM/YYYY')} keyboardType="numbers-and-punctuation" value={draft.docDate} onChangeText={docDate => set({ docDate })} error={shown('docDate')} optional />
              </View>
            ) : null}
            {/* A TextField's style is its input's: the box around it takes the row's share. */}
            <View style={styles.half}>
              <TextField
                label={kind === 'document' ? t('Ends on') : t('Valid until')}
                placeholder={t('DD/MM/YYYY')}
                keyboardType="numbers-and-punctuation"
                value={draft.expiresOn}
                onChangeText={expiresOn => set({ expiresOn })}
                error={shown('expiresOn')}
                optional
              />
            </View>
          </View>
        ) : null}

        {kind === 'document' ? (
          <>
            <PickerField label={t('Keep it')} value={keepChoices.find(choice => choice.value === draft.keep)!.label} icon="archive" onPress={() => setSheet('keep')} />
            {draft.keep === 'date' ? <TextField label={t('Keep until')} placeholder={t('DD/MM/YYYY')} keyboardType="numbers-and-punctuation" value={draft.keepUntil} onChangeText={keepUntil => set({ keepUntil })} error={shown('keepUntil')} /> : null}
            <TextField label={t('Labels')} placeholder={t('Flat, car…')} value={draft.labels} onChangeText={labels => set({ labels })} optional />
          </>
        ) : null}

        <TextField
          label={kind === 'emergency' ? t('What to know') : t('Notes')}
          placeholder={kind === 'emergency' ? t('Blood type, allergies, treatments, people to call…') : undefined}
          multiline
          value={draft.notes}
          onChangeText={notes => set({ notes })}
          optional={kind !== 'emergency'}
        />
        {item ? <Button kind="dangerText" icon="trash" label={t('Delete')} onPress={remove} style={styles.delete} /> : null}
      </EdgeScrollView>
      <FormFoot>
        <Button kind="text" label={t('Cancel')} onPress={unsaved.guard(cancel)} />
        <Button icon="check" label={t('Save')} onPress={save} />
      </FormFoot>

      <ChoiceSheet title={t('Type')} visible={sheet === 'kind'} value={kind} choices={IDENTITY_KINDS.map(each => ({ value: each as ItemKind, label: kindName(each), icon: KIND_GLYPHS[each] }))} onChoose={setKind} onDismiss={() => setSheet(null)} />
      <ChoiceSheet title={t('Barcode')} visible={sheet === 'format'} value={draft.format} choices={[...BARCODE_FORMATS.map(format => ({ value: format as BarcodeFormat | 'none', label: formatName(format) })), { value: 'none' as const, label: t('No barcode') }]} onChoose={format => set({ format })} onDismiss={() => setSheet(null)} />
      <ChoiceSheet title={t('Type')} visible={sheet === 'docType'} value={draft.docType} choices={DOCUMENT_TYPES.map(type => ({ value: type, label: documentTypeName(type), icon: documentTypeGlyph(type) }))} onChoose={docType => set({ docType })} onDismiss={() => setSheet(null)} />
      <ChoiceSheet title={t('For')} visible={sheet === 'person'} value={draft.person} choices={people} onChoose={person => set({ person })} onDismiss={() => setSheet(null)} />
      <ChoiceSheet title={t('Keep it')} visible={sheet === 'keep'} value={draft.keep} choices={keepChoices} onChoose={keep => set({ keep })} onDismiss={() => setSheet(null)} />
      <ChoiceSheet title={t('Currency')} visible={sheet === 'currency'} value={draft.currency} choices={['EUR', 'CHF', 'GBP', 'USD', 'CAD'].map(code => ({ value: code, label: code }))} onChoose={currency => set({ currency })} onDismiss={() => setSheet(null)} />
      <Sheet visible={sheet === 'source'} onDismiss={() => setSheet(null)} title={role === 'page' ? t('Add pages') : t(ROLE_WORDS[role])}>
        <SheetScroll>
          <ListRow icon="camera" title={t('Take a photo')} onPress={() => { setSheet(null); void take('camera'); }} />
          <ListRow icon="image" title={t('Choose from the photos')} onPress={() => { setSheet(null); void take('photos'); }} />
          {kind === 'document' ? <ListRow icon="pdf" title={t('Choose a PDF')} onPress={() => { setSheet(null); void take('pdf'); }} /> : null}
        </SheetScroll>
      </Sheet>
      {unsaved.dialog}
    </>
  );
}

export function EditScreen({ navigation, route }: ScreenProps<'Edit'>) {
  const styles = useThemedStyles(makeStyles);
  const status = useVaultStatus();
  const item = useLibraryStore(s => (route.params.id ? s.items[route.params.id] : undefined));
  const done = (): void => navigation.goBack();
  const kind = route.params.kind ?? null;
  let body: React.ReactNode;
  if (route.params.id) {
    if (!item || item.deletedAt !== null) body = <TopBar title={t('Not found')} onBack={done} />;
    else if (item.locked)
      body = (
        <>
          <TopBar title={t('Locked')} onBack={done} />
          <LockPanel subject="paper" />
        </>
      );
    else body = <EditForm kind={item.kind} item={item} onDone={done} />;
  } else if (kind) {
    const open = status === 'open' || (status === 'cards' && tierOfKind(kind) === 'cards');
    body = open ? (
      <EditForm kind={kind} item={null} onDone={done} />
    ) : (
      <>
        <TopBar title={kindName(kind)} onBack={done} />
        <LockPanel subject={tierOfKind(kind) === 'cards' ? 'cards' : 'paper'} />
      </>
    );
  }
  return (
    <View style={styles.screen}>
      <Ground />
      {body}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    content: { padding: 16, paddingBottom: 32, gap: 14 },
    files: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    thumb: { width: 104, gap: 4 },
    thumbFrame: { width: 104, height: 66, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    thumbRemove: { position: 'absolute', top: -6, right: -6 },
    addFile: { width: 104, height: 66, alignItems: 'center', justifyContent: 'center', gap: 2, borderWidth: 1.5, borderStyle: 'dashed' },
    pair: { flexDirection: 'row', gap: 12 },
    half: { flex: 1 },
    colour: { gap: 8 },
    colourLabel: { marginLeft: 4 },
    delete: { alignSelf: 'flex-start' },
  });
}
