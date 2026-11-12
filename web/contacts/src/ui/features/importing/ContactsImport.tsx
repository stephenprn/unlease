/**
 * Contacts' import wizard on the web (`core/services/importFlow`, the shell's `features/importing`):
 * Google Contacts' export (a vCard or « CSV Google », or the `.vcf` of a Takeout), dropped or picked;
 * then every person read with what becomes of them (new, completing someone here, here already, the
 * same as an earlier one of the file, nothing to know them by), each one that comes in left out by its
 * box; then the choices (completing those here, Google's labels one by one, the photos, Google's
 * stars), each counted; then one batch, the photos after, and the report, with « Annuler » on its slip
 * and under it. Nothing is written before « Importer », and it is planned again then, against the
 * address book as it is. Réglages › Données opens it (`/contacts/settings/import`), a file dropped
 * anywhere lands on its preview, and the first run offers it (`embedded`).
 */
import { useEffect, useEffectEvent, useMemo, useState } from 'react';

import { t, tc, tx } from '@unlease/core/i18n';
import { createId } from '@unlease/core/services/ids';
import { IMPORT_WORDS, importFilesProgress } from '@unlease/core/services/importFlow';
import { defaultLabels, fileLabels, planImport, plannedCount, readImportFile, type ImportedContact, type ImportFormat, type ImportPlan, type PlanOptions } from '@unlease/contacts/services/importing';
import {
  canLeave,
  completeWords,
  CONTACTS_IMPORT_WORDS,
  doneTitle,
  favoritesWords,
  fileLabelWords,
  importContactsAction,
  importedMessage,
  photosNeedServer,
  photosWords,
  previewCounts,
  previewEntries,
  reportLines,
  sourceWords,
} from '@unlease/contacts/services/importPreview';

import { takeImportPhotos, type PhotosOutcome } from '../../../app/media/photos';
import { applyImport, undoImport } from '../../../app/store/actions';
import { takeImportFile, useContactsUi } from '../../../app/store/contactsUi';
import { useContactsStore, type ContactsState } from '../../../app/store/library';
import { callingRegion } from '../../../app/store/prefs';
import { selectServer, useSettingsStore } from '@shared/app/store/settings';
import { dismissSnack, showSnack } from '@shared/app/store/ui';
import type { ImportWizardProps } from '@shared/modules';
import { Button } from '@shared/ui/components/Button';
import { EmptyLine } from '@shared/ui/components/EmptyLine';
import { FormMessage } from '@shared/ui/components/FormMessage';
import { ChoiceSwitch, ImportCounts, ImportDrop, ImportFrame, ImportInstructions, ImportPreview, ImportProgress, ImportReport, ImportSheet } from '@shared/ui/features/importing/ImportFlow';
import settings from '@shared/ui/features/settings/settings.module.css';
import { navigate } from '@shared/ui/router';
import { paths } from '../../routes';

const STEPS = [
  tx('Ouvrez contacts.google.com et connectez-vous.'),
  tx('Choisissez « Exporter », puis « vCard » (ou « CSV Google ») et exportez.'),
  tx('Déposez ici le fichier téléchargé (.vcf ou .csv). Celui d’un export Takeout de Google Contacts convient aussi.'),
];

const ACCEPT = '.vcf,.vcard,.csv,text/vcard,text/x-vcard,text/csv';

type Problem = 'notContacts' | 'emptyFile' | 'unreadable';

interface Read {
  readonly name: string;
  readonly format: ImportFormat;
  readonly people: readonly ImportedContact[];
}

/** A file read: who it holds, or why not. */
async function readFile(file: File): Promise<Read | Problem> {
  try {
    const read = readImportFile(file.name, await file.text());
    if (!read) return 'notContacts';
    if (read.people.length === 0) return 'emptyFile';
    return { name: file.name, ...read };
  } catch {
    return 'unreadable';
  }
}

interface Choices {
  readonly leave: ReadonlySet<number>;
  readonly complete: boolean;
  /** The file's labels brought (`FileLabel.key`). */
  readonly labels: ReadonlySet<string>;
  readonly photos: boolean;
  readonly favorites: boolean;
}

/** The plan for what was read and chosen, against the address book as it is. */
function planFor(read: Read, choices: Choices, { contacts, labels }: Pick<ContactsState, 'contacts' | 'labels'> = useContactsStore.getState()): ImportPlan {
  const options: PlanOptions = { now: Date.now(), newId: () => createId(), region: callingRegion(), ...choices };
  return planImport(Object.values(contacts), Object.values(labels), read.people, options);
}

type Step =
  | { readonly kind: 'source'; readonly problem: Problem | null; readonly reading: boolean }
  | { readonly kind: 'preview' | 'choices' }
  | { readonly kind: 'importing'; readonly done: number; readonly total: number }
  | { readonly kind: 'done'; readonly plan: ImportPlan; readonly photos: PhotosOutcome | null; readonly undo: () => boolean; readonly undone: boolean; readonly snack: number | null };

const SOURCE: Step = { kind: 'source', problem: null, reading: false };
const NONE: ReadonlySet<number> = new Set();

export function ContactsImport({ embedded = false, onFlow, onImported }: ImportWizardProps) {
  const [step, setStep] = useState<Step>(SOURCE);
  const [read, setRead] = useState<Read | null>(null);
  const [choices, setChoices] = useState<Choices | null>(null);
  const [choiceProblem, setChoiceProblem] = useState(false);
  const contacts = useContactsStore(s => s.contacts);
  const labels = useContactsStore(s => s.labels);
  const server = useSettingsStore(selectServer);

  const offered = useMemo(() => (read ? fileLabels(read.people, Object.values(labels)) : []), [read, labels]);
  // Planned again whenever the address book changes (a sync), so the preview says what will be.
  const plan = useMemo(() => (read && choices ? planFor(read, choices, { contacts, labels }) : null), [read, choices, contacts, labels]);
  const entries = useMemo(() => (read && plan ? previewEntries(read.people, plan, { contacts, labels }) : []), [read, plan, contacts, labels]);
  // What the choices act on, every choice at its most: planned while they show.
  const leave = choices?.leave ?? NONE;
  const choosing = step.kind === 'choices';
  const reach = useMemo(() => {
    if (!read || !choosing) return null;
    const all = planFor(read, { leave, complete: true, labels: new Set(offered.map(label => label.key)), photos: true, favorites: true }, { contacts, labels });
    const matched = new Set(all.people.flatMap(fate => (fate.kind === 'update' ? [fate.id] : [])));
    return { matched: matched.size, photos: all.photos, linked: [...all.creates, ...all.updates].filter(write => write.photo?.kind === 'url').length, stars: read.people.filter(person => person.favorite).length };
  }, [read, choosing, leave, offered, contacts, labels]);

  /** A file read: its preview, every choice at its default; or why not, under the drop zone. */
  const apply = (outcome: Read | Problem): void => {
    if (typeof outcome === 'string') {
      setStep({ kind: 'source', problem: outcome, reading: false });
      return;
    }
    setRead(outcome);
    setChoices({ leave: new Set(), complete: true, labels: defaultLabels(fileLabels(outcome.people, Object.values(useContactsStore.getState().labels))), photos: true, favorites: true });
    setChoiceProblem(false);
    setStep({ kind: 'preview' });
    onFlow?.(true);
  };
  const land = useEffectEvent(apply);

  const take = async (files: readonly File[]): Promise<void> => {
    const file = files[0];
    if (!file) return;
    setStep({ kind: 'source', problem: null, reading: true });
    apply(await readFile(file));
  };

  // A file dropped elsewhere in the app: read once here, straight to its preview.
  const dropped = useContactsUi(s => s.importFile);
  useEffect(() => {
    if (!dropped) return;
    const file = takeImportFile();
    if (file) void readFile(file).then(land);
  }, [dropped]);

  const toSource = (): void => {
    setRead(null);
    setChoices(null);
    setStep(SOURCE);
    onFlow?.(false);
  };

  const choose = (patch: Partial<Choices>): void => {
    setChoices(current => (current ? { ...current, ...patch } : current));
    setChoiceProblem(false);
  };

  const run = async (): Promise<void> => {
    if (!read || !choices) return;
    // Planned again: the address book may have changed since the preview.
    const fresh = planFor(read, choices);
    if (plannedCount(fresh) === 0 && fresh.labels.length === 0) {
      setChoiceProblem(true);
      return;
    }
    setStep({ kind: 'importing', done: 0, total: fresh.photos });
    applyImport(fresh);
    const photos = fresh.photos > 0 ? await takeImportPhotos([...fresh.creates, ...fresh.updates], (done, total) => setStep({ kind: 'importing', done, total })) : null;
    // Taken back once, from the slip or the report.
    let taken = false;
    const undo = (): boolean => {
      if (taken) return false;
      taken = true;
      undoImport(fresh, photos?.worn ?? new Map());
      setStep(current => (current.kind === 'done' ? { ...current, undone: true, snack: null } : current));
      return true;
    };
    const snack = showSnack(importedMessage(fresh), { label: tc('undo', 'Annuler'), run: () => void undo() }, { tone: 'success' });
    // Written: nothing left to plan (the report holds its plan, for « Annuler »).
    setRead(null);
    setChoices(null);
    setStep({ kind: 'done', plan: fresh, photos, undo, undone: false, snack });
    onImported?.();
    onFlow?.(false);
  };

  const undoFromReport = (): void => {
    if (step.kind !== 'done') return;
    if (step.snack !== null) dismissSnack(step.snack);
    if (step.undo()) showSnack(CONTACTS_IMPORT_WORDS.undone, undefined, { tone: 'success' });
  };

  const back = (to: () => void) => (
    <Button kind="text" icon="back" onClick={to}>
      {t('Retour')}
    </Button>
  );

  if (step.kind === 'source') {
    return (
      <ImportFrame step="source" embedded={embedded} title={CONTACTS_IMPORT_WORDS.sourceTitle} lead={CONTACTS_IMPORT_WORDS.sourceLead}>
        <ImportSheet label={CONTACTS_IMPORT_WORDS.sourceTitle}>
          <div className={settings.block}>
            <ImportInstructions steps={STEPS.map(text => t(text))} />
            <ImportDrop label={t('Déposez le fichier exporté (.vcf ou .csv)')} meta={t('ou cliquez pour le choisir')} accept={ACCEPT} reading={step.reading} inputLabel={t('Fichier de contacts')} onFiles={files => void take(files)} />
            {/* A file refused says why under the drop zone, as a form's own line. */}
            <FormMessage form={{ message: step.problem ? CONTACTS_IMPORT_WORDS[step.problem] : null, problems: 0 }} />
            <p className="t-meta">{`${CONTACTS_IMPORT_WORDS.kept} ${server ? IMPORT_WORDS.private : IMPORT_WORDS.privateLocal}`}</p>
          </div>
        </ImportSheet>
      </ImportFrame>
    );
  }

  if (step.kind === 'importing') {
    return (
      <ImportFrame step="import" embedded={embedded} title={IMPORT_WORDS.importingTitle} lead={IMPORT_WORDS.importingLead}>
        {step.total > 0 ? <ImportProgress label={importFilesProgress(step.done, step.total)} done={step.done} total={step.total} /> : <ImportProgress label={CONTACTS_IMPORT_WORDS.writing} />}
      </ImportFrame>
    );
  }

  if (step.kind === 'done') {
    const lines = reportLines(step.plan, step.photos, server === null);
    const another = (
      <Button kind={embedded ? 'tonal' : 'text'} icon="download" onClick={toSource}>
        {IMPORT_WORDS.another}
      </Button>
    );
    if (step.undone) {
      return (
        <ImportFrame step="import" embedded={embedded} title={CONTACTS_IMPORT_WORDS.undone} lead={CONTACTS_IMPORT_WORDS.undoneLead}>
          <div className={settings.buttons}>{another}</div>
        </ImportFrame>
      );
    }
    return (
      <ImportFrame step="import" embedded={embedded} title={doneTitle(step.plan)}>
        <ImportReport imported={lines.imported} skipped={lines.skipped}>
          <div className={settings.buttons}>
            {/* In the first run, the setup's own foot leads on: no way out of it here. */}
            {embedded ? null : <Button onClick={() => navigate(paths.contacts)}>{CONTACTS_IMPORT_WORDS.seeContacts}</Button>}
            {another}
            <Button kind="text" icon="undo" onClick={undoFromReport}>
              {CONTACTS_IMPORT_WORDS.undo}
            </Button>
          </div>
        </ImportReport>
      </ImportFrame>
    );
  }

  if (!read || !choices || !plan) return null;
  const source = sourceWords(read.format, read.name);

  if (step.kind === 'preview') {
    const left = leave;
    return (
      <ImportFrame
        step="preview"
        embedded={embedded}
        title={IMPORT_WORDS.previewTitle}
        lead={IMPORT_WORDS.previewLead}
        back={back(toSource)}
        forward={<Button onClick={() => setStep({ kind: 'choices' })}>{t('Continuer')}</Button>}
      >
        <ImportSheet label={source}>
          <div className={settings.block}>
            <ImportCounts lines={previewCounts(plan, source, server === null)} />
          </div>
        </ImportSheet>
        <ImportPreview
          entries={entries}
          label={CONTACTS_IMPORT_WORDS.listLabel}
          choice={{
            isOn: entry => !left.has(indexOf(entry.key)),
            can: entry => canLeave(plan.people[indexOf(entry.key)] ?? { kind: 'anonymous' }),
            toggle: entry => {
              const at = indexOf(entry.key);
              const next = new Set(left);
              if (next.has(at)) next.delete(at);
              else next.add(at);
              choose({ leave: next });
            },
          }}
        />
      </ImportFrame>
    );
  }

  if (!reach) return null;
  const nothing = reach.matched === 0 && offered.length === 0 && reach.photos === 0 && reach.stars === 0;
  return (
    <ImportFrame
      step="choices"
      embedded={embedded}
      title={IMPORT_WORDS.choicesTitle}
      lead={IMPORT_WORDS.choicesLead}
      back={back(() => setStep({ kind: 'preview' }))}
      forward={
        <Button icon="download" onClick={() => void run()}>
          {importContactsAction(plan)}
        </Button>
      }
    >
      {reach.matched > 0 ? (
        <ImportSheet title={CONTACTS_IMPORT_WORDS.existingTitle}>
          <ChoiceSwitch title={CONTACTS_IMPORT_WORDS.complete} meta={completeWords(choices.complete, reach.matched)} checked={choices.complete} onChange={complete => choose({ complete })} />
        </ImportSheet>
      ) : null}
      {offered.length > 0 ? (
        <ImportSheet title={CONTACTS_IMPORT_WORDS.labelsTitle}>
          <p className={`${settings.block} t-meta`}>{CONTACTS_IMPORT_WORDS.labelsLead}</p>
          {offered.map(label => (
            <ChoiceSwitch
              key={label.key}
              title={label.name}
              meta={fileLabelWords(label)}
              checked={choices.labels.has(label.key)}
              onChange={on => {
                const next = new Set(choices.labels);
                if (on) next.add(label.key);
                else next.delete(label.key);
                choose({ labels: next });
              }}
            />
          ))}
        </ImportSheet>
      ) : null}
      {reach.stars > 0 ? (
        <ImportSheet title={CONTACTS_IMPORT_WORDS.favoritesTitle}>
          <ChoiceSwitch title={CONTACTS_IMPORT_WORDS.favorites} meta={favoritesWords(choices.favorites, reach.stars)} checked={choices.favorites} onChange={favorites => choose({ favorites })} />
        </ImportSheet>
      ) : null}
      {reach.photos > 0 ? (
        <ImportSheet title={CONTACTS_IMPORT_WORDS.photosTitle}>
          <ChoiceSwitch
            title={CONTACTS_IMPORT_WORDS.photos}
            meta={server === null && reach.linked > 0 && choices.photos ? `${photosWords(true, reach.photos)} ${photosNeedServer(reach.linked)}` : photosWords(choices.photos, reach.photos)}
            checked={choices.photos}
            onChange={photos => choose({ photos })}
          />
        </ImportSheet>
      ) : null}
      {nothing ? (
        <ImportSheet label={IMPORT_WORDS.choicesTitle}>
          <div className={settings.block}>
            <EmptyLine size="body" text={CONTACTS_IMPORT_WORDS.nothingToChoose} />
          </div>
        </ImportSheet>
      ) : null}
      <FormMessage form={{ message: choiceProblem ? CONTACTS_IMPORT_WORDS.nothingToWrite : null, problems: 0 }} />
    </ImportFrame>
  );
}

/** A preview entry's person, by its key (`person-<index>`). */
const indexOf = (key: string): number => Number(key.slice('person-'.length));
