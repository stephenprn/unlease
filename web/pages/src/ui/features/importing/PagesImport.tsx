/**
 * Pages' import (`AppModule.importer`, the shell's `/pages/settings/import` and the first run's
 * step), the four steps every app shares (`core/services/importFlow`):
 *
 * 1. Source: Notion's « Markdown & CSV » export (its steps; its HTML export dropped beside it for
 *    the pages' icons), or Markdown from anywhere (a folder
 *    chosen whole, an Obsidian vault; `.md` files; a folder compressed); the zone takes them, read
 *    in this browser (`readExportFiles`), then as pages (`pages/services/importing`).
 * 2. Preview: what the export holds, counted, then every page in the tree's order, its place in it,
 *    what it holds and what becomes of it (new, or here already when imported again), each left out
 *    by its box (its sub-pages with it), then what is left out and why.
 * 3. Choices: where the pages go (a new page of their own, named after the export; the top of the
 *    tree; a page already here), and, when Pages asks Claude, kept out of Claude's reach.
 * 4. Import: planned again against the pages as they are now, written as one batch, then their
 *    pictures and files attached one by one, counted; the report, « Ouvrir les pages », and the
 *    slip's « Annuler », which takes the whole import back.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { importFilesProgress, IMPORT_WORDS, type ImportStep, type PreviewEntry } from '@unlease/core/services/importFlow';
import { plural } from '@unlease/core/services/format';
import { UNTITLED_PAGE } from '@unlease/pages/models/blocks';
import { importContainerTitle, importCountLines, importReportLines, importSkippedLines, planImport, previewEntries, readExport, type ExportRead, type ImportChoices, type ImportPlacement, type ImportWritten } from '@unlease/pages/services/importing';
import { importPagesAction, insideMeta, notionSteps, PAGES_IMPORT_WORDS as WORDS, underNewMeta } from '@unlease/pages/services/importWords';

import { showUndo } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { Icon } from '@shared/ui/components/Icon';
import { TextField } from '@shared/ui/components/TextField';
import { ChoiceRadios, ChoiceSwitch, ImportCounts, ImportDrop, ImportFrame, ImportInstructions, ImportPreview, ImportProgress, ImportReport, ImportSheet } from '@shared/ui/features/importing/ImportFlow';
import settings from '@shared/ui/features/settings/settings.module.css';
import type { ImportWizardProps } from '@shared/modules';
import { navigate } from '@shared/ui/router';
import { readExportFiles, type ReadExport } from '../../../app/importing/exportFiles';
import { attachImportedFile, fileRefusal } from '../../../app/media/blockFiles';
import { usePagesAskSettings } from '../../../app/pagesAsk';
import { useBlocksStore } from '../../../app/store/blocks';
import { importPages, undoImport } from '../../../app/store/pages';
import { paths } from '../../routes';
import { MovePageDialog } from '../pages/MovePageDialog';
import styles from './pagesImport.module.css';

/** Ids for a plan only shown: the one written is planned again, with real ones. */
const shownIds = (): (() => string) => {
  let n = 0;
  return () => `shown-${(n += 1)}`;
};

const NO_EXCLUDE = (): boolean => false;

interface Report {
  readonly imported: readonly string[];
  readonly skipped: readonly string[];
  readonly opened: string | null;
}

export function PagesImport({ embedded = false, onFlow, onImported }: ImportWizardProps) {
  const blocks = useBlocksStore(s => s.blocks);
  const blocksByParent = useBlocksStore(s => s.blocksByParent);
  const ask = usePagesAskSettings() !== null;
  const [step, setStep] = useState<ImportStep>('source');
  const [reading, setReading] = useState(false);
  const [given, setGiven] = useState<ReadExport | null>(null);
  const [read, setRead] = useState<ExportRead | null>(null);
  const [refused, setRefused] = useState<ReadExport['refused']>([]);
  const [choices, setChoices] = useState<ImportChoices | null>(null);
  const [picking, setPicking] = useState(false);
  const [progress, setProgress] = useState<{ readonly done: number; readonly total: number } | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  // The import taken back while its files were still being attached: the rest are not.
  const undone = useRef(false);
  const folder = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // A folder chosen whole: the attribute React does not know.
    folder.current?.setAttribute('webkitdirectory', '');
  }, [step]);

  const take = (files: readonly File[]): void => {
    if (files.length === 0) return;
    setReading(true);
    void readExportFiles(files)
      .then(found => {
        const next = readExport(found.files);
        setReading(false);
        if (Object.keys(next.pages).length === 0) {
          setRefused([...found.refused, ...(found.files.length > 0 ? [{ name: files.length === 1 ? files[0]!.name : plural(files.length, 'file'), why: WORDS.noPages }] : [])]);
          return;
        }
        setRefused(found.refused);
        setGiven(found);
        setRead(next);
        setChoices({ placement: 'new', containerTitle: importContainerTitle(next, Date.now()), insideId: null, private: false, off: new Set() });
        setReport(null);
        setStep('preview');
        onFlow?.(true);
      })
      .catch(() => {
        setReading(false);
        setRefused([{ name: files[0]!.name, why: WORDS.unreadable }]);
      });
  };

  const library = useMemo(() => ({ blocks, blocksByParent }), [blocks, blocksByParent]);
  const plan = useMemo(() => (read && choices ? planImport(read, choices, library, shownIds()) : null), [read, choices, library]);
  const entries = useMemo(() => (plan ? previewEntries(plan) : []), [plan]);
  const hasPages = useMemo(() => Object.values(blocks).some(block => block.kind === 'page' && block.deletedAt === null && block.trashedAt === null), [blocks]);

  const change = (patch: Partial<ImportChoices>): void => setChoices(current => (current ? { ...current, ...patch } : current));

  const restart = (): void => {
    setGiven(null);
    setRead(null);
    setChoices(null);
    setReport(null);
    setProgress(null);
    setRefused([]);
    setStep('source');
    onFlow?.(false);
  };

  const attach = async (written: ImportWritten, final: ReturnType<typeof planImport>, files: ReadExport): Promise<void> => {
    const failed: { name: string; why: string }[] = [];
    let attached = 0;
    setProgress({ done: 0, total: written.files.length });
    for (const [index, job] of written.files.entries()) {
      if (undone.current) break;
      // The read took the folders everything sat in off every path; the bytes keep the export's own (`ExportAsset.source`).
      const data = files.bytes.get(job.asset.source);
      const outcome = data ? await attachImportedFile(job.blockId, data, job.asset.name, job.asset.mime) : 'empty';
      if (outcome === 'ok') attached += 1;
      else failed.push({ name: job.asset.name, why: fileRefusal(outcome, job.asset.kind === 'image') });
      setProgress({ done: index + 1, total: written.files.length });
    }
    setReport({ imported: importReportLines(written, attached, final.totals.tables), skipped: importSkippedLines(final, failed), opened: written.opened });
    onFlow?.(false);
  };

  const write = (): void => {
    if (!read || !choices || !given) return;
    setStep('import');
    undone.current = false;
    // A frame for the progress, then the batch, planned against the pages as they are now.
    window.setTimeout(() => {
      // A name emptied: the export's own again.
      const final = planImport(read, { ...choices, containerTitle: choices.containerTitle.trim() || importContainerTitle(read, Date.now()) }, useBlocksStore.getState());
      const written = importPages(final);
      if (written.created.length > 0) {
        showUndo(plural(written.pages, 'page imported', 'pages imported'), () => {
          undone.current = true;
          undoImport(written.created, written.iconed);
        });
        onImported?.();
      }
      void attach(written, final, given);
    }, 0);
  };

  if (step === 'source' || !read || !choices || !plan) {
    return (
      <ImportFrame step="source" embedded={embedded} title={WORDS.title} lead={WORDS.lead}>
        <ImportSheet title={WORDS.fromNotion}>
          <div className={settings.block}>
            <ImportInstructions steps={notionSteps()} />
          </div>
        </ImportSheet>
        <ImportSheet title={WORDS.fromMarkdown}>
          <div className={settings.block}>
            <p className="t-body">{t('Choose the folder of your notes, an Obsidian vault for example: its sub-folders become sub-pages, its pictures come along. A few .md files, or a folder compressed as a .zip, can be dropped too.')}</p>
            <div className={settings.buttons}>
              <Button kind="outlined" icon="upload" disabled={reading} onClick={() => folder.current?.click()}>
                {t('Choose a folder')}
              </Button>
            </div>
          </div>
        </ImportSheet>
        <ImportSheet label={t('The files to import')}>
          <div className={settings.block}>
            <ImportDrop
              label={t('Drop the .zip export or .md files')}
              meta={t('or click to choose them')}
              accept=".zip,.md,.markdown,.txt,.csv,application/zip,text/markdown,text/plain,text/csv"
              multiple
              reading={reading}
              readingLabel={t('Reading the pages…')}
              inputLabel={t('Notion export or Markdown files')}
              onFiles={take}
            />
            {refused.length > 0 ? (
              <div className={styles.problem} role="alert">
                <Icon name="alert" size={20} />
                <span className={styles.problemText}>
                  {refused.map(file => (
                    <span key={file.name} className="t-body">
                      {t('{file}: {why}', { file: file.name, why: file.why })}
                    </span>
                  ))}
                </span>
              </div>
            ) : null}
            <p className="t-meta">{IMPORT_WORDS.private}</p>
          </div>
        </ImportSheet>
        <input
          ref={folder}
          type="file"
          multiple
          hidden
          aria-label={t('Folder of notes')}
          onChange={event => {
            const files = [...(event.target.files ?? [])];
            event.target.value = '';
            take(files);
          }}
        />
      </ImportFrame>
    );
  }

  if (step === 'preview') {
    const lines = importCountLines(plan);
    const offAbove = new Set(plan.pages.filter(page => page.offAbove).map(page => page.key));
    const pageKeys = new Set(plan.pages.map(page => page.key));
    return (
      <ImportFrame
        step="preview"
        embedded={embedded}
        title={IMPORT_WORDS.previewTitle}
        lead={WORDS.previewLead}
        back={
          <Button kind="text" onClick={restart}>
            {t('Back')}
          </Button>
        }
        forward={<Button onClick={() => setStep('choices')}>{t('Continue')}</Button>}
      >
        <ImportSheet label={IMPORT_WORDS.previewTitle}>
          <div className={settings.block}>
            <ImportCounts
              lines={[
                ...lines,
                ...(refused.length > 0 ? [{ icon: 'alert' as const, text: plural(refused.length, 'file set aside', 'files set aside'), meta: refused.map(file => t('{file}: {why}', { file: file.name, why: file.why })).join(' · ') }] : []),
              ]}
            />
            <p className="t-meta">{read.kind === 'notion' ? WORDS.readNotion : WORDS.readMarkdown}</p>
          </div>
        </ImportSheet>
        <ImportPreview
          entries={entries}
          label={WORDS.pages}
          choice={{
            isOn: (entry: PreviewEntry) => !choices.off.has(entry.key) && !offAbove.has(entry.key),
            can: (entry: PreviewEntry) => pageKeys.has(entry.key) && !offAbove.has(entry.key),
            toggle: (entry: PreviewEntry) => {
              const off = new Set(choices.off);
              if (off.has(entry.key)) off.delete(entry.key);
              else off.add(entry.key);
              change({ off });
            },
          }}
        />
      </ImportFrame>
    );
  }

  if (step === 'choices') {
    const inside = choices.insideId ? blocks[choices.insideId] : undefined;
    const insideTitle = inside ? `${inside.icon ? `${inside.icon} ` : ''}${inside.text.trim() || t(UNTITLED_PAGE)}` : null;
    const count = plan.totals.pages;
    const placements = [
      { value: 'new' as const, label: WORDS.underNew, meta: underNewMeta(choices.containerTitle.trim() || t(UNTITLED_PAGE)) },
      { value: 'top' as const, label: WORDS.top, meta: WORDS.topMeta },
      ...(hasPages ? [{ value: 'inside' as const, label: WORDS.inside, meta: insideMeta(insideTitle) }] : []),
    ];
    return (
      <ImportFrame
        step="choices"
        embedded={embedded}
        title={IMPORT_WORDS.choicesTitle}
        lead={IMPORT_WORDS.choicesLead}
        back={
          <Button kind="text" onClick={() => setStep('preview')}>
            {t('Back')}
          </Button>
        }
        forward={
          <Button icon="download" onClick={write}>
            {importPagesAction(count)}
          </Button>
        }
      >
        <ImportSheet label={WORDS.where}>
          <ChoiceRadios<ImportPlacement>
            title={WORDS.where}
            meta={WORDS.whereMeta}
            value={choices.placement}
            options={placements}
            onChange={placement => {
              change({ placement });
              if (placement === 'inside' && !choices.insideId) setPicking(true);
            }}
          />
          {choices.placement === 'new' ? (
            <div className={settings.block}>
              <TextField label={WORDS.containerName} value={choices.containerTitle} maxLength={500} onChange={containerTitle => change({ containerTitle })} />
            </div>
          ) : null}
          {choices.placement === 'inside' ? (
            <div className={`${settings.block} ${styles.inside}`}>
              <Button kind="outlined" icon="page" onClick={() => setPicking(true)}>
                {insideTitle ? WORDS.change : WORDS.pick}
              </Button>
            </div>
          ) : null}
        </ImportSheet>
        {ask ? (
          <ImportSheet label={t('Claude')}>
            <ChoiceSwitch title={WORDS.keep} meta={WORDS.keepMeta} checked={choices.private} onChange={kept => change({ private: kept })} />
          </ImportSheet>
        ) : null}
        <MovePageDialog
          open={picking}
          title={WORDS.pickTitle}
          current={choices.insideId}
          exclude={NO_EXCLUDE}
          onDismiss={() => {
            setPicking(false);
            if (!choices.insideId) change({ placement: 'new' });
          }}
          onPick={id => change({ placement: 'inside', insideId: id })}
        />
      </ImportFrame>
    );
  }

  return (
    <ImportFrame step="import" embedded={embedded} title={report ? IMPORT_WORDS.doneTitle : IMPORT_WORDS.importingTitle} lead={report ? WORDS.doneLead : IMPORT_WORDS.importingLead}>
      {report ? (
        <ImportReport imported={report.imported} skipped={report.skipped}>
          <div className={styles.actions}>
            {embedded || !report.opened ? null : <Button onClick={() => navigate(paths.page(report.opened!))}>{WORDS.open}</Button>}
            <Button kind="text" icon="download" onClick={restart}>
              {IMPORT_WORDS.another}
            </Button>
          </div>
        </ImportReport>
      ) : progress && progress.total > 0 ? (
        <ImportProgress label={importFilesProgress(progress.done, progress.total)} done={progress.done} total={progress.total} />
      ) : (
        <ImportProgress label={WORDS.writing} />
      )}
    </ImportFrame>
  );
}
