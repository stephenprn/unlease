/**
 * An event's form, new or changed, as Google's « Plus d'options »: the title; all day or its hours,
 * the days, the zone; the repeat (the usual choices from its start, or « Personnaliser… »); the
 * place (the contacts' addresses offered as it is typed); the people it is with; its reminders; its
 * labels and colour; its description, which mentions what the suite holds; its files; an address.
 * A new one may come prefilled from its address (a quick add, Claude, Carnet's « Ajouter à l'agenda »:
 * `/agenda/new?start=…&title=…`). Saving a series' event asks which of its events it is for.
 *
 * One save, in the foot that sticks to the window's bottom (and ⌘/Ctrl + Entrée or S from anywhere);
 * an end before the start is said under the hours and the save, pressed, goes to it; what was typed is
 * never lost by a slip (`useUnsaved`).
 */
import { useEffect, useEffectEvent, useId, useMemo, useRef, useState, type ReactNode } from 'react';

import { t } from '@unlease/core/i18n';
import { placeFromLine, type Place } from '@unlease/core/sync/places';
import type { GlyphName } from '@unlease/design/glyphs';
import { DAY_PATTERN, EVENT_LIMITS, labelNameTaken, WALL_PATTERN, type EventFile } from '@unlease/calendar/models/events';
import { asksScope, blankDraft, draftOf, handedDescription, handedUrl, keepLength, type EventDraft } from '@unlease/calendar/services/editing';
import { reminderWords, REMINDER_CHOICES } from '@unlease/calendar/services/eventText';
import { findOccurrence, type Occurrence } from '@unlease/calendar/services/occurrences';
import { cleanEventUrl, readsAsEventUrl } from '@unlease/calendar/services/links';
import { choiceOf, choiceRule, choiceWords, describeRule, parseRule, repeatChoices, type RepeatChoice } from '@unlease/calendar/services/recurrence';
import { addDays, addMinutes, deviceZone, instantToWall, isDay, isKnownZone, USUAL_ZONES } from '@unlease/calendar/services/time';
import { addressLine } from '@unlease/contacts/services/addresses';
import { contactName } from '@unlease/contacts/services/names';

import { useContactsStore } from '@contacts/app/store/library';
import { useMinute } from '@shared/app/hooks/useMinute';
import { showError, showSnack, showUndo } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { SwitchMark } from '@shared/ui/components/Checkbox';
import controls from '@shared/ui/components/controls.module.css';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { FormFoot } from '@shared/ui/components/FormFoot';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton } from '@shared/ui/components/IconButton';
import { Menu } from '@shared/ui/components/Menu';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { PlaceField } from '@shared/ui/components/PlaceField';
import { TextField } from '@shared/ui/components/TextField';
import { useForm } from '@shared/ui/components/useForm';
import { useUnsaved } from '@shared/ui/components/useUnsaved';
import { PageHead } from '@shared/ui/navigation/PageHead';
import { goBack, navigate, useLocation } from '@shared/ui/router';
import { keepEventFile, sendFiles } from '../../app/files';
import { addEvent, createLabel, saveEvent } from '../../app/store/actions';
import { LabelChips } from '@shared/ui/components/LabelChips';
import { askScope } from '../../app/store/calendarUi';
import { useNow } from '../../app/hooks/useToday';
import { useCalendarStore } from '../../app/store/library';
import { usePrefsStore } from '../../app/store/prefs';
import styles from '../calendar.module.css';
import { ColorPicker } from '../features/ColorPicker';
import { DescriptionField } from '../features/DescriptionField';
import { ChoiceField, DateField, TimeField } from '../features/Fields';
import { PeoplePicker } from '../features/People';
import { RepeatDialog } from '../features/RepeatDialog';
import { paths } from '../routes';

/** The key held with Entrée to save: ⌘ on a Mac, Ctrl elsewhere. */
const SAVE_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

/**
 * A row of the form, led by its glyph, centred on the row's first line: a field's (52, the default),
 * chips' (40), a file's (36), the swatches' (34) or a small button's (32).
 */
function Row({ icon, children, label, wide = false, first }: { icon: GlyphName; children: ReactNode; label?: string; wide?: boolean; first?: 'chips' | 'file' | 'swatches' | 'small' }) {
  return (
    <div className={styles.formRow} role={label ? 'group' : undefined} aria-label={label} data-first={first}>
      <Icon name={icon} size={22} />
      <div className={wide ? styles.formFieldsWide : styles.formFields}>{children}</div>
    </div>
  );
}

/** A new event's draft from its address, else the next hour's. */
function draftFromQuery(search: string, now: number, length: number, reminders: { timed: readonly number[]; allDay: readonly number[] }): EventDraft {
  const query = new URLSearchParams(search);
  const zone = deviceZone();
  const startAsked = query.get('start') ?? '';
  const nextHour = addMinutes(instantToWall(now, '').slice(0, 13) + ':00', 60);
  const start = DAY_PATTERN.test(startAsked) || WALL_PATTERN.test(startAsked) ? startAsked : nextHour;
  const endAsked = query.get('end') ?? '';
  const end = (DAY_PATTERN.test(endAsked) || WALL_PATTERN.test(endAsked)) && isDay(endAsked) === isDay(start) && endAsked >= start ? endAsked : isDay(start) ? addDays(start, 1) : addMinutes(start, length);
  const tz = query.get('tz') ?? '';
  // Any page may open this address: its words are only words, its link only the web's.
  const description = handedDescription([query.get('description'), query.get('notes')], query.get('link'));
  const draft = blankDraft(start, end, isKnownZone(tz) ? tz : zone, isDay(start) ? reminders.allDay : reminders.timed);
  const url = handedUrl(query.get('url'));
  return {
    ...draft,
    title: (query.get('title') ?? '').slice(0, EVENT_LIMITS.title),
    place: (query.get('place') ?? '').slice(0, EVENT_LIMITS.place),
    url,
    description,
  };
}

/** The places this device knows: the events' own (the most used first), then the contacts' addresses. */
function useKnownPlaces(): readonly Place[] {
  const events = useCalendarStore(s => s.events);
  const contacts = useContactsStore(s => s.contacts);
  return useMemo(() => {
    const used = Object.values(events)
      .filter(event => event.deletedAt === null && event.trashedAt === null && event.feedId === null && event.place.trim())
      .sort((a, b) => b.editedAt - a.editedAt)
      .map(event => placeFromLine(event.place));
    const kept = Object.values(contacts)
      .filter(contact => contact.deletedAt === null && contact.trashedAt === null && !contact.mergedInto)
      .flatMap(contact => contact.addresses.map(address => addressLine(address)).filter(Boolean).map(line => ({ ...placeFromLine(line), detail: `${contactName(contact)} · ${placeFromLine(line).detail}`.replace(/ · $/, '') })));
    return [...used, ...kept];
  }, [events, contacts]);
}

/** What is wrong with a link typed, or null (`readsAsEventUrl`). */
function urlProblem(url: string): string | null {
  return readsAsEventUrl(url) ? null : t('Un lien comme https://exemple.fr/billets, ou visio.exemple.org.');
}

/** The zones offered: the device's, the event's own, then the usual ones. */
function zoneChoices(current: string): readonly { value: string; label: string }[] {
  return [...new Set([deviceZone(), current, ...USUAL_ZONES].filter(Boolean))].map(zone => ({ value: zone, label: zone.replace(/_/g, ' ') }));
}

function EventForm({ occurrence, initial }: { occurrence: Occurrence | null; initial: EventDraft }) {
  const [draft, setDraft] = useState<EventDraft>(initial);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [showZone, setShowZone] = useState(() => !isDay(initial.start) && !!initial.timeZone && initial.timeZone !== deviceZone());
  const [removed, setRemoved] = useState<readonly string[]>([]);
  const [reminderMenu, setReminderMenu] = useState(false);
  const reminderButton = useRef<HTMLSpanElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const since = useRef({ title: occurrence ? occurrence.event.title : null, description: occurrence ? occurrence.event.description : null });
  const prefs = usePrefsStore();
  const { today } = useNow();
  const known = useKnownPlaces();
  const labels = useCalendarStore(s => s.labels);
  const liveLabels = useMemo(() => Object.values(labels).filter(label => label.deletedAt === null).sort((a, b) => (a.position < b.position ? -1 : 1)), [labels]);
  const allDay = isDay(draft.start);
  const set = (patch: Partial<EventDraft>): void => setDraft(current => ({ ...current, ...patch }));

  const setStart = (start: string): void => set({ start, end: keepLength(draft, start), timeZone: isDay(start) ? '' : draft.timeZone || deviceZone() });
  const toggleAllDay = (on: boolean): void => {
    if (on === allDay) return;
    if (on) set({ start: draft.start.slice(0, 10), end: addDays(draft.end.slice(0, 10) < draft.start.slice(0, 10) ? draft.start.slice(0, 10) : draft.end.slice(0, 10), 1), timeZone: '', reminders: prefs.allDayReminders });
    else set({ start: `${draft.start}T09:00`, end: addMinutes(`${draft.start}T09:00`, prefs.eventLength), timeZone: deviceZone(), reminders: prefs.reminders });
  };
  // An all-day event's last day as shown (its stored end is the day after).
  const lastDay = allDay ? addDays(draft.end, -1) : draft.end.slice(0, 10);
  const sameDay = !allDay && draft.end.slice(0, 10) === draft.start.slice(0, 10);
  const choice: RepeatChoice = choiceOf(draft.rrule, draft.start);
  const rule = draft.rrule ? parseRule(draft.rrule) : null;
  const repeatShown = choice === 'custom' && rule ? describeRule(rule, draft.start, draft.timeZone) : choiceWords(choice, draft.start);
  const reminderChoices = (allDay ? REMINDER_CHOICES.allDay : REMINDER_CHOICES.timed).filter(minutes => !draft.reminders.includes(minutes));

  const addFiles = async (files: FileList | null): Promise<void> => {
    if (!files) return;
    const added: EventFile[] = [];
    for (const file of [...files]) {
      const kept = await keepEventFile(file);
      if (typeof kept === 'string') showError(kept);
      else added.push(kept);
    }
    setDraft(current => ({ ...current, files: [...current.files, ...added].slice(0, EVENT_LIMITS.files) }));
  };

  /** The link as kept, its tracking off, said under the field. */
  const tidyUrl = (value: string): void => {
    const cleaned = cleanEventUrl(value);
    setRemoved(cleaned.removed);
    if (cleaned.url !== draft.url) set({ url: cleaned.url.slice(0, EVENT_LIMITS.url) });
  };

  const endsBefore = !(draft.end >= draft.start && (allDay ? draft.end > draft.start : true));
  const form = useForm({ end: endsBefore ? t('La fin vient avant le début : choisissez un jour ou une heure de fin plus tard.') : null, url: urlProblem(draft.url) });
  const endField = form.field('end');
  const endProblem = form.error('end');
  const endNote = useId();
  const unsaved = useUnsaved(JSON.stringify(draft) !== JSON.stringify(initial), { page: paths.home });
  /** A day or an hour changed: an end before the start is said at once (a pick is a field left). */
  const setWhen = (patch: Partial<EventDraft>): void => {
    set(patch);
    endField.left('picked');
  };

  const save = (): Promise<boolean> =>
    form.submit(async () => {
      const clean = { ...draft, title: draft.title.trim(), place: draft.place.trim(), url: cleanEventUrl(draft.url).url.slice(0, EVENT_LIMITS.url) };
      if (!occurrence) {
        const id = addEvent(clean);
        if (clean.files.length > 0) sendFiles();
        showSnack(t('Événement enregistré'), undefined, { tone: 'success' });
        unsaved.saved();
        navigate(paths.event(id), { replace: true });
        return;
      }
      const scope = asksScope(occurrence) ? await askScope(t('Modifier un événement périodique')) : 'all';
      if (!scope) return false;
      const undo = saveEvent(occurrence, clean, scope, since.current);
      if (clean.files.some(file => !file.uploaded)) sendFiles();
      showUndo(t('Événement enregistré'), undo);
      unsaved.saved();
      navigate(paths.event(occurrence.seriesId, occurrence.repeats && scope === 'this' ? occurrence.occurrence : null), { replace: true });
    });

  // ⌘ or Ctrl + Entrée, or + S, saves from anywhere on the page (not the browser's « Enregistrer la page »).
  const onSaveKeys = useEffectEvent((event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.isComposing) return;
    if (event.key !== 'Enter' && event.key.toLowerCase() !== 's') return;
    // A dialog over the form (the repeat, a series' scope) keeps its own keys.
    if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
    event.preventDefault();
    void save();
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent): void => onSaveKeys(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  return (
    <>
      <form
        className={styles.form}
        onSubmit={event => {
          event.preventDefault();
          void save();
        }}
        noValidate
      >
        <PageHead title={occurrence ? t('Modifier l’événement') : t('Nouvel événement')} />
        <OutlinedBox kind="panel" lift="card" className={`${styles.formSheet} paper`}>
          <input className={styles.titleInput} value={draft.title} onChange={event => set({ title: event.target.value })} placeholder={t('Ajouter un titre')} aria-label={t('Titre')} maxLength={EVENT_LIMITS.title} autoComplete="off" enterKeyHint="done" autoFocus={!occurrence} />
          <Row icon="clock" label={t('Quand')} wide>
            <div className={styles.whenLine}>
              <div className={styles.whenGroup}>
                <DateField value={draft.start.slice(0, 10)} label={allDay ? t('Premier jour') : t('Jour de début')} weekStart={prefs.weekStart} today={today} onChange={day => setStart(allDay ? day : `${day}${draft.start.slice(10)}`)} />
                {!allDay ? <TimeField value={draft.start.slice(11, 16)} label={t('Heure de début')} twelveHours={prefs.twelveHours} onChange={clock => setStart(`${draft.start.slice(0, 10)}T${clock}`)} /> : null}
              </div>
              <span className={styles.whenDash} aria-hidden="true">
                –
              </span>
              <div className={styles.whenGroup} data-end="">
                {!allDay ? (
                  <TimeField
                    value={draft.end.slice(11, 16)}
                    label={t('Heure de fin')}
                    from={sameDay ? draft.start.slice(11, 16) : undefined}
                    twelveHours={prefs.twelveHours}
                    invalid={!!endProblem}
                    describedBy={endProblem ? endNote : undefined}
                    onChange={clock => setWhen({ end: `${draft.end.slice(0, 10)}T${clock}` < draft.start ? `${addDays(draft.end.slice(0, 10), 1)}T${clock}` : `${draft.end.slice(0, 10)}T${clock}` })}
                  />
                ) : null}
                <DateField
                  value={lastDay}
                  label={allDay ? t('Dernier jour') : t('Jour de fin')}
                  weekStart={prefs.weekStart}
                  today={today}
                  invalid={!!endProblem}
                  describedBy={endProblem ? endNote : undefined}
                  // The end's day is what can come before the start (a time before it moves to the next day): it takes the focus.
                  fieldRef={endField.register}
                  onChange={day => setWhen({ end: allDay ? addDays(day < draft.start ? draft.start : day, 1) : `${day}${draft.end.slice(10)}` })}
                />
              </div>
            </div>
            {endProblem ? (
              <p id={endNote} className={`${controls.error} ${controls.fieldNoteAlone} t-meta`}>
                <Icon name="error" size={16} className={controls.errorGlyph} />
                <span>{endProblem}</span>
              </p>
            ) : null}
            <div className={styles.whenOptions}>
              <button type="button" role="switch" aria-checked={allDay} className={styles.switchRow} onClick={() => toggleAllDay(!allDay)}>
                <SwitchMark checked={allDay} />
                <span className="t-body">{t('Toute la journée')}</span>
              </button>
              {!allDay && !showZone ? (
                <Button kind="text" small icon="globe" onClick={() => setShowZone(true)}>
                  {t('Fuseau horaire')}
                </Button>
              ) : null}
            </div>
            {!allDay && showZone ? (
              <div className={styles.zoneLine}>
                <ChoiceField value={draft.timeZone || deviceZone()} choices={zoneChoices(draft.timeZone)} label={t('Fuseau horaire')} icon="globe" onChange={timeZone => set({ timeZone })} />
                {draft.timeZone && draft.timeZone !== deviceZone() ? <span className="t-meta">{t('Heures sur place, à {zone}', { zone: draft.timeZone.replace(/_/g, ' ').split('/').pop() ?? draft.timeZone })}</span> : null}
              </div>
            ) : null}
          </Row>
          <Row icon="refresh" label={t('Répétition')}>
            <ChoiceField
              value={choice}
              shown={repeatShown}
              label={t('Répétition')}
              choices={repeatChoices(draft.start).map(each => ({ value: each, label: choiceWords(each, draft.start) }))}
              onChange={next => {
                if (next === 'custom') setRepeatOpen(true);
                else set({ rrule: choiceRule(next, draft.start) });
              }}
            />
          </Row>
          <Row icon="mapPin" label={t('Lieu')} wide>
            <PlaceField ariaLabel={t('Lieu')} value={draft.place} onChange={place => set({ place: place.slice(0, EVENT_LIMITS.place) })} known={known} placeholder={t('Ajouter un lieu')} />
          </Row>
          <Row icon="people" label={t('Avec')} wide>
            <PeoplePicker value={draft.contactIds} max={EVENT_LIMITS.contacts} onChange={contactIds => set({ contactIds })} />
          </Row>
          <Row icon="bell" label={t('Rappels')} first="small">
            {draft.reminders.map(minutes => (
              <span key={minutes} className={styles.pick}>
                {reminderWords(minutes, allDay)}
                <IconButton icon="close" label={t('Retirer le rappel {when}', { when: reminderWords(minutes, allDay) })} compact size={16} onClick={() => set({ reminders: draft.reminders.filter(each => each !== minutes) })} />
              </span>
            ))}
            {draft.reminders.length < EVENT_LIMITS.reminders && reminderChoices.length > 0 ? (
              <>
                <span ref={reminderButton} className={styles.anchorSpan}>
                  <Button kind="text" small icon="plus" onClick={() => setReminderMenu(true)}>
                    {draft.reminders.length > 0 ? t('Un autre rappel') : t('Ajouter un rappel')}
                  </Button>
                </span>
                <Menu
                  open={reminderMenu}
                  anchor={reminderButton}
                  onDismiss={() => setReminderMenu(false)}
                  label={t('Ajouter un rappel')}
                  align="start"
                  items={reminderChoices.map(minutes => ({ label: reminderWords(minutes, allDay), icon: 'bell', onSelect: () => set({ reminders: [...draft.reminders, minutes].sort((a, b) => a - b) }) }))}
                />
              </>
            ) : null}
          </Row>
          <Row icon="tag" label={t('Libellés')} first="chips">
            {/* Each label its chip, its own tag the tick, and a new one named in place (as Contacts' form and the phone's). */}
            <LabelChips
              labels={liveLabels}
              chosen={draft.labelIds}
              onToggle={id => set({ labelIds: draft.labelIds.includes(id) ? draft.labelIds.filter(each => each !== id) : draft.labelIds.length < EVENT_LIMITS.labels ? [...draft.labelIds, id] : draft.labelIds })}
              onCreate={name => {
                if (labelNameTaken(useCalendarStore.getState().labels, name)) return { problem: t('Ce libellé existe déjà : choisissez un autre nom.') };
                const id = createLabel(name);
                if (draft.labelIds.length < EVENT_LIMITS.labels) set({ labelIds: [...draft.labelIds, id] });
                return { id };
              }}
              maxLength={EVENT_LIMITS.labelName}
              words={{ add: t('Nouveau libellé'), placeholder: t('Nom du libellé'), field: t('Nom du nouveau libellé'), create: t('Créer le libellé') }}
            />
          </Row>
          <Row icon="palette" label={t('Couleur')} wide first="swatches">
            <ColorPicker<true> value={draft.color} onChange={color => set({ color })} label={t('Couleur')} none={t('Celle de ses libellés')} />
          </Row>
          <Row icon="text" label={t('Description')} wide>
            <DescriptionField markup={draft.description} onChange={description => set({ description })} />
          </Row>
          <Row icon="link" label={t('Lien')} wide>
            <TextField
              kind="url"
              ariaLabel={t('Lien')}
              value={draft.url}
              field={form.field('url')}
              onChange={url => {
                setRemoved([]);
                // Pasted whole into the empty field: kept at once, its tracking off.
                if (!draft.url.trim() && url.trim().length - draft.url.length > 8) tidyUrl(url);
                else set({ url });
              }}
              onBlur={() => tidyUrl(draft.url)}
              placeholder={t('Ajouter un lien (billetterie, visio…)')}
              maxLength={EVENT_LIMITS.url}
              help={removed.length > 0 ? t('Pistage retiré : {names}', { names: removed.join(', ') }) : undefined}
            />
          </Row>
          <Row icon="file" label={t('Fichiers')} first={draft.files.length > 0 ? 'file' : 'small'}>
            {draft.files.map(file => (
              <span key={file.id} className={styles.file}>
                <Icon name={file.mime.startsWith('image/') ? 'image' : file.mime === 'application/pdf' ? 'pdf' : 'file'} size={18} />
                <span>{file.name}</span>
                <IconButton icon="close" label={t('Retirer {name}', { name: file.name })} compact size={16} onClick={() => set({ files: draft.files.filter(each => each.id !== file.id) })} />
              </span>
            ))}
            <Button kind="text" icon="upload" small onClick={() => fileInput.current?.click()}>
              {t('Joindre un fichier')}
            </Button>
            <input ref={fileInput} type="file" multiple hidden onChange={event => void addFiles(event.target.files).then(() => (event.target.value = ''))} />
          </Row>
        </OutlinedBox>
        <FormFoot form={form}>
          <span className={`${styles.formHint} t-meta`}>{t('{key} + Entrée pour enregistrer', { key: SAVE_KEY })}</span>
          <Button kind="text" onClick={() => goBack(paths.home)}>
            {t('Annuler')}
          </Button>
          <Button type="submit" icon="check" busy={form.busy}>
            {t('Enregistrer')}
          </Button>
        </FormFoot>
      </form>
      {/* Outside the form: a dialog's own submit (OK) bubbles through its portal to the form it sits in. */}
      <RepeatDialog
        open={repeatOpen}
        start={draft.start}
        rrule={draft.rrule}
        onCancel={() => setRepeatOpen(false)}
        onDone={rrule => {
          set({ rrule });
          setRepeatOpen(false);
        }}
      />
      {unsaved.dialog}
    </>
  );
}

export function NewEventScreen() {
  const { search } = useLocation();
  const now = useMinute();
  const prefs = usePrefsStore();
  // The form opens once with its query: later renders keep what was typed.
  const [initial] = useState(() => draftFromQuery(search, now, prefs.eventLength, { timed: prefs.reminders, allDay: prefs.allDayReminders }));
  return (
    <div className={`${styles.screen} ${styles.narrowScreen}`}>
      <EventForm occurrence={null} initial={initial} />
    </div>
  );
}

export function EditEventScreen({ id }: { id: string }) {
  const { search } = useLocation();
  const at = new URLSearchParams(search).get('at');
  const events = useCalendarStore(s => s.events);
  // The occurrence as it was when the form opened: what is typed is laid over it.
  const [occurrence] = useState(() => findOccurrence(events, id, at));
  if (!occurrence || occurrence.event.feedId !== null) {
    return (
      <div className={`${styles.screen} ${styles.narrowScreen}`}>
        <EmptyState scene="trash" as="h1" title={t('Cet événement n’existe plus')} text={t('Il a été supprimé, sur cet appareil ou sur un autre.')} />
      </div>
    );
  }
  return (
    <div className={`${styles.screen} ${styles.narrowScreen}`}>
      <EventForm key={`${id}@${at ?? ''}`} occurrence={occurrence} initial={draftOf(occurrence, events[occurrence.seriesId])} />
    </div>
  );
}

