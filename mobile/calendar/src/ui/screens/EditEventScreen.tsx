/**
 * « Nouvel événement » and « Modifier l'événement », as Google's form: the title; all day or not; when
 * it starts and ends (a later start keeps its length), its zone; how it repeats; where (typed, or a
 * contact's address); who with; its reminders, labels and colour; its description, mentions included;
 * its files and address. A change to a repeating event asks which occurrences it takes.
 *
 * Material's full-screen dialog: × and « Enregistrer » in the top bar, in reach above the keyboard;
 * leaving with changes asks first (`useUnsaved`); an end before the start is said under the end, and
 * « Enregistrer » says it again rather than saving.
 */
import React, { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, View } from 'react-native';
import Animated, { LayoutAnimationConfig } from 'react-native-reanimated';

import { t, tc } from '@unlease/core/i18n';
import { LINE_COLOR_NAMES, type LineColor } from '@unlease/design/colors';
import { GEOMETRY } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import type { GlyphName } from '@unlease/design/glyphs';
import { addressLine } from '@unlease/contacts/services/addresses';
import { contactName } from '@unlease/contacts/services/names';
import { placeFromLine, type Place } from '@unlease/core/sync/places';
import { resolveContact } from '@unlease/contacts/services/duplicates';
import { EVENT_LIMITS, labelNameTaken } from '@unlease/calendar/models/events';
import { asksScope, blankDraft, draftOf, handedDescription, handedRule, handedUrl, keepLength, type EditScope, type EventDraft } from '@unlease/calendar/services/editing';
import { clockWords, REMINDER_CHOICES, reminderWords, weekdayDay } from '@unlease/calendar/services/eventText';
import { eventColor } from '@unlease/calendar/services/colors';
import { findOccurrence } from '@unlease/calendar/services/occurrences';
import { cleanEventUrl, readsAsEventUrl } from '@unlease/calendar/services/links';
import { choiceOf, choiceWords, describeRule, parseRule } from '@unlease/calendar/services/recurrence';
import { addDays, addMinutes, clockPart, deviceZone, isDay, today as todayOf } from '@unlease/calendar/services/time';
import { addEvent, createLabel, saveEvent } from '@app/store/actions';
import { handedGuests } from '@app/handedEvent';
import { selectPrefs, useCalendarUiStore } from '@app/store/calendarUi';
import { useLibraryStore } from '@app/store/libraryStore';
import { pickEventDocument, pickEventPhoto } from '@app/eventFiles';
import { later } from '@app/later';
import { showSnack } from '@shared/app/store/uiStore';

import { AnimatedOrganic, AppText, Button, FormMessage, Ground, Icon, IconButton, LABEL_CHIP, LABEL_FIELD, LabelChips, LineColorPicker, ListRow, Organic, placedRow, PlaceSearchHost, RevealScrollView, RowPanel, searchPlace, Sheet, SwitchMark, Tappable, TextField, TopBar, useForm, usePanelRowCorners, useUnsaved, type LabelChipItem, type RowPlace } from '@shared/ui/components';
import { listIn, listMove, listOut } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { DayPickerSheet } from '../features/calendar/DayPickerSheet';
import { paintOf } from '../features/calendar/paint';
import { ContactPickerSheet } from '../features/event/ContactPickerSheet';
import { PersonChip } from '../features/event/People';
import { ReminderSheet } from '../features/event/ReminderSheet';
import { RepeatSheet } from '../features/event/RepeatSheet';
import { RichField, type RichFieldHandle } from '../features/event/RichField';
import { ScopeSheet } from '../features/event/ScopeSheet';
import { TimeSheet } from '../features/event/TimeSheet';
import { ZoneSheet } from '../features/event/ZoneSheet';
import type { ScreenProps } from '../navigation/types';

type Sheet = 'startDay' | 'endDay' | 'startTime' | 'endTime' | 'zone' | 'repeat' | 'reminder' | 'guests' | 'address' | 'color' | null;

const WHEN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

/** A reminder added settles in, one removed fades where it was, and what follows closes ranks (Carnet's checklist rows). */
const ROW_IN = listIn;
const ROW_OUT = listOut;
const ROW_MOVE = listMove;

/** A row of the form: its glyph, what it holds, a tap to change it. */
function Field({ icon, children, onPress, label, place }: { icon: GlyphName; children: React.ReactNode; onPress?: () => void; label?: string; place?: RowPlace | null }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  // Its panel tells its first and last rows where they lie: their press follows its corners.
  const shape = usePanelRowCorners(place);
  const body = (
    <>
      <View style={styles.fieldIcon}>
        <Icon name={icon} size={22} color={theme.color.inkMuted} />
      </View>
      <View style={styles.fieldBody}>{children}</View>
    </>
  );
  // A row with nothing to change reads as content, never as a control put out of reach.
  if (!onPress) return <View style={styles.field}>{body}</View>;
  return (
    <Tappable onPress={onPress} style={[styles.field, shape]} accessibilityRole="button" accessibilityLabel={label}>
      {body}
    </Tappable>
  );
}
placedRow(Field);

/**
 * The event's colour as one line, as Google Calendar's: the colour it will be painted in (its own, its
 * labels', or the default) on a pebble in the glyph's slot, then its name; a press opens the swatches.
 */
function ColorLine({ own, shown, onPress }: { own: LineColor | null; shown: LineColor | null; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const words = own ? LINE_COLOR_NAMES[own] : shown ? t('Its labels’ colour') : t('Default colour');
  return (
    <View style={styles.choiceRow}>
      <Tappable onPress={onPress} style={styles.choice} accessibilityRole="button" accessibilityLabel={t('Colour: {name}', { name: words })}>
        <View style={styles.fieldIcon}>
          <Organic pebble={2} style={[styles.colorStone, { backgroundColor: paintOf(theme, shown).fill }]} />
        </View>
        <AppText variant="body" numberOfLines={1} style={styles.grow}>
          {words}
        </AppText>
      </Tappable>
    </View>
  );
}

/**
 * One line of a list in the form (a reminder, « Ajouter un rappel »): the glyph's slot (its glyph on
 * the list's first line only), the words, a press that does one thing; a remove × beside it, its own
 * target, never inside the line's.
 */
function ChoiceLine({ icon, words, link = false, onPress, onRemove, removeLabel, hint }: { icon: GlyphName | null; words: string; link?: boolean; onPress: () => void; onRemove?: () => void; removeLabel?: string; hint?: string }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <View style={styles.choiceRow}>
      <Tappable onPress={onPress} style={styles.choice} accessibilityRole="button" accessibilityLabel={words} accessibilityHint={hint}>
        <View style={styles.fieldIcon}>{icon ? <Icon name={icon} size={22} color={theme.color.inkMuted} /> : null}</View>
        <AppText variant="body" color={link ? theme.color.link : theme.color.ink} numberOfLines={1} style={styles.grow}>
          {words}
        </AppText>
      </Tappable>
      {onRemove ? <IconButton icon="close" size={20} label={removeLabel ?? words} onPress={onRemove} /> : null}
    </View>
  );
}

/** A start or an end: its day, then its time at the row's end, each pressed alone, on the fields' text column. */
function WhenLine({ day, time, dayLabel, timeLabel, onDay, onTime, wrong }: { day: string; time: string | null; dayLabel: string; timeLabel: string; onDay: () => void; onTime: () => void; wrong?: string | null }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const ink = wrong ? theme.color.danger : theme.color.ink;
  return (
    <View style={styles.whenLine}>
      <Tappable onPress={onDay} style={styles.whenDay} accessibilityRole="button" accessibilityLabel={[dayLabel, wrong].filter(Boolean).join(', ')} accessibilityValue={{ text: day }}>
        <AppText variant="body" color={ink}>
          {day}
        </AppText>
      </Tappable>
      {time ? (
        <Tappable onPress={onTime} style={styles.whenTime} accessibilityRole="button" accessibilityLabel={[timeLabel, wrong].filter(Boolean).join(', ')} accessibilityValue={{ text: time }}>
          <AppText variant="body" color={ink}>
            {time}
          </AppText>
        </Tappable>
      ) : null}
    </View>
  );
}

/** What is wrong with the line above, on the fields' text column: its glyph, then the sentence in danger ink. */
function ProblemLine({ text }: { text: string }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <View style={styles.problem} accessibilityLiveRegion="polite">
      <View style={styles.problemGlyph}>
        <Icon name="error" size={16} color={theme.color.danger} />
      </View>
      <AppText variant="meta" color={theme.color.danger} style={styles.grow}>
        {text}
      </AppText>
    </View>
  );
}

export function EditEventScreen({ navigation, route }: ScreenProps<'Edit'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const prefs = useCalendarUiStore(selectPrefs);
  const params = route.params ?? {};
  const today = todayOf(Date.now());
  const zone = deviceZone();
  const description = useRef<RichFieldHandle>(null);
  /** What « @word » in the description may mention, docked on the keyboard. */
  const [mentions, setMentions] = useState<React.ReactNode>(null);

  // What the form starts from: the event at its occurrence, or a new one from what the link hands.
  const initial = useMemo(() => {
    const events = useLibraryStore.getState().events;
    if (params.id) {
      const named = events[params.id];
      const seriesId = named?.recurringId ?? params.id;
      const occurrence = findOccurrence(events, seriesId, named?.recurringId ? named.originalStart : (params.at ?? null));
      if (occurrence) return { occurrence, draft: draftOf(occurrence, events[occurrence.seriesId]) };
    }
    const fallback = `${today}T${String(Math.min(23, new Date().getHours() + 1)).padStart(2, '0')}:00`;
    const start = params.start && WHEN.test(params.start) ? params.start : fallback;
    const end = params.end && WHEN.test(params.end) && isDay(params.end) === isDay(start) && params.end > start ? params.end : isDay(start) ? addDays(start, 1) : addMinutes(start, prefs.eventLength);
    const base = blankDraft(start, end, params.tz || zone, isDay(start) ? prefs.allDayReminders : prefs.reminders);
    // Any app may open this link: its words are only words, its address only the web's.
    const text = handedDescription([params.description, params.notes], params.link);
    // Another app's repeat and guests: a rule this build reads, contacts still in the address book.
    const handed = { rrule: handedRule(params.rrule), contactIds: handedGuests(params.guests, useLibraryStore.getState().people.contacts) };
    return { occurrence: null, draft: { ...base, title: params.title ?? '', place: params.place ?? '', url: handedUrl(params.url), description: text, ...handed } };
    // The form reads its start once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [draft, setDraft] = useState<EventDraft>(initial.draft);
  const [namingLabel, setNamingLabel] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  /** The reminder the sheet changes; null while it adds one. */
  const [replacing, setReplacing] = useState<number | null>(null);
  const [scoping, setScoping] = useState(false);
  const [removed, setRemoved] = useState<readonly string[]>([]);
  const [showZone, setShowZone] = useState(() => !isDay(initial.draft.start) && !!initial.draft.timeZone && initial.draft.timeZone !== zone);
  const people = useLibraryStore(s => s.people.contacts);
  const events = useLibraryStore(s => s.events);
  const labelOrder = useLibraryStore(s => s.calendarLabelOrder);
  const labelRecords = useLibraryStore(s => s.calendarLabels);
  const labels = useMemo(
    () =>
      labelOrder.flatMap((id): LabelChipItem[] => {
        const label = labelRecords[id];
        return label && label.deletedAt === null ? [{ id, name: label.name, color: label.color }] : [];
      }),
    [labelOrder, labelRecords],
  );
  // The places this phone knows: the events' own (the latest first), then the contacts' addresses.
  const known = useMemo((): readonly Place[] => {
    const used = Object.values(events)
      .filter(event => event.deletedAt === null && event.trashedAt === null && event.feedId === null && event.place.trim())
      .sort((a, b) => b.editedAt - a.editedAt)
      .map(event => placeFromLine(event.place));
    const kept = Object.values(people)
      .filter(contact => contact.deletedAt === null && contact.trashedAt === null && !contact.mergedInto)
      .flatMap(contact => contact.addresses.map(address => addressLine(address)).filter(Boolean).map(line => ({ ...placeFromLine(line), detail: [contactName(contact), placeFromLine(line).detail].filter(Boolean).join(' · ') })));
    return [...used, ...kept];
  }, [events, people]);
  const editing = initial.occurrence !== null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial.draft);
  const allDay = isDay(draft.start);
  const set = (patch: Partial<EventDraft>): void => setDraft(current => ({ ...current, ...patch }));

  // Leaving with changes (×, Back, the gesture) asks first.
  const unsaved = useUnsaved(dirty, { screen: true });
  const endsBefore = draft.end < draft.start || (allDay && draft.end <= draft.start);
  const form = useForm({
    end: endsBefore ? t('The end comes before the start: choose a later end day or time.') : null,
    url: readsAsEventUrl(draft.url) ? null : t('A link such as https://example.com/tickets, or meet.example.org.'),
  });
  const endField = form.field('end');
  const endProblem = form.error('end');
  /** The end picked: one before the start is said at once (a pick is a field left). */
  const setEnd = (end: string): void => {
    set({ end });
    endField.left(end);
  };

  const commit = (scope: EditScope): void => {
    const clean = { ...draft, title: draft.title.trim(), place: draft.place.trim(), url: cleanEventUrl(draft.url).url };
    unsaved.saved();
    // As on the web: « Événement enregistré », with « Annuler » for a change.
    if (initial.occurrence) {
      const undo = saveEvent(initial.occurrence, clean, scope, { title: initial.draft.title, description: initial.draft.description });
      navigation.goBack();
      showSnack(t('Event saved'), { label: t('Undo'), run: undo }, { tone: 'success' });
    } else {
      const id = addEvent(clean);
      navigation.replace('Event', { id });
      showSnack(t('Event saved'), undefined, { tone: 'success' });
    }
  };
  const save = (): void => {
    if (!dirty && editing) {
      navigation.goBack();
      return;
    }
    later(
      form.submit(() => {
        if (initial.occurrence && asksScope(initial.occurrence)) setScoping(true);
        else commit('all');
      }),
    );
  };

  // A new start keeps the length; all day moves to the day, and back to the next hour.
  const setStart = (start: string): void => set({ start, end: keepLength(draft, start) });
  const setAllDay = (on: boolean): void => {
    if (on === allDay) return;
    const start = on ? draft.start.slice(0, 10) : `${draft.start.slice(0, 10)}T${String(Math.min(23, new Date().getHours() + 1)).padStart(2, '0')}:00`;
    set({ start, end: on ? addDays(start, 1) : addMinutes(start, prefs.eventLength), timeZone: on ? '' : draft.timeZone || zone, reminders: on ? prefs.allDayReminders : prefs.reminders });
  };
  // An all-day event's end is stored the day after its last: the form shows its last day.
  const lastDay = allDay ? addDays(draft.end, -1) : draft.end.slice(0, 10);
  const rule = draft.rrule ? parseRule(draft.rrule) : null;
  const repeatWords = !draft.rrule ? choiceWords('none', draft.start) : choiceOf(draft.rrule, draft.start) !== 'custom' ? choiceWords(choiceOf(draft.rrule, draft.start), draft.start) : rule ? describeRule(rule, draft.start, draft.timeZone) : draft.rrule;

  const openReminder = (minutes: number | null): void => {
    setReplacing(minutes);
    setSheet('reminder');
  };
  const pickReminder = (minutes: number): void => {
    const kept = replacing === null ? draft.reminders : draft.reminders.filter(each => each !== replacing);
    set({ reminders: [...new Set([...kept, minutes])].sort((a, b) => a - b) });
  };
  const reminderChoices = allDay ? REMINDER_CHOICES.allDay : REMINDER_CHOICES.timed;
  const moreReminders = draft.reminders.length < EVENT_LIMITS.reminders && reminderChoices.some(minutes => !draft.reminders.includes(minutes));

  const attach = async (photo: boolean): Promise<void> => {
    const outcome = photo ? await pickEventPhoto() : await pickEventDocument();
    if (outcome.status === 'ok') set({ files: [...draft.files, outcome.file] });
    else if (outcome.status === 'error') showSnack(outcome.message, undefined, { tone: 'error' });
  };

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={editing ? t('Edit event') : t('New event')} closes onBack={() => navigation.goBack()} actions={<Button label={t('Save')} small busy={form.busy} onPress={save} style={styles.saveButton} />} />
      {/* Sent with problems, how many is said by the action, as every form does (`FormMessage`). */}
      {form.message ? (
        <View style={styles.message}>
          <FormMessage message={form.message} />
        </View>
      ) : null}
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        {/* A place typed brings its field up, its suggestions dropping under it above the keyboard. */}
        <RevealScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* The form as it opens is simply there; what changes after (a reminder added or removed) moves. */}
          <LayoutAnimationConfig skipEntering>
            <TextField kind="text" value={draft.title} onChangeText={title => set({ title })} placeholder={t('Add a title')} accessibilityLabel={t('Title')} style={styles.title} returnKeyType="done" maxLength={EVENT_LIMITS.title} autoFocus={!editing && !draft.title} />

            <RowPanel outline="card" style={styles.panel}>
              <ListRow
                title={t('All day')}
                icon="clock"
                onPress={() => setAllDay(!allDay)}
                accessibilityRole="switch"
                accessibilityState={{ checked: allDay }}
                trailing={<SwitchMark checked={allDay} />}
              />
              <WhenLine
                day={weekdayDay(draft.start.slice(0, 10))}
                time={allDay ? null : clockWords(clockPart(draft.start), prefs.twelveHours)}
                dayLabel={t('Start day')}
                timeLabel={t('Start time')}
                onDay={() => setSheet('startDay')}
                onTime={() => setSheet('startTime')}
              />
              <WhenLine
                day={weekdayDay(lastDay)}
                time={allDay ? null : clockWords(clockPart(draft.end), prefs.twelveHours)}
                dayLabel={t('End day')}
                timeLabel={t('End time')}
                onDay={() => setSheet('endDay')}
                onTime={() => setSheet('endTime')}
                wrong={endProblem}
              />
              {endProblem ? <ProblemLine text={endProblem} /> : null}
              {!allDay && showZone ? (
                <Field icon="globe" onPress={() => setSheet('zone')} label={t('Time zone')}>
                  <AppText variant="body">{(draft.timeZone || zone).replace(/_/g, ' ')}</AppText>
                  {draft.timeZone && draft.timeZone !== zone ? <AppText variant="meta">{t('Local times, in {zone}', { zone: draft.timeZone.replace(/_/g, ' ').split('/').pop() ?? draft.timeZone })}</AppText> : null}
                </Field>
              ) : null}
              {!allDay && !showZone ? <ChoiceLine icon="globe" words={t('Time zone')} link onPress={() => (setShowZone(true), setSheet('zone'))} /> : null}
              <Field icon="refresh" onPress={() => setSheet('repeat')} label={t('Repeat')}>
                <AppText variant="body">{repeatWords}</AppText>
              </Field>
            </RowPanel>

            {/* The place is a row as the guests are: a press looks for it over the whole screen, the form never moving. */}
            <Animated.View layout={ROW_MOVE}>
              <Organic outline="card" style={styles.panel}>
                <View style={styles.placeRow}>
                  <View style={styles.grow}>
                    <Field
                      icon="mapPin"
                      onPress={() => searchPlace({ value: draft.place, known, label: t('Place'), onChangeText: place => set({ place }) })}
                      label={draft.place.trim() ? t('Place: {place}', { place: draft.place.trim() }) : t('Add a place')}
                    >
                      <AppText variant="body" color={draft.place.trim() ? theme.color.ink : theme.color.link}>
                        {draft.place.trim() || t('Add a place')}
                      </AppText>
                    </Field>
                  </View>
                  <IconButton icon="person" label={t('A contact’s address')} onPress={() => setSheet('address')} />
                </View>
                <Field icon="people" onPress={() => setSheet('guests')} label={t('Add people')}>
                  {draft.contactIds.length > 0 ? (
                    <View style={styles.people}>
                      {draft.contactIds.map(id => (
                        <PersonChip key={id} contact={resolveContact(people, id)} onRemove={() => set({ contactIds: draft.contactIds.filter(each => each !== id) })} />
                      ))}
                    </View>
                  ) : null}
                  <AppText variant="body" color={theme.color.link}>
                    {draft.contactIds.length > 0 ? tc('event', 'Add someone') : t('Add people')}
                  </AppText>
                </Field>
              </Organic>
            </Animated.View>

            {/* Reminders, labels and colour: what is ticked or added here moves, the panel's edge with it (no field grows as it is typed in it). */}
            <AnimatedOrganic layout={ROW_MOVE} outline="card" style={styles.panel}>
              {draft.reminders.map((minutes, index) => {
                const words = reminderWords(minutes, allDay);
                return (
                  <Animated.View key={`reminder:${minutes}`} layout={ROW_MOVE} entering={ROW_IN} exiting={ROW_OUT}>
                    <ChoiceLine
                      icon={index === 0 ? 'bell' : null}
                      words={words}
                      hint={t('Edit the reminder')}
                      onPress={() => openReminder(minutes)}
                      onRemove={() => set({ reminders: draft.reminders.filter(each => each !== minutes) })}
                      removeLabel={t('Remove the reminder {when}', { when: words })}
                    />
                  </Animated.View>
                );
              })}
              {moreReminders ? (
                <Animated.View layout={ROW_MOVE} entering={ROW_IN} exiting={ROW_OUT}>
                  <ChoiceLine icon={draft.reminders.length === 0 ? 'bell' : null} words={t('Add a reminder')} link onPress={() => openReminder(null)} />
                </Animated.View>
              ) : null}
              <Animated.View layout={ROW_MOVE} style={styles.labelsRow}>
                <View style={[styles.fieldIcon, styles.labelsGlyph, namingLabel && labels.length === 0 ? styles.labelsGlyphNaming : null]}>
                  <Icon name="tag" size={22} color={theme.color.inkMuted} />
                </View>
                <View style={styles.grow} accessibilityRole="list" accessibilityLabel={t('Labels')}>
                  <LabelChips
                    onNaming={setNamingLabel}
                    labels={labels}
                    chosen={draft.labelIds}
                    onToggle={id =>
                      setDraft(current => ({
                        ...current,
                        labelIds: current.labelIds.includes(id) ? current.labelIds.filter(each => each !== id) : current.labelIds.length < EVENT_LIMITS.labels ? [...current.labelIds, id] : current.labelIds,
                      }))
                    }
                    onCreate={name => {
                      if (labelNameTaken(useLibraryStore.getState().calendarLabels, name)) return { problem: t('This label already exists: choose another name.') };
                      const id = createLabel(name);
                      setDraft(current => ({ ...current, labelIds: current.labelIds.length < EVENT_LIMITS.labels ? [...current.labelIds, id] : current.labelIds }));
                      return { id };
                    }}
                    maxLength={EVENT_LIMITS.labelName}
                    words={{ add: t('New label'), placeholder: t('Label name'), field: t('New label’s name'), create: t('Create the label') }}
                  />
                </View>
              </Animated.View>
              {/* One line, as Google Calendar's: the swatches open in a sheet, so fifteen of them never take the form's room. */}
              <Animated.View layout={ROW_MOVE}>
                <ColorLine own={draft.color} shown={eventColor({ color: draft.color, labelIds: draft.labelIds, feedId: null }, labelRecords, {})} onPress={() => setSheet('color')} />
              </Animated.View>
            </AnimatedOrganic>

            {/* Moved as the panel above changes; its own height follows what is typed at once, so it is never animated. */}
            <Animated.View layout={ROW_MOVE}>
              <Organic outline="card" style={styles.panel}>
                <View style={styles.descriptionRow}>
                  <View style={[styles.fieldIcon, styles.descriptionGlyph]}>
                    <Icon name="text" size={22} color={theme.color.inkMuted} />
                  </View>
                  <View style={[styles.grow, styles.description]}>
                    <RichField ref={description} value={draft.description} onChange={value => set({ description: value })} label={t('Description')} placeholder={t('Add a description')} except={initial.occurrence?.seriesId ?? null} onSuggestions={setMentions} />
                    <Button label={t('Mention')} icon="mention" kind="text" small onPress={() => description.current?.startMention()} />
                  </View>
                </View>
                <View style={styles.linkRow}>
                  <View style={[styles.fieldIcon, styles.linkGlyph]}>
                    <Icon name="link" size={22} color={theme.color.inkMuted} />
                  </View>
                  <View style={styles.grow}>
                    <TextField
                      kind="url"
                      field={form.field('url')}
                      returnKeyType="done"
                      maxLength={EVENT_LIMITS.url}
                      value={draft.url}
                      onChangeText={url => {
                        setRemoved([]);
                        set({ url });
                      }}
                      onEndEditing={event => {
                        const cleaned = cleanEventUrl(event.nativeEvent.text);
                        setRemoved(cleaned.removed);
                        if (cleaned.url !== draft.url) set({ url: cleaned.url });
                      }}
                      placeholder={t('Add a link (tickets, video call…)')}
                      accessibilityLabel={t('Link')}
                      help={removed.length > 0 ? t('Tracking removed: {names}', { names: removed.join(', ') }) : undefined}
                    />
                  </View>
                </View>
                {draft.files.map(file => (
                  <View key={file.id} style={styles.fileRow}>
                    <View style={styles.fieldIcon}>
                      <Icon name={file.mime.startsWith('image/') ? 'image' : file.mime === 'application/pdf' ? 'pdf' : 'file'} size={22} color={theme.color.inkMuted} />
                    </View>
                    <AppText variant="body" numberOfLines={1} style={styles.grow}>
                      {file.name}
                    </AppText>
                    <IconButton icon="close" size={20} label={t('Remove {name}', { name: file.name })} onPress={() => set({ files: draft.files.filter(each => each.id !== file.id) })} />
                  </View>
                ))}
                {/* Lines of the form, as « Ajouter un rappel »: the glyph in its slot, the words on the rows' column. */}
                <ChoiceLine icon="image" words={t('Attach a photo')} link onPress={() => later(attach(true))} />
                <ChoiceLine icon="file" words={t('Attach a file')} link onPress={() => later(attach(false))} />
              </Organic>
            </Animated.View>
          </LayoutAnimationConfig>
        </RevealScrollView>
        {mentions}
      </KeyboardAvoidingView>

      <DayPickerSheet visible={sheet === 'startDay'} title={t('Start day')} day={draft.start.slice(0, 10)} today={today} weekStart={prefs.weekStart} onDismiss={() => setSheet(null)} onDay={day => setStart(allDay ? day : `${day}${draft.start.slice(10)}`)} />
      <DayPickerSheet
        visible={sheet === 'endDay'}
        title={t('End day')}
        day={lastDay}
        today={today}
        weekStart={prefs.weekStart}
        onDismiss={() => setSheet(null)}
        onDay={day => setEnd(allDay ? addDays(day < draft.start ? draft.start : day, 1) : `${day}${draft.end.slice(10)}`)}
      />
      <TimeSheet visible={sheet === 'startTime'} title={t('Start time')} value={clockPart(draft.start)} twelveHours={prefs.twelveHours} onDismiss={() => setSheet(null)} onTime={clock => setStart(`${draft.start.slice(0, 10)}T${clock}`)} />
      <TimeSheet
        visible={sheet === 'endTime'}
        title={t('End time')}
        value={clockPart(draft.end)}
        twelveHours={prefs.twelveHours}
        onDismiss={() => setSheet(null)}
        onTime={clock => {
          const end = `${draft.end.slice(0, 10)}T${clock}`;
          // An end before the start on the same day ends the next day, as a night out does.
          setEnd(end <= draft.start ? `${addDays(draft.start, 1)}T${clock}` : end);
        }}
      />
      <Sheet visible={sheet === 'color'} onDismiss={() => setSheet(null)} title={t('Colour')}>
        {/* A pick is the answer: the sheet goes with it, as Google Calendar's. */}
        <View style={styles.colorSheet}>
          <LineColorPicker
            value={draft.color}
            onChange={color => {
              set({ color });
              setSheet(null);
            }}
            allowNone
            noneLabel={t('Its labels’ colour')}
            accessibilityLabel={t('Colour')}
          />
        </View>
      </Sheet>
      <ZoneSheet visible={sheet === 'zone'} zone={draft.timeZone || zone} onDismiss={() => setSheet(null)} onZone={timeZone => set({ timeZone })} />
      <RepeatSheet visible={sheet === 'repeat'} start={draft.start} rrule={draft.rrule} today={today} weekStart={prefs.weekStart} onDismiss={() => setSheet(null)} onRule={rrule => set({ rrule })} />
      <ReminderSheet visible={sheet === 'reminder'} allDay={allDay} chosen={draft.reminders} replacing={replacing} onDismiss={() => setSheet(null)} onPick={pickReminder} />
      <ContactPickerSheet visible={sheet === 'guests'} title={t('Add people')} onDismiss={() => setSheet(null)} onPick={contact => set({ contactIds: [...new Set([...draft.contactIds, contact.id])] })} />
      <ContactPickerSheet
        visible={sheet === 'address'}
        title={t('A contact’s address')}
        only={contact => contact.addresses.some(address => addressLine(address))}
        onDismiss={() => setSheet(null)}
        onPick={contact => set({ place: addressLine(contact.addresses.find(address => addressLine(address))!) })}
      />
      <ScopeSheet visible={scoping} deleting={false} onDismiss={() => setScoping(false)} onScope={commit} />
      {unsaved.dialog}
      <PlaceSearchHost />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    fill: { flex: 1 },
    content: { padding: 12, paddingBottom: 64, gap: 14 },
    saveButton: { marginRight: 8 },
    message: { paddingHorizontal: 16, paddingBottom: 8 },
    problem: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginLeft: 56, marginRight: 16, marginBottom: 6 },
    problemGlyph: { marginTop: 1 },
    title: { fontSize: 22 },
    // Its rows 6 in from its every edge (theirs 2 and its 4), as from its sides.
    panel: { paddingVertical: 4, backgroundColor: theme.color.paper },
    // The day and the time on the text column of the rows around (a list row's: 6 in, 10, a 24 glyph, 16).
    // The day and the time a little apart, and each line from the next, so two presses never touch.
    whenLine: { flexDirection: 'row', alignItems: 'center', gap: GEOMETRY.rowGap, marginLeft: 48, marginRight: 6, marginVertical: GEOMETRY.rowGap / 2 },
    whenDay: { flex: 1, minHeight: 48, justifyContent: 'center', paddingHorizontal: 8, ...corners(SHAPES.tab) },
    whenTime: { minHeight: 48, minWidth: 72, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 10, ...corners(SHAPES.tab) },
    field: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, minHeight: 52, paddingHorizontal: 10, paddingVertical: 12, marginHorizontal: 6, marginVertical: GEOMETRY.rowGap / 2, ...corners(SHAPES.tab) },
    fieldIcon: { width: 24, alignItems: 'center' },
    fieldBody: { flex: 1, gap: 4 },
    // A boxed field on the rows' column: its glyph in the slot (16 in), its edge at 56, its glyph on the field's middle.
    linkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, paddingLeft: 16, paddingRight: 14, paddingVertical: 6 },
    linkGlyph: { height: 52, justifyContent: 'center' },
    grow: { flex: 1 },
    // A list's line on the rows' text column (6 in, 10, a 24 glyph slot, 16), its × beside it.
    choiceRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 6, marginRight: 8, marginVertical: GEOMETRY.rowGap / 2 },
    choice: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 52, paddingHorizontal: 10, ...corners(SHAPES.tab) },
    labelsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, paddingLeft: 16, paddingRight: 14, paddingVertical: 8 },
    // The tag on the chips' first line.
    labelsGlyph: { height: LABEL_CHIP, justifyContent: 'center' },
    // The glyph centres on the field a first label is named in.
    labelsGlyphNaming: { height: LABEL_FIELD },
    // The colour's pebble in the glyph's slot, a little under the glyphs' size so it reads as a mark, not a button.
    colorStone: { width: 22, height: 20 },
    colorSheet: { paddingHorizontal: 8, paddingBottom: 8 },
    people: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    // The contact's address at the row's end, beside the place's own press.
    placeRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
    descriptionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, paddingLeft: 16, paddingRight: 14, paddingVertical: 8 },
    descriptionGlyph: { paddingTop: 14 },
    description: { gap: 4 },
    // A file kept: its kind's glyph in the slot, its name on the words' column, its × at the end as the reminders' are.
    fileRow: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 52, paddingLeft: 16, paddingRight: 8, marginVertical: GEOMETRY.rowGap / 2 },
  });
