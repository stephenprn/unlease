/**
 * What Agenda draws over its pages: an occurrence's popover where it was clicked (or a birthday's, a
 * reminder's, a page's day), the quick form of an event drawn on the grid, the question « which of a
 * series' events? », and Claude's panel of questions about the calendar.
 */
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';

import { getLocale, t } from '@unlease/core/i18n';
import { ASK_STARTERS, askContext } from '@unlease/calendar/services/ask';
import { EVENT_LIMITS, isOwn } from '@unlease/calendar/models/events';
import { blankDraft, type EditScope } from '@unlease/calendar/services/editing';
import { whenLine } from '@unlease/calendar/services/eventText';
import { birthdaysIn } from '@unlease/calendar/services/layers';
import { findOccurrence, hiddenFeedIds, occurrencesIn, type Occurrence } from '@unlease/calendar/services/occurrences';
import { addDays, deviceZone, instantToDay, instantToWall, isDay } from '@unlease/calendar/services/time';
import type { CalendarAskTurn } from '@unlease/calendar/sync/routes';

import { useContactsStore } from '@contacts/app/store/library';
import { useMinute } from '@shared/app/hooks/useMinute';
import { selectServer, useSettingsStore } from '@shared/app/store/settings';
import { showSnack } from '@shared/app/store/ui';
import { Button, Spinner } from '@shared/ui/components/Button';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { IconButton } from '@shared/ui/components/IconButton';
import layers from '@shared/ui/components/layers.module.css';
import { Layer } from '@shared/ui/components/Layer';
import { Popover } from '@shared/ui/components/Popover';
import { navigate, type Route } from '@shared/ui/router';
import { askCalendar } from '../../app/api';
import { kindOf, LAYER_COLORS, useColorOf } from '../../app/hooks/useItems';
import { mentionWords } from '../../app/names';
import { addEvent } from '../../app/store/actions';
import { closePeek, closeQuick, setAskOpen, useCalendarUi, type Anchor } from '../../app/store/calendarUi';
import { useCalendarStore } from '../../app/store/library';
import { usePrefsStore } from '../../app/store/prefs';
import styles from '../calendar.module.css';
import { paths } from '../routes';
import { ChoiceRows } from './ChoiceRows';
import { duplicateOccurrence, EventDetails, PeekTools } from './EventDetails';
import { BirthdayDetails, PageDateDetails, ReminderDetails } from './LayerDetails';

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
      return peeked.item.event.title.trim() || t('Sans titre');
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
                  label={t('Ouvrir')}
                  compact
                  onClick={() => {
                    closePeek();
                    navigate(fullPage);
                  }}
                />
              ) : null}
              <IconButton icon="close" label={t('Fermer')} compact onClick={closePeek} />
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

/** The quick form of an event drawn on the grid (or a day of the month): its title, and « Plus d'options ». */
function Quick({ start, end, anchor }: { start: string; end: string; anchor: Anchor }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const now = useMinute();
  const prefs = usePrefsStore();
  const zone = deviceZone();
  const allDay = isDay(start);
  const reminders = allDay ? prefs.allDayReminders : prefs.reminders;
  const save = (): void => {
    addEvent({ ...blankDraft(start, end, zone, reminders), title: title.trim() });
    closeQuick();
    showSnack(t('Événement enregistré'), undefined, { tone: 'success' });
  };
  const more = (): void => {
    closeQuick();
    navigate(paths.newEvent({ start, end, title: title.trim() || undefined }));
  };
  const startAt = allDay ? 0 : new Date(start).getTime();
  const when = whenLine(
    allDay
      ? { startAt: 0, endAt: 0, allDay: true, firstDay: start, lastDay: addDays(end, -1) }
      : { startAt, endAt: new Date(end).getTime(), allDay: false, firstDay: start.slice(0, 10), lastDay: instantToDay(new Date(end).getTime() - 1) },
    now,
    prefs.twelveHours,
  );
  return (
    <>
      <AnchorBox anchor={anchor} anchorRef={anchorRef} />
      <Popover open onDismiss={closeQuick} anchor={anchorRef} label={t('Nouvel événement')} width={360} initialFocus={inputRef}>
        <form
          className={styles.quick}
          onSubmit={event => {
            event.preventDefault();
            save();
          }}
        >
          <input ref={inputRef} className={styles.titleInput} value={title} onChange={event => setTitle(event.target.value)} placeholder={t('Ajouter un titre')} aria-label={t('Titre')} maxLength={EVENT_LIMITS.title} autoComplete="off" enterKeyHint="done" />
          <span className="t-meta">{when}</span>
          <div className={styles.formFoot}>
            <Button kind="text" onClick={more}>
              {t('Plus d’options')}
            </Button>
            <Button type="submit" icon="check">
              {t('Enregistrer')}
            </Button>
          </div>
        </form>
      </Popover>
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
            {t('Annuler')}
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
          { value: 'this', label: t('Cet événement') },
          { value: 'following', label: t('Cet événement et les suivants') },
          { value: 'all', label: t('Tous les événements') },
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
      setError(failure instanceof Error ? failure.message : t('Le serveur ne répond pas'));
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
          title={t('Demander à Claude')}
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
                placeholder={t('Votre question sur votre agenda')}
                aria-label={t('Votre question')}
                maxLength={2000}
              />
              <IconButton icon="arrowUp" label={t('Demander')} shape={1} disabled={!question.trim() || busy} onClick={() => void ask()} />
            </div>
          }
        >
          <div className={styles.askHead}>
            <p className="t-meta">{t('Claude lit vos événements de trois mois en arrière à un an devant, et les anniversaires de vos contacts.')}</p>
            {turns.length > 0 ? (
              <Button kind="text" icon="broom" small onClick={() => setTurns([])}>
                {t('Nouvelle conversation')}
              </Button>
            ) : null}
          </div>
          {turns.length === 0 && !busy ? (
            <div className={styles.starters} aria-label={t('Exemples de questions')}>
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
                {t('Claude lit votre agenda…')}
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
      {quick ? <Quick key={`${quick.start}|${quick.end}`} start={quick.start} end={quick.end} anchor={quick.anchor} /> : null}
      <ScopeDialog />
      <AskPanel />
    </>
  );
}
