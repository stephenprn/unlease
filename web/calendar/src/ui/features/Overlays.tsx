/**
 * What Agenda draws over its pages: an occurrence's popover where it was clicked (or a birthday's, a
 * reminder's, a page's day), the quick form of an event drawn on the grid, the question « which of a
 * series' events? », and Claude's panel of questions about the calendar.
 */
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';

import { getLocale, t } from '@unlease/core/i18n';
import { ASK_STARTERS, askContext } from '@unlease/calendar/services/ask';
import { EVENT_LIMITS, isOwn } from '@unlease/calendar/models/events';
import type { GlyphName } from '@unlease/design/glyphs';
import { blankDraft, keepLength, type EditScope, type EventDraft } from '@unlease/calendar/services/editing';
import { birthdaysIn } from '@unlease/calendar/services/layers';
import { findOccurrence, hiddenFeedIds, occurrencesIn, type Occurrence } from '@unlease/calendar/services/occurrences';
import { addDays, addMinutes, deviceZone, instantToDay, instantToWall, isDay } from '@unlease/calendar/services/time';
import type { CalendarAskTurn } from '@unlease/calendar/sync/routes';

import { useContactsStore } from '@contacts/app/store/library';
import { selectServer, useSettingsStore } from '@shared/app/store/settings';
import { showSnack } from '@shared/app/store/ui';
import { Button, Spinner } from '@shared/ui/components/Button';
import { SwitchMark } from '@shared/ui/components/Checkbox';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton } from '@shared/ui/components/IconButton';
import layers from '@shared/ui/components/layers.module.css';
import { Layer } from '@shared/ui/components/Layer';
import { PlaceField } from '@shared/ui/components/PlaceField';
import { Popover } from '@shared/ui/components/Popover';
import { useUnsaved } from '@shared/ui/components/useUnsaved';
import { navigate, type Route } from '@shared/ui/router';
import { askCalendar } from '../../app/api';
import { kindOf, LAYER_COLORS, useColorOf } from '../../app/hooks/useItems';
import { useNow } from '../../app/hooks/useToday';
import { mentionWords } from '../../app/names';
import { addEvent } from '../../app/store/actions';
import { closePeek, closeQuick, handDraft, setAskOpen, setQuickTimes, useCalendarUi, type Anchor, type QuickDraft } from '../../app/store/calendarUi';
import { useCalendarStore } from '../../app/store/library';
import { usePrefsStore } from '../../app/store/prefs';
import styles from '../calendar.module.css';
import { paths } from '../routes';
import { ChoiceRows } from './ChoiceRows';
import { DescriptionField } from './DescriptionField';
import { duplicateOccurrence, EventDetails, PeekTools } from './EventDetails';
import { DateField, FormRow, TimeField, useKnownPlaces } from './Fields';
import { BirthdayDetails, PageDateDetails, ReminderDetails } from './LayerDetails';
import { PeoplePicker } from './People';

/** A rectangle on screen as an element a popover can stand by. */
function AnchorBox({ anchor, anchorRef }: { anchor: Anchor; anchorRef: React.RefObject<HTMLSpanElement | null> }) {
  const style: CSSProperties = { left: anchor.left, top: anchor.top, width: anchor.width, height: anchor.height };
  return <span ref={anchorRef} className={styles.anchor} style={style} aria-hidden="true" />;
}

/** What a peeked key is: an occurrence of an event, or a layer's item and what it names. */
function usePeeked(key: string): { readonly kind: 'event'; readonly item: Occurrence } | { readonly kind: 'birthday'; readonly contactId: string; readonly day: string } | { readonly kind: 'reminder'; readonly noteId: string } | { readonly kind: 'page'; readonly pageId: string; readonly day: string } | null {
  const events = useCalendarStore(s => s.events);
  return useMemo(() => {
    const kind = kindOf(key);
    const parts = key.split(':');
    if (kind === 'birthday') return { kind, contactId: parts[1]!, day: parts[2]! };
    if (kind === 'reminder') return { kind, noteId: parts[1]! };
    if (kind === 'page') return { kind, pageId: parts[1]!, day: parts[2]! };
    const at = key.indexOf('@');
    const item = at > 0 ? findOccurrence(events, key.slice(0, at), key.slice(at + 1)) : null;
    return item ? { kind: 'event', item } : null;
  }, [events, key]);
}

/** A peeked item's title: an event's, the person's, the note's, the page's. */
function peekTitle(peeked: NonNullable<ReturnType<typeof usePeeked>>): string {
  switch (peeked.kind) {
    case 'event':
      return peeked.item.event.title.trim() || t('Untitled');
    case 'birthday':
      return mentionWords({ type: 'contact', id: peeked.contactId });
    case 'reminder':
      return mentionWords({ type: 'note', id: peeked.noteId });
    case 'page':
      return mentionWords({ type: 'page', id: peeked.pageId });
  }
}

function Peek({ peekKey, anchor }: { peekKey: string; anchor: Anchor }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const peeked = usePeeked(peekKey);
  const colorOf = useColorOf();
  const titleId = useId();
  const open = peeked !== null;
  useEffect(() => {
    if (!open) closePeek();
  }, [open]);
  if (!peeked) return null;
  const item = peeked.kind === 'event' ? peeked.item : null;
  const color = peeked.kind === 'event' ? colorOf(peeked.item) : LAYER_COLORS[peeked.kind];
  const title = peekTitle(peeked);
  const fullPage = item ? paths.event(item.seriesId, item.repeats ? item.occurrence : null) : peeked.kind === 'birthday' ? paths.birthday(peeked.contactId) : null;
  return (
    <>
      <AnchorBox anchor={anchor} anchorRef={anchorRef} />
      <Popover open onDismiss={closePeek} anchor={anchorRef} label={title} width={400}>
        <div className={styles.peek} aria-labelledby={titleId}>
          {item ? (
            <PeekTools
              item={item}
              onClose={closePeek}
              onOpen={() => {
                closePeek();
                navigate(fullPage!);
              }}
            />
          ) : (
            <div className={styles.peekTools}>
              {fullPage ? (
                <IconButton
                  icon="external"
                  label={t('Open')}
                  compact
                  onClick={() => {
                    closePeek();
                    navigate(fullPage);
                  }}
                />
              ) : null}
              <IconButton icon="close" label={t('Close')} compact onClick={closePeek} />
            </div>
          )}
          <h2 id={titleId} className={`${styles.peekTitle} t-title`} data-line={color ?? undefined}>
            <span className={styles.swatch} aria-hidden="true" />
            <span>{title}</span>
          </h2>
          {peeked.kind === 'event' ? (
            <EventDetails
              item={peeked.item}
              withWhen
              // A subscription's event is read-only: its copy is in sight, where it says so.
              onCopy={
                isOwn(peeked.item.event)
                  ? undefined
                  : () => {
                      closePeek();
                      duplicateOccurrence(peeked.item);
                    }
              }
            />
          ) : null}
          {peeked.kind === 'birthday' ? <BirthdayDetails contactId={peeked.contactId} day={peeked.day} /> : null}
          {peeked.kind === 'reminder' ? <ReminderDetails noteId={peeked.noteId} /> : null}
          {peeked.kind === 'page' ? <PageDateDetails pageId={peeked.pageId} day={peeked.day} time={null} /> : null}
        </div>
      </Popover>
    </>
  );
}

/** How wide the quick form stands, and how far from the slot it stands beside. */
const QUICK_WIDTH = 440;
const QUICK_GAP = 8;
const QUICK_MARGIN = 8;

/**
 * Where the quick form stands, as Google's: beside the slot drawn (on its right, else on its left),
 * its top on the slot's, slid up only as far as the window needs; with no room on either side (a
 * day's wide column, a narrow window), under or over the slot. A popover drops under its anchor:
 * beside the slot, the anchor is that side's edge from the window's top down to the slot's top.
 */
function besideSlot(slot: Anchor): { readonly anchor: Anchor; readonly align: 'start' | 'end' } {
  const viewport = document.documentElement.clientWidth;
  const height = Math.max(0, slot.top - 4);
  const right = slot.left + slot.width + QUICK_GAP;
  if (right + QUICK_WIDTH + QUICK_MARGIN <= viewport) return { anchor: { left: right, top: 0, width: 0, height }, align: 'start' };
  const left = slot.left - QUICK_GAP;
  if (left - QUICK_WIDTH >= QUICK_MARGIN) return { anchor: { left, top: 0, width: 0, height }, align: 'end' };
  return { anchor: slot, align: 'start' };
}

/** A row of the quick form not filled yet: its glyph in the slot, what it adds; a press opens it into its field, in place. */
function QuickRow({ icon, label, onOpen }: { icon: GlyphName; label: string; onOpen: () => void }) {
  return (
    <button type="button" className={styles.quickRow} onClick={onOpen}>
      <Icon name={icon} size={22} />
      <span className="t-body">{label}</span>
    </button>
  );
}

type QuickPart = 'place' | 'people' | 'description';

/**
 * The quick form of an event drawn on the grid (or a day of the month), as Google's: its title; its
 * day and hours, which the span drawn follows; then its place, its people and its description, each a
 * line until it is opened into its field (the whole form's own); « Plus d'options » carries all of it
 * to the whole form. Entrée in a line saves (⌘/Ctrl + Entrée anywhere), Échap closes, asking first
 * once something is typed; saved in one batch.
 */
function Quick({ quick }: { quick: QuickDraft }) {
  const { start, end } = quick;
  const anchorRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Placed once as it opens: what is typed or picked in it never moves it.
  const [placed] = useState(() => besideSlot(quick.anchor));
  const [opening] = useState(() => ({ start, end }));
  const [title, setTitle] = useState('');
  const [place, setPlace] = useState('');
  const [contactIds, setContactIds] = useState<readonly string[]>([]);
  const [description, setDescription] = useState('');
  const [opened, setOpened] = useState<readonly QuickPart[]>([]);
  const prefs = usePrefsStore();
  const { today } = useNow();
  const known = useKnownPlaces();
  const allDay = isDay(start);
  const draft: EventDraft = {
    ...blankDraft(start, end, deviceZone(), allDay ? prefs.allDayReminders : prefs.reminders),
    title: title.trim(),
    place: place.trim(),
    contactIds,
    description,
  };
  const dirty = draft.title !== '' || draft.place !== '' || contactIds.length > 0 || description.trim() !== '' || start !== opening.start || end !== opening.end;
  const unsaved = useUnsaved(dirty);
  const open = (part: QuickPart): void => setOpened(current => [...current, part]);
  const save = (): void => {
    addEvent(draft);
    closeQuick();
    showSnack(t('Event saved'), undefined, { tone: 'success' });
  };
  const more = (): void => {
    handDraft(draft);
    closeQuick();
    navigate(paths.newEvent({ start, end, title: draft.title || undefined }));
  };
  const setStart = (next: string): void => setQuickTimes(next, keepLength({ start, end }, next));
  // Opened on a whole day (the month's), its switch says so and gives it hours, as the whole form's does.
  const toggleAllDay = (): void => {
    const day = start.slice(0, 10);
    if (allDay) setQuickTimes(`${day}T09:00`, addMinutes(`${day}T09:00`, prefs.eventLength));
    else setQuickTimes(day, addDays(end.slice(0, 10) > day ? end.slice(0, 10) : day, 1));
  };
  // An all-day event's last day as shown (its stored end is the day after); a timed one's end on its start's day, or the next.
  const lastDay = allDay ? addDays(end, -1) : end.slice(0, 10);
  const sameDay = !allDay && end.slice(0, 10) === start.slice(0, 10);
  return (
    <>
      <AnchorBox anchor={placed.anchor} anchorRef={anchorRef} />
      <Popover open onDismiss={unsaved.guard(closeQuick)} anchor={anchorRef} align={placed.align} label={t('New event')} width={QUICK_WIDTH} className={styles.quickPanel} initialFocus={inputRef}>
        <form
          className={styles.quick}
          onSubmit={event => {
            event.preventDefault();
            save();
          }}
          onKeyDown={event => {
            // ⌘ or Ctrl + Entrée saves from the description too, as on the whole form.
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
              event.preventDefault();
              save();
            }
          }}
        >
          <input ref={inputRef} className={styles.titleInput} value={title} onChange={event => setTitle(event.target.value)} placeholder={t('Add a title')} aria-label={t('Title')} maxLength={EVENT_LIMITS.title} autoComplete="off" enterKeyHint="done" />
          <FormRow icon="clock" label={t('When')} wide>
            <div className={styles.whenLine}>
              <div className={styles.whenGroup}>
                <DateField value={start.slice(0, 10)} label={allDay ? t('First day') : t('Start day')} weekStart={prefs.weekStart} today={today} onChange={day => setStart(allDay ? day : `${day}${start.slice(10)}`)} />
                {!allDay ? <TimeField value={start.slice(11, 16)} label={t('Start time')} twelveHours={prefs.twelveHours} onChange={clock => setStart(`${start.slice(0, 10)}T${clock}`)} /> : null}
              </div>
              {/* One day all day is its day alone; else the end, its day only when it is another. */}
              {!allDay || lastDay !== start ? (
                <>
                  <span className={styles.whenDash} aria-hidden="true">
                    –
                  </span>
                  <div className={styles.whenGroup} data-end="">
                    {!allDay ? (
                      <TimeField
                        value={end.slice(11, 16)}
                        label={t('End time')}
                        from={sameDay ? start.slice(11, 16) : undefined}
                        twelveHours={prefs.twelveHours}
                        // A time before the start's ends the next day, as on the whole form.
                        onChange={clock => setQuickTimes(start, `${end.slice(0, 10)}T${clock}` < start ? `${addDays(end.slice(0, 10), 1)}T${clock}` : `${end.slice(0, 10)}T${clock}`)}
                      />
                    ) : null}
                    {allDay || !sameDay ? (
                      <DateField
                        value={lastDay}
                        label={allDay ? t('Last day') : t('End day')}
                        weekStart={prefs.weekStart}
                        today={today}
                        // Never before the start: an earlier day keeps the end where it was.
                        onChange={day => setQuickTimes(start, allDay ? addDays(day < start ? start : day, 1) : `${day}${end.slice(10)}` > start ? `${day}${end.slice(10)}` : end)}
                      />
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
            {isDay(opening.start) ? (
              <div className={styles.whenOptions}>
                <button type="button" role="switch" aria-checked={allDay} className={styles.switchRow} onClick={toggleAllDay}>
                  <SwitchMark checked={allDay} />
                  <span className="t-body">{t('All day')}</span>
                </button>
              </div>
            ) : null}
          </FormRow>
          {opened.includes('place') ? (
            <FormRow icon="mapPin" label={t('Place')} wide>
              <PlaceField ariaLabel={t('Place')} value={place} onChange={next => setPlace(next.slice(0, EVENT_LIMITS.place))} known={known} placeholder={t('Add a place')} autoFocus />
            </FormRow>
          ) : (
            <QuickRow icon="mapPin" label={t('Add a place')} onOpen={() => open('place')} />
          )}
          {opened.includes('people') ? (
            <FormRow icon="people" label={t('With')} wide>
              <PeoplePicker value={contactIds} max={EVENT_LIMITS.contacts} onChange={setContactIds} autoFocus />
            </FormRow>
          ) : (
            <QuickRow icon="people" label={t('Add people')} onOpen={() => open('people')} />
          )}
          {opened.includes('description') ? (
            <FormRow icon="text" label={t('Description')} wide>
              <DescriptionField markup={description} onChange={setDescription} autoFocus />
            </FormRow>
          ) : (
            <QuickRow icon="text" label={t('Add a description')} onOpen={() => open('description')} />
          )}
          <div className={styles.formFoot}>
            <Button kind="text" onClick={more}>
              {t('More options')}
            </Button>
            <Button type="submit" icon="check">
              {t('Save')}
            </Button>
          </div>
        </form>
      </Popover>
      {unsaved.dialog}
    </>
  );
}

/** « Cet événement, et les suivants, ou tous ? », for a change to an event of a series. */
function ScopeForm({ title, resolve }: { title: string; resolve: (scope: EditScope | null) => void }) {
  const [scope, setScope] = useState<EditScope>('this');
  const titleId = useId();
  return (
    <DialogFrame
      title={title}
      titleId={titleId}
      onClose={() => resolve(null)}
      className={layers.dialog}
      onSubmit={event => {
        event.preventDefault();
        resolve(scope);
      }}
      foot={
        <>
          <Button kind="text" onClick={() => resolve(null)}>
            {t('Cancel')}
          </Button>
          <Button type="submit">{t('OK')}</Button>
        </>
      }
    >
      <ChoiceRows<EditScope>
        labelledBy={titleId}
        value={scope}
        onChange={setScope}
        choices={[
          { value: 'this', label: t('This event') },
          { value: 'following', label: t('This and following events') },
          { value: 'all', label: t('All events') },
        ]}
      />
    </DialogFrame>
  );
}

function ScopeDialog() {
  const ask = useCalendarUi(s => s.scopeAsk);
  return (
    <Layer open={ask !== null} onDismiss={() => ask?.resolve(null)} label={ask?.title ?? ''}>
      {ask ? <ScopeForm title={ask.title} resolve={ask.resolve} /> : null}
    </Layer>
  );
}

/**
 * Questions about the calendar to Claude, in a side panel (a whole page on a phone-sized window): what
 * it reads is built here, from three months back to a year ahead. The question field stays at the
 * foot, Entrée asks (Maj+Entrée goes to the line); the conversation scrolls above it.
 */
function AskPanel() {
  const open = useCalendarUi(s => s.askOpen);
  const server = useSettingsStore(selectServer);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<CalendarAskTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [turns.length, busy]);
  const ask = async (typed: string = question): Promise<void> => {
    const asked = typed.trim();
    if (!asked || !server || busy) return;
    setBusy(true);
    setError(null);
    setQuestion(asked);
    try {
      const now = Date.now();
      const today = instantToDay(now);
      const { events, labels, feeds } = useCalendarStore.getState();
      const from = addDays(today, -90);
      const to = addDays(today, 366);
      const occurrences = occurrencesIn(Object.values(events), from, to, { hiddenFeeds: hiddenFeedIds(Object.values(feeds)) });
      const birthdays = birthdaysIn(Object.values(useContactsStore.getState().contacts), from, to);
      const context = askContext({ occurrences, birthdays, labels, feeds, name: mentionWords, now });
      const answer = await askCalendar(server, { question: asked, context, lang: getLocale(), now: instantToWall(now, ''), history: turns });
      setTurns(current => [...current, { question: asked, answer: answer.answer }]);
      setQuestion('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('The server isn’t responding'));
    } finally {
      setBusy(false);
      field.current?.focus();
    }
  };
  const close = (): void => setAskOpen(false);
  return (
    <Layer open={open} onDismiss={close} kind="side" labelledBy={titleId} initialFocus={field}>
      {open ? (
        <DialogFrame
          title={t('Ask Claude')}
          titleId={titleId}
          onClose={close}
          page
          className={styles.askFrame}
          onSubmit={event => {
            event.preventDefault();
            void ask();
          }}
          foot={
            <div className={styles.askComposer}>
              <textarea
                ref={field}
                className={styles.askField}
                value={question}
                rows={1}
                onChange={event => setQuestion(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void ask();
                  }
                }}
                placeholder={t('Your question about your calendar')}
                aria-label={t('Your question')}
                maxLength={2000}
              />
              <IconButton icon="arrowUp" label={t('Ask')} shape={1} disabled={!question.trim() || busy} onClick={() => void ask()} />
            </div>
          }
        >
          <div className={styles.askHead}>
            <p className="t-meta">{t('Claude reads your events from three months back to a year ahead, and your contacts’ birthdays.')}</p>
            {turns.length > 0 ? (
              <Button kind="text" icon="broom" small onClick={() => setTurns([])}>
                {t('New conversation')}
              </Button>
            ) : null}
          </div>
          {turns.length === 0 && !busy ? (
            <div className={styles.starters} aria-label={t('Example questions')}>
              {ASK_STARTERS.map(starter => (
                <Button key={starter} kind="outlined" small onClick={() => void ask(t(starter))}>
                  {t(starter)}
                </Button>
              ))}
            </div>
          ) : null}
          {turns.map((turn, index) => (
            <div key={index} className={styles.turn}>
              <p className={`${styles.question} t-body`}>{turn.question}</p>
              <p className={`${styles.answer} t-body`}>{turn.answer}</p>
            </div>
          ))}
          {busy ? (
            <div className={styles.turn}>
              <p className={`${styles.question} t-body`}>{question}</p>
              <p className={`${styles.askWaiting} t-meta`}>
                <Spinner />
                {t('Claude is reading your calendar…')}
              </p>
            </div>
          ) : null}
          {error ? (
            <p className={`${styles.askError} t-body`} role="alert">
              {error}
            </p>
          ) : null}
          <div ref={end} />
        </DialogFrame>
      ) : null}
    </Layer>
  );
}

export function CalendarOverlays(_props: { route: Route; pagePath: string }) {
  const peek = useCalendarUi(s => s.peek);
  const quick = useCalendarUi(s => s.quick);
  return (
    <>
      {peek ? <Peek key={peek.key} peekKey={peek.key} anchor={peek.anchor} /> : null}
      {quick ? <Quick key={quick.id} quick={quick} /> : null}
      <ScopeDialog />
      <AskPanel />
    </>
  );
}
