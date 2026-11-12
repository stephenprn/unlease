/**
 * Agenda's import (`AppModule.importer`, the shell's `/agenda/settings/import` and the first run's
 * step), the four steps every app shares (`core/services/importFlow`):
 *
 * 1. Source: how to get Google Agenda's export, the zone the `.zip` or the `.ics` are dropped on or
 *    picked from (several at once: one per calendar). Files dropped anywhere on Agenda land straight
 *    on the preview (`importFiles`).
 * 2. Preview: the calendars and what they hold, counted, then every event sorted by date with what
 *    becomes of it (new, already here by its UID, a series completed, or left out and why), each new
 *    one left out by its box; the same file imported before offers « Retirer ces événements ».
 * 3. Choices: the period, a label per calendar (to find, filter or remove them at once), the
 *    calendars to leave out, the reminders; each changes the plan and its counts at once.
 * 4. Import: planned again against the agenda as it is now, written as one batch (labels, then the
 *    events), then the report; its slip takes it all back.
 */
import { useEffect, useMemo, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { IMPORT_WORDS, type ImportStep, type PreviewEntry } from '@unlease/core/services/importFlow';
import { EVENT_LIMITS, TRASH_RETENTION_DAYS } from '@unlease/calendar/models/events';
import type { IcsCalendar } from '@unlease/calendar/services/ics';
import { defaultImportChoices, importedEvents, importFileName, importLabelNames, knownCalendar, periodCounts, planImport, type ImportChoices, type ImportOptions, type ImportPeriod, type ImportReminders } from '@unlease/calendar/services/importing';
import { calendarMeta, importCounts, importEntries, importReport, labelHelp, periodOptions, reminderOptions } from '@unlease/calendar/services/importWords';

import { showUndo } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { Confirm } from '@shared/ui/components/Dialog';
import { Icon } from '@shared/ui/components/Icon';
import { TextField } from '@shared/ui/components/TextField';
import { ChoiceRadios, ChoiceSwitch, ImportCounts, ImportDrop, ImportFrame, ImportInstructions, ImportPreview, ImportProgress, ImportReport, ImportSheet } from '@shared/ui/features/importing/ImportFlow';
import settings from '@shared/ui/features/settings/settings.module.css';
import type { ImportWizardProps } from '@shared/modules';
import { navigate } from '@shared/ui/router';
import { readImportFiles, type ReadFiles } from '../../../app/importFiles';
import { applyImport, removeImported, undoImport } from '../../../app/store/actions';
import { setImportFiles, useCalendarUi } from '../../../app/store/calendarUi';
import { useCalendarStore } from '../../../app/store/library';
import { usePrefsStore } from '../../../app/store/prefs';
import { paths } from '../../routes';
import styles from './calendarImport.module.css';

/** Ids for a plan only shown: the one written is planned again, with real ones. */
const shownIds = (): (() => string) => {
  let n = 0;
  return () => `shown-${(n += 1)}`;
};

/** The files' events as one calendar: what « Retirer ces événements » looks for. */
const together = (read: ReadFiles): IcsCalendar => ({ name: '', events: read.files.flatMap(file => file.calendar.events) });

export function CalendarImport({ embedded = false, onFlow, onImported }: ImportWizardProps) {
  const given = useCalendarUi(s => s.importFiles);
  const events = useCalendarStore(s => s.events);
  const labels = useCalendarStore(s => s.labels);
  const feeds = useCalendarStore(s => s.feeds);
  const twelveHours = usePrefsStore(s => s.twelveHours);
  const timed = usePrefsStore(s => s.reminders);
  const allDay = usePrefsStore(s => s.allDayReminders);
  const [step, setStep] = useState<ImportStep>('source');
  const [reading, setReading] = useState(false);
  const [read, setRead] = useState<ReadFiles | null>(null);
  const [refused, setRefused] = useState<ReadFiles['refused']>([]);
  const [choices, setChoices] = useState<ImportChoices | null>(null);
  const [report, setReport] = useState<{ readonly imported: string[]; readonly skipped: string[] } | null>(null);
  const [removing, setRemoving] = useState(false);
  // One moment for a read: the period counts from it.
  const [now, setNow] = useState(() => Date.now());

  const take = (files: readonly File[]): void => {
    if (files.length === 0) return;
    setReading(true);
    void readImportFiles(files).then(found => {
      setReading(false);
      setRefused(found.refused);
      if (found.files.length === 0) return;
      setNow(Date.now());
      setRead(found);
      setChoices(defaultImportChoices(found.files));
      setReport(null);
      setStep('preview');
      onFlow?.(true);
    });
  };

  // Files given anywhere on Agenda: taken from the store, then read.
  useEffect(() => {
    if (!given) return;
    setImportFiles(null);
    void Promise.resolve(given).then(take);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- taken once, as they come
  }, [given]);

  const defaults = useMemo(() => ({ timed, allDay }), [timed, allDay]);
  const list = useMemo(() => Object.values(events), [events]);
  // What is shown and counted: the labels' names and the reminders change none of it, so typing a name plans nothing again.
  const period = choices?.period ?? 'all';
  const filesOff = choices?.filesOff ?? null;
  const leftOut = choices?.leftOut ?? null;
  const options: ImportOptions | null = useMemo(() => (filesOff && leftOut ? { period, filesOff, leftOut } : null), [period, filesOff, leftOut]);
  const plan = useMemo(() => (read && options ? planImport(read.files, list, now, shownIds(), options) : null), [read, options, list, now]);
  const context = useMemo(() => (read ? { files: read.files, now, twelveHours, period, feedName: (id: string) => feeds[id]?.name ?? null } : null), [read, now, twelveHours, period, feeds]);
  const entries = useMemo(() => (plan && context ? importEntries(plan, context) : []), [plan, context]);
  const imported = useMemo(() => (read ? importedEvents(together(read), list).length : 0), [read, list]);
  const counts = useMemo(() => (step === 'choices' && read && filesOff && leftOut ? periodCounts(read.files, list, now, { filesOff, leftOut }) : null), [step, read, filesOff, leftOut, list, now]);

  const change = (patch: Partial<ImportChoices>): void => setChoices(current => (current ? { ...current, ...patch } : current));

  const restart = (): void => {
    setRead(null);
    setChoices(null);
    setReport(null);
    setRefused([]);
    setStep('source');
    onFlow?.(false);
  };

  const write = (): void => {
    if (!read || !choices) return;
    setStep('import');
    // A frame for the progress, then the batch, planned against the agenda as it is now.
    window.setTimeout(() => {
      const state = useCalendarStore.getState();
      const final = planImport(read.files, Object.values(state.events), Date.now(), undefined, { ...choices, labels: state.labels, defaults });
      const count = applyImport(final);
      setReport(importReport(final, { files: read.files, now, period: choices.period }, useCalendarStore.getState().labels));
      if (count > 0) {
        showUndo(t('{events} importés', { events: plural(count, 'événement') }), () => undoImport(final));
        onImported?.();
      }
      onFlow?.(false);
    }, 0);
  };

  const remove = (): void => {
    setRemoving(false);
    if (!read) return;
    const { count, undo } = removeImported(together(read));
    showUndo(plural(count, 'événement placé dans la corbeille', 'événements placés dans la corbeille'), undo);
    if (embedded) restart();
    else navigate(paths.home);
  };

  if (step === 'source' || !read || !choices || !plan || !context) {
    return (
      <ImportFrame step="source" embedded={embedded} title={t('Votre agenda Google')} lead={t('Un fichier .ics, d’où qu’il vienne : l’export de Google Agenda, un agenda d’Apple ou d’Outlook, une invitation.')}>
        <ImportSheet title={t('Depuis Google Agenda')}>
          <div className={settings.block}>
            <ImportInstructions
              steps={[
                t('Sur un ordinateur, ouvrez Google Agenda, puis Paramètres › Importer et exporter › Exporter.'),
                t('Google vous donne une archive .zip : un fichier .ics par agenda. Google Takeout, en ne cochant qu’Agenda, donne la même.'),
                t('Déposez l’archive ici telle quelle, ou les fichiers .ics des agendas voulus.'),
              ]}
            />
            <ImportDrop
              label={t('Déposez l’archive .zip ou les fichiers .ics')}
              meta={t('ou cliquez pour les choisir')}
              accept=".ics,.ical,.ifb,.icalendar,.zip,text/calendar,application/zip"
              multiple
              reading={reading}
              readingLabel={t('Lecture des agendas…')}
              inputLabel={t('Fichiers d’agenda')}
              onFiles={take}
            />
            {refused.length > 0 ? (
              <div className={styles.problem} role="alert">
                <Icon name="alert" size={20} />
                <span className={styles.problemText}>
                  {refused.map(file => (
                    <span key={file.name} className="t-body">
                      {t('{file} : {why}', { file: file.name, why: file.why })}
                    </span>
                  ))}
                </span>
              </div>
            ) : null}
            <p className="t-meta">{IMPORT_WORDS.private}</p>
          </div>
        </ImportSheet>
      </ImportFrame>
    );
  }

  if (step === 'preview') {
    const lines = importCounts(plan, context);
    return (
      <ImportFrame
        step="preview"
        embedded={embedded}
        title={IMPORT_WORDS.previewTitle}
        lead={IMPORT_WORDS.previewLead}
        back={
          <Button kind="text" onClick={restart}>
            {t('Retour')}
          </Button>
        }
        forward={<Button onClick={() => setStep('choices')}>{t('Continuer')}</Button>}
      >
        <ImportSheet label={IMPORT_WORDS.previewTitle}>
          <div className={settings.block}>
            <ImportCounts lines={[...lines, ...(refused.length > 0 ? [{ icon: 'alert' as const, text: plural(refused.length, 'fichier mis de côté', 'fichiers mis de côté'), meta: refused.map(file => t('{file} : {why}', { file: file.name, why: file.why })).join(' · ') }] : [])]} />
          </div>
        </ImportSheet>
        {imported > 0 ? (
          <ImportSheet title={t('Déjà importé')}>
            <div className={settings.block}>
              <p className="t-body">{t('{events} de ce fichier dans votre agenda', { events: plural(imported, 'événement') })}</p>
              <p className="t-meta">{t('Pour repartir de zéro : retirez-les, puis importez le fichier à nouveau.')}</p>
              <div className={settings.buttons}>
                <Button kind="dangerText" icon="trash" onClick={() => setRemoving(true)}>
                  {t('Retirer ces événements')}
                </Button>
              </div>
            </div>
          </ImportSheet>
        ) : null}
        <ImportPreview
          entries={entries}
          label={t('Les événements du fichier')}
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
        <Confirm
          open={removing}
          title={t('Retirer {events} ?', { events: plural(imported, 'événement') })}
          message={t('Les événements de ce fichier qui sont dans votre agenda iront à la corbeille, même ceux modifiés depuis. Ils y restent {days} jours.', { days: TRASH_RETENTION_DAYS })}
          confirmLabel={t('Retirer')}
          danger
          onCancel={() => setRemoving(false)}
          onConfirm={remove}
        />
      </ImportFrame>
    );
  }

  if (step === 'choices') {
    const several = read.files.length > 1;
    const offered = read.files.map((_, index) => index).filter(index => !choices.filesOff.has(index));
    const showCalendars = several || read.files.some(file => knownCalendar(importFileName(file)) !== null);
    const labelNames = choices.labelNames;
    return (
      <ImportFrame
        step="choices"
        embedded={embedded}
        title={IMPORT_WORDS.choicesTitle}
        lead={IMPORT_WORDS.choicesLead}
        back={
          <Button kind="text" onClick={() => setStep('preview')}>
            {t('Retour')}
          </Button>
        }
        forward={
          <Button icon="download" onClick={write}>
            {plan.count > 0 ? t('Importer {events}', { events: plural(plan.count, 'événement') }) : t('Importer')}
          </Button>
        }
      >
        <ImportSheet label={t('Période')}>
          <ChoiceRadios<ImportPeriod> title={t('Période')} meta={t('Une série qui se répète encore compte comme à venir, avec ses dates passées.')} value={choices.period} options={counts ? periodOptions(counts, now) : []} onChange={period => change({ period })} />
        </ImportSheet>
        <ImportSheet label={t('Libellés')}>
          <ChoiceSwitch
            title={t('Ranger sous un libellé')}
            meta={several ? t('Un libellé par agenda, à son nom : pour retrouver, filtrer ou retirer ses événements d’un coup.') : t('Pour retrouver, filtrer ou retirer ces événements d’un coup.')}
            checked={labelNames !== null}
            onChange={on => change({ labelNames: on ? importLabelNames(read.files) : null })}
          >
            {labelNames && offered.length > 0 ? (
              <div className={`${settings.block} ${styles.names}`}>
                {offered.map(index => (
                  <TextField
                    key={index}
                    label={several ? t('Libellé de « {calendar} »', { calendar: importFileName(read.files[index]!) || t('Agenda sans nom') }) : t('Nom du libellé')}
                    value={labelNames[index] ?? ''}
                    maxLength={EVENT_LIMITS.labelName}
                    help={labelHelp(labelNames[index] ?? '', labels)}
                    onChange={value => change({ labelNames: labelNames.map((name, at) => (at === index ? value : name)) })}
                  />
                ))}
              </div>
            ) : null}
          </ChoiceSwitch>
        </ImportSheet>
        {showCalendars ? (
          <ImportSheet title={t('Agendas')}>
            {read.files.map((file, index) => (
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
        <ImportSheet label={t('Rappels')}>
          <ChoiceRadios<ImportReminders> title={t('Rappels')} value={choices.reminders} options={reminderOptions(plan, defaults)} onChange={reminders => change({ reminders })} />
        </ImportSheet>
      </ImportFrame>
    );
  }

  return (
    <ImportFrame step="import" embedded={embedded} title={report ? IMPORT_WORDS.doneTitle : IMPORT_WORDS.importingTitle} lead={report ? t('Tout ce qui vient d’arriver peut repartir : « Annuler » sur le message, ou plus tard « Retirer ces événements » en important les mêmes fichiers.') : IMPORT_WORDS.importingLead}>
      {report ? (
        <ImportReport imported={report.imported} skipped={report.skipped}>
          <div className={styles.actions}>
            {embedded ? null : <Button onClick={() => navigate(paths.home)}>{t('Voir l’agenda')}</Button>}
            <Button kind="text" icon="download" onClick={restart}>
              {IMPORT_WORDS.another}
            </Button>
          </div>
        </ImportReport>
      ) : (
        <ImportProgress label={t('Écriture des événements…')} />
      )}
    </ImportFrame>
  );
}
