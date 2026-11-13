/**
 * Carnet's import wizard on the web (`core/services/importFlow`, the shell's `features/importing`):
 * Google Keep's Takeout archive dropped or picked; then every note of it with what it becomes (a
 * note, a list, a collection, a link Claude files) or why it is left out (here already, Keep's bin,
 * empty, unreadable), each one that comes in left out by its box; then the choices (the notes of one
 * link, the lists of links, each line of those lists that holds no address, the archived notes), each
 * with its default and its cost; then one batch, the photos after, counted, and the report. Nothing
 * is written before « Importer », and it is planned again then, against the library as it is.
 * Réglages › Données opens it (`/notes/settings/import`), and the first run offers it (`embedded`).
 *
 * The reading, the preview and the records are the package's (`notes/services/keepImport`), shared
 * with the phone; the archive's reader loads on first use (it brings the unzip).
 */
import { useCallback, useMemo, useState } from 'react';

import { t, tc } from '@unlease/core/i18n';
import { IMPORT_WORDS, importFilesProgress } from '@unlease/core/services/importFlow';
import { CLAUDE_COST_PER_LINK } from '@unlease/core/sync/settings';
import {
  alreadyImported,
  ARCHIVED_CHOICES,
  archivedChoiceWords,
  archivedCount,
  canLeaveOut,
  defaultKeepChoices,
  KEEP_WIZARD_WORDS,
  keepCountLines,
  keepDoneTitle,
  keepImportAction,
  keepImportWrote,
  keepImportCount,
  keepLinksToRead,
  keepListBoxLabel,
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
  type KeepStray,
  type StrayChoice,
  type StrayChoiceKind,
} from '@unlease/notes/services/keepImport';

import type { PreparedImport } from '../../../app/keep/keepImport';
import { useLibraryStore } from '../../../app/store/library';
import { useCanRead } from '../../../app/store/prefs';
import { selectServerSettings, useServerSettingsStore } from '@shared/app/store/serverSettings';
import { selectServer, useSettingsStore } from '@shared/app/store/settings';
import type { ImportWizardProps } from '@shared/modules';
import { Button } from '@shared/ui/components/Button';
import { Checkbox } from '@shared/ui/components/Checkbox';
import { EmptyLine } from '@shared/ui/components/EmptyLine';
import { FormMessage } from '@shared/ui/components/FormMessage';
import { Segmented } from '@shared/ui/components/Segmented';
import { TextField } from '@shared/ui/components/TextField';
import { useForm } from '@shared/ui/components/useForm';
import { ChoiceRadios, ChoiceSwitch, ImportCounts, ImportDrop, ImportFrame, ImportInstructions, ImportPreview, ImportProgress, ImportReport, ImportSheet } from '@shared/ui/features/importing/ImportFlow';
import settings from '@shared/ui/features/settings/settings.module.css';
import { navigate } from '@shared/ui/router';
import { paths } from '../../routes';
import styles from './keepWizard.module.css';

/** The reader (and its unzip) loads on first use: a one-time move-in should not weigh on every visit. */
const reader = () => import('../../../app/keep/keepImport');

const ACCEPT = '.zip,application/zip,application/x-zip-compressed,.json,.txt,image/*';

/** More lists than this, and their rows wait behind « Choisir une par une ». */
const LISTS_SHOWN = 4;

type Step =
  | { readonly kind: 'source'; readonly problem: string | null; readonly reading: boolean }
  | { readonly kind: 'preview' | 'choices' }
  | { readonly kind: 'importing'; readonly done: number; readonly total: number }
  | { readonly kind: 'done'; readonly report: KeepReport };

const SOURCE: Step = { kind: 'source', problem: null, reading: false };

export function KeepWizard({ embedded = false, onFlow, onImported }: ImportWizardProps) {
  const [step, setStep] = useState<Step>(SOURCE);
  const [prepared, setPrepared] = useState<PreparedImport | null>(null);
  const [choices, setChoices] = useState<KeepChoices | null>(null);
  const [choosing, setChoosing] = useState(false);
  /** When the archive was read: the preview's dates are said from it. */
  const [readAt, setReadAt] = useState(0);
  const reading = useCanRead();
  const server = useSettingsStore(selectServer);
  // The server's model, for what a link read costs: no figure until the server has said (as on the phone).
  const model = useServerSettingsStore(selectServerSettings)?.analysis.model ?? null;
  const costEach = model ? CLAUDE_COST_PER_LINK[model] : null;
  // Whether a note or a link with this id is in this browser's library, live or deleted (an earlier import's):
  // read from the store, so the preview is planned again when a sync brings one.
  const notes = useLibraryStore(s => s.notes);
  const links = useLibraryStore(s => s.links);
  const known = useCallback((type: 'note' | 'link', id: string): boolean => (type === 'note' ? notes[id] : links[id]) !== undefined, [notes, links]);

  const plan = prepared?.plan ?? null;
  const entries = useMemo(() => (plan && choices ? keepPreview(plan, { known, reading, now: readAt }, choices) : []), [plan, choices, known, reading, readAt]);
  const already = useMemo(() => (plan ? alreadyImported(plan, known) : 0), [plan, known]);
  const problems = useMemo(() => (plan && choices ? strayProblems(plan, choices) : {}), [plan, choices]);
  const form = useForm<string>(problems);

  const take = async (files: readonly File[]): Promise<void> => {
    if (files.length === 0) return;
    setStep({ kind: 'source', problem: null, reading: true });
    const { KeepImportError, readKeepArchive } = await reader();
    try {
      const read = await readKeepArchive(files);
      setPrepared(read);
      setChoices(defaultKeepChoices(read.plan));
      setChoosing(false);
      setReadAt(Date.now());
      form.reset();
      setStep({ kind: 'preview' });
      onFlow?.(true);
    } catch (error) {
      setStep({ kind: 'source', problem: error instanceof KeepImportError ? error.message : KEEP_WIZARD_WORDS.unreadableArchive, reading: false });
    }
  };

  /** Back to the start, the archive read set aside. */
  const toSource = (): void => {
    setPrepared(null);
    setChoices(null);
    setStep(SOURCE);
    onFlow?.(false);
  };

  const choose = (patch: Partial<KeepChoices>): void => setChoices(current => (current ? { ...current, ...patch } : current));

  const run = async (): Promise<void> => {
    if (!prepared || !choices) return;
    setStep({ kind: 'importing', done: 0, total: 0 });
    const { runKeepImport } = await reader();
    // Planned again inside: the library may have changed since the preview.
    const report = await runKeepImport(prepared, choices, (done, total) => setStep({ kind: 'importing', done, total }));
    setPrepared(null);
    setStep({ kind: 'done', report });
    if (keepImportWrote(report)) onImported?.();
    onFlow?.(false);
  };

  const back = (to: () => void) => (
    <Button kind="text" icon="back" onClick={to}>
      {t('Back')}
    </Button>
  );

  if (step.kind === 'source') {
    return (
      <ImportFrame step="source" embedded={embedded} title={KEEP_WIZARD_WORDS.sourceTitle} lead={KEEP_WIZARD_WORDS.sourceLead}>
        <ImportSheet label={KEEP_WIZARD_WORDS.sourceTitle}>
          <div className={settings.block}>
            <ImportInstructions steps={[t('Open takeout.google.com and sign in.'), KEEP_WIZARD_WORDS.takeoutDeselect, KEEP_WIZARD_WORDS.takeoutDrop]} />
            <ImportDrop
              label={t('Drop the Takeout archive (.zip)')}
              meta={tc('f', 'or click to choose it')}
              accept={ACCEPT}
              multiple
              reading={step.reading}
              readingLabel={t('Reading the archive…')}
              inputLabel={t('Google Takeout archive')}
              onFiles={files => void take(files)}
            />
            {/* An archive refused says why under the drop zone, as a form's own line. */}
            <FormMessage form={{ message: step.problem, problems: 0 }} />
            <p className="t-meta">{`${KEEP_WIZARD_WORDS.keeps} ${server ? IMPORT_WORDS.private : IMPORT_WORDS.privateLocal}`}</p>
          </div>
        </ImportSheet>
      </ImportFrame>
    );
  }

  if (step.kind === 'importing') {
    return (
      <ImportFrame step="import" embedded={embedded} title={IMPORT_WORDS.importingTitle} lead={IMPORT_WORDS.importingLead}>
        {step.total > 0 ? <ImportProgress label={importFilesProgress(step.done, step.total)} done={step.done} total={step.total} /> : <ImportProgress label={KEEP_WIZARD_WORDS.writing} />}
      </ImportFrame>
    );
  }

  if (step.kind === 'done') {
    const lines = keepReportLines(step.report);
    return (
      <ImportFrame step="import" embedded={embedded} title={keepDoneTitle(step.report)}>
        <ImportReport imported={lines.imported} skipped={lines.skipped}>
          <div className={settings.buttons}>
            {/* In the first run, the setup's own foot leads on: no way out of it here. */}
            {embedded ? null : <Button onClick={() => navigate(paths.board)}>{KEEP_WIZARD_WORDS.board}</Button>}
            <Button kind={embedded ? 'tonal' : 'text'} icon="download" onClick={toSource}>
              {IMPORT_WORDS.another}
            </Button>
          </div>
        </ImportReport>
      </ImportFrame>
    );
  }

  if (!plan || !choices) return null;
  const left = choices.left ?? new Set<string>();

  if (step.kind === 'preview') {
    return (
      <ImportFrame
        step="preview"
        embedded={embedded}
        title={IMPORT_WORDS.previewTitle}
        lead={IMPORT_WORDS.previewLead}
        back={back(toSource)}
        forward={<Button onClick={() => setStep({ kind: 'choices' })}>{t('Continue')}</Button>}
      >
        <ImportSheet label={KEEP_WIZARD_WORDS.previewLabel}>
          <div className={settings.block}>
            <ImportCounts lines={keepCountLines(plan, already)} />
          </div>
        </ImportSheet>
        <ImportPreview
          entries={entries}
          label={KEEP_WIZARD_WORDS.previewLabel}
          choice={{
            isOn: entry => !left.has(entry.key),
            can: canLeaveOut,
            toggle: entry => {
              const next = new Set(left);
              if (next.has(entry.key)) next.delete(entry.key);
              else next.add(entry.key);
              choose({ left: next });
            },
          }}
        />
      </ImportFrame>
    );
  }

  // The choices: only what this archive asks, each with its default and what it costs.
  // Only what comes in asks anything: not a note here already, left out by its box, or archived and left aside.
  const comes = (note: ImportedNote): boolean => keepNoteComes(note, known, choices);
  const singles = singleLinkNotes(plan).filter(comes).length;
  const lists = linkListNotes(plan).filter(comes);
  const chosenLists = lists.filter(note => choices.collections.has(note.source));
  const withStrays = chosenLists.filter(note => note.strays.length > 0);
  const archived = archivedCount(plan, known, choices);
  const toRead = keepLinksToRead(plan, known, choices);
  const count = keepImportCount(plan, known, choices);
  const singlesWords = keepSinglesWords(singles, reading, costEach);
  const listsWords = keepListsWords(lists.length, toRead.lists, reading, costEach);
  const archive = archivedChoiceWords(archived);
  const strays = choices.strays ?? new Map<string, StrayChoice>();
  const strayKind = (note: ImportedNote, stray: KeepStray): StrayChoiceKind => strays.get(strayKey(note, stray))?.kind ?? 'comment';
  const setStray = (note: ImportedNote, stray: KeepStray, choice: StrayChoice): void => {
    const next = new Map(strays);
    next.set(strayKey(note, stray), choice);
    choose({ strays: next });
  };
  const toggleList = (note: ImportedNote): void => {
    const next = new Set(choices.collections);
    if (next.has(note.source)) next.delete(note.source);
    else next.add(note.source);
    choose({ collections: next });
  };
  const labels = strayChoiceLabels();
  const showLists = choosing || lists.length <= LISTS_SHOWN;

  return (
    <ImportFrame
      step="choices"
      embedded={embedded}
      title={IMPORT_WORDS.choicesTitle}
      lead={IMPORT_WORDS.choicesLead}
      back={back(() => setStep({ kind: 'preview' }))}
      forward={
        <Button icon="download" busy={form.busy} onClick={() => void form.submit(run)}>
          {keepImportAction(count)}
        </Button>
      }
    >
      {singles > 0 || lists.length > 0 ? (
        <ImportSheet title={KEEP_WIZARD_WORDS.linksTitle}>
          {singles > 0 ? <ChoiceSwitch title={singlesWords.title} meta={singlesWords.meta} checked={choices.singleLinks} onChange={singleLinks => choose({ singleLinks })} /> : null}
          {lists.length > 0 ? (
            <ChoiceSwitch
              title={listsWords.title}
              meta={listsWords.meta}
              checked={chosenLists.length === lists.length}
              onChange={all => choose({ collections: new Set(all ? [...choices.collections, ...lists.map(note => note.source)] : [...choices.collections].filter(source => !lists.some(note => note.source === source))) })}
            />
          ) : null}
          {lists.length > 0 && showLists ? (
            <ul className={styles.lists} aria-label={KEEP_WIZARD_WORDS.linksTitle}>
              {lists.map(note => (
                <li key={note.key} className={settings.row}>
                  <span className={styles.box}>
                    <Checkbox checked={choices.collections.has(note.source)} onToggle={() => toggleList(note)} label={keepListBoxLabel(note)} />
                  </span>
                  <span className={settings.rowText}>
                    <span className="t-body">{keepNoteName(note)}</span>
                    <span className="t-meta tabular">{keepListLine(note, choices.collections.has(note.source), strays)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {lists.length > LISTS_SHOWN ? (
            <div className={styles.more}>
              <Button kind="text" small onClick={() => setChoosing(open => !open)}>
                {choosing ? t('Hide the list') : t('Choose one by one')}
              </Button>
            </div>
          ) : null}
        </ImportSheet>
      ) : null}

      {withStrays.length > 0 ? (
        <ImportSheet title={KEEP_WIZARD_WORDS.straysTitle}>
          <p className={`${settings.help} t-meta`}>{KEEP_WIZARD_WORDS.straysLead}</p>
          {withStrays.map(note => (
            <section key={note.key} className={styles.strayList} aria-label={keepNoteName(note)}>
              <h4 className="t-body-strong">{keepNoteName(note)}</h4>
              {note.strays.map(stray => {
                const key = strayKey(note, stray);
                const kind = strayKind(note, stray);
                const chosen = strays.get(key);
                return (
                  <div key={key} className={styles.stray}>
                    <p className={`${styles.strayText} t-body`}>{stray.text}</p>
                    <Segmented
                      label={strayChoiceName(stray)}
                      value={kind}
                      options={STRAY_CHOICES.map(value => ({ value, label: labels[value] }))}
                      onChange={value => setStray(note, stray, value === 'link' ? { kind: 'link', url: chosen?.kind === 'link' ? chosen.url : '' } : { kind: value })}
                    />
                    {kind === 'link' ? (
                      <TextField
                        label={KEEP_WIZARD_WORDS.strayUrl}
                        kind="url"
                        value={chosen?.kind === 'link' ? chosen.url : ''}
                        onChange={url => setStray(note, stray, { kind: 'link', url })}
                        field={form.field(key)}
                        help={strayChoiceMeta(note, stray, 'link')}
                      />
                    ) : (
                      <p className="t-meta">{strayChoiceMeta(note, stray, kind)}</p>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </ImportSheet>
      ) : null}

      {archived > 0 ? (
        <ImportSheet label={archive.title}>
          <ChoiceRadios<ArchivedChoice>
            title={archive.title}
            meta={archive.meta}
            value={choices.archived ?? ARCHIVED_CHOICES[0]}
            options={archive.options}
            onChange={value => choose({ archived: value })}
          />
        </ImportSheet>
      ) : null}

      {singles === 0 && lists.length === 0 && archived === 0 ? (
        <ImportSheet label={IMPORT_WORDS.choicesTitle}>
          <div className={settings.block}>
            <EmptyLine size="body" text={KEEP_WIZARD_WORDS.nothingToChoose} />
          </div>
        </ImportSheet>
      ) : null}
      <FormMessage form={form} />
    </ImportFrame>
  );
}
