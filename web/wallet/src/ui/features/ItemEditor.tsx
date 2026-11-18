/**
 * A card's or a paper's form, over the page it was opened from (a whole page under 720 px). What it
 * asks follows the kind: a card's shop, number, barcode format and colour; a gift card's balance; a
 * paper's holder, number, dates and whom it concerns; a document's type, issuer, date, end and how
 * long to keep it. Pictures (the two sides, or the pages) and PDFs are sealed as they are picked;
 * « Remplir avec Claude » reads them on the person's say, after saying what is sent. Leaving with
 * changes asks first.
 */
import { useId, useMemo, useState } from 'react';

import { getLocale, t } from '@unlease/core/i18n';
import { isBlank } from '@unlease/core/services/formChecks';
import { isLineColor } from '@unlease/design/colors';
import { contactName } from '@unlease/contacts/services/names';
import { BARCODE_FORMATS, barcodeProblem, guessFormat, isBarcodeFormat, type BarcodeFormat } from '@unlease/wallet/models/barcode';
import { DOCUMENT_TYPES, type DocumentType } from '@unlease/wallet/models/documentTypes';
import { EMPTY_DETAILS, IDENTITY_KINDS, ITEM_LIMITS, tierOfKind, type FileRole, type ItemDetails, type ItemKind, type WalletFile, type WalletItem } from '@unlease/wallet/models/item';
import { readGoogleWalletLink, type GoogleWalletCard } from '@unlease/wallet/services/googleWallet';
import { barcodeProblemWords, documentTypeName, formatName, kindName } from '@unlease/wallet/services/words';

import { useContactsStore } from '@contacts/app/store/library';
import { removeStoredFile } from '@shared/app/media/files';
import { useServerFeature } from '@shared/app/store/serverSettings';
import { showError, showSnack, showUndo, showWarning } from '@shared/app/store/ui';
import { LabelColorPicker } from '@contacts/ui/features/LabelColorPicker';
import { Button } from '@shared/ui/components/Button';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { FormMessage } from '@shared/ui/components/FormMessage';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton } from '@shared/ui/components/IconButton';
import { Layer } from '@shared/ui/components/Layer';
import { SelectField } from '@shared/ui/components/SelectField';
import { TextField } from '@shared/ui/components/TextField';
import { useForm } from '@shared/ui/components/useForm';
import { useUnsaved } from '@shared/ui/components/useUnsaved';
import { keepWalletFile, MAX_WALLET_FILE_BYTES, openedFileUrl } from '../../app/files';
import { barcodeInPicture, DETECTOR_FORMATS, readWithClaude } from '../../app/read';
import { addItem, deleteItem, itemKey, prepareItem, updateItem } from '../../app/store/actions';
import { useWalletStore } from '../../app/store/library';
import { useVaultStatus } from '../../app/store/vault';
import styles from '../wallet.module.css';
import { UnlockPanel } from './vault/UnlockPanel';

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
    issuedOn: d.issuedOn ?? '',
    expiresOn: d.expiresOn ?? '',
    birthDate: d.birthDate ?? '',
    nationality: d.nationality,
    person: d.personContactId ?? '',
    amount: d.balance ? String(d.balance.amount) : '',
    currency: d.balance?.currency ?? 'EUR',
    docType: d.docType ?? 'other',
    docDate: d.docDate ?? '',
    keep: d.keepUntil === 'forever' ? 'forever' : d.keepUntil ? 'date' : 'rule',
    keepUntil: d.keepUntil && d.keepUntil !== 'forever' ? d.keepUntil : '',
    labels: d.labels.join(', '),
    notes: item?.notes ?? '',
    files: d.files,
  };
}

const day = (value: string): string | null => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);

function detailsOf(kind: ItemKind, draft: Draft, base: ItemDetails): ItemDetails {
  const cards = tierOfKind(kind) === 'cards';
  const number = draft.number.trim();
  const amount = Number(draft.amount.replace(',', '.'));
  return {
    ...base,
    issuer: draft.issuer.trim(),
    holder: draft.holder.trim(),
    number: draft.format === 'none' || !cards ? number : '',
    barcode: cards && draft.format !== 'none' && number ? { format: draft.format, value: number } : null,
    color: cards ? draft.color : null,
    issuedOn: day(draft.issuedOn),
    expiresOn: day(draft.expiresOn),
    birthDate: day(draft.birthDate),
    nationality: draft.nationality.trim().toUpperCase().slice(0, 3),
    personContactId: draft.person || null,
    balance: kind === 'giftCard' && draft.amount.trim() && Number.isFinite(amount) ? { amount, currency: draft.currency } : null,
    docType: kind === 'document' ? draft.docType : null,
    docDate: kind === 'document' ? day(draft.docDate) : null,
    keepUntil: kind !== 'document' ? null : draft.keep === 'forever' ? 'forever' : draft.keep === 'date' ? day(draft.keepUntil) : null,
    labels: draft.labels
      .split(',')
      .map(label => label.trim())
      .filter(Boolean)
      .slice(0, ITEM_LIMITS.labels),
    files: draft.files,
  };
}

const ROLE_WORDS: Readonly<Record<FileRole, string>> = { front: 'Front [side]', back: 'Back [side]', page: 'Page', photo: 'Photo' };

function FileStrip({ files, onRemove }: { files: readonly WalletFile[]; onRemove: (id: string) => void }) {
  if (files.length === 0) return null;
  return (
    <div className={styles.files}>
      {files.map((file, index) => {
        const url = file.thumb ? openedFileUrl(file.thumb) : null;
        return (
          <div key={file.id} className={styles.fileThumb}>
            {file.mime === 'application/pdf' ? (
              <span className={styles.filePdf}>
                <Icon name="pdf" size={28} />
              </span>
            ) : url ? (
              <img src={url} alt="" />
            ) : (
              <span className={styles.filePdf}>
                <Icon name="image" size={24} />
              </span>
            )}
            <span className="t-meta">{file.role === 'page' ? `${t('Page')} ${index + 1}` : t(ROLE_WORDS[file.role])}</span>
            <IconButton className={styles.fileRemove} icon="close" size={16} compact label={t('Remove')} onClick={() => onRemove(file.id)} />
          </div>
        );
      })}
    </div>
  );
}

function pickFiles(accept: string, multiple: boolean, capture: boolean): Promise<File[]> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    if (capture) input.setAttribute('capture', 'environment');
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.click();
  });
}

interface FormProps {
  readonly kind: ItemKind;
  readonly item: WalletItem | null;
  readonly closing: boolean;
  readonly under: string;
  readonly onClose: () => void;
}

function EditorForm({ kind: startKind, item, closing, under, onClose }: FormProps) {
  const titleId = useId();
  // A paper's type changes in place: an identity card found to be a residence permit.
  const [kind, setKind] = useState<ItemKind>(startKind);
  const [draft, setDraft] = useState<Draft>(() => draftOf(startKind, item));
  const [prepared] = useState(() => (item ? null : prepareItem(startKind)));
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [consent, setConsent] = useState(false);
  const [reading, setReading] = useState(false);
  const claude = useServerFeature('claude');
  const contacts = useContactsStore(state => state.contacts);
  const cards = tierOfKind(kind) === 'cards';
  const identity = !cards && kind !== 'document';
  const set = (patch: Partial<Draft>): void => setDraft(current => ({ ...current, ...patch }));
  // A Google Wallet link pasted into the number fills the card: its number, and its name and barcode when the link carries them.
  const takeGoogle = (card: GoogleWalletCard): void => {
    if (!item && card.kind !== kind) setKind(card.kind);
    const title = draft.title.trim() || card.title;
    setDraft(current => ({ ...current, title, number: card.number || current.number, format: card.barcode?.format ?? (card.number ? guessFormat(card.number) : current.format) }));
    if (!card.number) showWarning(t('This Google Wallet link holds no card number: type it from the card.'));
    else if (!title) showSnack(t('Number taken from Google Wallet. Name the shop, and check the barcode’s type against the card.'), undefined, { tone: 'success' });
    else showSnack(t('Card filled from Google Wallet. Check the barcode against the card.'), undefined, { tone: 'success' });
  };
  const initial = useMemo(() => draftOf(startKind, item), [startKind, item]);
  const dirty = kind !== startKind || JSON.stringify(initial) !== JSON.stringify(draft);
  const unsaved = useUnsaved(dirty && !closing, { page: under });

  const numberProblem = cards && draft.format !== 'none' && draft.number.trim() ? barcodeProblem(draft.format, draft.number.trim()) : null;
  const form = useForm({
    title: (kind === 'card' || kind === 'giftCard' || kind === 'document') && isBlank(draft.title) ? (kind === 'document' ? t('Name the document.') : t('Name the shop or the card.')) : null,
    number: numberProblem && draft.format !== 'none' ? barcodeProblemWords(numberProblem, draft.format) : null,
  });

  const keyOf = (): Uint8Array | null => (prepared ? prepared.key : itemKey(item!.id));

  const addFiles = async (role: FileRole, capture: boolean): Promise<void> => {
    const multiple = role === 'page';
    const files = await pickFiles(kind === 'document' ? 'image/*,application/pdf' : 'image/*', multiple, capture);
    const key = keyOf();
    if (!key) {
      showError(t('The vault locked meanwhile: unlock it and try again.'));
      return;
    }
    try {
      const kept: WalletFile[] = [];
      for (const file of files) {
        if (file.size > MAX_WALLET_FILE_BYTES) {
          showError(t('This file is over 40 MB.'));
          continue;
        }
        kept.push(await keepWalletFile(key, file, role, file.name || kindName(kind)));
        // A card's number read from its picture, where the browser can.
        if (cards && !draft.number.trim() && file.type.startsWith('image/')) {
          const found = await barcodeInPicture(file);
          const format = found ? DETECTOR_FORMATS[found.format] : undefined;
          if (found && format && isBarcodeFormat(format)) set({ number: found.value, format });
        }
      }
      setPicked(current => [...current, ...kept.flatMap(file => (file.thumb ? [file.id, file.thumb] : [file.id]))]);
      setDraft(current => {
        // A new front or back replaces the old one; pages add up.
        const others = role === 'page' || role === 'photo' ? current.files : current.files.filter(file => file.role !== role);
        return { ...current, files: [...others, ...kept].slice(0, ITEM_LIMITS.files) };
      });
    } catch {
      showError(t('This file couldn’t be read.'));
    } finally {
      if (!prepared) key.fill(0);
    }
  };

  const fill = async (): Promise<void> => {
    setConsent(false);
    const key = keyOf();
    if (!key) return;
    setReading(true);
    try {
      const read = await readWithClaude(key, draft.files, kind);
      if (!read) {
        showError(t('Add a picture of it first.'));
        return;
      }
      setDraft(current => ({
        ...current,
        title: current.title || read.title || '',
        issuer: current.issuer || read.issuer || '',
        holder: current.holder || read.holder || '',
        number: current.number || read.number || '',
        issuedOn: current.issuedOn || read.issuedOn || '',
        expiresOn: current.expiresOn || read.expiresOn || '',
        birthDate: current.birthDate || read.birthDate || '',
        docType: kind === 'document' && current.docType === 'other' && read.docType ? read.docType : current.docType,
        docDate: current.docDate || read.docDate || '',
        amount: current.amount || (read.amount !== null ? String(read.amount) : ''),
        notes: current.notes || read.summary || '',
      }));
      showSnack(t('Filled in by Claude: check each field against the paper.'), undefined, { tone: 'success' });
    } catch {
      showError(t('Claude couldn’t read it this time.'));
    } finally {
      if (!prepared) key.fill(0);
      setReading(false);
    }
  };

  const save = (): void => {
    const details = detailsOf(kind, draft, item?.details ?? EMPTY_DETAILS);
    const title = draft.title.trim() || (kind === 'emergency' ? t('In case of emergency') : kindName(kind));
    if (item) updateItem(item.id, { title, details, notes: draft.notes, ...(item.kind !== kind ? { kind } : {}) });
    else if (prepared) addItem(prepared, { kind, title, details, notes: draft.notes, text: '' });
    // Files picked then taken off the item: their sealed copies go.
    const kept = new Set(details.files.flatMap(file => (file.thumb ? [file.id, file.thumb] : [file.id])));
    for (const id of picked) if (!kept.has(id)) void removeStoredFile(id);
    unsaved.saved();
    onClose();
  };

  const cancel = unsaved.guard(() => {
    for (const id of picked) void removeStoredFile(id);
    onClose();
  });

  const remove = (): void => {
    if (!item) return;
    const undo = deleteItem(item.id);
    unsaved.saved();
    onClose();
    showUndo(t('{name} deleted', { name: item.title || kindName(kind) }), undo);
  };

  const people = Object.values(contacts)
    .filter(contact => contact.deletedAt === null)
    .map(contact => ({ value: contact.id, label: contactName(contact) }))
    .sort((a, b) => a.label.localeCompare(b.label, getLocale()));

  return (
    <DialogFrame
      title={item ? t('Edit {name}', { name: item.title || kindName(kind) }) : kindName(kind)}
      titleId={titleId}
      onClose={cancel}
      className={styles.editor}
      onSubmit={form.onSubmit(save)}
      foot={
        <>
          {item ? (
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
      <div className={styles.fields}>
        <FileStrip files={draft.files} onRemove={id => set({ files: draft.files.filter(file => file.id !== id) })} />
        <div className={styles.actions}>
          {kind === 'document' ? (
            <>
              <Button kind="tonal" icon="camera" onClick={() => void addFiles('page', true)}>
                {t('Photograph pages')}
              </Button>
              <Button kind="tonal" icon="upload" onClick={() => void addFiles('page', false)}>
                {t('Add a PDF or pictures')}
              </Button>
            </>
          ) : kind !== 'emergency' ? (
            <>
              <Button kind="tonal" icon="camera" onClick={() => void addFiles('front', false)}>
                {t('Front [side]')}
              </Button>
              <Button kind="tonal" icon="camera" onClick={() => void addFiles('back', false)}>
                {t('Back [side]')}
              </Button>
            </>
          ) : null}
          {claude && draft.files.some(file => file.mime.startsWith('image/')) ? (
            <Button kind="text" icon="sparkle" busy={reading} onClick={() => setConsent(true)}>
              {t('Fill in with Claude')}
            </Button>
          ) : null}
        </div>

        {identity ? <SelectField label={t('Type')} value={kind} options={IDENTITY_KINDS.map(each => ({ value: each as ItemKind, label: kindName(each) }))} onChange={setKind} /> : null}

        <TextField
          label={kind === 'card' || kind === 'giftCard' ? t('Shop or card') : identity ? t('Name in the wallet') : t('Name')}
          placeholder={kind === 'document' ? t('Tax notice 2026, flat lease…') : kind === 'card' ? t('Bakery, library, gym…') : kindName(kind)}
          value={draft.title}
          onChange={title => set({ title })}
          field={form.field('title')}
          optional={!(kind === 'card' || kind === 'giftCard' || kind === 'document')}
          maxLength={200}
        />

        {kind === 'document' ? (
          <div className={styles.pair}>
            <SelectField label={t('Type')} value={draft.docType} options={DOCUMENT_TYPES.map(type => ({ value: type, label: documentTypeName(type) }))} onChange={docType => set({ docType })} />
            <TextField label={t('Issued by')} placeholder={t('Tax office, insurer, landlord…')} value={draft.issuer} onChange={issuer => set({ issuer })} optional />
          </div>
        ) : null}

        {cards && kind !== 'emergency' ? (
          <>
            <div className={styles.pair}>
              <TextField
                label={t('Card number')}
                inputMode="text"
                spellCheck={false}
                value={draft.number}
                onChange={number => {
                  // A Google Wallet link pasted here fills the card instead.
                  const google = readGoogleWalletLink(number);
                  if (google) takeGoogle(google);
                  else set({ number, format: draft.format === 'code128' && number.trim() ? guessFormat(number.trim()) : draft.format });
                }}
                field={form.field('number')}
                optional
                help={t('Type it as written under the barcode, add the card’s picture, or paste a Google Wallet link.')}
              />
              <SelectField label={t('Barcode')} value={draft.format} options={[...BARCODE_FORMATS.map(format => ({ value: format, label: formatName(format) })), { value: 'none' as const, label: t('No barcode') }]} onChange={format => set({ format })} />
            </div>
            <fieldset className={styles.fields}>
              <legend className="t-label">{t('Colour')}</legend>
              <LabelColorPicker value={draft.color && isLineColor(draft.color) ? draft.color : 'grey'} onChange={color => set({ color })} label={t('Colour')} />
            </fieldset>
          </>
        ) : null}

        {identity || kind === 'emergency' ? (
          <div className={styles.pair}>
            <TextField label={t('Name on it')} value={draft.holder} onChange={holder => set({ holder })} optional autoComplete="off" />
            <SelectField label={t('For')} value={draft.person} options={[{ value: '', label: t('You') }, ...people]} onChange={person => set({ person })} />
          </div>
        ) : null}
        {identity ? (
          <>
            <div className={styles.pair}>
              <TextField label={t('Number [paper]')} spellCheck={false} value={draft.number} onChange={number => set({ number })} optional autoComplete="off" />
              <TextField label={t('Nationality')} placeholder={t('Three letters: FRA…')} value={draft.nationality} onChange={nationality => set({ nationality })} optional maxLength={3} autoCapitalize="characters" />
            </div>
            <div className={styles.pair}>
              <TextField label={t('Issued on')} type="date" value={draft.issuedOn} onChange={issuedOn => set({ issuedOn })} optional />
              <TextField label={t('Born on')} type="date" value={draft.birthDate} onChange={birthDate => set({ birthDate })} optional />
            </div>
          </>
        ) : null}

        {kind === 'giftCard' ? (
          <div className={styles.pair}>
            <TextField label={t('Balance')} inputMode="decimal" value={draft.amount} onChange={amount => set({ amount })} optional />
            <SelectField label={t('Currency')} value={draft.currency} options={['EUR', 'CHF', 'GBP', 'USD', 'CAD'].map(code => ({ value: code, label: code }))} onChange={currency => set({ currency })} />
          </div>
        ) : null}

        {kind !== 'emergency' ? (
          <div className={styles.pair}>
            {kind === 'document' ? <TextField label={t('Date of the document')} type="date" value={draft.docDate} onChange={docDate => set({ docDate })} optional /> : null}
            <TextField
              label={kind === 'document' ? t('Ends on') : t('Valid until')}
              help={kind === 'document' ? t('A contract’s end, a warranty’s: a reminder comes a month before.') : undefined}
              type="date"
              value={draft.expiresOn}
              onChange={expiresOn => set({ expiresOn })}
              optional
            />
          </div>
        ) : null}

        {kind === 'document' ? (
          <div className={styles.pair}>
            <SelectField
              label={t('Keep it')}
              value={draft.keep}
              options={[
                { value: 'rule' as const, label: t('As long as France asks') },
                { value: 'forever' as const, label: t('For good') },
                { value: 'date' as const, label: t('Until a date') },
              ]}
              onChange={keep => set({ keep })}
            />
            {draft.keep === 'date' ? <TextField label={t('Keep until')} type="date" value={draft.keepUntil} onChange={keepUntil => set({ keepUntil })} /> : <TextField label={t('Labels')} placeholder={t('Flat, car…')} value={draft.labels} onChange={labels => set({ labels })} optional />}
          </div>
        ) : null}

        <TextField
          label={kind === 'emergency' ? t('What to know') : t('Notes')}
          placeholder={kind === 'emergency' ? t('Blood type, allergies, treatments, people to call…') : undefined}
          multiline
          value={draft.notes}
          onChange={notes => set({ notes })}
          optional={kind !== 'emergency'}
        />
      </div>

      <Layer open={consent} onDismiss={() => setConsent(false)} label={t('Fill in with Claude')} role="alertdialog">
        {consent ? (
          <DialogFrame
            title={t('Fill in with Claude')}
            onClose={() => setConsent(false)}
            foot={
              <>
                <Button kind="text" onClick={() => setConsent(false)}>
                  {t('Cancel')}
                </Button>
                <Button icon="sparkle" onClick={() => void fill()}>
                  {t('Send to Claude')}
                </Button>
              </>
            }
          >
            <p className={`${styles.consent} t-body`}>
              {t('Its pictures are opened on this device and sent once, through your server, to Claude, which reads its fields. Your server keeps nothing of them; Anthropic’s own policy applies to what it receives. Everything else in your wallet stays sealed.')}
            </p>
          </DialogFrame>
        ) : null}
      </Layer>
      {unsaved.dialog}
    </DialogFrame>
  );
}

/** A new item's form, or an item's; locked meanwhile, it asks to unlock first. */
export function ItemEditor({ id, kind, closing, under, onClose }: { id: string | null; kind: ItemKind | null; closing: boolean; under: string; onClose: () => void }) {
  const titleId = useId();
  const item = useWalletStore(state => (id ? state.items[id] : undefined));
  const [kept, setKept] = useState(item);
  if (item && item !== kept) setKept(item);
  const shown = item ?? (closing ? kept : undefined);
  const status = useVaultStatus();
  const tierOpen = !kind || status === 'open' || (status === 'cards' && tierOfKind(kind) === 'cards');
  if (id && shown && !shown.locked && shown.deletedAt === null) {
    return (
      <Layer open={!closing} onDismiss={onClose} routed full labelledBy={titleId}>
        <EditorForm kind={shown.kind} item={shown} closing={closing} under={under} onClose={onClose} />
      </Layer>
    );
  }
  if (!id && kind && tierOpen) {
    return (
      <Layer open={!closing} onDismiss={onClose} routed full labelledBy={titleId}>
        <EditorForm kind={kind} item={null} closing={closing} under={under} onClose={onClose} />
      </Layer>
    );
  }
  return (
    <Layer open={!closing} onDismiss={onClose} routed labelledBy={titleId}>
      <DialogFrame title={id && !shown ? t('Not found') : t('Locked')} titleId={titleId} onClose={onClose}>
        {id && !shown ? <p className="t-body">{t('This card or paper is no longer in your wallet.')}</p> : <UnlockPanel what={t('Unlock the vault to add or change what it holds.')} />}
      </DialogFrame>
    </Layer>
  );
}
