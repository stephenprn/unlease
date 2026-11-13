/**
 * Moving in from Google Keep on the phone (`core/services/importFlow`'s four steps, the web's
 * `KeepWizard` drawn the same): the Takeout archive picked and read; every note of it previewed with
 * what it becomes or why it is left out, each one left out by its box; the choices (the notes of one
 * link, the lists of links, each line of such a list without an address, the archive), each with its
 * default and its cost; then the records in one batch, the photos counted, and what came in. The
 * reading, the plan and every word shared with the web are the package's (`notes/services/keepImport`);
 * this holds the steps and what the person chose.
 *
 * On Réglages' « Importer » screen under its top bar, or as the first run's step (`ImportHost`), whose
 * own foot shows on the first step and on the report. Nothing is written before « Importer ».
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { IMPORT_WORDS, importFilesProgress, type ImportStep, type PreviewEntry } from '@unlease/core/services/importFlow';
import { CLAUDE_COST_PER_LINK, type ClaudeModel } from '@unlease/core/sync/settings';
import {
  archivedChoiceWords,
  archivedCount,
  canLeaveOut,
  defaultKeepChoices,
  KEEP_WIZARD_WORDS,
  keepCountLines,
  keepDoneTitle,
  keepImportAction,
  keepImportCount,
  keepImportWrote,
  keepLinksToRead,
  keepListLine,
  keepListsWords,
  keepNoteComes,
  keepNoteName,
  keepPreview,
  keepReportLines,
  keepSinglesWords,
  linkListNotes,
  singleLinkNotes,
  STRAY_CHOICES,
  strayChoiceLabels,
  strayChoiceMeta,
  strayChoiceName,
  strayKey,
  strayProblems,
  type ArchivedChoice,
  type ImportedNote,
  type KeepChoices,
  type KeepReport,
  type StrayChoice,
  type StrayChoiceKind,
} from '@unlease/notes/services/keepImport';
import { alreadyHere, discardKeepImport, knownHere, prepareKeepImport, runKeepImport, type PreparedImport } from '@app/keepImport';
import { fetchServerSettings } from '@app/sync/transport';
import { rememberServerSettings, selectCanRead, selectServer, useSettingsStore } from '@shared/app/store/settingsStore';
import { requestSync } from '@shared/app/sync/syncManager';
import {
  ChoiceRadios,
  ChoiceSwitch,
  ImportBlock,
  ImportCounts,
  ImportFrame,
  ImportInstructions,
  ImportPreview,
  ImportProgress,
  ImportReport,
  ImportSheet,
  useImportHost,
  type ImportWizardProps,
} from '@shared/ui/features/importing/ImportFlow';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

import { AppText, Button, CheckMark, EmptyLine, FormMessage, ListRow, Segmented, TextField, useForm, type Form } from '../../components';

export interface KeepWizardProps extends ImportWizardProps {
  /** « Voir le tableau » once done (Réglages' screen; the first run has its own way on). */
  readonly onBoard?: () => void;
}

/** The archive read, and when (the preview's dates count from it). */
interface Read {
  readonly prepared: PreparedImport;
  readonly already: number;
  readonly at: number;
}

const yieldFrame = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

export function KeepWizard({ onFlow, onImported, onBoard }: KeepWizardProps) {
  const styles = useThemedStyles(makeStyles);
  const { embedded } = useImportHost();
  const server = useSettingsStore(selectServer);
  const reading = useSettingsStore(selectCanRead);
  const [step, setStep] = useState<ImportStep>('source');
  const [read, setRead] = useState<Read | null>(null);
  const [picking, setPicking] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [choices, setChoices] = useState<KeepChoices | null>(null);
  /** Each stray line's way, and the address typed for it (kept while another way is tried). */
  const [strayKinds, setStrayKinds] = useState<ReadonlyMap<string, StrayChoiceKind>>(new Map());
  const [strayUrls, setStrayUrls] = useState<ReadonlyMap<string, string>>(new Map());
  const [progress, setProgress] = useState<{ readonly done: number; readonly total: number } | null>(null);
  const [report, setReport] = useState<KeepReport | null>(null);
  /** The server's model, for what a link read costs: no figure until the server has said. */
  const [model, setModel] = useState<ClaudeModel | null>(null);
  /** The archive read and not imported: its files go if the wizard is left. */
  const pending = useRef<PreparedImport | null>(null);

  useEffect(() => {
    if (!server) return;
    let live = true;
    fetchServerSettings(server).then(settings => {
      if (!live || !settings) return;
      setModel(settings.analysis.model);
      rememberServerSettings(settings);
    });
    return () => {
      live = false;
    };
  }, [server]);

  // Left before « Importer »: the archive's files extracted here are removed.
  useEffect(
    () => () => {
      if (pending.current) void discardKeepImport(pending.current);
    },
    [],
  );

  const strays = useMemo(() => {
    const map = new Map<string, StrayChoice>();
    for (const [key, kind] of strayKinds) map.set(key, kind === 'link' ? { kind: 'link', url: strayUrls.get(key) ?? '' } : { kind });
    return map;
  }, [strayKinds, strayUrls]);
  const chosen = useMemo<KeepChoices | null>(() => (choices ? { ...choices, strays } : null), [choices, strays]);
  const plan = read?.prepared.plan ?? null;

  const entries = useMemo<readonly PreviewEntry[]>(() => (plan && chosen && read ? keepPreview(plan, { known: knownHere, reading, now: read.at }, chosen) : []), [plan, chosen, read, reading]);
  const counts = useMemo(() => (plan && read ? keepCountLines(plan, read.already) : []), [plan, read]);
  const problems = useMemo(() => (plan && chosen ? strayProblems(plan, chosen) : {}), [plan, chosen]);
  const form = useForm<string>(problems, { order: Object.keys(problems) });

  const pick = async (): Promise<void> => {
    setPicking(true);
    setRefused(null);
    const outcome = await prepareKeepImport();
    setPicking(false);
    if (outcome.status === 'error') setRefused(outcome.message);
    if (outcome.status !== 'ok') return;
    pending.current = outcome.prepared;
    setRead({ prepared: outcome.prepared, already: alreadyHere(outcome.prepared.plan), at: Date.now() });
    setChoices(defaultKeepChoices(outcome.prepared.plan));
    setStrayKinds(new Map());
    setStrayUrls(new Map());
    form.reset();
    setStep('preview');
    onFlow?.(true);
  };

  // Back to the start, the archive read set aside and its files removed.
  const toSource = useCallback(() => {
    if (pending.current) void discardKeepImport(pending.current);
    pending.current = null;
    setRead(null);
    setChoices(null);
    setReport(null);
    setProgress(null);
    setStep('source');
    onFlow?.(false);
  }, [onFlow]);
  const toPreview = useCallback(() => setStep('preview'), []);
  const hold = useCallback(() => {}, []);

  const run = async (): Promise<void> => {
    if (!read || !chosen) return;
    setStep('import');
    setProgress(null);
    // The import owns the archive's files from here (it removes those no note took): leaving now must not take them from under it.
    pending.current = null;
    // The progress shows before the batch is written.
    await yieldFrame();
    const done = await runKeepImport(read.prepared, chosen, (count, total) => setProgress({ done: count, total }));
    requestSync();
    setReport(done);
    if (keepImportWrote(done)) onImported?.();
    onFlow?.(false);
  };

  if (step === 'source' || !read || !plan || !chosen) {
    return (
      <ImportFrame step="source" title={KEEP_WIZARD_WORDS.sourceTitle} lead={KEEP_WIZARD_WORDS.sourceLead}>
        <ImportSheet>
          <ImportBlock>
            <ImportInstructions steps={[t('Open takeout.google.com on a computer or this phone.'), KEEP_WIZARD_WORDS.takeoutDeselect, KEEP_WIZARD_WORDS.takeoutPick]} />
            {/* The form's own line, its glyph saying it as well as its colour. */}
            <FormMessage message={refused} />
            <Button label={t('Choose the archive')} icon="download" busy={picking} onPress={() => void pick()} style={styles.stretch} />
            <AppText variant="meta">{`${KEEP_WIZARD_WORDS.keeps} ${IMPORT_WORDS.private}`}</AppText>
          </ImportBlock>
        </ImportSheet>
      </ImportFrame>
    );
  }

  if (step === 'preview') {
    const left = chosen.left ?? new Set<string>();
    return (
      <ImportFrame
        step="preview"
        title={IMPORT_WORDS.previewTitle}
        lead={IMPORT_WORDS.previewLead}
        onBack={toSource}
        back={<Button kind="text" label={t('Back')} onPress={toSource} />}
        forward={<Button label={t('Continue')} onPress={() => setStep('choices')} />}
      >
        <ImportSheet>
          <ImportCounts lines={counts} />
        </ImportSheet>
        <ImportPreview
          entries={entries}
          choice={{
            isOn: entry => !left.has(entry.key),
            can: canLeaveOut,
            toggle: entry =>
              setChoices(current => {
                if (!current) return current;
                const next = new Set(current.left ?? []);
                if (next.has(entry.key)) next.delete(entry.key);
                else next.add(entry.key);
                return { ...current, left: next };
              }),
          }}
        />
      </ImportFrame>
    );
  }

  if (step === 'choices') {
    const count = keepImportCount(plan, knownHere, chosen);
    return (
      <ImportFrame
        step="choices"
        title={IMPORT_WORDS.choicesTitle}
        lead={IMPORT_WORDS.choicesLead}
        onBack={toPreview}
        back={<Button kind="text" label={t('Back')} onPress={toPreview} />}
        forward={<Button label={keepImportAction(count)} icon="download" busy={form.busy} onPress={() => void form.submit(run)} />}
      >
        <KeepChoicesBody
          plan={read.prepared.plan}
          choices={chosen}
          reading={reading}
          costEach={model ? CLAUDE_COST_PER_LINK[model] : null}
          strayKinds={strayKinds}
          strayUrls={strayUrls}
          form={form}
          onChoices={change => setChoices(current => (current ? { ...current, ...change } : current))}
          onStrayKind={(key, kind) => setStrayKinds(current => new Map(current).set(key, kind))}
          onStrayUrl={(key, url) => setStrayUrls(current => new Map(current).set(key, url))}
        />
        <FormMessage message={form.message} />
      </ImportFrame>
    );
  }

  if (!report) {
    const files = progress !== null && progress.total > 0;
    return (
      <ImportFrame step="import" title={IMPORT_WORDS.importingTitle} lead={IMPORT_WORDS.importingLead} onBack={hold}>
        <ImportProgress label={files ? importFilesProgress(progress.done, progress.total) : KEEP_WIZARD_WORDS.writing} done={files ? progress.done : undefined} total={files ? progress.total : undefined} />
      </ImportFrame>
    );
  }

  const { imported, skipped } = keepReportLines(report);
  return (
    <ImportFrame step="import" title={keepDoneTitle(report)}>
      <ImportReport imported={imported} skipped={skipped}>
        <View style={styles.actions}>
          {/* In the first run it is the one action here (its own foot goes on): tonal; beside « Voir le tableau », quiet. */}
          <Button kind={embedded ? 'tonal' : 'text'} label={IMPORT_WORDS.another} onPress={toSource} />
          {/* The first run goes on by its own foot: no way out of it from here. */}
          {!embedded && onBoard ? <Button label={KEEP_WIZARD_WORDS.board} onPress={onBoard} /> : null}
        </View>
      </ImportReport>
    </ImportFrame>
  );
}

interface ChoicesBodyProps {
  readonly plan: PreparedImport['plan'];
  readonly choices: KeepChoices;
  readonly reading: boolean;
  readonly costEach: number | null;
  readonly strayKinds: ReadonlyMap<string, StrayChoiceKind>;
  readonly strayUrls: ReadonlyMap<string, string>;
  readonly form: Form<string>;
  readonly onChoices: (change: Partial<KeepChoices>) => void;
  readonly onStrayKind: (key: string, kind: StrayChoiceKind) => void;
  readonly onStrayUrl: (key: string, url: string) => void;
}

/** The choices step's sheets: the notes of one link, the lists of links and their lines without one, the archive. */
function KeepChoicesBody({ plan, choices, reading, costEach, strayKinds, strayUrls, form, onChoices, onStrayKind, onStrayUrl }: ChoicesBodyProps) {
  const styles = useThemedStyles(makeStyles);
  // Only what comes in asks anything: not a note here already, left out by its box, or archived and left aside.
  const comes = (note: ImportedNote): boolean => keepNoteComes(note, knownHere, choices);
  const singles = singleLinkNotes(plan).filter(comes);
  const lists = linkListNotes(plan).filter(comes);
  const strayLists = lists.filter(note => note.strays.length > 0 && choices.collections.has(note.source));
  const archived = archivedCount(plan, knownHere, choices);
  const toRead = keepLinksToRead(plan, knownHere, choices);
  const singlesWords = keepSinglesWords(singles.length, reading, costEach);
  const listsWords = keepListsWords(lists.length, toRead.lists, reading, costEach);
  const archive = archivedChoiceWords(archived);
  const labels = strayChoiceLabels();

  const toggleList = (source: string): void => {
    const next = new Set(choices.collections);
    if (next.has(source)) next.delete(source);
    else next.add(source);
    onChoices({ collections: next });
  };

  if (singles.length === 0 && lists.length === 0 && archived === 0) {
    return (
      <ImportSheet>
        <EmptyLine size="body" text={KEEP_WIZARD_WORDS.nothingToChoose} style={styles.empty} />
      </ImportSheet>
    );
  }

  return (
    <>
      {singles.length > 0 ? (
        <ImportSheet>
          <ChoiceSwitch title={singlesWords.title} meta={singlesWords.meta} checked={choices.singleLinks} onChange={on => onChoices({ singleLinks: on })} />
        </ImportSheet>
      ) : null}
      {lists.length > 0 ? (
        <ImportSheet title={KEEP_WIZARD_WORDS.linksTitle}>
          <ChoiceSwitch
            title={listsWords.title}
            meta={listsWords.meta}
            checked={lists.every(note => choices.collections.has(note.source))}
            onChange={all => {
              const next = new Set(choices.collections);
              for (const note of lists) {
                if (all) next.add(note.source);
                else next.delete(note.source);
              }
              onChoices({ collections: next });
            }}
          />
          {lists.map(note => {
            const on = choices.collections.has(note.source);
            return (
              <ListRow
                key={note.key}
                title={keepNoteName(note)}
                supporting={keepListLine(note, on, choices.strays)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => toggleList(note.source)}
                leading={<CheckMark checked={on} />}
              />
            );
          })}
        </ImportSheet>
      ) : null}
      {strayLists.length > 0 ? (
        <ImportSheet title={KEEP_WIZARD_WORDS.straysTitle}>
          <ImportBlock>
            <AppText variant="meta">{KEEP_WIZARD_WORDS.straysLead}</AppText>
          </ImportBlock>
          {strayLists.map(note => (
            <View key={note.key} style={styles.strayList}>
              <AppText variant="bodyStrong" style={styles.inset}>
                {keepNoteName(note)}
              </AppText>
              {note.strays.map(stray => {
                const key = strayKey(note, stray);
                const kind = strayKinds.get(key) ?? 'comment';
                return (
                  <View key={key} style={styles.stray}>
                    <AppText variant="body">{stray.text}</AppText>
                    <Segmented label={strayChoiceName(stray)} value={kind} onChange={value => onStrayKind(key, value)} options={STRAY_CHOICES.map(value => ({ value, label: labels[value] }))} />
                    <AppText variant="meta">{strayChoiceMeta(note, stray, kind)}</AppText>
                    {kind === 'link' ? (
                      <TextField label={KEEP_WIZARD_WORDS.strayUrl} kind="url" value={strayUrls.get(key) ?? ''} onChangeText={value => onStrayUrl(key, value)} field={form.field(key)} />
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))}
        </ImportSheet>
      ) : null}
      {archived > 0 ? (
        <ImportSheet>
          <ChoiceRadios<ArchivedChoice> title={archive.title} meta={archive.meta} value={choices.archived ?? 'archive'} options={archive.options} onChange={value => onChoices({ archived: value })} />
        </ImportSheet>
      ) : null}
    </>
  );
}

const makeStyles = (_theme: Theme) =>
  StyleSheet.create({
    stretch: { alignSelf: 'stretch' },
    actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
    empty: { paddingHorizontal: 16, paddingVertical: 12 },
    // Each list's lines under its name, 16 in as the sheet's words are.
    strayList: { paddingBottom: 8 },
    inset: { paddingHorizontal: 16, paddingTop: 8 },
    stray: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  });
