/**
 * Agenda's import on the phone (the web's `CalendarImport`), the four steps every app shares
 * (`core/services/importFlow`), the screen's whole body under its top bar (`ImportScreen`) or a step
 * of the first run (`ImportHost`):
 *
 * 1. Source: how to get Google Agenda's export (an `.ics` per calendar, out of its archive), and
 *    « Choisir un fichier .ics ». A file shared or opened with Agenda lands straight on the preview.
 * 2. Preview: the calendars and what they hold, counted (another calendar added from there), then
 *    every event sorted by date with what becomes of it, each new one left out by its box; the same
 *    file imported before offers « Retirer ces événements ».
 * 3. Choices: the period, a label per calendar, the calendars to leave out, the reminders; each
 *    changes the plan and its counts at once.
 * 4. Import: planned again against the agenda as it is now, one batch (labels, then events), then the
 *    report; its slip takes it all back.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { IMPORT_WORDS, type ImportStep, type PreviewEntry } from '@unlease/core/services/importFlow';
import { EVENT_LIMITS, TRASH_RETENTION_DAYS } from '@unlease/calendar/models/events';
import type { IcsCalendar } from '@unlease/calendar/services/ics';
import { defaultImportChoices, importedEvents, importFileName, importLabelNames, knownCalendar, periodCounts, planImport, type ImportChoices, type ImportFile, type ImportOptions, type ImportPeriod, type ImportReminders } from '@unlease/calendar/services/importing';
import { calendarMeta, importCounts, importEntries, importReport, labelHelp, periodOptions, reminderOptions } from '@unlease/calendar/services/importWords';
import { readCalendarFiles } from '@app/importing';
import { later } from '@app/later';
import { removeImported, undoImport, writeImport } from '@app/store/actions';
import { selectPrefs, useCalendarUiStore } from '@app/store/calendarUi';
import { setPendingImport, useImportStore } from '@app/store/importStore';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@shared/app/store/uiStore';
import { pickDocument } from '@shared/platform/documents';

import { AppText, Button, Dialog, Icon, TextField } from '@shared/ui/components';
import { ChoiceRadios, ChoiceSwitch, ImportBlock, ImportCounts, ImportFrame, ImportInstructions, ImportPreview, ImportProgress, ImportReport, ImportSheet, useImportHost, type ImportWizardProps } from '@shared/ui/features/importing/ImportFlow';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { RootStackParamList } from '../../navigation/types';

/** Ids for a plan only shown: the one written is planned again, with real ones. */
const shownIds = (): (() => string) => {
  let n = 0;
  return () => `shown-${(n += 1)}`;
};

/** The files' events as one calendar: what « Retirer ces événements » looks for. */
const together = (files: readonly ImportFile[]): IcsCalendar => ({ name: '', events: files.flatMap(file => file.calendar.events) });

export function CalendarImport({ onFlow, onImported }: ImportWizardProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { embedded } = useImportHost();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const pending = useImportStore(s => s.pending);
  const events = useLibraryStore(s => s.events);
  const labels = useLibraryStore(s => s.calendarLabels);
  const feeds = useLibraryStore(s => s.feeds);
  const prefs = useCalendarUiStore(selectPrefs);
  const [step, setStep] = useState<ImportStep>('source');
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [files, setFiles] = useState<readonly ImportFile[] | null>(null);
  const [choices, setChoices] = useState<ImportChoices | null>(null);
  const [report, setReport] = useState<{ readonly imported: string[]; readonly skipped: string[] } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  /** Calendars read: the first ones open the preview, more are added to it. */
  const open = useCallback(
    (read: readonly ImportFile[], adding: boolean): void => {
      setProblem(null);
      setNow(Date.now());
      const all = adding ? [...(files ?? []), ...read] : read;
      setFiles(all);
      setChoices(current => (adding && current ? { ...defaultImportChoices(all), period: current.period, reminders: current.reminders, leftOut: current.leftOut } : defaultImportChoices(all)));
      setReport(null);
      setStep('preview');
      onFlow?.(true);
    },
    [files, onFlow],
  );

  // A file shared or opened with Agenda: taken from the store, then on the preview.
  useEffect(() => {
    if (!pending) return;
    setPendingImport(null);
    void Promise.resolve(pending.files).then(read => open(read, false));
  }, [pending, open]);

  const pick = async (adding: boolean): Promise<void> => {
    const picked = await pickDocument(['text/calendar', 'text/x-vcalendar', 'application/octet-stream', '*/*']);
    if (picked.status !== 'ok' || !picked.path) {
      if (picked.status === 'error') setProblem(picked.message ? t(picked.message) : t('Unreadable file'));
      return;
    }
    setReading(true);
    const read = await readCalendarFiles([picked.path], [picked.name]);
    setReading(false);
    if (read.status === 'ok') open(read.files, adding);
    else if (adding) showSnack(read.status === 'empty' ? t('No events in this file.') : read.message, undefined, { tone: read.status === 'empty' ? 'warning' : 'error' });
    else setProblem(read.status === 'empty' ? t('No events in this file.') : read.message);
  };

  const defaults = useMemo(() => ({ timed: prefs.reminders, allDay: prefs.allDayReminders }), [prefs.reminders, prefs.allDayReminders]);
  const list = useMemo(() => Object.values(events), [events]);
  // What is shown and counted: the labels' names and the reminders change none of it, so typing a name plans nothing again.
  const period = choices?.period ?? 'all';
  const filesOff = choices?.filesOff ?? null;
  const leftOut = choices?.leftOut ?? null;
  const options: ImportOptions | null = useMemo(() => (filesOff && leftOut ? { period, filesOff, leftOut } : null), [period, filesOff, leftOut]);
  const plan = useMemo(() => (files && options ? planImport(files, list, now, shownIds(), options) : null), [files, options, list, now]);
  const context = useMemo(() => (files ? { files, now, twelveHours: prefs.twelveHours, period, feedName: (id: string) => feeds[id]?.name ?? null } : null), [files, now, prefs.twelveHours, period, feeds]);
  const entries = useMemo(() => (plan && context ? importEntries(plan, context) : []), [plan, context]);
  const imported = useMemo(() => (files ? importedEvents(together(files), list).length : 0), [files, list]);
  const counts = useMemo(() => (step === 'choices' && files && filesOff && leftOut ? periodCounts(files, list, now, { filesOff, leftOut }) : null), [step, files, filesOff, leftOut, list, now]);

  const change = (patch: Partial<ImportChoices>): void => setChoices(current => (current ? { ...current, ...patch } : current));

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
    if (!files || !choices) return;
    setStep('import');
    // A frame for the progress, then the batch, planned against the agenda as it is now.
    setTimeout(() => {
      const state = useLibraryStore.getState();
      const final = planImport(files, Object.values(state.events), Date.now(), undefined, { ...choices, labels: state.calendarLabels, defaults });
      const count = writeImport(final);
      setReport(importReport(final, { files, now, period: choices.period }, useLibraryStore.getState().calendarLabels));
      if (count > 0) {
        showSnack(t('{events} imported', { events: plural(count, 'event') }), { label: t('Undo'), run: () => undoImport(final) }, { tone: 'success' });
        onImported?.();
      }
      onFlow?.(false);
    }, 16);
  };

  const remove = (): void => {
    setRemoving(false);
    if (!files) return;
    const { count, undo } = removeImported(together(files));
    showSnack(plural(count, 'event moved to the bin', 'events moved to the bin'), { label: t('Undo'), run: undo }, { tone: 'success' });
    if (embedded) restart();
    else navigation.goBack();
  };

  if (step === 'source' || !files || !choices || !plan || !context) {
    return (
      <ImportFrame step="source" title={t('Your Google calendar')} lead={t('An .ics file, wherever it comes from: Google Calendar’s export, an Apple or Outlook calendar, an invitation.')}>
        <ImportSheet title={t('From Google Calendar')}>
          <ImportBlock>
            <ImportInstructions
              steps={[
                t('On a computer, open Google Calendar, then Settings › Import & export › Export.'),
                t('Google gives you a .zip archive: open it in the Files app, which brings out one .ics file per calendar.'),
                t('Choose a calendar’s .ics file here; you can add others at the next step.'),
              ]}
            />
            <Button label={t('Choose an .ics file')} icon="download" busy={reading} onPress={() => later(pick(false))} />
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
      </ImportFrame>
    );
  }

  if (step === 'preview') {
    return (
      <>
        <ImportFrame
          step="preview"
          title={IMPORT_WORDS.previewTitle}
          lead={IMPORT_WORDS.previewLead}
          onBack={restart}
          back={<Button kind="text" label={t('Back')} onPress={restart} />}
          forward={<Button label={t('Continue')} onPress={() => setStep('choices')} />}
        >
          <ImportSheet>
            <ImportCounts lines={importCounts(plan, context)} />
            <View style={styles.more}>
              <Button kind="text" small icon="plus" label={t('Add another calendar')} busy={reading} onPress={() => later(pick(true))} />
            </View>
          </ImportSheet>
          {imported > 0 ? (
            <ImportSheet title={t('Imported already')}>
              <ImportBlock>
                <AppText variant="body">{t('{events} from this file in your calendar', { events: plural(imported, 'event') })}</AppText>
                <AppText variant="meta">{t('To start afresh: remove them, then import the file again.')}</AppText>
                <View style={styles.start}>
                  <Button kind="dangerText" icon="trash" label={t('Remove these events')} onPress={() => setRemoving(true)} />
                </View>
              </ImportBlock>
            </ImportSheet>
          ) : null}
          <ImportPreview
            entries={entries}
            choice={{
              isOn: (entry: PreviewEntry) => !choices.leftOut.has(entry.key),
              can: (entry: PreviewEntry) => entry.fate === 'new' || entry.fate === 'update',
              toggle: (entry: PreviewEntry) => {
                const leftOut = new Set(choices.leftOut);
                if (leftOut.has(entry.key)) leftOut.delete(entry.key);
                else leftOut.add(entry.key);
                change({ leftOut });
              },
            }}
          />
        </ImportFrame>
        <Dialog
          visible={removing}
          title={t('Remove {events}?', { events: plural(imported, 'event') })}
          message={t('The events from this file that are in your calendar go to the bin, even those changed since. They stay there for {days} days.', { days: TRASH_RETENTION_DAYS })}
          confirmLabel={t('Remove')}
          danger
          onCancel={() => setRemoving(false)}
          onConfirm={remove}
        />
      </>
    );
  }

  if (step === 'choices') {
    const several = files.length > 1;
    const offered = files.map((_, index) => index).filter(index => !choices.filesOff.has(index));
    const showCalendars = several || files.some(file => knownCalendar(importFileName(file)) !== null);
    const labelNames = choices.labelNames;
    return (
      <ImportFrame
        step="choices"
        title={IMPORT_WORDS.choicesTitle}
        lead={IMPORT_WORDS.choicesLead}
        onBack={toPreview}
        back={<Button kind="text" label={t('Back')} onPress={toPreview} />}
        forward={<Button icon="download" label={plan.count > 0 ? t('Import {events}', { events: plural(plan.count, 'event') }) : t('Import')} onPress={write} />}
      >
        <ImportSheet>
          <ChoiceRadios<ImportPeriod> title={t('Period')} meta={t('A series that still repeats counts as upcoming, with its past dates.')} value={choices.period} options={counts ? periodOptions(counts, now) : []} onChange={period => change({ period })} />
        </ImportSheet>
        <ImportSheet>
          <ChoiceSwitch
            title={t('File under a label')}
            meta={several ? t('A label per calendar, at its name: to find, filter or remove its events at once.') : t('To find, filter or remove these events at once.')}
            checked={labelNames !== null}
            onChange={on => change({ labelNames: on ? importLabelNames(files) : null })}
          />
          {labelNames && offered.length > 0 ? (
            <View style={styles.fields}>
              {offered.map(index => (
                <TextField
                  key={index}
                  label={several ? t('Label for “{calendar}”', { calendar: importFileName(files[index]!) || t('Unnamed calendar') }) : t('Label name')}
                  value={labelNames[index] ?? ''}
                  maxLength={EVENT_LIMITS.labelName}
                  help={labelHelp(labelNames[index] ?? '', labels)}
                  onChangeText={value => change({ labelNames: labelNames.map((name, at) => (at === index ? value : name)) })}
                />
              ))}
            </View>
          ) : null}
        </ImportSheet>
        {showCalendars ? (
          <ImportSheet title={t('Calendars')}>
            {files.map((file, index) => (
              <ChoiceSwitch
                key={index}
                title={importFileName(file) || t('Unnamed calendar')}
                meta={calendarMeta(file, plan.items.filter(item => item.file === index && item.event !== null).length)}
                checked={!choices.filesOff.has(index)}
                onChange={on => {
                  const filesOff = new Set(choices.filesOff);
                  if (on) filesOff.delete(index);
                  else filesOff.add(index);
                  change({ filesOff });
                }}
              />
            ))}
          </ImportSheet>
        ) : null}
        <ImportSheet>
          <ChoiceRadios<ImportReminders> title={t('Reminders')} value={choices.reminders} options={reminderOptions(plan, defaults)} onChange={reminders => change({ reminders })} />
        </ImportSheet>
      </ImportFrame>
    );
  }

  return (
    <ImportFrame step="import" title={report ? IMPORT_WORDS.doneTitle : IMPORT_WORDS.importingTitle} lead={report ? t('Everything that just came in can go again: “Undo” on the message, or later “Remove these events” by importing the same files.') : IMPORT_WORDS.importingLead}>
      {report ? (
        <ImportReport imported={report.imported} skipped={report.skipped}>
          <View style={styles.actions}>
            {embedded ? null : <Button label={t('See the calendar')} onPress={() => navigation.navigate('Calendar')} />}
            <Button kind="text" icon="download" label={IMPORT_WORDS.another} onPress={restart} />
          </View>
        </ImportReport>
      ) : (
        <ImportProgress label={t('Writing the events…')} />
      )}
    </ImportFrame>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    flex: { flex: 1 },
    problem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    more: { flexDirection: 'row', paddingHorizontal: 10, paddingBottom: 8 },
    start: { flexDirection: 'row' },
    fields: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, gap: 14 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  });
