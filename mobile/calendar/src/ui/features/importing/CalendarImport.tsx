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

import { t, tc } from '@unlease/core/i18n';
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
      if (picked.status === 'error') setProblem(picked.message ? t(picked.message) : t('Fichier illisible'));
      return;
    }
    setReading(true);
    const read = await readCalendarFiles([picked.path], [picked.name]);
    setReading(false);
    if (read.status === 'ok') open(read.files, adding);
    else if (adding) showSnack(read.status === 'empty' ? t('Aucun événement dans ce fichier.') : read.message, undefined, { tone: read.status === 'empty' ? 'warning' : 'error' });
    else setProblem(read.status === 'empty' ? t('Aucun événement dans ce fichier.') : read.message);
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
        showSnack(t('{events} importés', { events: plural(count, 'événement') }), { label: tc('undo', 'Annuler'), run: () => undoImport(final) }, { tone: 'success' });
        onImported?.();
      }
      onFlow?.(false);
    }, 16);
  };

  const remove = (): void => {
    setRemoving(false);
    if (!files) return;
    const { count, undo } = removeImported(together(files));
    showSnack(plural(count, 'événement placé dans la corbeille', 'événements placés dans la corbeille'), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
    if (embedded) restart();
    else navigation.goBack();
  };

  if (step === 'source' || !files || !choices || !plan || !context) {
    return (
      <ImportFrame step="source" title={t('Votre agenda Google')} lead={t('Un fichier .ics, d’où qu’il vienne : l’export de Google Agenda, un agenda d’Apple ou d’Outlook, une invitation.')}>
        <ImportSheet title={t('Depuis Google Agenda')}>
          <ImportBlock>
            <ImportInstructions
              steps={[
                t('Sur un ordinateur, ouvrez Google Agenda, puis Paramètres › Importer et exporter › Exporter.'),
                t('Google vous donne une archive .zip : ouvrez-la dans l’application Fichiers, qui en sort un fichier .ics par agenda.'),
                t('Choisissez ici le fichier .ics d’un agenda ; vous pourrez en ajouter d’autres à l’étape suivante.'),
              ]}
            />
            <Button label={t('Choisir un fichier .ics')} icon="download" busy={reading} onPress={() => later(pick(false))} />
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
          back={<Button kind="text" label={t('Retour')} onPress={restart} />}
          forward={<Button label={t('Continuer')} onPress={() => setStep('choices')} />}
        >
          <ImportSheet>
            <ImportCounts lines={importCounts(plan, context)} />
            <View style={styles.more}>
              <Button kind="text" small icon="plus" label={t('Ajouter un autre agenda')} busy={reading} onPress={() => later(pick(true))} />
            </View>
          </ImportSheet>
          {imported > 0 ? (
            <ImportSheet title={t('Déjà importé')}>
              <ImportBlock>
                <AppText variant="body">{t('{events} de ce fichier dans votre agenda', { events: plural(imported, 'événement') })}</AppText>
                <AppText variant="meta">{t('Pour repartir de zéro : retirez-les, puis importez le fichier à nouveau.')}</AppText>
                <View style={styles.start}>
                  <Button kind="dangerText" icon="trash" label={t('Retirer ces événements')} onPress={() => setRemoving(true)} />
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
          title={t('Retirer {events} ?', { events: plural(imported, 'événement') })}
          message={t('Les événements de ce fichier qui sont dans votre agenda iront à la corbeille, même ceux modifiés depuis. Ils y restent {days} jours.', { days: TRASH_RETENTION_DAYS })}
          confirmLabel={t('Retirer')}
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
        back={<Button kind="text" label={t('Retour')} onPress={toPreview} />}
        forward={<Button icon="download" label={plan.count > 0 ? t('Importer {events}', { events: plural(plan.count, 'événement') }) : t('Importer')} onPress={write} />}
      >
        <ImportSheet>
          <ChoiceRadios<ImportPeriod> title={t('Période')} meta={t('Une série qui se répète encore compte comme à venir, avec ses dates passées.')} value={choices.period} options={counts ? periodOptions(counts, now) : []} onChange={period => change({ period })} />
        </ImportSheet>
        <ImportSheet>
          <ChoiceSwitch
            title={t('Ranger sous un libellé')}
            meta={several ? t('Un libellé par agenda, à son nom : pour retrouver, filtrer ou retirer ses événements d’un coup.') : t('Pour retrouver, filtrer ou retirer ces événements d’un coup.')}
            checked={labelNames !== null}
            onChange={on => change({ labelNames: on ? importLabelNames(files) : null })}
          />
          {labelNames && offered.length > 0 ? (
            <View style={styles.fields}>
              {offered.map(index => (
                <TextField
                  key={index}
                  label={several ? t('Libellé de « {calendar} »', { calendar: importFileName(files[index]!) || t('Agenda sans nom') }) : t('Nom du libellé')}
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
          <ImportSheet title={t('Agendas')}>
            {files.map((file, index) => (
              <ChoiceSwitch
                key={index}
                title={importFileName(file) || t('Agenda sans nom')}
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
          <ChoiceRadios<ImportReminders> title={t('Rappels')} value={choices.reminders} options={reminderOptions(plan, defaults)} onChange={reminders => change({ reminders })} />
        </ImportSheet>
      </ImportFrame>
    );
  }

  return (
    <ImportFrame step="import" title={report ? IMPORT_WORDS.doneTitle : IMPORT_WORDS.importingTitle} lead={report ? t('Tout ce qui vient d’arriver peut repartir : « Annuler » sur le message, ou plus tard « Retirer ces événements » en important les mêmes fichiers.') : IMPORT_WORDS.importingLead}>
      {report ? (
        <ImportReport imported={report.imported} skipped={report.skipped}>
          <View style={styles.actions}>
            {embedded ? null : <Button label={t('Voir l’agenda')} onPress={() => navigation.navigate('Calendar')} />}
            <Button kind="text" icon="download" label={IMPORT_WORDS.another} onPress={restart} />
          </View>
        </ImportReport>
      ) : (
        <ImportProgress label={t('Écriture des événements…')} />
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
