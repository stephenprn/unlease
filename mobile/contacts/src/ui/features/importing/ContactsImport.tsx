/**
 * Contacts' import wizard on the phone (`core/services/importFlow`, `@shared/ui/features/importing`;
 * the web's `ContactsImport` reads the same): this phone's own contacts (Google's synced ones with
 * them, the permission asked, Android's settings offered once refused), or Google Contacts' export
 * (a `.vcf` or « Google CSV », or Takeout's); then every person read with what becomes of them, each
 * one that comes in left out by its box; then the choices (completing those here, Google's labels one
 * by one, Google's stars, the photos), each counted; then one batch, the photos after, counted, and
 * the report, with « Annuler » on its slip and under it. Nothing is written before « Importer », and
 * it is planned again then. A card shared to the app lands on its preview; the first run hosts it
 * (`ImportHost`), its own foot under the first and the last step.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t, tx } from '@unlease/core/i18n';
import { IMPORT_WORDS, importFilesProgress } from '@unlease/core/services/importFlow';
import { defaultLabels, fileLabels, plannedCount, type ImportPlan } from '@unlease/contacts/services/importing';
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
import { planFor, readPhoneBook, readPickedFile, runImport, undoImport, type ImportRead, type ImportReport } from '@app/importing';
import { later } from '@app/later';
import { setPendingImport, useImportStore } from '@app/store/importStore';
import { useLibraryStore } from '@app/store/libraryStore';
import { askPermission, openAppSettings } from '@platform/phoneContacts';
import { selectServer, useSettingsStore } from '@shared/app/store/settingsStore';
import { dismissSnack, showSnack } from '@shared/app/store/uiStore';
import { AppText, Button, EmptyLine, FormMessage } from '@shared/ui/components';
import {
  ChoiceSwitch,
  ImportBlock,
  ImportCounts,
  ImportFrame,
  ImportInstructions,
  ImportPreview,
  ImportProgress,
  ImportReport as Report,
  ImportSheet,
  useImportHost,
  type ImportWizardProps,
} from '@shared/ui/features/importing/ImportFlow';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';

const GOOGLE_STEPS = [
  tx('Open contacts.google.com, then “Export” (or takeout.google.com, “Contacts”).'),
  tx('Choose “vCard” or “Google CSV”, then save the file on this phone.'),
  tx('Choose it here: nothing is written before you agree.'),
];

interface Choices {
  readonly leave: ReadonlySet<number>;
  readonly complete: boolean;
  readonly labels: ReadonlySet<string>;
  readonly photos: boolean;
  readonly favorites: boolean;
}

type Step =
  | { readonly kind: 'source' }
  | { readonly kind: 'preview' | 'choices' }
  | { readonly kind: 'importing'; readonly done: number; readonly total: number }
  | { readonly kind: 'done'; readonly plan: ImportPlan; readonly report: ImportReport; readonly undo: () => boolean; readonly undone: boolean; readonly snack: number | null };

/** What a source could not read, said in its own sheet (the access refused offers Android's settings). */
interface Problem {
  readonly from: 'file' | 'phone';
  readonly message: string;
  readonly blocked?: boolean;
}

const NONE: ReadonlySet<number> = new Set();

export interface ContactsImportProps extends ImportWizardProps {
  /** « Voir les contacts » on the report (its own screen; the first run has its own way on). */
  readonly onSeeContacts?: () => void;
}

export function ContactsImport({ onFlow, onImported, onSeeContacts }: ContactsImportProps) {
  const styles = useThemedStyles(makeStyles);
  const host = useImportHost();
  const [step, setStep] = useState<Step>({ kind: 'source' });
  const [read, setRead] = useState<ImportRead | null>(null);
  const [choices, setChoices] = useState<Choices | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [reading, setReading] = useState<{ readonly done: number; readonly total: number } | 'file' | null>(null);
  const [choiceProblem, setChoiceProblem] = useState(false);
  const contacts = useLibraryStore(s => s.contacts);
  const labels = useLibraryStore(s => s.labels);
  const server = useSettingsStore(selectServer);

  const open = (next: ImportRead): void => {
    setRead(next);
    setChoices({ leave: new Set(), complete: true, labels: defaultLabels(fileLabels(next.people, Object.values(useLibraryStore.getState().labels))), photos: true, favorites: true });
    setChoiceProblem(false);
    setProblem(null);
    setStep({ kind: 'preview' });
    onFlow?.(true);
  };

  // A card shared to the app, read before the screen opened: straight to its preview.
  const pending = useImportStore(s => s.pending);
  useEffect(() => {
    if (!pending) return;
    setPendingImport(null);
    open(pending);
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps -- taken once, as it comes

  const offered = useMemo(() => (read ? fileLabels(read.people, Object.values(labels)) : []), [read, labels]);
  // Planned again whenever the address book changes (a sync), so the preview says what will be.
  const plan = useMemo(() => (read && choices ? planFor(read.people, choices, { contacts, labels }) : null), [read, choices, contacts, labels]);
  const entries = useMemo(() => (read && plan ? previewEntries(read.people, plan, { contacts, labels }) : []), [read, plan, contacts, labels]);
  // What the choices act on, every choice at its most: planned while they show.
  const leave = choices?.leave ?? NONE;
  const choosing = step.kind === 'choices';
  const reach = useMemo(() => {
    if (!read || !choosing) return null;
    const all = planFor(read.people, { leave, complete: true, labels: new Set(offered.map(label => label.key)), photos: true, favorites: true }, { contacts, labels });
    const matched = new Set(all.people.flatMap(fate => (fate.kind === 'update' ? [fate.id] : [])));
    return { matched: matched.size, photos: all.photos, linked: [...all.creates, ...all.updates].filter(write => write.photo?.kind === 'url').length, stars: read.people.filter(person => person.favorite).length };
  }, [read, choosing, leave, offered, contacts, labels]);

  const fromFile = async (): Promise<void> => {
    setProblem(null);
    setReading('file');
    const outcome = await readPickedFile();
    setReading(null);
    if (outcome.status === 'ok') open(outcome.read);
    else if (outcome.status === 'error') setProblem({ from: 'file', message: outcome.message });
  };

  const fromPhone = async (): Promise<void> => {
    setProblem(null);
    const answer = await askPermission('contacts');
    if (answer !== 'granted') {
      if (answer === 'blocked') setProblem({ from: 'phone', message: CONTACTS_IMPORT_WORDS.phoneBlocked, blocked: true });
      return;
    }
    setReading({ done: 0, total: 0 });
    try {
      const people = await readPhoneBook((done, total) => setReading({ done, total }));
      if (people.length === 0) setProblem({ from: 'phone', message: CONTACTS_IMPORT_WORDS.phoneEmpty });
      else open({ source: 'phone', format: null, name: '', people });
    } catch {
      setProblem({ from: 'phone', message: CONTACTS_IMPORT_WORDS.phoneFailed });
    } finally {
      setReading(null);
    }
  };

  const toSource = (): void => {
    setRead(null);
    setChoices(null);
    setStep({ kind: 'source' });
    onFlow?.(false);
  };

  const choose = (patch: Partial<Choices>): void => {
    setChoices(current => (current ? { ...current, ...patch } : current));
    setChoiceProblem(false);
  };

  const run = async (): Promise<void> => {
    if (!read || !choices) return;
    // Planned again: the address book may have changed since the preview.
    const fresh = planFor(read.people, choices);
    if (plannedCount(fresh) === 0 && fresh.labels.length === 0) {
      setChoiceProblem(true);
      return;
    }
    setStep({ kind: 'importing', done: 0, total: fresh.photos });
    const report = await runImport(fresh, (done, total) => setStep({ kind: 'importing', done, total }));
    // Taken back once, from the slip or the report.
    let taken = false;
    const undo = (): boolean => {
      if (taken) return false;
      taken = true;
      undoImport(fresh, report.worn);
      setStep(current => (current.kind === 'done' ? { ...current, undone: true, snack: null } : current));
      return true;
    };
    const snack = showSnack(importedMessage(fresh), { label: t('Undo'), run: () => { undo(); } }, { tone: 'success' });
    // Written: nothing left to plan (the report holds its plan, for « Annuler »).
    setRead(null);
    setChoices(null);
    setStep({ kind: 'done', plan: fresh, report, undo, undone: false, snack });
    onImported?.();
    onFlow?.(false);
  };

  const undoFromReport = (): void => {
    if (step.kind !== 'done') return;
    if (step.snack !== null) dismissSnack(step.snack);
    if (step.undo()) showSnack(CONTACTS_IMPORT_WORDS.undone, undefined, { tone: 'success' });
  };

  const busy = reading !== null;

  if (step.kind === 'source') {
    return (
      <ImportFrame step="source" title={IMPORT_WORDS.sourceTitle} lead={t('The simplest: this phone’s contacts, which include your Google account’s. Or Google Contacts’ export.')}>
        <ImportSheet title={CONTACTS_IMPORT_WORDS.phoneTitle}>
          <ImportBlock>
            <AppText variant="body">{CONTACTS_IMPORT_WORDS.phoneLead}</AppText>
            <FormMessage message={problem?.from === 'phone' ? problem.message : null} />
            {problem?.from === 'phone' && problem.blocked ? <Button label={t('Open Android settings')} icon="settings" kind="text" onPress={openAppSettings} style={styles.start} /> : null}
            <Button label={t('Read the phone’s contacts')} icon="phone" kind="tonal" busy={reading !== null && reading !== 'file'} disabled={busy} onPress={() => later(fromPhone())} style={styles.start} />
          </ImportBlock>
        </ImportSheet>
        {reading !== null && reading !== 'file' ? <ImportProgress label={reading.total > 0 ? t('Reading the phone’s contacts… {done} of {total}', reading) : t('Reading the phone’s contacts…')} done={reading.done} total={reading.total} /> : null}
        <ImportSheet title={CONTACTS_IMPORT_WORDS.sourceTitle}>
          <ImportBlock>
            <ImportInstructions steps={GOOGLE_STEPS.map(text => t(text))} />
            <FormMessage message={problem?.from === 'file' ? problem.message : null} />
            <Button label={t('Choose a file')} icon="file" kind="tonal" busy={reading === 'file'} disabled={busy} onPress={() => later(fromFile())} style={styles.start} />
          </ImportBlock>
        </ImportSheet>
        <AppText variant="meta" style={styles.note}>
          {`${CONTACTS_IMPORT_WORDS.kept} ${server ? IMPORT_WORDS.private : IMPORT_WORDS.privateLocal}`}
        </AppText>
      </ImportFrame>
    );
  }

  if (step.kind === 'importing') {
    return (
      <ImportFrame step="import" title={IMPORT_WORDS.importingTitle} lead={IMPORT_WORDS.importingLead}>
        {step.total > 0 ? <ImportProgress label={importFilesProgress(step.done, step.total)} done={step.done} total={step.total} /> : <ImportProgress label={CONTACTS_IMPORT_WORDS.writing} />}
      </ImportFrame>
    );
  }

  if (step.kind === 'done') {
    const another = <Button label={IMPORT_WORDS.another} icon="download" kind="tonal" onPress={toSource} style={styles.start} />;
    if (step.undone) {
      return (
        <ImportFrame step="import" title={CONTACTS_IMPORT_WORDS.undone} lead={CONTACTS_IMPORT_WORDS.undoneLead}>
          <View style={styles.actions}>{another}</View>
        </ImportFrame>
      );
    }
    const lines = reportLines(step.plan, { taken: step.report.photos, missed: step.report.photosMissed }, server === null);
    return (
      <ImportFrame step="import" title={doneTitle(step.plan)}>
        <Report imported={lines.imported} skipped={lines.skipped}>
          <View style={styles.actions}>
            {/* In the first run, the setup's own foot leads on: no way out of it here. */}
            {host.embedded || !onSeeContacts ? null : <Button label={CONTACTS_IMPORT_WORDS.seeContacts} onPress={onSeeContacts} style={styles.start} />}
            {another}
            <Button label={CONTACTS_IMPORT_WORDS.undo} icon="undo" kind="text" onPress={undoFromReport} style={styles.start} />
          </View>
        </Report>
      </ImportFrame>
    );
  }

  if (!read || !choices || !plan) return null;
  const source = read.source === 'file' && read.format ? sourceWords(read.format, read.name) : sourceWords(read.source === 'phone' ? 'phone' : 'shared', read.name);

  if (step.kind === 'preview') {
    return (
      <ImportFrame
        step="preview"
        title={IMPORT_WORDS.previewTitle}
        lead={IMPORT_WORDS.previewLead}
        onBack={toSource}
        back={<Button label={t('Back')} kind="text" onPress={toSource} />}
        forward={<Button label={t('Continue')} onPress={() => setStep({ kind: 'choices' })} />}
      >
        <ImportSheet>
          <ImportCounts lines={previewCounts(plan, source, server === null)} />
        </ImportSheet>
        <ImportPreview
          entries={entries}
          choice={{
            isOn: entry => !leave.has(indexOf(entry.key)),
            can: entry => canLeave(plan.people[indexOf(entry.key)] ?? { kind: 'anonymous' }),
            toggle: entry => {
              const at = indexOf(entry.key);
              const next = new Set(leave);
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
  const toPreview = (): void => setStep({ kind: 'preview' });
  return (
    <ImportFrame
      step="choices"
      title={IMPORT_WORDS.choicesTitle}
      lead={IMPORT_WORDS.choicesLead}
      onBack={toPreview}
      back={<Button label={t('Back')} kind="text" onPress={toPreview} />}
      forward={<Button label={importContactsAction(plan)} icon="download" onPress={() => later(run())} />}
    >
      {reach.matched > 0 ? (
        <ImportSheet title={CONTACTS_IMPORT_WORDS.existingTitle}>
          <ChoiceSwitch title={CONTACTS_IMPORT_WORDS.complete} meta={completeWords(choices.complete, reach.matched)} checked={choices.complete} onChange={complete => choose({ complete })} />
        </ImportSheet>
      ) : null}
      {offered.length > 0 ? (
        <ImportSheet title={CONTACTS_IMPORT_WORDS.labelsTitle}>
          <ImportBlock>
            <AppText variant="meta">{CONTACTS_IMPORT_WORDS.labelsLead}</AppText>
          </ImportBlock>
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
        <ImportSheet>
          <EmptyLine size="body" text={CONTACTS_IMPORT_WORDS.nothingToChoose} style={styles.empty} />
        </ImportSheet>
      ) : null}
      <View style={styles.message}>
        <FormMessage message={choiceProblem ? CONTACTS_IMPORT_WORDS.nothingToWrite : null} />
      </View>
    </ImportFrame>
  );
}

/** A preview entry's person, by its key (`person-<index>`). */
const indexOf = (key: string): number => Number(key.slice('person-'.length));

const makeStyles = () =>
  StyleSheet.create({
    start: { alignSelf: 'flex-start' },
    note: { paddingHorizontal: 16 },
    actions: { gap: 8, paddingHorizontal: 4 },
    empty: { paddingHorizontal: 16, paddingVertical: 12 },
    message: { paddingHorizontal: 12 },
  });
