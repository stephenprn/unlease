/**
 * Pages' import on the phone (the web's `PagesImport`), the four steps every app shares
 * (`core/services/importFlow`), the screen's whole body under its top bar (`ImportScreen`) or a step
 * of the first run (`ImportHost`):
 *
 * 1. Source: Markdown files, one picked at a time (more added from the preview), read as pages
 *    (`pages/services/importing`). Notion's export is a .zip, which the phone does not open yet: the
 *    web app imports it, and the source says so.
 * 2. Preview: what the files hold, counted, then every page with what it holds and what becomes of
 *    it (new, or here already when imported again), each left out by its box, then what is left out
 *    and why.
 * 3. Choices: where the pages go (a new page of their own, the top of the tree, a page already
 *    here), and, when Pages asks Claude, kept out of Claude's reach.
 * 4. Import: planned again against the pages as they are now, written as one batch; the report,
 *    « Ouvrir les pages », and the slip's « Annuler », which takes the whole import back.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { IMPORT_WORDS, type ImportStep, type PreviewEntry } from '@unlease/core/services/importFlow';
import { UNTITLED_PAGE } from '@unlease/pages/models/blocks';
import { importContainerTitle, importCountLines, importReportLines, importSkippedLines, isExportArchive, isExportText, planImport, previewEntries, readExport, type ExportFile, type ImportChoices, type ImportPlacement } from '@unlease/pages/services/importing';
import { importPagesAction, insideMeta, PAGES_IMPORT_WORDS as WORDS, underNewMeta } from '@unlease/pages/services/importWords';
import { movePlaces, type MovePlace } from '@unlease/pages/services/recentPages';
import { usePagesAskSettings } from '@app/pagesAsk';
import { useLibraryStore } from '@app/store/libraryStore';
import { importPages, undoImport } from '@app/store/pages';
import { showSnack } from '@shared/app/store/uiStore';
import { pickDocument } from '@shared/platform/documents';
import { readText, removePath } from '@shared/platform/media';

import { AppText, Button, EmptyLine, Icon, Sheet, SHEET_INSET, SheetScroll, TextField } from '@shared/ui/components';
import { ChoiceRadios, ChoiceSwitch, ImportBlock, ImportCounts, ImportFrame, ImportPreview, ImportProgress, ImportReport, ImportSheet, useImportHost, type ImportWizardProps } from '@shared/ui/features/importing/ImportFlow';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { RootStackParamList } from '../../navigation/types';
import { PageChoice } from '../pages/PageSheets';

/** Ids for a plan only shown: the one written is planned again, with real ones. */
const shownIds = (): (() => string) => {
  let n = 0;
  return () => `shown-${(n += 1)}`;
};

/** What the system's picker offers: Markdown is typed many ways (or not at all) by file managers. */
const PICKED_TYPES = ['text/*', 'application/octet-stream'];

interface Report {
  readonly imported: readonly string[];
  readonly skipped: readonly string[];
  readonly opened: string | null;
}

/** A Markdown or CSV file picked, read, its copy removed; or why not. */
async function pickExportFile(): Promise<{ readonly file: ExportFile } | { readonly problem: string } | null> {
  const picked = await pickDocument(PICKED_TYPES);
  if (picked.status === 'cancelled') return null;
  if (picked.status !== 'ok' || !picked.path) return { problem: picked.message ? t(picked.message) : t('Unreadable file') };
  try {
    if (isExportArchive(picked.name)) return { problem: t('A .zip archive, like Notion’s export, imports from Pages on the web for now.') };
    if (!isExportText(picked.name)) return { problem: t('Neither a Markdown file nor a CSV table.') };
    const text = await readText(picked.path);
    return { file: { path: picked.name, text, bytes: picked.bytes } };
  } catch {
    return { problem: t('Unreadable file') };
  } finally {
    await removePath(picked.path);
  }
}

export function PagesImport({ onFlow, onImported }: ImportWizardProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { embedded } = useImportHost();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const blocks = useLibraryStore(s => s.blocks);
  const blocksByParent = useLibraryStore(s => s.blocksByParent);
  const ask = usePagesAskSettings() !== null;
  const [step, setStep] = useState<ImportStep>('source');
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [files, setFiles] = useState<readonly ExportFile[] | null>(null);
  const [choices, setChoices] = useState<ImportChoices | null>(null);
  const [picking, setPicking] = useState(false);
  const [report, setReport] = useState<Report | null>(null);

  const read = useMemo(() => (files ? readExport(files) : null), [files]);
  const library = useMemo(() => ({ blocks, blocksByParent }), [blocks, blocksByParent]);
  const plan = useMemo(() => (read && choices ? planImport(read, choices, library, shownIds()) : null), [read, choices, library]);
  const entries = useMemo(() => (plan ? previewEntries(plan) : []), [plan]);
  const hasPages = useMemo(() => Object.values(blocks).some(block => block.kind === 'page' && block.deletedAt === null && block.trashedAt === null), [blocks]);

  const change = (patch: Partial<ImportChoices>): void => setChoices(current => (current ? { ...current, ...patch } : current));

  /** A file picked: the first opens the preview, more join it (a file of the same name replaced). */
  const pick = async (adding: boolean): Promise<void> => {
    setReading(true);
    const got = await pickExportFile();
    setReading(false);
    if (!got) return;
    if ('problem' in got) {
      if (adding) showSnack(got.problem, undefined, { tone: 'error' });
      else setProblem(got.problem);
      return;
    }
    const all = [...(adding ? (files ?? []) : []).filter(file => file.path !== got.file.path), got.file];
    if (Object.keys(readExport(all).pages).length === 0) {
      if (adding) showSnack(WORDS.noPages, undefined, { tone: 'warning' });
      else setProblem(t('{file}: {why}', { file: got.file.path, why: WORDS.noPages }));
      return;
    }
    setProblem(null);
    setFiles(all);
    setChoices(current => (adding && current ? current : { placement: 'new', containerTitle: importContainerTitle(readExport(all), Date.now()), insideId: null, private: false, off: new Set() }));
    setReport(null);
    setStep('preview');
    onFlow?.(true);
  };

  const restart = useCallback((): void => {
    setFiles(null);
    setChoices(null);
    setReport(null);
    setProblem(null);
    setStep('source');
    onFlow?.(false);
  }, [onFlow]);
  const toPreview = useCallback(() => setStep('preview'), []);

  const write = (): void => {
    if (!read || !choices) return;
    setStep('import');
    // A frame for the progress, then the batch, planned against the pages as they are now.
    setTimeout(() => {
      // A name emptied: the export's own again.
      const final = planImport(read, { ...choices, containerTitle: choices.containerTitle.trim() || importContainerTitle(read, Date.now()) }, useLibraryStore.getState());
      const written = importPages(final);
      if (written.created.length > 0) {
        showSnack(plural(written.pages, 'page imported', 'pages imported'), { label: t('Undo'), run: () => undoImport(written.created, written.iconed) }, { tone: 'success' });
        onImported?.();
      }
      // The phone reads words alone: a picture or a file a page names stays an empty place, said why.
      setReport({ imported: importReportLines(written, 0, final.totals.tables), skipped: importSkippedLines(final, []), opened: written.opened });
      onFlow?.(false);
    }, 16);
  };

  if (step === 'source' || !read || !choices || !plan) {
    return (
      <ImportFrame step="source" title={WORDS.title} lead={WORDS.lead}>
        <ImportSheet title={WORDS.fromMarkdown}>
          <ImportBlock>
            <AppText variant="body">{t('Choose a .md file: it becomes a page, its tasks, tables and links included. More can be added at the next step.')}</AppText>
            <Button label={t('Choose a Markdown file')} icon="download" busy={reading} onPress={() => void pick(false)} />
            {problem ? (
              <View style={styles.problem} accessibilityLiveRegion="polite">
                <Icon name="alert" size={20} color={theme.color.danger} />
                <AppText variant="body" color={theme.color.danger} style={styles.flex}>
                  {problem}
                </AppText>
              </View>
            ) : null}
            <AppText variant="meta">{IMPORT_WORDS.private}</AppText>
          </ImportBlock>
        </ImportSheet>
        <ImportSheet title={WORDS.fromNotion}>
          <ImportBlock>
            <AppText variant="body">{t('Notion’s export is a .zip archive, with its sub-pages and pictures: import it from Pages on the web, in Settings › Data › Import. The pages then arrive here by themselves.')}</AppText>
          </ImportBlock>
        </ImportSheet>
      </ImportFrame>
    );
  }

  if (step === 'preview') {
    const offAbove = new Set(plan.pages.filter(page => page.offAbove).map(page => page.key));
    const pageKeys = new Set(plan.pages.map(page => page.key));
    return (
      <ImportFrame
        step="preview"
        title={IMPORT_WORDS.previewTitle}
        lead={WORDS.previewLead}
        onBack={restart}
        back={<Button kind="text" label={t('Back')} onPress={restart} />}
        forward={<Button label={t('Continue')} onPress={() => setStep('choices')} />}
      >
        <ImportSheet>
          <ImportCounts lines={importCountLines(plan)} />
          <View style={styles.more}>
            <Button kind="text" small icon="plus" label={t('Add a file')} busy={reading} onPress={() => void pick(true)} />
          </View>
        </ImportSheet>
        <ImportPreview
          entries={entries}
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
    const placements = [
      { value: 'new' as const, label: WORDS.underNew, meta: underNewMeta(choices.containerTitle.trim() || t(UNTITLED_PAGE)) },
      { value: 'top' as const, label: WORDS.top, meta: WORDS.topMeta },
      ...(hasPages ? [{ value: 'inside' as const, label: WORDS.inside, meta: insideMeta(insideTitle) }] : []),
    ];
    return (
      <>
        <ImportFrame
          step="choices"
          title={IMPORT_WORDS.choicesTitle}
          lead={IMPORT_WORDS.choicesLead}
          onBack={toPreview}
          back={<Button kind="text" label={t('Back')} onPress={toPreview} />}
          forward={<Button icon="download" label={importPagesAction(plan.totals.pages)} onPress={write} />}
        >
          <ImportSheet>
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
              <View style={styles.fields}>
                <TextField label={WORDS.containerName} value={choices.containerTitle} maxLength={500} onChangeText={containerTitle => change({ containerTitle })} />
              </View>
            ) : null}
            {choices.placement === 'inside' ? (
              <View style={styles.more}>
                <Button kind="text" small icon="page" label={insideTitle ? WORDS.change : WORDS.pick} onPress={() => setPicking(true)} />
              </View>
            ) : null}
          </ImportSheet>
          {ask ? (
            <ImportSheet>
              <ChoiceSwitch title={WORDS.keep} meta={WORDS.keepMeta} checked={choices.private} onChange={kept => change({ private: kept })} />
            </ImportSheet>
          ) : null}
        </ImportFrame>
        <PagePickSheet
          visible={picking}
          current={choices.insideId}
          onDismiss={() => {
            setPicking(false);
            if (!choices.insideId) change({ placement: 'new' });
          }}
          onPick={id => {
            setPicking(false);
            change({ placement: 'inside', insideId: id });
          }}
        />
      </>
    );
  }

  return (
    <ImportFrame step="import" title={report ? IMPORT_WORDS.doneTitle : IMPORT_WORDS.importingTitle} lead={report ? WORDS.doneLead : IMPORT_WORDS.importingLead}>
      {report ? (
        <ImportReport imported={report.imported} skipped={report.skipped}>
          <View style={styles.actions}>
            {embedded || !report.opened ? null : <Button label={WORDS.open} onPress={() => navigation.navigate('Page', { id: report.opened! })} />}
            <Button kind="text" icon="download" label={IMPORT_WORDS.another} onPress={restart} />
          </View>
        </ImportReport>
      ) : (
        <ImportProgress label={WORDS.writing} />
      )}
    </ImportFrame>
  );
}

/** « Importer dans »: every page out of the bin by its icon and title, as « Déplacer vers » lists them, the one chosen ticked. */
function PagePickSheet({ visible, current, onDismiss, onPick }: { visible: boolean; current: string | null; onDismiss: () => void; onPick: (id: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);
  const blocks = useLibraryStore(s => s.blocks);
  const children = useLibraryStore(s => s.blocksByParent);
  const { recent, all } = useMemo(() => (visible ? movePlaces(blocks, children, { query, exclude: () => false, current, untitled: t(UNTITLED_PAGE) }) : { recent: [], all: [] }), [visible, blocks, children, query, current]);
  const choice = ({ page, path }: MovePlace, key: string) => <PageChoice key={key} title={page.text.trim() || t(UNTITLED_PAGE)} icon={page.icon} path={path} here={page.id === current} onPress={() => onPick(page.id)} />;
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={WORDS.pickTitle} tall>
      <View style={styles.search}>
        <TextField value={query} onChangeText={setQuery} placeholder={t('Search for a page')} accessibilityLabel={t('Search for a page')} />
      </View>
      <SheetScroll top={false} contentContainerStyle={styles.list}>
        {recent.length > 0 ? (
          <>
            <AppText variant="section" style={styles.section} accessibilityRole="header">
              {t('Recent')}
            </AppText>
            {recent.map(place => choice(place, `recent-${place.page.id}`))}
            <AppText variant="section" style={styles.section} accessibilityRole="header">
              {t('All pages')}
            </AppText>
          </>
        ) : null}
        {all.map(place => choice(place, place.page.id))}
        {all.length === 0 ? <EmptyLine text={t('No page matches.')} style={styles.empty} /> : null}
      </SheetScroll>
    </Sheet>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    flex: { flex: 1 },
    problem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    more: { flexDirection: 'row', paddingHorizontal: 10, paddingBottom: 8 },
    fields: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, gap: 14 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
    search: { paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
    list: { paddingBottom: 16 },
    section: { paddingHorizontal: SHEET_INSET, paddingTop: 14, paddingBottom: 4 },
    empty: { padding: 16 },
  });
